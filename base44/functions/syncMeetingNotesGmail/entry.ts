// v2026-08-04.todas-las-notas-gemini (asunto "Notas:" -> toma TODAS las reuniones, no solo Comité/WT)
// Sincroniza notas de reuniones desde el Gmail conectado (conector integrado "gmail").
// Busca los correos "Notas de Gemini" de reuniones de WeTracking (identificadas por
// incluir alguno de los correos del equipo), deduplica por gmail_message_id y crea
// ReunionNota en estado Pendiente. El FRONTEND encadena procesarNotaReunion por cada
// id creada (evita timeouts funcion->funcion), igual que el sync de Drive.
// POST body: { query?: string, max?: number } -> { creadas: [ids], omitidas: n, errores: [] }
// Env: BASE44_API_KEY. Conexion compartida via getConnection('gmail').

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const BASE_URL = 'https://wtapp.base44.app';

// Correos del equipo WeTracking. RESERVADO para el filtro por integrantes que se
// activará más adelante (además del correo propio). Por ahora se filtra por título.
const EMAILS_WETRACKING = [
  'ingenierodesarrollo@wetracking.co',
  'karen@grouptso.com',
  'direccioncomercial@grouptso.com',
];

// Por ahora: una reunión es de WeTracking si su TÍTULO dice "Comité"/"Comite" o "WeTracking".
function tituloEsWeTracking(titulo: string): boolean {
  const t = (titulo || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return t.includes('comite') || t.includes('wetracking');
}

// Reuniones que NUNCA se importan ni se procesan (Comité Comercial, LINK trabajo remoto, Gastii, AAXA).
// OJO: "Comité W.T." (WeTracking) SÍ se conserva.
function tituloExcluido(titulo: string): boolean {
  const t = (titulo || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return /comite\s*comercial/.test(t) || /trabajo\s*remoto/.test(t) || /gasti+/.test(t) || t.includes('aaxa');
}

// Query por defecto: correos "Notas de Gemini" cuyo asunto tenga "comite" o "wetracking".
// Se puede sobreescribir con body.query (ej. 'label:Reuniones' o un asunto propio).
// Todos los correos de "Notas de Gemini" empiezan con "Notas:" en el asunto -> los tomamos TODOS
// (cualquier reunión, no solo Comité/WeTracking). Las excluidas se filtran aparte.
// Conector Gmail POR USUARIO (cada quien conecta su cuenta en Configuracion ->
// Integraciones). Es el mismo que usa la pestana Correo del Perfil.
const GMAIL_PERSONAL_CONNECTOR_ID = '6a739cba0cfbf2c423f6d6f2';

const QUERY_DEFAULT = 'subject:Notas newer_than:180d';

function jsonRes(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

// Decodifica base64url (Gmail usa base64url en los bodies)
function decodeB64Url(data: string): string {
  try {
    const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return '';
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>(?=)/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Recorre el arbol de partes MIME buscando el mejor cuerpo de texto.
type GmailPart = {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
};

function extraerCuerpo(payload: GmailPart): { texto: string; html: string } {
  let plano = '';
  let html = '';
  function walk(part: GmailPart) {
    if (!part) return;
    const mt = part.mimeType || '';
    if (mt === 'text/plain' && part.body?.data) {
      plano += decodeB64Url(part.body.data) + '\n';
    } else if (mt === 'text/html' && part.body?.data) {
      html += decodeB64Url(part.body.data) + '\n';
    }
    (part.parts || []).forEach(walk);
  }
  walk(payload);
  const texto = plano.trim() || (html.trim() ? stripHtml(html) : '');
  return { texto: texto.trim(), html };
}

function header(headers: { name: string; value: string }[], nombre: string): string {
  const h = (headers || []).find((x) => x.name?.toLowerCase() === nombre.toLowerCase());
  return h?.value || '';
}

// Encuentra el primer link a un Google Doc en el cuerpo (HTML o texto) -> { docId, docUrl }
// Gemini suele envolver el link en un redirect google.com/url?q=... percent-encoded,
// así que buscamos también en una versión decodificada del contenido.
function extraerDocLink(...textos: string[]): { docId: string; docUrl: string } {
  const re = /docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]{20,})/;
  for (const t of textos) {
    if (!t) continue;
    let decoded = t;
    try { decoded = decodeURIComponent(t.replace(/\+/g, ' ')); } catch { /* keep raw */ }
    const m = t.match(re) || decoded.match(re);
    if (m) return { docId: m[1], docUrl: `https://docs.google.com/document/d/${m[1]}/edit` };
  }
  return { docId: '', docUrl: '' };
}

// "Notas: CÓMITE COMERCIAL 22 jun 2026" -> "CÓMITE COMERCIAL 22 jun 2026"
function limpiarTitulo(asunto: string): string {
  return asunto.replace(/^\s*notas\s*:\s*/i, '').trim() || asunto;
}

// Identidad de reunión (fecha|título normalizado) para deduplicar la MISMA reunión
// que llegó por varias cuentas/fuentes (comités con varios del equipo).
function normalizarTitulo(titulo: string): string {
  return (titulo || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/notas?\s+de\s+gemini/g, ' ')
    .replace(/^\s*notas?\s*:?\s*/i, '')
    .replace(/gmt\s*[+-]?\s*\d{1,2}:?\d{2}/g, ' ')
    .replace(/\d{4}[/.-]\d{1,2}[/.-]\d{1,2}/g, ' ')
    .replace(/\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/g, ' ')
    .replace(/\d{1,2}:\d{2}(:\d{2})?/g, ' ')
    .replace(/\d{1,2}\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[a-z]*\.?\s+\d{2,4}/g, ' ')
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function claveReunion(titulo: string, fecha: string): string {
  return `${String(fecha || '').slice(0, 10)}|${normalizarTitulo(titulo)}`;
}

Deno.serve(async (req) => {
  // ?probe=conectores -> prueba QUE conexiones de Gmail se pueden obtener SIN sesion
  // de usuario (que es la situacion del cron) y de que cuenta es cada una. De esto
  // depende si el escaneo diario puede leer el correo de Karen.
  if (new URL(req.url).searchParams.get('probe') === 'conectores') {
    const KAREN = '6a739cba0cfbf2c423f6d6f2';
    const b44x: any = createClientFromRequest(req);
    const cx = b44x.asServiceRole.connectors;
    const intentos: Array<[string, () => Promise<any>]> = [
      ['getConnection("gmail")', () => cx.getConnection('gmail')],
      ['getConnection(idKaren)', () => cx.getConnection(KAREN)],
      ['getWorkspaceConnection("gmail")', () => cx.getWorkspaceConnection?.('gmail')],
      ['getWorkspaceConnection(idKaren)', () => cx.getWorkspaceConnection?.(KAREN)],
      ['getCurrentAppUserConnection(idKaren)', () => cx.getCurrentAppUserConnection?.(KAREN)],
    ];
    const out: Record<string, string> = { metodos_disponibles: Object.keys(cx || {}).join(', ') || '(no enumerables)' };
    for (const [nombre, fn] of intentos) {
      try {
        const conn = await fn();
        const tok = conn?.accessToken;
        if (!tok) { out[nombre] = 'sin accessToken'; continue; }
        // ¿de quien es esta cuenta?
        const rp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { Authorization: `Bearer ${tok}` } });
        out[nombre] = rp.ok ? `OK -> ${(await rp.json()).emailAddress}` : `token OK pero gmail ${rp.status}`;
      } catch (e) { out[nombre] = `ERROR: ${String((e as Error)?.message || e).slice(0, 110)}`; }
    }
    return jsonRes(out);
  }

  if (req.method !== 'POST') return jsonRes({ message: 'Solo POST' }, 405);

  const apiKey = Deno.env.get('BASE44_API_KEY') || '';
  if (!apiKey) return jsonRes({ message: 'BASE44_API_KEY no configurada' }, 500);
  const hdrs = { 'api_key': apiKey, 'Content-Type': 'application/json' };

  let body: { query?: string; max?: number; personal?: boolean } = {};
  try { body = await req.json(); } catch { body = {}; }
  const queryCustom = !!(body.query && body.query.trim());
  const query = queryCustom ? body.query!.trim() : QUERY_DEFAULT;
  const max = Math.min(Math.max(Number(body.max) || 60, 1), 100);

  // DOS MODOS:
  //  personal:true -> lee el Gmail DE QUIEN ESTA LOGUEADO (conector por usuario, el
  //    mismo patron que ya usan syncMeetingNotesTeams y syncMeetingNotesOneDrive).
  //    Asi cada miembro del equipo procesa SUS propias notas de Gemini, sin reenvios
  //    ni buzon central. Requiere sesion, asi que lo dispara el frontend.
  //  por defecto    -> cuenta central compartida (conector 'gmail'), para el cron.
  // El dedup por clave fecha|titulo evita que una reunion con varios asistentes se
  // procese una vez por cada persona que la sincronice.
  let accessToken: string;
  let modo = 'central';
  try {
    const b44 = createClientFromRequest(req);
    if (body.personal === true) {
      const user = await b44.auth.me();
      if (!user) return jsonRes({ connected: false, message: 'El modo personal requiere sesion de usuario' }, 401);
      ({ accessToken } = await b44.asServiceRole.connectors.getCurrentAppUserConnection(GMAIL_PERSONAL_CONNECTOR_ID));
      modo = `personal:${user.email || ''}`;
    } else {
      ({ accessToken } = await b44.asServiceRole.connectors.getConnection('gmail'));
    }
  } catch (e) {
    // 200 a proposito (igual que syncMeetingNotesTeams): "no conectado" no es un error
    // de la llamada, y con 4xx el SDK del frontend lanza excepcion y se pierde el mensaje.
    return jsonRes({
      connected: false,
      message: body.personal
        ? `No tienes tu Gmail conectado. Conectalo en Configuracion -> Integraciones. Detalle: ${String(e).slice(0, 160)}`
        : `Gmail no conectado. Conectalo en Base44 -> Integraciones (conector "gmail"). Detalle: ${String(e).slice(0, 160)}`,
    });
  }
  const gHdrs = { 'Authorization': `Bearer ${accessToken}` };

  // 1. Listar mensajes que hacen match con la busqueda
  const rList = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${max}`,
    { headers: gHdrs }
  );
  if (!rList.ok) {
    const txt = (await rList.text()).slice(0, 200);
    if (rList.status === 401 || rList.status === 403) {
      return jsonRes({ connected: false, message: `Sin permiso de lectura de Gmail. Reconecta la cuenta con el scope gmail.readonly. (${rList.status}: ${txt})` }, 400);
    }
    return jsonRes({ message: `Gmail list ${rList.status}: ${txt}` }, 500);
  }
  const { messages = [] } = await rList.json();

  const creadas: string[] = [];
  const errores: string[] = [];
  let omitidas = 0;

  // Índice de reuniones ya existentes (fecha|título) para no duplicar la misma reunión
  // que ya entró por Drive/Teams u otra cuenta.
  const clavesExistentes = new Set<string>();
  try {
    const rAll = await fetch(`${BASE_URL}/api/entities/ReunionNota?limit=1000`, { headers: hdrs });
    if (rAll.ok) { const todas = await rAll.json(); for (const r of (todas || [])) if (r?.titulo && r?.fecha_reunion) clavesExistentes.add(claveReunion(r.titulo, r.fecha_reunion)); }
  } catch { /* si falla, seguimos con dedup por gmail_message_id */ }

  for (const msg of messages as { id: string }[]) {
    try {
      // Dedup por gmail_message_id
      const rEx = await fetch(`${BASE_URL}/api/entities/ReunionNota?gmail_message_id=${encodeURIComponent(msg.id)}`, { headers: hdrs });
      if (rEx.ok) {
        const existentes = await rEx.json();
        if (Array.isArray(existentes) && existentes.length > 0) { omitidas++; continue; }
      }

      // Traer el mensaje completo
      const rMsg = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
        { headers: gHdrs }
      );
      if (!rMsg.ok) { errores.push(`${msg.id}: get ${rMsg.status}`); continue; }
      const full = await rMsg.json();

      const heads = full.payload?.headers || [];
      const asunto = header(heads, 'Subject') || '(sin asunto)';
      const remitente = header(heads, 'From') || '';

      // Con la búsqueda por defecto, solo aceptamos los correos de Gemini, cuyo asunto
      // empieza por "Notas:" (evita "Documento compartido contigo: Notas..." y similares)
      if (!queryCustom && !/^\s*notas\s*:/i.test(asunto)) { omitidas++; continue; }

      // Excluidas: Comité Comercial / trabajo remoto / Gastii -> nunca importar (aunque sea query custom)
      if (tituloExcluido(limpiarTitulo(asunto))) { omitidas++; continue; }

      // Se aceptan TODAS las notas de Gemini (asunto "Notas:"), no solo Comité/WeTracking:
      // así entran las reuniones con clientes (Amplex, etc.). Solo se descartan las excluidas (arriba).

      const fechaMs = Number(full.internalDate) || Date.now();
      const fechaISO = new Date(fechaMs).toISOString().slice(0, 10);
      // Junio 2026 hacia atrás -> nunca importar
      if (fechaISO < '2026-07-01') { omitidas++; continue; }
      // Dedup por identidad de reunión (misma fecha+título llegada por otra cuenta/fuente)
      const claveR = claveReunion(limpiarTitulo(asunto), fechaISO);
      if (clavesExistentes.has(claveR)) { omitidas++; continue; }

      const { texto: cuerpo, html } = extraerCuerpo(full.payload || {});
      const extracto = (cuerpo || full.snippet || '').slice(0, 800);
      // Las notas de Gemini enlazan el Google Doc con el detalle completo
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
          extracto,
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

  return jsonRes({ modo, creadas, omitidas, errores, total_encontrados: messages.length });
});