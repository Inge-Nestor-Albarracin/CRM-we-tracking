// Importa las "Notas de Gemini" de un buzón de Gmail y crea ReunionNota en Pendiente.
// Recibe el accessToken ya resuelto, así que sirve tanto para la cuenta central como
// para el Gmail PROPIO de cada usuario (conector por usuario).
// Devuelve { creadas, omitidas, errores, total_encontrados }; el que llama encadena
// procesarReunion por cada id creada.

import { tituloExcluido, claveReunion } from './reunionUtils.ts';

const BASE_URL = 'https://wtapp.base44.app';
export const QUERY_NOTAS_DEFAULT = 'subject:Notas newer_than:180d';

// Reuniones anteriores a esta fecha nunca se importan.
const DESDE = '2026-07-01';

function decodeB64Url(data: string): string {
  try {
    const bin = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder('utf-8').decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    return '';
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

type GmailPart = { mimeType?: string; body?: { data?: string }; parts?: GmailPart[] };

function extraerCuerpo(payload: GmailPart): { texto: string; html: string } {
  let plano = '';
  let html = '';
  function walk(part: GmailPart) {
    if (!part) return;
    const mt = part.mimeType || '';
    if (mt === 'text/plain' && part.body?.data) plano += decodeB64Url(part.body.data) + '\n';
    else if (mt === 'text/html' && part.body?.data) html += decodeB64Url(part.body.data) + '\n';
    (part.parts || []).forEach(walk);
  }
  walk(payload);
  return { texto: (plano.trim() || (html.trim() ? stripHtml(html) : '')).trim(), html };
}

function header(headers: { name: string; value: string }[], nombre: string): string {
  return (headers || []).find((x) => x.name?.toLowerCase() === nombre.toLowerCase())?.value || '';
}

// Gemini envuelve el link del Doc en un redirect google.com/url?q=... percent-encoded,
// así que se busca también sobre una versión decodificada.
function extraerDocLink(...textos: string[]): { docId: string; docUrl: string } {
  const re = /docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]{20,})/;
  for (const t of textos) {
    if (!t) continue;
    let decoded = t;
    try { decoded = decodeURIComponent(t.replace(/\+/g, ' ')); } catch { /* usar crudo */ }
    const m = t.match(re) || decoded.match(re);
    if (m) return { docId: m[1], docUrl: `https://docs.google.com/document/d/${m[1]}/edit` };
  }
  return { docId: '', docUrl: '' };
}

// "Notas: COMITÉ 22 jun 2026" -> "COMITÉ 22 jun 2026"
function limpiarTitulo(asunto: string): string {
  return asunto.replace(/^\s*notas\s*:\s*/i, '').trim() || asunto;
}

export async function importarNotasGemini(
  accessToken: string,
  apiKey: string,
  opts: { query?: string; max?: number } = {},
): Promise<{ creadas: string[]; omitidas: number; errores: string[]; total_encontrados: number }> {
  const hdrs = { 'api_key': apiKey, 'Content-Type': 'application/json' };
  const gHdrs = { 'Authorization': `Bearer ${accessToken}` };
  const queryCustom = !!(opts.query && opts.query.trim());
  const query = queryCustom ? opts.query!.trim() : QUERY_NOTAS_DEFAULT;
  const max = Math.min(Math.max(Number(opts.max) || 60, 1), 100);

  const creadas: string[] = [];
  const errores: string[] = [];
  let omitidas = 0;

  const rList = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${max}`,
    { headers: gHdrs },
  );
  if (!rList.ok) throw new Error(`Gmail list ${rList.status}: ${(await rList.text()).slice(0, 160)}`);
  const { messages = [] } = await rList.json();

  // Índice de reuniones ya existentes (fecha|título): evita duplicar la MISMA reunión
  // que ya entró por Drive, por Teams o por el correo de otro asistente.
  const clavesExistentes = new Set<string>();
  try {
    const rAll = await fetch(`${BASE_URL}/api/entities/ReunionNota?limit=1000`, { headers: hdrs });
    if (rAll.ok) {
      const todas = await rAll.json();
      for (const r of (todas || [])) if (r?.titulo && r?.fecha_reunion) clavesExistentes.add(claveReunion(r.titulo, r.fecha_reunion));
    }
  } catch { /* si falla, queda el dedup por gmail_message_id */ }

  for (const msg of messages as { id: string }[]) {
    try {
      const rEx = await fetch(`${BASE_URL}/api/entities/ReunionNota?gmail_message_id=${encodeURIComponent(msg.id)}`, { headers: hdrs });
      if (rEx.ok) {
        const existentes = await rEx.json();
        if (Array.isArray(existentes) && existentes.length > 0) { omitidas++; continue; }
      }

      const rMsg = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`, { headers: gHdrs });
      if (!rMsg.ok) { errores.push(`${msg.id}: get ${rMsg.status}`); continue; }
      const full = await rMsg.json();

      const heads = full.payload?.headers || [];
      const asunto = header(heads, 'Subject') || '(sin asunto)';
      const remitente = header(heads, 'From') || '';

      // Solo correos de Gemini: su asunto empieza por "Notas:" (descarta
      // "Documento compartido contigo: Notas..." y parecidos).
      if (!queryCustom && !/^\s*notas\s*:/i.test(asunto)) { omitidas++; continue; }
      if (tituloExcluido(limpiarTitulo(asunto))) { omitidas++; continue; }

      const fechaISO = new Date(Number(full.internalDate) || Date.now()).toISOString().slice(0, 10);
      if (fechaISO < DESDE) { omitidas++; continue; }
      const claveR = claveReunion(limpiarTitulo(asunto), fechaISO);
      if (clavesExistentes.has(claveR)) { omitidas++; continue; }

      const { texto: cuerpo, html } = extraerCuerpo(full.payload || {});
      const { docId, docUrl } = extraerDocLink(html, cuerpo);

      const rNew = await fetch(`${BASE_URL}/api/entities/ReunionNota`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({
          titulo: limpiarTitulo(asunto).slice(0, 200),
          fecha_reunion: fechaISO,
          origen: 'Gmail',
          gmail_message_id: msg.id,
          remitente: remitente.slice(0, 200),
          ...(docId ? { doc_id: docId, doc_url: docUrl } : {}),
          extracto: (cuerpo || full.snippet || '').slice(0, 800),
          estado_procesamiento: 'Pendiente',
        }),
      });
      if (rNew.ok) {
        const nota = await rNew.json();
        if (nota.id) creadas.push(nota.id);
        clavesExistentes.add(claveR);
      } else {
        errores.push(`${asunto.slice(0, 40)}: create ${rNew.status}`);
      }
    } catch (e) {
      errores.push(`${msg.id}: ${String(e).slice(0, 120)}`);
    }
  }

  return { creadas, omitidas, errores, total_encontrados: messages.length };
}
