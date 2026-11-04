// v2026-07-29.excluir-aaxa-y-junio
// Sincroniza notas de reuniones desde Google Drive (docs de Meet/Gemini).
// Lista los Google Docs de la carpeta de notas, deduplica por doc_id y crea
// ReunionNota en estado Pendiente. El FRONTEND encadena procesarNotaReunion
// por cada id creada (evita timeouts de funcion a funcion).
// POST body: {} -> { creadas: [ids], omitidas: n, errores: [] }
// Env: BASE44_API_KEY. Conector 'googledrive' requerido. Carpeta por nombre (sin secrets).
// NO usa SyncState (reservado para el sync de Calendar): dedup por doc_id.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { jsonRes, tituloExcluido, claveReunion } from '../../shared/reunionUtils.ts';

const BASE_URL = 'https://wtapp.base44.app';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonRes({ message: 'Solo POST' }, 405);

  const apiKey = Deno.env.get('BASE44_API_KEY') || '';
  if (!apiKey) return jsonRes({ message: 'BASE44_API_KEY no configurada' }, 500);
  const hdrs = { 'api_key': apiKey, 'Content-Type': 'application/json' };

  // Token del conector Drive
  let accessToken: string;
  try {
    const b44 = createClientFromRequest(req);
    ({ accessToken } = await b44.asServiceRole.connectors.getConnection('googledrive'));
  } catch (e) {
    return jsonRes({ message: `Conector de Google Drive no disponible. Configúralo en Base44 (Connectors → googledrive). Detalle: ${String(e).slice(0, 200)}` }, 500);
  }
  const gHdrs = { 'Authorization': `Bearer ${accessToken}` };

  // Sin carpeta dedicada: busca en TODO el Drive docs cuyos nombres parecen actas.
  // Ventana amplia: ultimos 2 años.
  const dias = 730;
  const desde = new Date(Date.now() - dias * 24 * 3600 * 1000).toISOString();
  const keywords = [
    "acta", "reunion", "reuni\u00f3n", "meeting", "notas", "nota",
    "minuta", "gemini", "meet", "resumen", "memoria"
  ];
  const nameConditions = keywords.map(k => `name contains '${k}'`).join(' or ');
  const qDocs = encodeURIComponent(
    `mimeType='application/vnd.google-apps.document' and trashed=false and modifiedTime > '${desde}' and (${nameConditions})`
  );
  // Paginar para traer TODOS los docs (antes se cortaba en 25 -> se perdían reuniones).
  const files: { id: string; name: string; modifiedTime: string; createdTime: string; webViewLink: string }[] = [];
  let pageToken = '';
  for (let p = 0; p < 25; p++) {
    const u = `https://www.googleapis.com/drive/v3/files?q=${qDocs}`
      + `&fields=nextPageToken,files(id,name,modifiedTime,createdTime,webViewLink)`
      + `&orderBy=modifiedTime desc&pageSize=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const rDocs = await fetch(u, { headers: gHdrs });
    if (!rDocs.ok) {
      if (files.length) break; // ya trajimos algo; seguimos con lo que hay
      return jsonRes({ message: `Drive list ${rDocs.status}: ${(await rDocs.text()).slice(0, 200)}` }, 500);
    }
    const data = await rDocs.json();
    files.push(...(data.files || []));
    pageToken = data.nextPageToken || '';
    if (!pageToken) break;
  }

  // ?debug=1 -> no crea nada: solo dice DE QUE CUENTA es el Drive y que ve, con el
  // motivo de cada omision. Sirve para saber si estamos mirando el Drive correcto.
  if (new URL(req.url).searchParams.get('debug') === '1') {
    let cuenta = '(desconocida)';
    try {
      const rAbout = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', { headers: gHdrs });
      if (rAbout.ok) cuenta = (await rAbout.json())?.user?.emailAddress || '(sin email)';
    } catch { /* seguimos */ }
    const recientes = files.slice(0, 12).map(f => ({
      titulo: String(f.name || '').slice(0, 70),
      creado: String(f.createdTime || '').slice(0, 10),
      motivo: tituloExcluido(f.name) ? 'titulo excluido'
            : (String(f.createdTime || '').slice(0, 10) < '2026-07-01' ? 'anterior al 1-jul-2026' : 'ENTRARIA'),
    }));
    return jsonRes({
      cuenta_del_drive: cuenta,
      docs_encontrados: files.length,
      por_titulo_excluido: files.filter(f => tituloExcluido(f.name)).length,
      por_antiguos: files.filter(f => String(f.createdTime || '').slice(0, 10) < '2026-07-01').length,
      candidatos_reales: files.filter(f => !tituloExcluido(f.name) && String(f.createdTime || '').slice(0, 10) >= '2026-07-01').length,
      mas_recientes: recientes,
    });
  }

  const creadas: string[] = [];
  const errores: string[] = [];
  let omitidas = 0;

  // Índice de reuniones YA existentes por clave (fecha|título) para no duplicar la MISMA
  // reunión llegada por varias cuentas del equipo (comités con varios participantes).
  const clavesExistentes = new Set<string>();
  try {
    const rAll = await fetch(`${BASE_URL}/api/entities/ReunionNota?limit=1000`, { headers: hdrs });
    if (rAll.ok) {
      const todas = await rAll.json();
      for (const r of (todas || [])) if (r?.titulo && r?.fecha_reunion) clavesExistentes.add(claveReunion(r.titulo, r.fecha_reunion));
    }
  } catch { /* si falla, seguimos con dedup por doc_id */ }

  for (const file of files as { id: string; name: string; modifiedTime: string; createdTime: string; webViewLink: string }[]) {
    try {
      // Excluidas: Comité Comercial / trabajo remoto / Gastii / AAXA -> nunca importar
      if (tituloExcluido(file.name)) { omitidas++; continue; }
      // Junio 2026 hacia atrás -> nunca importar
      const fCreado = (file.createdTime || '').slice(0, 10);
      if (fCreado && fCreado < '2026-07-01') { omitidas++; continue; }
      // Dedup por doc_id (filtro de igualdad del REST de entidades)
      const rEx = await fetch(`${BASE_URL}/api/entities/ReunionNota?doc_id=${encodeURIComponent(file.id)}`, { headers: hdrs });
      if (rEx.ok) {
        const existentes = await rEx.json();
        if (Array.isArray(existentes) && existentes.length > 0) { omitidas++; continue; }
      }
      // Dedup por identidad de reunión (misma fecha+título llegada por otra cuenta/fuente)
      const claveR = claveReunion(file.name, file.createdTime || '');
      if (clavesExistentes.has(claveR)) { omitidas++; continue; }

      // Extracto rápido del doc (para preview sin re-exportar)
      let extracto = '';
      try {
        const rTxt = await fetch(
          `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/plain`,
          { headers: gHdrs }
        );
        if (rTxt.ok) extracto = (await rTxt.text()).slice(0, 800);
      } catch { /* extracto opcional */ }

      const rNew = await fetch(`${BASE_URL}/api/entities/ReunionNota`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({
          titulo: file.name,
          fecha_reunion: (file.createdTime || '').slice(0, 10) || undefined,
          origen: 'Google_Drive',
          doc_id: file.id,
          doc_url: file.webViewLink,
          doc_modified_time: file.modifiedTime,
          extracto,
          estado_procesamiento: 'Pendiente',
        }),
      });
      if (rNew.ok) {
        const nota = await rNew.json();
        if (nota.id) creadas.push(nota.id);
        clavesExistentes.add(claveR);
      } else {
        errores.push(`${file.name}: create ${rNew.status}`);
      }
    } catch (e) {
      errores.push(`${file.name}: ${String(e).slice(0, 120)}`);
    }
  }

  return jsonRes({ creadas, omitidas, errores });
});