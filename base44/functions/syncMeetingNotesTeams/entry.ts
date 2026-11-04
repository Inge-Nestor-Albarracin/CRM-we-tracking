// v2026-07-29.teams
// Sincroniza transcripciones de reuniones de Microsoft Teams (Microsoft Graph API).
// Lista las onlineMeetings recientes del usuario, obtiene sus transcripciones,
// deduplica por doc_id (teams_{transcriptId}) y crea ReunionNota en estado Pendiente.
// El FRONTEND encadena procesarNotaReunion por cada id creada.
// POST body: {} -> { creadas: [ids], omitidas: n, errores: [] }
// Conector APP_USER 'microsoft_teams' (id: 6a6abe4e8046024839fa9ea7).

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { jsonRes, tituloExcluido, claveReunion } from '../../shared/reunionUtils.ts';

const TEAMS_CONNECTOR_ID = '6a6abe4e8046024839fa9ea7';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonRes({ message: 'Solo POST' }, 405);

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return jsonRes({ connected: false, message: 'Unauthorized' }, 401);

    // Token del conector Teams (APP_USER: cada usuario tiene el suyo)
    let accessToken: string;
    try {
      ({ accessToken } = await base44.asServiceRole.connectors.getCurrentAppUserConnection(TEAMS_CONNECTOR_ID));
    } catch {
      return jsonRes({ connected: false, message: 'Teams no conectado. Conecta tu cuenta en Configuración → Integraciones.' });
    }

    const gHdrs: Record<string, string> = { 'Authorization': `Bearer ${accessToken}` };

    // Ventana: ultimos 90 dias (las transcripciones de Teams suelen ser recientes)
    const dias = 90;
    const desde = new Date(Date.now() - dias * 24 * 3600 * 1000).toISOString();
    const hasta = new Date().toISOString();

    // 1) Listar online meetings recientes (con paginacion)
    const meetings: { id: string; subject: string; startDateTime: string; joinUrl: string }[] = [];
    let url: string | null = `https://graph.microsoft.com/v1.0/me/onlineMeetings?$filter=startDateTime+ge+${desde}+and+startDateTime+le+${hasta}&$top=50&$select=id,subject,startDateTime,joinUrl&$orderby=startDateTime+desc`;

    for (let p = 0; p < 10 && url; p++) {
      const r = await fetch(url, { headers: gHdrs });
      if (!r.ok) break;
      const data = await r.json();
      meetings.push(...(data.value || []));
      url = data['@odata.nextLink'] || null;
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

    for (const meeting of meetings) {
      try {
        if (tituloExcluido(meeting.subject || '')) { omitidas++; continue; }
        const fInicio = (meeting.startDateTime || '').slice(0, 10);
        if (fInicio && fInicio < '2026-07-01') { omitidas++; continue; }

        // 2) Obtener transcripciones de la reunion
        const rTr = await fetch(`https://graph.microsoft.com/v1.0/me/onlineMeetings/${meeting.id}/transcripts`, { headers: gHdrs });
        if (!rTr.ok) continue;
        const trData = await rTr.json();
        const transcripts = trData.value || [];
        if (transcripts.length === 0) continue;

        for (const tr of transcripts) {
          try {
            const docId = `teams_${tr.id}`;
            // Dedup por doc_id
            const existentes = await base44.asServiceRole.entities.ReunionNota.filter({ doc_id: docId });
            if (existentes && existentes.length > 0) { omitidas++; continue; }
            // Dedup por identidad de reunión (misma fecha+título por otra cuenta/fuente)
            const claveR = claveReunion(meeting.subject || `Reunión de Teams ${fInicio}`, fInicio);
            if (clavesExistentes.has(claveR)) { omitidas++; continue; }

            // 3) Obtener contenido de la transcripcion
            let extracto = '';
            try {
              const rContent = await fetch(
                `https://graph.microsoft.com/v1.0/me/onlineMeetings/${meeting.id}/transcripts/${tr.id}/content`,
                { headers: { ...gHdrs, 'Accept': 'text/plain' } }
              );
              if (rContent.ok) {
                const text = await rContent.text();
                // Limpiar formato VTT si viene asi: quitar cabecera y lineas de timing
                extracto = text
                  .replace(/^WEBVTT.*$/m, '')
                  .replace(/^\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}.*/gm, '')
                  .replace(/^\s*$/gm, '')
                  .trim()
                  .slice(0, 800);
              }
            } catch { /* extracto opcional */ }

            const titulo = meeting.subject || `Reunión de Teams ${fInicio}`;
            const nota = await base44.asServiceRole.entities.ReunionNota.create({
              titulo,
              fecha_reunion: fInicio || undefined,
              origen: 'Microsoft_Teams',
              doc_id: docId,
              doc_url: meeting.joinUrl || undefined,
              doc_modified_time: tr.createdDateTime || undefined,
              extracto,
              estado_procesamiento: 'Pendiente',
            });
            if (nota?.id) creadas.push(nota.id);
            clavesExistentes.add(claveR);
          } catch (e) {
            errores.push(`${meeting.subject || meeting.id}: ${String(e).slice(0, 120)}`);
          }
        }
      } catch (e) {
        errores.push(`${meeting.subject || meeting.id}: ${String(e).slice(0, 120)}`);
      }
    }

    return jsonRes({ creadas, omitidas, errores });
  } catch (e) {
    return jsonRes({ message: String(e).slice(0, 300) }, 500);
  }
});