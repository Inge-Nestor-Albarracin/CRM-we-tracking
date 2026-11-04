// v2026-07-27.gmail-bandeja
// Lista los correos recientes de la cuenta Gmail conectada (ms@grouptso.com).
// POST { q?: string (filtro Gmail, default 'in:inbox'), max?: number }
//   -> { mensajes: [{ id, threadId, from, subject, date, snippet, unread }] }
// AUTOCONTENIDO (sin imports de ../../shared) para que Base44 lo despliegue siempre.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

function jsonRes(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonRes({ error: 'Solo POST', mensajes: [] }, 405);
  let body: any = {};
  try { body = await req.json(); } catch { /* sin body */ }
  const q = String(body.q || 'in:inbox');
  const max = Math.min(Number(body.max) || 20, 30);

  try {
    const b44 = createClientFromRequest(req);
    const { accessToken } = await b44.asServiceRole.connectors.getConnection('gmail');
    if (!accessToken) return jsonRes({ error: 'Gmail no conectado', mensajes: [] });
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
