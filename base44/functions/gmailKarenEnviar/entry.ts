// Envía un correo (nuevo o respuesta) desde la cuenta Gmail adicional del usuario (conector "WeTracking Gmail Karen").
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { jsonRes, b64url } from "../../shared/gmailUtils.ts";

const GMAIL_KAREN_CONNECTOR_ID = '6a739cba0cfbf2c423f6d6f2';

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
    const user = await b44.auth.me();
    if (!user) return jsonRes({ error: 'Unauthorized' }, 401);

    let accessToken: string | undefined;
    try {
      const conn = await b44.asServiceRole.connectors.getCurrentAppUserConnection(GMAIL_KAREN_CONNECTOR_ID);
      accessToken = conn?.accessToken;
    } catch { return jsonRes({ error: 'Gmail (Karen) no conectado' }); }
    if (!accessToken) return jsonRes({ error: 'Gmail (Karen) no conectado' });

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