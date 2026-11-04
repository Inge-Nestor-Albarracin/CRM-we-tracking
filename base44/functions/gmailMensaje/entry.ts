// v2026-07-27.gmail-mensaje
// Devuelve el contenido completo de un correo y lo marca como leído.
// POST { id: string } -> { from, to, subject, date, html, texto, threadId, messageId }
// AUTOCONTENIDO.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { jsonRes, decodeB64Url, extraerCuerpoParts } from "../../shared/gmailUtils.ts";

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonRes({ error: 'Solo POST' }, 405);
  let body: any = {};
  try { body = await req.json(); } catch { /* */ }
  const id = String(body.id || '');
  if (!id) return jsonRes({ error: 'Falta id' }, 400);

  try {
    const b44 = createClientFromRequest(req);
    const { accessToken } = await b44.asServiceRole.connectors.getConnection('gmail');
    if (!accessToken) return jsonRes({ error: 'Gmail no conectado' });
    const hdr = { Authorization: `Bearer ${accessToken}` };

    const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, { headers: hdr });
    if (!r.ok) return jsonRes({ error: `mensaje ${r.status}` });
    const m = await r.json();
    const hs: Record<string, string> = {};
    (m.payload?.headers || []).forEach((h: any) => { hs[String(h.name).toLowerCase()] = h.value; });
    const { html, texto } = extraerCuerpoParts(m.payload || {});

    // Marcar como leído (quitar etiqueta UNREAD).
    try {
      await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}/modify`, {
        method: 'POST', headers: { ...hdr, 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
      });
    } catch { /* no crítico */ }

    return jsonRes({
      from: hs.from || '', to: hs.to || '', subject: hs.subject || '(sin asunto)',
      date: hs.date || '', html, texto: texto || m.snippet || '',
      threadId: m.threadId || id, messageId: hs['message-id'] || '',
    });
  } catch (e) {
    return jsonRes({ error: String((e as Error).message || e).slice(0, 200) });
  }
});