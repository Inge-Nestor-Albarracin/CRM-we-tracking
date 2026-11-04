// Helpers compartidos para procesar correos de Gmail y respuestas HTTP JSON.
// Usado por syncEmailToNota y procesarNotaReunion.

export function jsonRes(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

export function decodeB64Url(data: string): string {
  try {
    const bin = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder('utf-8').decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch { return ''; }
}

// base64url de un string UTF-8 (para el raw MIME de Gmail al enviar correos).
export function b64url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Como extraerCuerpo pero devuelve html y texto por separado (para mostrar el correo en la UI).
export function extraerCuerpoParts(payload: GmailPart): { html: string; texto: string } {
  let plano = ''; let html = '';
  (function walk(p: GmailPart) {
    if (!p) return;
    if (p.mimeType === 'text/plain' && p.body?.data) plano += decodeB64Url(p.body.data) + '\n';
    else if (p.mimeType === 'text/html' && p.body?.data) html += decodeB64Url(p.body.data) + '\n';
    (p.parts || []).forEach(walk);
  })(payload);
  return { html, texto: plano };
}

export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n').replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export type GmailPart = { mimeType?: string; body?: { data?: string; size?: number }; parts?: GmailPart[] };

// Recorre el arbol de partes MIME y devuelve el mejor cuerpo de texto disponible.
export function extraerCuerpo(payload: GmailPart): string {
  let plano = ''; let html = '';
  (function walk(p: GmailPart) {
    if (!p) return;
    if (p.mimeType === 'text/plain' && p.body?.data) plano += decodeB64Url(p.body.data) + '\n';
    else if (p.mimeType === 'text/html' && p.body?.data) html += decodeB64Url(p.body.data) + '\n';
    (p.parts || []).forEach(walk);
  })(payload);
  return (plano.trim() || (html.trim() ? stripHtml(html) : '')).trim();
}