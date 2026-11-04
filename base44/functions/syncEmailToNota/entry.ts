// v2026-07-22.redeploy2
// Sincroniza correos recibidos en Gmail como Notas vinculadas a Contactos.
// Trigger: webhook de Gmail (workflow SyncEmailsToNotas) que pasa
// { data: { new_message_ids: [...], has_new_messages: true } }.
// Para cada mensaje: trae el contenido, busca un Contacto por email del remitente,
// y si hay match crea una Nota vinculada al contacto (y a su empresa si existe).
// Deduplica por gmail_message_id. POST body: { data: { new_message_ids: string[] } }.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { jsonRes, extraerCuerpo } from '../../shared/gmailUtils.ts';

function header(headers: { name: string; value: string }[], nombre: string): string {
  const h = (headers || []).find((x) => x.name?.toLowerCase() === nombre.toLowerCase());
  return h?.value || '';
}

// "Juan Perez <juan@acme.com>" -> "juan@acme.com"
function extractEmail(from: string): string {
  const m = from.match(/<([^>]+@[^>]+)>/);
  if (m) return m[1].toLowerCase().trim();
  const m2 = from.match(/([^\s<>]+@[^\s<>]+)/);
  return m2 ? m2[1].toLowerCase().trim() : '';
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonRes({ message: 'Solo POST' }, 405);

  const base44 = createClientFromRequest(req);

  let body: { data?: { new_message_ids?: string[] } } = {};
  try { body = await req.json(); } catch { body = {}; }
  const messageIds: string[] = body.data?.new_message_ids ?? [];
  if (messageIds.length === 0) {
    return jsonRes({ procesados: 0, creadas: 0, sin_match: 0, errores: 0 });
  }

  let accessToken: string;
  try {
    ({ accessToken } = await base44.asServiceRole.connectors.getConnection('gmail'));
  } catch (e) {
    return jsonRes({ error: `Gmail no conectado: ${String(e).slice(0, 200)}` }, 400);
  }
  const gHdrs = { 'Authorization': `Bearer ${accessToken}` };

  let creadas = 0;
  let sin_match = 0;
  let errores = 0;
  const detalleErrores: string[] = [];

  for (const msgId of messageIds) {
    try {
      // Deduplicar por gmail_message_id
      const existentes = await base44.asServiceRole.entities.Nota.filter({ gmail_message_id: msgId });
      if (Array.isArray(existentes) && existentes.length > 0) continue;

      const rMsg = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
        { headers: gHdrs }
      );
      if (!rMsg.ok) { errores++; detalleErrores.push(`${msgId}: get ${rMsg.status}`); continue; }
      const full = await rMsg.json();

      const heads = full.payload?.headers || [];
      const asunto = header(heads, 'Subject') || '(sin asunto)';
      const from = header(heads, 'From') || '';
      const senderEmail = extractEmail(from);
      const fechaMs = Number(full.internalDate) || Date.now();
      const cuerpo = extraerCuerpo(full.payload || {}) || full.snippet || '';

      if (!senderEmail) { sin_match++; continue; }

      // Buscar contacto por email del remitente
      const contactos = await base44.asServiceRole.entities.Contacto.filter({ email: senderEmail });
      const contacto = Array.isArray(contactos) && contactos.length > 0 ? contactos[0] : null;
      if (!contacto) { sin_match++; continue; }

      const textoNota = `Correo recibido — Asunto: ${asunto}\nDe: ${from}\n\n${cuerpo.slice(0, 3000)}`;
      await base44.asServiceRole.entities.Nota.create({
        contacto_id: contacto.id,
        empresa_id: contacto.empresa_id || undefined,
        texto: textoNota,
        fecha_nota: new Date(fechaMs).toISOString(),
        gmail_message_id: msgId,
      });
      creadas++;
    } catch (e) {
      errores++;
      detalleErrores.push(`${msgId}: ${String(e).slice(0, 120)}`);
    }
  }

  return jsonRes({
    procesados: messageIds.length,
    creadas,
    sin_match,
    errores,
    ...(detalleErrores.length ? { detalle_errores: detalleErrores } : {}),
  });
});