// v2026-07-22.redeploy2
// Proxy CORS: devuelve el texto completo de una ReunionNota.
// El browser no puede leer file storage de Base44 ni exportar de Drive directamente.
// POST body: { id: string } -> { texto: string }
// AUTOCONTENIDO (sin imports de ../../shared) para que Base44 lo despliegue siempre.
// Lee: contenido_url -> Google Doc (con pestañas) -> cuerpo de Gmail -> extracto.
// Nunca responde 500 por contenido: si algo falla, cae al extracto.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

function jsonRes(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

function decodeB64Url(data: string): string {
  try {
    const bin = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder('utf-8').decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch { return ''; }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n').replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type GmailPart = { mimeType?: string; body?: { data?: string }; parts?: GmailPart[] };
function extraerCuerpo(payload: GmailPart): string {
  let plano = ''; let html = '';
  (function walk(p: GmailPart) {
    if (!p) return;
    if (p.mimeType === 'text/plain' && p.body?.data) plano += decodeB64Url(p.body.data) + '\n';
    else if (p.mimeType === 'text/html' && p.body?.data) html += decodeB64Url(p.body.data) + '\n';
    (p.parts || []).forEach(walk);
  })(payload);
  return (plano.trim() || (html.trim() ? stripHtml(html) : '')).trim();
}

function textoDeContenido(content: any[]): string {
  let out = '';
  for (const el of content || []) {
    if (el.paragraph) {
      for (const pe of el.paragraph.elements || []) if (pe.textRun?.content) out += pe.textRun.content;
    } else if (el.table) {
      for (const row of el.table.tableRows || []) {
        for (const cell of row.tableCells || []) out += textoDeContenido(cell.content || []);
      }
    }
  }
  return out;
}
function textoDeTab(tab: any): string {
  const titulo = tab?.tabProperties?.title || '';
  const cuerpo = textoDeContenido(tab?.documentTab?.body?.content || []);
  let out = titulo ? `\n===== ${titulo} =====\n${cuerpo}` : cuerpo;
  for (const child of tab?.childTabs || []) out += textoDeTab(child);
  return out;
}
function textoDeDoc(doc: any): string {
  if (Array.isArray(doc?.tabs) && doc.tabs.length > 0) return doc.tabs.map(textoDeTab).join('\n').trim();
  return textoDeContenido(doc?.body?.content || []).trim();
}
/* eslint-enable @typescript-eslint/no-explicit-any */

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonRes({ message: 'Solo POST' }, 405);

  const apiKey = Deno.env.get('BASE44_API_KEY') || '';
  if (!apiKey) return jsonRes({ message: 'BASE44_API_KEY no configurada' }, 500);

  let body: { id?: string };
  try { body = await req.json(); } catch { return jsonRes({ message: 'Body JSON invalido' }, 400); }
  if (!body.id) return jsonRes({ message: 'id es requerido' }, 400);

  const rNota = await fetch(`https://wtapp.base44.app/api/entities/ReunionNota/${body.id}`, {
    headers: { 'api_key': apiKey },
  });
  if (!rNota.ok) return jsonRes({ message: 'ReunionNota no encontrada' }, 404);
  const nota = await rNota.json();

  let texto = '';

  // 1. Contenido ya guardado en file storage (lo que deja procesarNotaReunion).
  if (nota.contenido_url) {
    try {
      const r = await fetch(nota.contenido_url);
      if (r.ok) texto = await r.text();
    } catch { /* seguimos */ }
  }

  // 2. Google Doc (Drive/Gemini): TODAS las pestañas (Notas + Transcripción) vía Docs API.
  if (!texto.trim() && nota.doc_id) {
    try {
      const b44 = createClientFromRequest(req);
      const { accessToken } = await b44.asServiceRole.connectors.getConnection('googledrive');
      const rDoc = await fetch(
        `https://docs.googleapis.com/v1/documents/${nota.doc_id}?includeTabsContent=true`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      if (rDoc.ok) {
        texto = textoDeDoc(await rDoc.json());
      } else {
        const rExp = await fetch(
          `https://www.googleapis.com/drive/v3/files/${nota.doc_id}/export?mimeType=text/plain`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );
        if (rExp.ok) texto = await rExp.text();
      }
    } catch { /* sin acceso al doc: seguimos */ }
  }

  // 3. Cuerpo del correo (Gmail integrado de Base44) para notas de Gmail.
  if (!texto.trim() && nota.origen === 'Gmail' && nota.gmail_message_id) {
    try {
      const b44 = createClientFromRequest(req);
      const { accessToken } = await b44.asServiceRole.connectors.getConnection('gmail');
      const rMsg = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${nota.gmail_message_id}?format=full`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      if (rMsg.ok) {
        const full = await rMsg.json();
        texto = extraerCuerpo(full.payload || {}) || full.snippet || '';
      }
    } catch { /* seguimos */ }
  }

  // 4. Último recurso: el extracto guardado. Nunca fallamos con 500 por contenido.
  if (!texto.trim()) texto = nota.extracto || 'Sin contenido disponible.';
  return jsonRes({ texto });
});