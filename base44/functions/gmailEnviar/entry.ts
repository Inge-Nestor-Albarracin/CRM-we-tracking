// v2026-07-27.gmail-enviar
// Envía un correo (nuevo o respuesta) desde la cuenta Gmail conectada (ms@grouptso.com).
// POST { to, asunto, cuerpo, threadId?, inReplyTo? } -> { ok }
// AUTOCONTENIDO.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

function jsonRes(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

// base64url de un string UTF-8 (para el raw MIME de Gmail).
function b64url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonRes({ error: 'Solo POST' }, 405);
  let body: any = {};
  try { body = await req.json(); } catch { /* */ }
  const to = String(body.to || '').trim();
  const asunto = String(body.asunto || '(sin asunto)');
  const cuerpo = String(body.cuerpo || '');
  const threadId = body.threadId ? String(body.threadId) : '';
  const inReplyTo = body.inReplyTo ? String(body.inReplyTo) : '';
  if (!to || !cuerpo) return jsonRes({ error: 'Faltan destinatario o cuerpo' }, 400);

  try {
    const b44 = createClientFromRequest(req);
    const { accessToken } = await b44.asServiceRole.connectors.getConnection('gmail');
    if (!accessToken) return jsonRes({ error: 'Gmail no conectado' });

    const encAsunto = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(asunto)))}?=`;
    const headers = [
      `To: ${to}`,
      `Subject: ${encAsunto}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 8bit',
    ];
    if (inReplyTo) { headers.push(`In-Reply-To: ${inReplyTo}`); headers.push(`References: ${inReplyTo}`); }
    const mime = headers.join('\r\n') + '\r\n\r\n' + cuerpo;

    const payload: any = { raw: b64url(mime) };
    if (threadId) payload.threadId = threadId;

    const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) return jsonRes({ error: (await r.text()).slice(0, 200) });
    return jsonRes({ ok: true });
  } catch (e) {
    return jsonRes({ error: String((e as Error).message || e).slice(0, 200) });
  }
});
