// v2026-08-26.bandeja+notas
// Lista los correos recientes de la cuenta Gmail adicional del usuario (conector "WeTracking Gmail Karen").
// TAMBIÉN sincroniza las notas de Gemini de ESE buzón con { sincronizar_notas: true }:
// así cada persona del equipo procesa SUS propias reuniones sin reenviar nada a un
// buzón central. Vive aquí (y no en syncMeetingNotesGmail, que sería el sitio natural)
// porque esta es la función que ya maneja el conector de Gmail POR USUARIO, y porque
// la app está en el tope de 50 funciones y no se puede crear una nueva.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { jsonRes } from "../../shared/gmailUtils.ts";
import { importarNotasGemini } from "../../shared/notasGmail.ts";

const GMAIL_KAREN_CONNECTOR_ID = '6a739cba0cfbf2c423f6d6f2';

Deno.serve(async (req) => {
  if (new URL(req.url).searchParams.get('_probe') === 'version') {
    return jsonRes({ version: 'v2026-08-26.bandeja+notas' });
  }
  if (req.method !== 'POST') return jsonRes({ error: 'Solo POST', mensajes: [] }, 405);
  let body: any = {};
  try { body = await req.json(); } catch { /* sin body */ }
  const q = String(body.q || 'in:inbox');
  const max = Math.min(Number(body.max) || 20, 30);

  try {
    const b44 = createClientFromRequest(req);
    const user = await b44.auth.me();
    if (!user) return jsonRes({ error: 'Unauthorized', mensajes: [] }, 401);

    let accessToken: string | undefined;
    try {
      const conn = await b44.asServiceRole.connectors.getCurrentAppUserConnection(GMAIL_KAREN_CONNECTOR_ID);
      accessToken = conn?.accessToken;
    } catch { return jsonRes({ connected: false, error: 'Gmail (Karen) no conectado', mensajes: [] }); }
    if (!accessToken) return jsonRes({ connected: false, error: 'Gmail (Karen) no conectado', mensajes: [] });

    // Modo sincronización: importa las notas de Gemini de ESTE buzón.
    if (body.sincronizar_notas === true) {
      const apiKey = Deno.env.get('BASE44_API_KEY') || '';
      if (!apiKey) return jsonRes({ error: 'BASE44_API_KEY no configurada' }, 500);
      const r = await importarNotasGemini(accessToken, apiKey, { query: body.query, max: body.max });
      return jsonRes({ modo: `personal:${user.email || ''}`, ...r });
    }

    const hdr = { Authorization: `Bearer ${accessToken}` };
    const rL = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}&q=${encodeURIComponent(q)}`, { headers: hdr });
    if (!rL.ok) return jsonRes({ error: `list ${rL.status}`, mensajes: [] });
    const list = await rL.json();
    const ids: string[] = (list.messages || []).map((m: any) => m.id);

    const mensajes = await Promise.all(ids.map(async (id) => {
      try {
        const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, { headers: hdr });
        if (!r.ok) return null;
        const m = await r.json();
        const hs: Record<string, string> = {};
        (m.payload?.headers || []).forEach((h: any) => { hs[String(h.name).toLowerCase()] = h.value; });
        return {
          id, threadId: m.threadId || id,
          from: hs.from || '', subject: hs.subject || '(sin asunto)',
          date: hs.date || '', snippet: m.snippet || '',
          unread: (m.labelIds || []).includes('UNREAD'),
        };
      } catch { return null; }
    }));

    return jsonRes({ mensajes: mensajes.filter(Boolean) });
  } catch (e) {
    return jsonRes({ error: String((e as Error).message || e).slice(0, 200), mensajes: [] });
  }
});