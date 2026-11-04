// v2026-07-23.gmail-con-fallback
// Envio de emails por la API de Gmail de la cuenta conectada (ms@grouptso.com),
// para que salgan de ese correo sin ningún rastro de Base44.
// POST body: { modo: 'individual'|'campana'|'prueba', campana_id?, contacto_ids?, asunto, cuerpo_html?, plantilla_id?, email? }

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

function err400(msg: string) {
  return new Response(JSON.stringify({ message: msg }), { status: 400, headers: { 'Content-Type': 'application/json' } });
}
function err500(msg: string) {
  return new Response(JSON.stringify({ message: msg }), { status: 500, headers: { 'Content-Type': 'application/json' } });
}

function generarUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function reemplazarVariables(texto: string, c: Record<string, string>): string {
  return texto
    .replace(/\{\{nombre\}\}/gi, c.nombre || '')
    .replace(/\{\{empresa\}\}/gi, c.empresa || '')
    .replace(/\{\{sector\}\}/gi, c.sector || '')
    .replace(/\{\{ciudad\}\}/gi, c.ciudad || '')
    .replace(/\{\{cargo\}\}/gi, c.cargo || '');
}

function inyectarPixel(html: string, tid: string): string {
  const pixel = `<img src="https://wtapp.base44.app/api/functions/trackEmailOpen?tid=${tid}" width="1" height="1" style="display:none" alt="" />`;
  return html.includes('</body>') ? html.replace('</body>', `${pixel}</body>`) : html + pixel;
}

// ── Envío nativo por Gmail (cuenta conectada = ms@grouptso.com) ──
// Sale de esa cuenta, sin ningún rastro de Base44 en el remitente.
const REMITENTE = 'WeTracking <ms@grouptso.com>';

