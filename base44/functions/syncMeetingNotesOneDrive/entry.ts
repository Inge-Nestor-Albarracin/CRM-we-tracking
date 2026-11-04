// v2026-07-30.onedrive
// Sincroniza notas de reuniones desde OneDrive (archivos Word/texto con keywords de acta).
// Busca en todo el Drive archivos cuyos nombres contengan keywords (acta, reunion, meeting, etc.),
// descarga el contenido de texto, deduplica por doc_id (onedrive_{fileId}) y crea ReunionNota
// en estado Pendiente. El FRONTEND encadena procesarNotaReunion por cada id creada.
// POST body: {} -> { creadas: [ids], omitidas: n, errores: [] }
// Conector APP_USER 'one_drive' (id: 6a6ac2bcc7f6324a62b63151).

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { jsonRes, tituloExcluido, claveReunion } from '../../shared/reunionUtils.ts';

const ONEDRIVE_CONNECTOR_ID = '6a6ac2bcc7f6324a62b63151';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonRes({ message: 'Solo POST' }, 405);

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return jsonRes({ connected: false, message: 'Unauthorized' }, 401);

    // Token del conector OneDrive (APP_USER: cada usuario tiene el suyo)
    let accessToken: string;
    try {
      ({ accessToken } = await base44.asServiceRole.connectors.getCurrentAppUserConnection(ONEDRIVE_CONNECTOR_ID));
    } catch {
      return jsonRes({ connected: false, message: 'OneDrive no conectado. Conecta tu cuenta en Configuración → Integraciones.' });
    }

    const gHdrs: Record<string, string> = { 'Authorization': `Bearer ${accessToken}` };

    // Keywords para buscar archivos de notas de reuniones en OneDrive
    const keywords = ['acta', 'reunion', 'meeting', 'notas', 'minuta', 'resumen', 'gemini', 'meet'];

    // Buscar en todo el Drive por cada keyword y deduplicar por file id
    const filesMap = new Map<string, { id: string; name: string; createdDateTime: string; lastModifiedDateTime: string; webUrl: string }>();

    for (const kw of keywords) {
      let url: string | null = `https://graph.microsoft.com/v1.0/me/drive/root/search(q='${encodeURIComponent(kw)}')?$top=50&$select=id,name,createdDateTime,lastModifiedDateTime,webUrl,file`;
      for (let p = 0; p < 5 && url; p++) {
        try {
          const r = await fetch(url, { headers: gHdrs });
          if (!r.ok) break;
          const data = await r.json();
          for (const item of (data.value || [])) {
            // Solo archivos (no carpetas)
            if (item.file && !filesMap.has(item.id)) {
              filesMap.set(item.id, item);
            }
          }
          url = data['@odata.nextLink'] || null;
        } catch {
          break;
        }
      }
    }

    const creadas: string[] = [];
    const errores: string[] = [];
    let omitidas = 0;

    // Índice de reuniones ya existentes (fecha|título) para no duplicar la MISMA reunión
    // llegada por varias cuentas/fuentes (comités con varios del equipo).
    const clavesExistentes = new Set<string>();
    try {
      const todas = await base44.asServiceRole.entities.ReunionNota.list('-fecha_reunion', 1000);
      for (const r of (todas || [])) if (r?.titulo && r?.fecha_reunion) clavesExistentes.add(claveReunion(r.titulo, r.fecha_reunion));
    } catch { /* si falla, seguimos con dedup por doc_id */ }

    for (const file of filesMap.values()) {
      try {
        // Excluidas por título
        if (tituloExcluido(file.name)) { omitidas++; continue; }
        // Junio 2026 hacia atrás -> nunca importar
        const fCreado = (file.createdDateTime || '').slice(0, 10);
        if (fCreado && fCreado < '2026-07-01') { omitidas++; continue; }

        const docId = `onedrive_${file.id}`;
        // Dedup por doc_id
        const existentes = await base44.asServiceRole.entities.ReunionNota.filter({ doc_id: docId });
        if (existentes && existentes.length > 0) { omitidas++; continue; }
        // Dedup por identidad de reunión (misma fecha+título por otra cuenta/fuente)
        const claveR = claveReunion(file.name, fCreado);
        if (clavesExistentes.has(claveR)) { omitidas++; continue; }

        // Descargar contenido del archivo (texto plano)
        let extracto = '';
        try {
          const rContent = await fetch(
            `https://graph.microsoft.com/v1.0/me/drive/items/${file.id}/content`,
            { headers: { ...gHdrs, 'Accept': 'text/plain' } }
          );
          if (rContent.ok) {
            const text = await rContent.text();
            // Detectar binario (.docx empieza con PK, o tiene null bytes)
            if (!text.startsWith('PK') && !text.includes('\0')) {
              extracto = text.trim().slice(0, 800);
            }
          }
        } catch { /* extracto opcional */ }

        const nota = await base44.asServiceRole.entities.ReunionNota.create({
          titulo: file.name,
          fecha_reunion: fCreado || undefined,
          origen: 'OneDrive',
          doc_id: docId,
          doc_url: file.webUrl || undefined,
          doc_modified_time: file.lastModifiedDateTime || undefined,
          extracto,
          estado_procesamiento: 'Pendiente',
        });
        if (nota?.id) creadas.push(nota.id);
        clavesExistentes.add(claveR);
      } catch (e) {
        errores.push(`${file.name}: ${String(e).slice(0, 120)}`);
      }
    }

    return jsonRes({ creadas, omitidas, errores });
  } catch (e) {
    return jsonRes({ message: String(e).slice(0, 300) }, 500);
  }
});