function b64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function b64url(str: string): string {
  return b64(new TextEncoder().encode(str)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function encSubject(s: string): string {
  // RFC 2047 para asuntos con tildes/ñ.
  return `=?UTF-8?B?${b64(new TextEncoder().encode(s))}?=`;
}
async function enviarPorGmail(accessToken: string, to: string, subject: string, html: string): Promise<void> {
  const mime =
    `From: ${REMITENTE}\r\n` +
    `To: ${to}\r\n` +
    `Subject: ${encSubject(subject)}\r\n` +
    `MIME-Version: 1.0\r\n` +
    `Content-Type: text/html; charset=UTF-8\r\n\r\n` +
    html;
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: b64url(mime) }),
  });
  if (!r.ok) throw new Error(`Gmail ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

// ── Motor de segmentación (espejo de src/lib/segmentos.js) ──
function normSeg(s: unknown): string {
  return String(s ?? '').toLowerCase().trim();
}
type Criterio = { campo: string; operador: string; valor?: string };
function evaluarCriterio(contacto: Record<string, unknown>, cr: Criterio): boolean {
  if (!cr?.campo || !cr?.operador) return true;
  const cv = contacto[cr.campo];
  const v = cr.valor;
  switch (cr.operador) {
    case 'es': return normSeg(cv) === normSeg(v);
    case 'no_es': return normSeg(cv) !== normSeg(v);
    case 'contiene': return normSeg(cv).includes(normSeg(v));
    case 'vacio': return cv == null || String(cv).trim() === '';
    case 'no_vacio': return cv != null && String(cv).trim() !== '';
    case 'mayor': return Number(cv) > Number(v);
    case 'menor': return Number(cv) < Number(v);
    case 'mayor_igual': return Number(cv) >= Number(v);
    case 'menor_igual': return Number(cv) <= Number(v);
    case 'despues': return !!cv && new Date(cv as string) > new Date(v as string);
    case 'antes': return !!cv && new Date(cv as string) < new Date(v as string);
    default: return true;
  }
}
function cumpleSegmento(contacto: Record<string, unknown>, filtros: Criterio[], logica: string): boolean {
  const activos = (filtros || []).filter(f => f.campo && f.operador);
  if (activos.length === 0) return true;
  const res = activos.map(f => evaluarCriterio(contacto, f));
  return logica === 'OR' ? res.some(Boolean) : res.every(Boolean);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return err400('Solo POST');

  const base44 = createClientFromRequest(req);
  const appId = Deno.env.get('BASE44_APP_ID') || '';
  const apiKey = Deno.env.get('BASE44_API_KEY') || '';
  if (!apiKey) return err500('BASE44_API_KEY no configurada');

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err400('Body JSON invalido'); }

  const { modo, campana_id, contacto_ids, asunto, cuerpo_html, plantilla_id, email: emailPrueba } = body as {
    modo: 'individual' | 'campana' | 'prueba';
    campana_id?: string;
    contacto_ids?: string[];
    asunto?: string;
    cuerpo_html?: string;
    plantilla_id?: string;
    email?: string;
  };

  if (!asunto) return err400('asunto es requerido');

  const BASE_URL = 'https://wtapp.base44.app';
  const hdrs = { 'api_key': apiKey, 'Content-Type': 'application/json' };

  // Resolver HTML
  let htmlResuelto = cuerpo_html || '';
  if (!htmlResuelto && plantilla_id) {
    const rP = await fetch(`${BASE_URL}/api/entities/PlantillaEmail/${plantilla_id}`, { headers: hdrs });
    if (rP.ok) {
      const p = await rP.json();
      htmlResuelto = p.cuerpo_html || '';
      if (!htmlResuelto && p.cuerpo_html_url) {
        const rH = await fetch(p.cuerpo_html_url);
        if (rH.ok) htmlResuelto = await rH.text();
      }
    }
  }
  if (!htmlResuelto) return err400('No hay HTML en la plantilla. Abre la plantilla, agrega el cuerpo y usa Enviar prueba desde el modal de edicion.');

  // Resolver destinatarios
  let contactos: Record<string, string>[] = [];

  if (modo === 'prueba') {
    if (!emailPrueba) return err400('email requerido para modo prueba');
    contactos = [{ id: 'prueba', email: emailPrueba, nombre: 'Carlos Ramirez', empresa: 'Bodegas del Norte', sector: 'Bodegas', ciudad: 'Bogota', cargo: 'Gerente de Operaciones' }];

  } else if (modo === 'campana' && campana_id) {
    const rCamp = await fetch(`${BASE_URL}/api/entities/Campana/${campana_id}`, { headers: hdrs });
    if (!rCamp.ok) return err400('Campaña no encontrada');
    const camp = await rCamp.json();

    // Cargar todos los contactos con email y filtrar por el segmento
    const rC = await fetch(`${BASE_URL}/api/entities/Contacto?limit=1000`, { headers: hdrs });
    const todos: Record<string, string>[] = rC.ok ? (await rC.json()).filter((c: Record<string, string>) => c.email) : [];

    if (camp.segmento_id) {
      // Segmento guardado (criterios flexibles), por contacto o por empresa
      const rSeg = await fetch(`${BASE_URL}/api/entities/Segmento/${camp.segmento_id}`, { headers: hdrs });
      if (rSeg.ok) {
        const seg = await rSeg.json();
        if (seg.tipo === 'empresa') {
          // Filtrar empresas y quedarnos con los contactos de esas empresas
          const rEmp = await fetch(`${BASE_URL}/api/entities/Empresa?limit=1000`, { headers: hdrs });
          const empresas: Record<string, string>[] = rEmp.ok ? await rEmp.json() : [];
          const idsMatch = new Set(
            empresas.filter(e => cumpleSegmento(e, seg.filtros || [], seg.logica || 'AND')).map(e => e.id)
          );
          contactos = todos.filter(c => c.empresa_id && idsMatch.has(c.empresa_id));
        } else {
          contactos = todos.filter(c => cumpleSegmento(c, seg.filtros || [], seg.logica || 'AND'));
        }
      } else {
        contactos = todos;
      }
    } else if (camp.segmento) {
      // Segmento inline legacy { sector, etapa_pipeline, ciudad }
      const s = camp.segmento;
      contactos = todos.filter(c =>
        (!s.sector || normSeg(c.sector) === normSeg(s.sector)) &&
        (!s.etapa_pipeline || normSeg(c.etapa_pipeline) === normSeg(s.etapa_pipeline)) &&
        (!s.ciudad || normSeg(c.ciudad) === normSeg(s.ciudad))
      );
    } else {
      contactos = todos;
    }

    await fetch(`${BASE_URL}/api/entities/Campana/${campana_id}`, { method: 'PUT', headers: hdrs, body: JSON.stringify({ estado: 'Enviando' }) });

  } else if (modo === 'individual' && contacto_ids?.length) {
    for (const id of contacto_ids) {
      const r = await fetch(`${BASE_URL}/api/entities/Contacto/${id}`, { headers: hdrs });
      if (r.ok) { const c = await r.json(); if (c.email) contactos.push(c); }
    }
  }

  if (contactos.length === 0) return err400('No hay contactos con email en el segmento');

  // Token del Gmail conectado (ms@grouptso.com) para enviar de forma nativa.
  // Si no está disponible (o luego falla el envío), se cae al método de Base44.
  let accessToken = '';
  try {
    const conn = await base44.asServiceRole.connectors.getConnection('gmail');
    accessToken = conn.accessToken || '';
  } catch { accessToken = ''; }
  let usarGmail = !!accessToken;

  const resultados: { nombre: string; email: string; ok: boolean; error?: string }[] = [];
  let enviados = 0;

  for (const contacto of contactos) {
    const tid = generarUUID();
    const asuntoFinal = reemplazarVariables(asunto, contacto);
    const htmlFinal = inyectarPixel(reemplazarVariables(htmlResuelto, contacto), tid);

    try {
      if (usarGmail) {
        try {
          await enviarPorGmail(accessToken, contacto.email, asuntoFinal, htmlFinal);
        } catch {
          // Gmail sin permiso de envío (u otro fallo): cae a Base44 y ya no reintenta Gmail.
          usarGmail = false;
          await base44.integrations.Core.SendEmail({ to: contacto.email, subject: asuntoFinal, body: htmlFinal, from_name: 'WeTracking' });
        }
      } else {
        await base44.integrations.Core.SendEmail({ to: contacto.email, subject: asuntoFinal, body: htmlFinal, from_name: 'WeTracking' });
      }
      enviados++;
      resultados.push({ nombre: contacto.nombre, email: contacto.email, ok: true });
    } catch (e) {
      resultados.push({ nombre: contacto.nombre, email: contacto.email, ok: false, error: String(e?.message || e).slice(0, 300) });
    }

    if (modo !== 'prueba') {
      await fetch(`${BASE_URL}/api/entities/EmailEnviado`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ contacto_id: contacto.id, campana_id: campana_id || null, email_destino: contacto.email, nombre_destino: contacto.nombre, asunto: asuntoFinal, estado: resultados[resultados.length - 1].ok ? 'Enviado' : 'Rebotado', fecha_envio: new Date().toISOString(), tracking_id: tid }),
      });
    }
  }

  if (campana_id) {
    await fetch(`${BASE_URL}/api/entities/Campana/${campana_id}`, { method: 'PUT', headers: hdrs, body: JSON.stringify({ estado: 'Enviada', total_enviados: enviados }) });
  }

  return new Response(JSON.stringify({ mensaje: `${enviados}/${contactos.length} emails enviados`, resultados }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});