// v2026-08-04.nova-acceso-contactos (contexto FULL de contactos + editar_contacto/empresa + correos)
// Copiloto interno de WeTracking ("Nova") — endpoint HTTP para el chat en la app.
// Tiene EXACTAMENTE las mismas capacidades que Nova en Telegram (mismas acciones y
// asesor de tags RFID), pero la salida es para el chat web: responde en Markdown
// (tablas incluidas) y "envía" archivos como enlaces [Abrir](...) dentro de la respuesta.
// AUTOCONTENIDO (sin imports compartidos) para deploy sin problemas en Base44.
// POST { mensaje: string, historial?: {role,content}[] } -> { respuesta, acciones_ejecutadas }
// Env: BASE44_API_KEY, ANTHROPIC_API_KEY.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
const BASE_URL = 'https://wtapp.base44.app';
const APP_URL = 'https://crm.wetracking.co';

// Crea un evento en el Google Calendar del equipo (conexión de app 'googlecalendar').
// acc: { titulo, fecha (YYYY-MM-DD), hora? (HH:mm 24h), fecha_fin?, descripcion?, invitados?, con_meet? }
async function crearEventoGoogle(accessToken: string, acc: any): Promise<{ ok: boolean; detalle: string; link?: string; meet?: string }> {
  const titulo = String(acc.titulo || '').trim();
  const fecha = String(acc.fecha || '').slice(0, 10);
  if (!titulo || !fecha) return { ok: false, detalle: 'Falta título o fecha del evento' };
  const hora = acc.hora ? String(acc.hora) : '';
  const fechaFin = acc.fecha_fin ? String(acc.fecha_fin).slice(0, 10) : '';
  let startObj: any, endObj: any;
  if (hora) {
    const [h, min] = hora.split(':').map((n: string) => parseInt(n, 10));
    const totalEnd = h * 60 + (min || 0) + (Number(acc.duracion_min) || 30);
    const eH = String(Math.floor(totalEnd / 60) % 24).padStart(2, '0');
    const eM = String(totalEnd % 60).padStart(2, '0');
    const endDate = totalEnd >= 1440 ? new Date(new Date(fecha).getTime() + 864e5).toISOString().slice(0, 10) : fecha;
    const hhmm = `${String(h).padStart(2, '0')}:${String(min || 0).padStart(2, '0')}`;
    startObj = { dateTime: `${fecha}T${hhmm}:00`, timeZone: 'America/Bogota' };
    endObj = { dateTime: `${endDate}T${eH}:${eM}:00`, timeZone: 'America/Bogota' };
  } else {
    const base = (fechaFin && fechaFin >= fecha) ? fechaFin : fecha;
    const finExcl = new Date(base + 'T00:00:00'); finExcl.setDate(finExcl.getDate() + 1);
    startObj = { date: fecha };
    endObj = { date: finExcl.toISOString().slice(0, 10) };
  }
  const attendees = String(acc.invitados || '').split(/[,;\s]+/).map((s: string) => s.trim().toLowerCase())
    .filter((s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)).map((email: string) => ({ email }));
  const conMeet = acc.con_meet === true || acc.con_meet === 'true' || /meet|si|sí/i.test(String(acc.con_meet || ''));
  const body: any = { summary: titulo, colorId: '5', start: startObj, end: endObj };
  if (acc.descripcion) body.description = String(acc.descripcion);
  if (attendees.length) body.attendees = attendees;
  if (conMeet) body.conferenceData = { createRequest: { requestId: `nova-${Date.now()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } };
  const params = new URLSearchParams();
  if (conMeet) params.set('conferenceDataVersion', '1');
  if (attendees.length) params.set('sendUpdates', 'all');
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events${qs}`, {
    method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) return { ok: false, detalle: `Calendar ${res.status}: ${(await res.text()).slice(0, 120)}` };
  const ev = await res.json();
  const meet = ev.hangoutLink || (ev.conferenceData?.entryPoints || []).find((x: any) => x.entryPointType === 'video')?.uri || '';
  return { ok: true, detalle: `Evento "${titulo}" (${fecha}${hora ? ' ' + hora : ''})${attendees.length ? ` · ${attendees.length} invitado(s)` : ''}`, link: ev.htmlLink, meet };
}

// Envía un correo desde la cuenta Gmail conectada (ms@grouptso.com) vía el conector 'gmail'.
// acc: { para, asunto?, cuerpo }
async function enviarCorreoGmail(accessToken: string, acc: any): Promise<{ ok: boolean; detalle: string }> {
  const para = String(acc.para || acc.to || acc.destinatario || '').trim();
  const asunto = String(acc.asunto || '(sin asunto)');
  const cuerpo = String(acc.cuerpo || acc.mensaje || acc.body || '');
  if (!para || !cuerpo) return { ok: false, detalle: 'Falta el destinatario o el cuerpo del correo' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(para)) return { ok: false, detalle: `Correo de destino inválido: ${para}` };
  const b64url = (str: string) => {
    const bytes = new TextEncoder().encode(str);
    let bin = ''; bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const encAsunto = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(asunto)))}?=`;
  const mime = [
    `To: ${para}`,
    `Subject: ${encAsunto}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
  ].join('\r\n') + '\r\n\r\n' + cuerpo;
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: b64url(mime) }),
  });
  if (!r.ok) return { ok: false, detalle: `Gmail ${r.status}: ${(await r.text()).slice(0, 120)}` };
  return { ok: true, detalle: `Correo enviado a ${para} — "${asunto}"` };
}

function jsonRes(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
function normalizar(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}
function fmtCOP(v: number): string { return '$' + Math.round(Number(v) || 0).toLocaleString('es-CO'); }

// Proxy de archivos: convierte cualquier URL de storage de Base44 (media.base44.com o
// base44.app/api/apps/.../files) en una URL del dominio propio (crm.wetracking.co).
// Los links externos (Canva/Drive/YouTube) se devuelven tal cual.
function urlArchivo(u: string): string {
  if (!u || typeof u !== 'string') return u;
  let parsed: URL;
  try { parsed = new URL(u); } catch { return u; }
  const host = parsed.hostname;
  const esFile = host === 'media.base44.com'
    || (/(^|\.)base44\.app$/.test(host) && /\/(files|images)\//.test(parsed.pathname))
    || (host === 'app.base44.com' && /\/(files|images)\//.test(parsed.pathname));
  if (!esFile) return u;
  return `${APP_URL}/api/apps/6a43f4eff47c0d92cfe2b575/functions/archivo?p=${encodeURIComponent(parsed.pathname)}`;
}

// Equipo interno de WeTracking (por correo Y por nombre). Tareas de estos = "equipo"; el resto = "cliente".
const EQUIPO_EMAILS = ['karen@grouptso.com', 'ingenierodesarrollo@wetracking.co', 'ms@grouptso.com', 'ts@grouptso.com', 'direccioncomercial@grouptso.com'];
const EQUIPO_NOMBRES = ['david pernett', 'karen rojas', 'thomas schonlau', 'massimiliano schonlau', 'gisell reyes'];
function nombreEsEquipo(nombre: string): boolean {
  const n = normalizar(nombre || '');
  if (!n) return false;
  return EQUIPO_NOMBRES.some((tn) => {
    const [nom, ape] = tn.split(' ');
    if (n === tn || n.includes(tn)) return true;
    return !!ape && n.includes(nom) && n.includes(ape);
  });
}
function esTareaEquipo(t: any): boolean {
  const email = String(t.asignado_a || '').toLowerCase();
  if (email && EQUIPO_EMAILS.includes(email)) return true;
  if (nombreEsEquipo(t.responsable) || nombreEsEquipo(t.asignado_a)) return true;
  if (t.ambito === 'equipo') return true;
  if (t.ambito === 'cliente') return false;
  return true; // sin datos -> equipo por defecto
}

// Detecta si un item de biblioteca (video/presentación) es un ARCHIVO subido.
function esArchivoSubido(item: any): boolean {
  if (!item) return false;
  if (item.tipo === 'archivo') return true;
  const u = String(item.url || '');
  if (/media\.base44\.com|base44\.app\/api\/apps\/[^/]+\/files\//i.test(u)) return true;
  if (/\.(pdf|pptx?|docx?|xlsx?|mp4|mov|avi|png|jpe?g)(\?|#|$)/i.test(u)) return true;
  return false;
}

// ─────────── Ejecutor de acciones (crear/manipular el CRM) ───────────
function idPorNombre(nombre: string, lista: any[]): string | null {
  const n = normalizar(nombre);
  if (!n) return null;
  for (const it of lista) {
    const ln = normalizar(it.nombre || '');
    if (ln && (ln === n || ln.includes(n) || n.includes(ln))) return it.id;
  }
  return null;
}

async function ejecutarAccion(
  acc: any,
  ctx: { hdrs: any; empresas: any[]; contactos: any[]; productos: any[]; usuarios: any[]; cotizaciones: any[]; empresaNombre: Record<string, string> },
): Promise<{ ok: boolean; detalle: string } | null> {
  const { hdrs, empresas, contactos, productos, usuarios, cotizaciones, empresaNombre } = ctx;
  const hoyStr = new Date().toISOString().slice(0, 10);
  const crear = async (entidad: string, payload: any) => {
    try { const r = await fetch(`${BASE_URL}/api/entities/${entidad}`, { method: 'POST', headers: hdrs, body: JSON.stringify(payload) }); return r.ok; }
    catch { return false; }
  };
  // Actualiza un registro existente (PUT full-replace: se parte del objeto actual + los cambios).
  const actualizar = async (entidad: string, actual: any, patch: any) => {
    try {
      const { id, created_date: _cd, updated_date: _ud, created_by: _cb, ...base } = actual;
      Object.assign(base, patch);
      const r = await fetch(`${BASE_URL}/api/entities/${entidad}/${id}`, { method: 'PUT', headers: hdrs, body: JSON.stringify(base) });
      return r.ok;
    } catch { return false; }
  };
  try {
    const t = acc.tipo;
    if (t === 'crear_tarea' && acc.titulo) {
      const empId = acc.empresa_nombre ? idPorNombre(String(acc.empresa_nombre), empresas) : null;
      const emails = new Set(usuarios.map((u: any) => u.email));
      const p: any = { titulo: String(acc.titulo).slice(0, 140), fecha_limite: acc.fecha_limite || new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10), prioridad: acc.prioridad || 'Media' };
      if (acc.descripcion) p.descripcion = String(acc.descripcion);
      if (empId) p.empresa_id = empId;
      if (acc.asignado_a && emails.has(acc.asignado_a)) p.asignado_a = acc.asignado_a;
      p.ambito = acc.ambito === 'cliente' ? 'cliente' : 'equipo';
      if (acc.responsable) p.responsable = String(acc.responsable);
      return { ok: await crear('Tarea', p), detalle: `Tarea: ${p.titulo}${empId ? ` (${empresaNombre[empId]})` : ''}` };
    }
    if (t === 'crear_nota' && acc.texto) {
      const empId = acc.empresa_nombre ? idPorNombre(String(acc.empresa_nombre), empresas) : null;
      const p: any = { texto: String(acc.texto), fecha_nota: new Date().toISOString() };
      if (empId) p.empresa_id = empId;
      return { ok: await crear('Nota', p), detalle: `Nota${empId ? ` en ${empresaNombre[empId]}` : ''}` };
    }
    if (t === 'crear_empresa' && acc.nombre) {
      const p: any = { nombre: String(acc.nombre).slice(0, 150), estado: acc.estado || 'Activo' };
      for (const f of ['sector', 'ciudad', 'pais', 'direccion', 'telefono', 'email', 'dominio_web']) if (acc[f]) p[f] = String(acc[f]);
      return { ok: await crear('Empresa', p), detalle: `Empresa creada: ${p.nombre}` };
    }
    if (t === 'crear_contacto' && acc.nombre) {
      const empId = acc.empresa_nombre ? idPorNombre(String(acc.empresa_nombre), empresas) : null;
      const p: any = { nombre: String(acc.nombre).slice(0, 150) };
      if (empId) { p.empresa_id = empId; p.empresa = empresaNombre[empId]; }
      for (const f of ['email', 'telefono', 'cargo', 'sector', 'ciudad']) if (acc[f]) p[f] = String(acc[f]);
      return { ok: await crear('Contacto', p), detalle: `Contacto creado: ${p.nombre}${empId ? ` (${empresaNombre[empId]})` : ''}` };
    }
    if (t === 'editar_contacto' && acc.contacto_nombre) {
      const cid = idPorNombre(String(acc.contacto_nombre), contactos);
      const actual = contactos.find((c: any) => c.id === cid);
      if (!cid || !actual) return { ok: false, detalle: `No encontré el contacto "${acc.contacto_nombre}"` };
      const patch: any = {};
      for (const f of ['nombre', 'email', 'telefono', 'cargo', 'sector', 'ciudad', 'etapa_pipeline']) if (acc[f] != null && acc[f] !== '') patch[f] = String(acc[f]);
      if (acc.empresa_nombre) { const eid = idPorNombre(String(acc.empresa_nombre), empresas); if (eid) { patch.empresa_id = eid; patch.empresa = empresaNombre[eid]; } }
      if (!Object.keys(patch).length) return { ok: false, detalle: 'No me dijiste qué cambiar del contacto' };
      return { ok: await actualizar('Contacto', actual, patch), detalle: `Contacto "${actual.nombre}" actualizado (${Object.keys(patch).join(', ')})` };
    }
    if (t === 'editar_empresa' && acc.empresa_nombre) {
      const eid = idPorNombre(String(acc.empresa_nombre), empresas);
      const actual = empresas.find((e: any) => e.id === eid);
      if (!eid || !actual) return { ok: false, detalle: `No encontré la empresa "${acc.empresa_nombre}"` };
      const patch: any = {};
      for (const f of ['nombre', 'sector', 'ciudad', 'pais', 'direccion', 'telefono', 'email', 'dominio_web', 'estado']) if (acc[f] != null && acc[f] !== '') patch[f] = String(acc[f]);
      if (!Object.keys(patch).length) return { ok: false, detalle: 'No me dijiste qué cambiar de la empresa' };
      return { ok: await actualizar('Empresa', actual, patch), detalle: `Empresa "${actual.nombre}" actualizada (${Object.keys(patch).join(', ')})` };
    }
    if (t === 'crear_oportunidad' && acc.nombre) {
      const empId = acc.empresa_nombre ? idPorNombre(String(acc.empresa_nombre), empresas) : null;
      const p: any = { nombre: String(acc.nombre).slice(0, 150), etapa: acc.etapa || 'Visita_Inicial' };
      if (empId) p.empresa_id = empId;
      if (acc.valor != null) p.valor_estimado = Number(acc.valor) || 0;
      if (acc.fecha_cierre_estimada) p.fecha_cierre_estimada = acc.fecha_cierre_estimada;
      const contId = acc.contacto_nombre ? idPorNombre(String(acc.contacto_nombre), contactos) : null;
      if (contId) p.contacto_id = contId;
      return { ok: await crear('Oportunidad', p), detalle: `Oportunidad: ${p.nombre}${empId ? ` (${empresaNombre[empId]})` : ''}` };
    }
    if (t === 'crear_producto' && acc.nombre) {
      const p: any = { nombre: String(acc.nombre).slice(0, 150), activo: true };
      for (const f of ['sku', 'categoria', 'tipo_rfid', 'descripcion', 'unidad']) if (acc[f]) p[f] = String(acc[f]);
      if (acc.precio_venta != null) p.precio_venta = Number(acc.precio_venta) || 0;
      if (acc.stock_minimo != null) p.stock_minimo = Number(acc.stock_minimo) || 0;
      return { ok: await crear('Producto', p), detalle: `Producto creado: ${p.nombre}` };
    }
    if (t === 'movimiento_inventario' && acc.producto_nombre && acc.cantidad) {
      const prodId = idPorNombre(String(acc.producto_nombre), productos);
      if (!prodId) return { ok: false, detalle: `No encontré el producto "${acc.producto_nombre}"` };
      const tipoMov = String(acc.tipo_mov || acc.movimiento || 'entrada').toLowerCase();
      const p: any = { producto_id: prodId, tipo: ['entrada', 'salida', 'ajuste'].includes(tipoMov) ? tipoMov : 'entrada', cantidad: Number(acc.cantidad) || 0 };
      if (acc.motivo) p.motivo = String(acc.motivo);
      const prodNom = productos.find((x: any) => x.id === prodId)?.nombre || acc.producto_nombre;
      return { ok: await crear('MovimientoInventario', p), detalle: `Inventario: ${p.tipo} ${p.cantidad} de ${prodNom}` };
    }
    if (t === 'crear_cotizacion' && acc.empresa_nombre) {
      const empId = idPorNombre(String(acc.empresa_nombre), empresas);
      if (!empId) return { ok: false, detalle: `No encontré la empresa "${acc.empresa_nombre}"` };
      const esSoftware = String(acc.cot_tipo || acc.tipo_cotizacion || '').toLowerCase() === 'software';

      let items: any[]; let subtotal: number; let iva_pct: number; const sw: any = {};
      if (esSoftware) {
        const per = String(acc.sw_periodicidad || 'mensual').toLowerCase() === 'anual' ? 'anual' : 'mensual';
        const modulo = String(acc.sw_modulo || acc.modulo || 'inventarios').toLowerCase() === 'samm' ? 'samm' : 'inventarios';
        const activos = Number(acc.sw_activos) || 0;
        const usuariosSw = Number(acc.sw_usuarios) || 0;
        const gigas = Number(acc.sw_gigas) || 0;
        const solicitudes = Number(acc.sw_solicitudes) || 0;
        const precio = Number(acc.sw_precio ?? acc.precio ?? 0) || 0;
        const activosTxt = activos ? `${activos} activos` : 'los activos';
        const usuariosTxt = usuariosSw ? `${usuariosSw} usuarios` : 'los usuarios';
        let descripcion: string;
        if (acc.sw_descripcion || acc.descripcion_software) {
          descripcion = String(acc.sw_descripcion || acc.descripcion_software);
        } else if (modulo === 'samm') {
          const gigasTxt = gigas ? ` y ${gigas} Gigas de almacenamiento` : '';
          const solTxt = solicitudes ? `${solicitudes} solicitudes` : 'las solicitudes acordadas';
          descripcion = `Licenciamiento del software para ${usuariosTxt}, almacenamiento de ${activosTxt}${gigasTxt}, bajo modalidad de pago ${per}. Incluye acceso a la academia virtual de WeTracking con capacitaciones y material de apoyo, acceso a la versión SAMM Web y App (SAMM 2.0), y soporte técnico con una cantidad de ${solTxt} al mes.`;
        } else {
          descripcion = `Costo de software fee ${per} con capacidad de almacenamiento para ${activosTxt} y ${usuariosTxt}, incluyendo el desarrollo de entradas y salidas con medición de tiempo por activo. Adicionalmente cuenta con 5 horas de soporte ${per} y capacitación.`;
        }
        const nombreSw = modulo === 'samm' ? `Plataforma SAMM (fee ${per})` : `Software WeTracking (fee ${per})`;
        items = [{ producto_nombre: nombreSw, descripcion, cantidad: 1, precio_unitario: precio, descuento_pct: 0, total_linea: precio }];
        subtotal = precio; iva_pct = 0;
        sw.sw_modulo = modulo; sw.sw_activos = activos; sw.sw_usuarios = usuariosSw; sw.sw_periodicidad = per;
        if (modulo === 'samm') { sw.sw_gigas = gigas; sw.sw_solicitudes = solicitudes; }
      } else {
        if (!Array.isArray(acc.items) || !acc.items.length) return { ok: false, detalle: 'Faltan los ítems de la cotización de hardware' };
        items = acc.items.map((it: any) => {
          const prodId = it.producto_nombre ? idPorNombre(String(it.producto_nombre), productos) : null;
          const prod = prodId ? productos.find((x: any) => x.id === prodId) : null;
          const precio = Number(it.precio_unitario ?? prod?.precio_venta ?? 0) || 0;
          const cant = Number(it.cantidad) || 1;
          const desc = Number(it.descuento_pct) || 0;
          return { producto_id: prodId || undefined, producto_nombre: it.producto_nombre || prod?.nombre || '', cantidad: cant, precio_unitario: precio, descuento_pct: desc, total_linea: Math.round(cant * precio * (1 - desc / 100)) };
        });
        subtotal = items.reduce((s: number, i: any) => s + i.total_linea, 0);
        iva_pct = Number(acc.iva_pct ?? 19);
      }
      const iva_valor = Math.round(subtotal * iva_pct / 100);
      const year = new Date().getFullYear();
      const re = new RegExp(`^COT-${year}-(\\d+)$`);
      const seqs = cotizaciones.map((c: any) => String(c.numero || '').match(re)).filter(Boolean).map((m: any) => parseInt(m![1], 10));
      const numero = `COT-${year}-${String((seqs.length ? Math.max(...seqs) : 0) + 1).padStart(3, '0')}`;
      const contId = acc.contacto_nombre ? idPorNombre(String(acc.contacto_nombre), contactos) : null;
      const envio = Number(acc.costo_envio) || 0;
      const p: any = { numero, tipo: esSoftware ? 'software' : 'hardware', empresa_id: empId, estado: 'Borrador', moneda: acc.moneda || 'COP', fecha_emision: hoyStr, validez_dias: Number(acc.validez_dias) || 15, items, subtotal, descuento_total: 0, iva_pct, iva_valor, costo_envio: envio, total: subtotal + iva_valor + envio, condiciones_pago: acc.condiciones_pago || '', ...sw };
      if (contId) p.contacto_id = contId;
      if (acc.notas) p.notas = String(acc.notas);
      const tt = esSoftware ? 'Software' : 'Hardware';
      return { ok: await crear('Cotizacion', p), detalle: `Cotización ${tt} ${numero} para ${empresaNombre[empId]} ($${(subtotal + iva_valor + envio).toLocaleString('es-CO')})${envio ? ` (incluye envío $${envio.toLocaleString('es-CO')})` : ''}` };
    }
    if (t === 'crear_meta' && acc.titulo) {
      const tipos = ['leads', 'cierres', 'revenue_usd'];
      const tipo = tipos.includes(String(acc.tipo_meta)) ? String(acc.tipo_meta) : 'leads';
      const now = new Date();
      const p: any = { titulo: String(acc.titulo).slice(0, 150), tipo, valor_meta: Number(acc.valor_meta) || 0, valor_actual: 0, mes: Number(acc.mes) || (now.getMonth() + 1), anio: Number(acc.anio) || now.getFullYear() };
      if (acc.descripcion) p.descripcion = String(acc.descripcion);
      const emails = new Set(usuarios.map((u: any) => u.email));
      if (acc.asignado_a && emails.has(acc.asignado_a)) p.asignado_a = acc.asignado_a;
      return { ok: await crear('Meta', p), detalle: `Meta: ${p.titulo} (${p.valor_meta} ${tipo}, ${p.mes}/${p.anio})` };
    }
    if (t === 'crear_recordatorio' && acc.titulo && (acc.fecha || acc.fecha_inicio)) {
      const f = String(acc.fecha_inicio || acc.fecha);
      const iso = f.includes('T') ? f : `${f}T09:00:00`;
      const d = new Date(iso);
      if (isNaN(d.getTime())) return { ok: false, detalle: 'Fecha inválida para el recordatorio' };
      const p: any = { titulo: String(acc.titulo).slice(0, 150), fecha_inicio: d.toISOString(), leido: false };
      if (acc.descripcion) p.descripcion = String(acc.descripcion);
      if (acc.ubicacion) p.ubicacion = String(acc.ubicacion);
      return { ok: await crear('AlertaCalendario', p), detalle: `Recordatorio: ${p.titulo} (${d.toLocaleString('es-CO')})` };
    }
    if (t === 'crear_segmento' && acc.nombre) {
      const p: any = {
        nombre: String(acc.nombre).slice(0, 120),
        tipo: acc.tipo_segmento === 'empresa' ? 'empresa' : 'contacto',
        logica: acc.logica === 'OR' ? 'OR' : 'AND',
        filtros: Array.isArray(acc.filtros) ? acc.filtros.map((x: any) => ({ campo: String(x.campo || ''), operador: String(x.operador || 'igual'), valor: String(x.valor ?? '') })) : [],
      };
      if (acc.descripcion) p.descripcion = String(acc.descripcion);
      return { ok: await crear('Segmento', p), detalle: `Segmento: ${p.nombre} (${p.filtros.length} filtro/s)` };
    }
    if (t === 'crear_plantilla' && acc.nombre && acc.asunto) {
      const cats = ['Prospeccion', 'Follow-up', 'Propuesta', 'Informativo'];
      const p: any = { nombre: String(acc.nombre).slice(0, 120), asunto: String(acc.asunto), cuerpo_html: String(acc.cuerpo_html || acc.cuerpo || ''), categoria: cats.includes(String(acc.categoria)) ? String(acc.categoria) : 'Prospeccion', activo: true };
      return { ok: await crear('PlantillaEmail', p), detalle: `Plantilla: ${p.nombre}` };
    }
    if (t === 'crear_campana' && acc.nombre && acc.asunto) {
      const p: any = { nombre: String(acc.nombre).slice(0, 120), asunto: String(acc.asunto), estado: 'Borrador' };
      try {
        if (acc.segmento_nombre) {
          const rS = await fetch(`${BASE_URL}/api/entities/Segmento?limit=200`, { headers: hdrs });
          if (rS.ok) { const segs = await rS.json(); const s = segs.find((x: any) => normalizar(x.nombre || '').includes(normalizar(String(acc.segmento_nombre)))); if (s) p.segmento_id = s.id; }
        }
        if (acc.plantilla_nombre) {
          const rP = await fetch(`${BASE_URL}/api/entities/PlantillaEmail?limit=200`, { headers: hdrs });
          if (rP.ok) { const pls = await rP.json(); const pl = pls.find((x: any) => normalizar(x.nombre || '').includes(normalizar(String(acc.plantilla_nombre)))); if (pl) p.plantilla_id = pl.id; }
        }
      } catch { /* resolución opcional */ }
      return { ok: await crear('Campana', p), detalle: `Campaña (borrador): ${p.nombre}` };
    }
    if (t === 'agregar_video' && acc.titulo && acc.url) {
      const cats = ['Redes', 'Caso_Exito', 'Informativo', 'Producto', 'Otro'];
      const p: any = { titulo: String(acc.titulo).slice(0, 150), categoria: cats.includes(String(acc.categoria)) ? String(acc.categoria) : 'Informativo', tipo: 'link', url: String(acc.url), activo: true };
      if (acc.descripcion) p.descripcion = String(acc.descripcion);
      return { ok: await crear('Video', p), detalle: `Video agregado: ${p.titulo}` };
    }
    if (t === 'agregar_presentacion' && acc.titulo && acc.url) {
      const cats = ['Comercial', 'Producto', 'Caso_Exito', 'Institucional', 'Propuesta', 'Otro'];
      const p: any = { titulo: String(acc.titulo).slice(0, 150), categoria: cats.includes(String(acc.categoria)) ? String(acc.categoria) : 'Comercial', tipo: 'link', url: String(acc.url), activo: true };
      if (acc.descripcion) p.descripcion = String(acc.descripcion);
      return { ok: await crear('Presentacion', p), detalle: `Presentación agregada: ${p.titulo}` };
    }
    return null;
  } catch (e) { return { ok: false, detalle: String(e).slice(0, 100) }; }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonRes({ message: 'Solo POST' }, 405);

  // SEG-02: solo usuarios con sesión en el CRM (antes aceptaba llamadas anónimas).
  {
    let u: any = null;
    try { u = await createClientFromRequest(req).auth.me(); } catch { /* sin sesión */ }
    if (!u?.email) return jsonRes({ message: 'No autenticado' }, 401);
  }

  const apiKey = Deno.env.get('BASE44_API_KEY') || '';
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') || '';
  if (!apiKey) return jsonRes({ message: 'BASE44_API_KEY no configurada' }, 500);
  if (!anthropicKey) return jsonRes({ message: 'ANTHROPIC_API_KEY no configurada' }, 500);

  let body: { mensaje?: string; historial?: { role: string; content: string }[] };
  try { body = await req.json(); } catch { return jsonRes({ message: 'Body JSON invalido' }, 400); }
  const mensaje = (body.mensaje || '').trim();
  if (!mensaje) return jsonRes({ message: 'mensaje es requerido' }, 400);
  const historial = Array.isArray(body.historial) ? body.historial.slice(-8) : [];

  const hdrs = { 'api_key': apiKey, 'Content-Type': 'application/json' };
  const b44 = createClientFromRequest(req);
  const get = async (path: string): Promise<any[]> => {
    try {
      const r = await fetch(`${BASE_URL}/api/entities/${path}`, { headers: hdrs });
      if (!r.ok) return [];
      const arr = await r.json();
      // ORDEN DETERMINISTA — critico para el prompt caching. La API no garantiza
      // el mismo orden entre llamadas; si el orden cambia, el texto del contexto
      // cambia, el prefijo deja de coincidir byte a byte y el cache NO pega (se
      // veia como "lectura 4.619 / escritura 24.924": solo pegaba la 1a capa).
      // Las paths que ya piden sort= se dejan como vienen: ese orden importa.
      return (Array.isArray(arr) && !path.includes('sort='))
        ? arr.sort((a: any, b: any) => String(a?.id || '').localeCompare(String(b?.id || '')))
        : arr;
    } catch { return []; }
  };

  try {
    const [empresas, oportunidades, cotizaciones, tareas, reuniones, productos, movimientos, contactos, usuarios, conversaciones, emails, campanas, segmentos, mensajesGrupo, videos, guiasTag, presentaciones, miembrosEquipo] =
      await Promise.all([
        get('Empresa?limit=500'), get('Oportunidad?limit=500'), get('Cotizacion?limit=300'),
        get('Tarea?limit=500'), get('ReunionNota?limit=25&sort=-fecha_reunion'), get('Producto?limit=500'),
        get('MovimientoInventario?limit=2000'), get('Contacto?limit=500'), get('User?limit=100'),
        get('Conversacion?limit=200&sort=-fecha_ultimo_mensaje'), get('EmailEnviado?limit=300'),
        get('Campana?limit=100'), get('Segmento?limit=100'), get('MensajeGrupoTelegram?limit=60&sort=-fecha'),
        get('Video?limit=200'), get('GuiaTag?limit=200'), get('Presentacion?limit=200'),
        get('MiembroEquipo?limit=200'),
      ]);
  // Desempate determinista en las listas que vienen con sort= de la API: si dos
  // registros empatan en el campo ordenado, el orden entre ellos puede variar y
  // eso solo basta para invalidar el cache. Las reuniones son la capa mas pesada.
  const _desempatar = (arr: any[], campo: string) => Array.isArray(arr) ? arr.sort((a: any, b: any) => {
    const d = String(b?.[campo] || '').localeCompare(String(a?.[campo] || ''));
    return d !== 0 ? d : String(a?.id || '').localeCompare(String(b?.id || ''));
  }) : arr;
  _desempatar(reuniones, 'fecha_reunion');
  _desempatar(conversaciones, 'fecha_ultimo_mensaje');

    // Equipo interno CONFIGURABLE (Configuración → Equipo); fallback a la lista fija.
    const _memActivos = (miembrosEquipo || []).filter((m: any) => m.activo !== false);
    const _eqNombres = _memActivos.length ? _memActivos.map((m: any) => normalizar(String(m.nombre || ''))).filter(Boolean) : EQUIPO_NOMBRES;
    const _eqEmails = _memActivos.length ? _memActivos.map((m: any) => String(m.email || '').toLowerCase()).filter(Boolean) : EQUIPO_EMAILS;
    // Quién escribe (usuario logueado del CRM) -> memoria por persona + "mi correo".
    let webUser: any = null;
    try { webUser = await b44.auth.me(); } catch { /* ya validado arriba */ }
    const miEmail = String(webUser?.email || '').toLowerCase();
    const miNombre = webUser?.full_name || webUser?.email || 'el usuario';
    const memKey = miEmail;
    const equipoMiembrosTxt = _memActivos.length
      ? _memActivos.map((m: any) => `  - ${m.nombre}${m.email ? ` <${m.email}>` : ''}${m.cargo ? ` — ${m.cargo}` : ''}`).join('\n')
      : '  (no configurado)';
    const nombreEsEquipoDyn = (nombre: string) => {
      const n = normalizar(nombre || '');
      if (!n) return false;
      return _eqNombres.some((tn: string) => { const [nom, ape] = tn.split(' '); if (n === tn || n.includes(tn)) return true; return !!ape && n.includes(nom) && n.includes(ape); });
    };
    const esTareaEquipo = (t: any): boolean => {
      const email = String(t.asignado_a || '').toLowerCase();
      if (email && _eqEmails.includes(email)) return true;
      if (nombreEsEquipoDyn(t.responsable) || nombreEsEquipoDyn(t.asignado_a)) return true;
      if (t.ambito === 'equipo') return true;
      if (t.ambito === 'cliente') return false;
      return true; // sin datos claros -> equipo por defecto
    };
    const presentacionesTxt = (presentaciones || []).filter((p: any) => p.activo !== false).map((p: any) => `  - ${p.titulo}${p.categoria ? ` [${p.categoria}]` : ''} (${p.tipo === 'archivo' ? 'archivo' : 'link'})`).join('\n') || '  (ninguna)';
    const videosTxt = (videos || []).filter((v: any) => v.activo !== false).map((v: any) => `  - ${v.titulo}${v.categoria ? ` [${v.categoria}]` : ''}`).join('\n') || '  (ninguno)';
    const grupoTxt = (mensajesGrupo || []).slice(0, 40).reverse().map((m: any) => `  - ${m.remitente || '?'}: ${String(m.texto || '').slice(0, 200)}`).join('\n') || '  (sin mensajes recientes en el grupo)';

    const empresaNombre: Record<string, string> = {};
    for (const e of empresas) empresaNombre[e.id] = e.nombre;
    const hoy = new Date().toISOString().slice(0, 10);

    const pipeline: Record<string, { n: number; valor: number }> = {};
    for (const o of oportunidades) { const et = o.etapa || 'Sin etapa'; pipeline[et] = pipeline[et] || { n: 0, valor: 0 }; pipeline[et].n++; pipeline[et].valor += Number(o.valor_estimado) || 0; }
    const abiertas = oportunidades.filter((o: any) => !String(o.etapa || '').toLowerCase().includes('cerrado') && !String(o.etapa || '').toLowerCase().includes('perdido') && !String(o.etapa || '').toLowerCase().includes('ganado'));
    const pipelineTxt = Object.entries(pipeline).map(([et, v]) => `  - ${et}: ${v.n} op., ${fmtCOP(v.valor)}`).join('\n') || '  (ninguna)';
    const oportTxt = abiertas.slice(0, 40).map((o: any) => `  - ${o.nombre} | ${empresaNombre[o.empresa_id] || '—'} | ${o.etapa} | ${fmtCOP(o.valor_estimado)}${o.fecha_cierre_estimada ? ` | cierre ${o.fecha_cierre_estimada}` : ''}`).join('\n') || '  (ninguna)';

    const cotPorEstado: Record<string, { n: number; valor: number }> = {};
    for (const c of cotizaciones) { const es = c.estado || 'Borrador'; cotPorEstado[es] = cotPorEstado[es] || { n: 0, valor: 0 }; cotPorEstado[es].n++; cotPorEstado[es].valor += Number(c.total) || 0; }
    const cotTxt = Object.entries(cotPorEstado).map(([es, v]) => `  - ${es}: ${v.n}, ${fmtCOP(v.valor)}`).join('\n') || '  (ninguna)';
    // Lista de cotizaciones recientes con número/empresa/tipo (para responder "mándame la cotización de X").
    const cotLista = cotizaciones.slice(0, 60).map((c: any) => `  - ${c.numero} | ${empresaNombre[c.empresa_id] || '—'} | ${c.tipo === 'software' ? 'Software' : 'Hardware'} | ${c.estado || 'Borrador'} | ${fmtCOP(c.total)}`).join('\n') || '  (ninguna)';

    const pendientes = tareas.filter((t: any) => !t.completada).sort((a: any, b: any) => String(a.fecha_limite || '').localeCompare(String(b.fecha_limite || '')));
    const fmtTarea = (t: any) => { const v = t.fecha_limite && String(t.fecha_limite) < hoy ? ' [VENCIDA]' : ''; const quien = t.responsable || t.asignado_a || ''; return `  - ${t.titulo} | vence ${t.fecha_limite || 's/f'}${v}${quien ? ` | ${quien}` : ''}${t.empresa_id ? ` | ${empresaNombre[t.empresa_id] || ''}` : ''}`; };
    const tareasEquipoTxt = pendientes.filter(esTareaEquipo).slice(0, 40).map(fmtTarea).join('\n') || '  (ninguna)';
    const tareasClienteTxt = pendientes.filter((t: any) => !esTareaEquipo(t)).slice(0, 40).map(fmtTarea).join('\n') || '  (ninguna)';

    // Reuniones con ACTA COMPLETA (no solo el resumen) para que Nova responda a fondo.
    const reunTxt = reuniones.slice(0, 15).map((r: any) => {
      const emp = r.empresa_id ? (empresaNombre[r.empresa_id] || '') : '';
      const acta = String(r.acta_md || '').trim();
      const cuerpo = acta ? acta.slice(0, 5000) : String(r.resumen || r.extracto || 'sin resumen procesado');
      const ai = (r.action_items || []).map((a: any, i: number) => `    ${i + 1}. ${a.descripcion || a.titulo || ''}${a.responsable ? ` (→ ${a.responsable})` : ''}${a.fecha_limite ? ` [vence ${a.fecha_limite}]` : ''}`).join('\n');
      return `━━━ REUNIÓN: ${r.titulo}${emp ? ` — ${emp}` : ''} (${r.fecha_reunion || '—'}) ━━━\n${cuerpo}${ai ? `\n  Action items:\n${ai}` : ''}`;
    }).join('\n\n') || '  (ninguna)';

    const stock: Record<string, number> = {};
    for (const m of movimientos) { if (!m.producto_id) continue; const d = m.tipo === 'salida' ? -(Number(m.cantidad) || 0) : (Number(m.cantidad) || 0); stock[m.producto_id] = (stock[m.producto_id] || 0) + d; }
    const activos = productos.filter((p: any) => p.activo !== false);
    const bajoMin = activos.filter((p: any) => (stock[p.id] || 0) < (Number(p.stock_minimo) || 0));
    const totalUnidades = Object.values(stock).reduce((a, b) => a + b, 0);
    const invLista = activos.map((p: any) => {
      const s = stock[p.id] || 0;
      const bajo = s < (Number(p.stock_minimo) || 0) ? ' ⚠️' : '';
      const specs = [
        p.tipo_rfid ? p.tipo_rfid : '',
        p.superficie ? `superficie: ${p.superficie}` : '',
        p.temp_max != null ? `hasta ${p.temp_max}°C` : '',
        p.rango_m != null ? `rango ${p.rango_m}m` : '',
        p.entorno ? `entorno: ${p.entorno}` : '',
        p.aplicacion ? `aplicación: ${p.aplicacion}` : '',
      ].filter(Boolean).join(', ');
      return `  - ${p.nombre}${p.sku ? ` [${p.sku}]` : ''}: ${s} uds${p.categoria ? ` | ${p.categoria}` : ''}${specs ? ` | ${specs}` : ''}${bajo}`;
    }).join('\n');
    const invTxt = `  Resumen: ${activos.length} productos activos · ${totalUnidades} uds totales · ${bajoMin.length} bajo mínimo\nDetalle por producto (con ficha técnica para recomendar tags):\n${invLista}`;

    const guiaTagTxt = (guiasTag || []).filter((g: any) => g.activo !== false).map((g: any) =>
      `  - ${g.escenario}${g.condiciones ? ` (${g.condiciones})` : ''}${g.sector ? ` [${g.sector}]` : ''} → ${g.tag_recomendado}${g.por_que ? ` — ${g.por_que}` : ''}`
    ).join('\n') || '  (sin escenarios cargados)';

    const convPorEstado: Record<string, number> = {};
    for (const c of conversaciones) { const e = c.estado || 'Desconocido'; convPorEstado[e] = (convPorEstado[e] || 0) + 1; }
    const sinLeer = conversaciones.filter((c: any) => Number(c.mensajes_sin_leer) > 0).length;
    const leadsTxt = `  - ${conversaciones.length} conversaciones · ${sinLeer} con mensajes sin leer\n  - Por estado: ${Object.entries(convPorEstado).map(([e, n]) => `${e}: ${n}`).join(', ') || '—'}`;

    const emailsPorEstado: Record<string, number> = {};
    for (const e of emails) { const s = e.estado || 'Enviado'; emailsPorEstado[s] = (emailsPorEstado[s] || 0) + 1; }
    const emailTxt = `  - ${emails.length} emails enviados (${Object.entries(emailsPorEstado).map(([s, n]) => `${s}: ${n}`).join(', ') || '—'})\n  - ${campanas.length} campañas · ${segmentos.length} segmentos`;

    const equipoTxt = usuarios.map((u: any) => `  - ${u.email}${u.full_name ? ` (${u.full_name})` : ''}`).join('\n') || '  (ninguno)';
    const fmtContacto = (c: any) => {
      const emp = c.empresa || (c.empresa_id ? empresaNombre[c.empresa_id] : '') || '';
      return `  - ${c.nombre || 's/n'}${emp ? ` | ${emp}` : ''}${c.cargo ? ` | ${c.cargo}` : ''}${c.telefono ? ` | tel ${c.telefono}` : ''}${c.email ? ` | ${c.email}` : ''}${(c.etapa_pipeline || c.etapa) ? ` | etapa ${c.etapa_pipeline || c.etapa}` : ''}`;
    };
    const contactosTxt = contactos.length
      ? contactos.slice(0, 300).map(fmtContacto).join('\n') + (contactos.length > 300 ? `\n  … y ${contactos.length - 300} más` : '')
      : '  (ninguno)';

    // ── El contexto va partido en CAPAS por frecuencia de cambio ──────────────
    // El caché es un match de prefijo: al cambiar algo se invalida ESO y todo lo que
    // venga DESPUÉS. Poniendo lo que casi nunca cambia arriba, crear una tarea solo
    // invalida la última capa (~5k) en vez de los ~33k completos.

    // CAPA 1 — Biblioteca y equipo: cambia cada varias semanas.
    const ctxBiblioteca = `=== EQUIPO (para asignar tareas) ===
${equipoTxt}

=== VIDEOS (biblioteca; puedes enviarlos con enviar_archivo clase "video") ===
${videosTxt}

=== GUÍA DE SELECCIÓN DE TAGS (escenarios curados por el equipo) ===
${guiaTagTxt}

=== PRESENTACIONES (biblioteca; enviar con enviar_archivo clase "presentacion") ===
${presentacionesTxt}`;

    // CAPA 2 — Directorio y actas: cambia algunas veces al día. Es la más pesada
    // (las actas completas), así que es la que más importa NO invalidar.
    const ctxDirectorio = `=== EMPRESAS (${empresas.length}) ===
${empresas.slice(0, 150).map((e: any) => `  - ${e.nombre}${e.sector ? ` | ${e.sector}` : ''}${e.estado ? ` | ${e.estado}` : ''}`).join('\n') || '  (ninguna)'}${empresas.length > 150 ? `\n  … y ${empresas.length - 150} más` : ''}

=== CONTACTOS ===
${contactosTxt}

=== REUNIONES RECIENTES (ACTA COMPLETA) ===
${reunTxt}`;

    // CAPA 3 — Operación del día: cambia cada vez que alguien toca el CRM.
    const ctxOperacion = `=== PIPELINE (oportunidades por etapa) ===
${pipelineTxt}
Total abiertas: ${abiertas.length} · valor abierto: ${fmtCOP(abiertas.reduce((s: number, o: any) => s + (Number(o.valor_estimado) || 0), 0))}

OPORTUNIDADES ABIERTAS:
${oportTxt}

=== COTIZACIONES (por estado) ===
${cotTxt}

=== TAREAS PENDIENTES DEL EQUIPO (nuestras) ===
${tareasEquipoTxt}

=== TAREAS DE CLIENTES / EXTERNOS (para seguimiento/presionar) ===
${tareasClienteTxt}

=== INVENTARIO ===
${invTxt}

=== LEADS / BANDEJA ===
${leadsTxt}

=== EMAIL MARKETING ===
${emailTxt}`;

    // Bloque ESTÁTICO (idéntico en cada llamada) -> se cachea y no se re-cobra por turno.
    const systemStatic = `Eres Nova, el copiloto interno de WeTracking (empresa colombiana B2B de tecnología RFID para trazabilidad y gestión de activos e inventarios). Ayudas al EQUIPO INTERNO, no a clientes.

Tienes acceso a los datos actuales de la empresa (te llegan en el segundo bloque de sistema). Responde SIEMPRE con base en esos datos reales; si algo no está, dilo con honestidad. Sé concreto: cifras, nombres y fechas. No inventes precios ni ROI.

ACCESO TOTAL: en los datos tienes el ACTA COMPLETA de las reuniones recientes (no un resumen recortado). Cuando te pregunten por el detalle de una reunión (los problemas del cliente, decisiones, compromisos, quién dijo qué), responde con el CONTENIDO REAL del acta. NUNCA digas que "solo tienes un resumen parcial" ni que "solo guardas los primeros caracteres": tienes el acta entera. Si te piden un archivo (acta, cotización, presentación, catálogo, documento, video, foto), ENVÍALO de una con enviar_archivo — no preguntes "¿quieres que te lo mande?", solo hazlo.

ASESOR EXPERTO DE TAGS RFID: una de tus funciones clave es recomendar el TAG adecuado según la necesidad de una empresa. Cuando te describan un caso (qué van a rastrear, superficie, entorno, temperatura, distancia de lectura, sector), recomienda el/los tag(s) del CATÁLOGO usando su ficha técnica y la GUÍA DE SELECCIÓN DE TAGS del equipo. Principios RFID que debes aplicar:
- Frecuencia: UHF = largo alcance (varios metros), ideal para inventario/activos/logística; HF/NFC = corto alcance (cm), ideal para acceso, autenticación, activos individuales.
- Superficie: sobre METAL o líquidos usa SIEMPRE tags "on-metal" (los normales no leen bien sobre metal).
- Temperatura: entornos calientes (hornos, talleres, autoclaves) requieren tags de alta temperatura; verifica el temp_max del tag vs. el del entorno.
- Entorno: exterior/húmedo/químico requiere encapsulado resistente (IP alto); interior seco es más flexible.
- Distancia: si necesitan leer a varios metros, UHF; si es punto a punto, HF/NFC.
- Aplicación: cruza la "aplicación típica" del tag con lo que el cliente rastrea.
Recomienda de 1 a 3 opciones concretas del catálogo (nombre del producto), explica en 1 frase POR QUÉ cada una encaja, y si falta un dato clave (superficie, temperatura, distancia) PREGÚNTALO antes de recomendar. Si ninguna del catálogo encaja, dilo con honestidad y sugiere qué tipo de tag habría que conseguir. Nunca inventes specs que no estén en la ficha.

FORMATO (respondes en el CHAT WEB de la app, que renderiza Markdown completo):
- Responde SIEMPRE en Markdown limpio y bien estructurado.
- Usa encabezados cortos (##), viñetas y **negritas** para lo clave.
- Cuando muestres varios registros con campos (tareas, oportunidades, cotizaciones), usa una TABLA Markdown con encabezados.
- Los enlaces van en formato Markdown [texto](url) para que sean clicables.
- Sé breve: nada de párrafos largos ni muros de texto.
- Para ORDEN y claridad SÍ puedes usar "emojis de estructura": números 1️⃣2️⃣3️⃣… para enumerar pasos o listas, ✅/❌ para estado (hecho/pendiente), y cuadros de color para prioridad/estado (🟥 urgente o vencido, 🟩 ok/al día, 🟦 informativo, 🟨 atención). NO uses emojis decorativos, caritas, ni al azar — solo esos, y solo cuando ayuden a entender mejor.

Puedes EJECUTAR acciones en el sistema cuando el usuario lo pida claramente (crear/registrar cosas o mover inventario). Referencias a empresa/producto/contacto van POR NOMBRE (el sistema los busca). Nunca inventes datos: si falta algo clave, pídelo en la respuesta en vez de crear con datos falsos.

EQUIPO de WeTracking (sus tareas SIEMPRE son ambito "equipo"): David Pernett, Karen Rojas, Thomas Schonlau, Massimiliano Schonlau, Gisell Reyes (correos: ${EQUIPO_EMAILS.join(', ')}). CUALQUIER otra persona (clientes, prospectos, contratistas, externos) es ambito "cliente". Al crear/asignar una tarea marca el ambito correcto según el nombre del responsable. En los datos las tareas vienen separadas en "del equipo" y "de clientes"; respeta esa distinción.

Responde ÚNICAMENTE con JSON válido:
{
  "respuesta": "tu respuesta en Markdown (confirma en palabras lo que hiciste)",
  "acciones": [
    { "tipo": "crear_tarea", "titulo": "...", "descripcion": "opc", "fecha_limite": "YYYY-MM-DD o null", "empresa_nombre": "o null", "asignado_a": "email del equipo o null", "responsable": "nombre del responsable o null", "ambito": "equipo | cliente" },
    { "tipo": "crear_nota", "texto": "...", "empresa_nombre": "o null" },
    { "tipo": "crear_empresa", "nombre": "...", "sector": "opc", "ciudad": "opc", "telefono": "opc", "email": "opc", "dominio_web": "opc", "estado": "opc" },
    { "tipo": "crear_contacto", "nombre": "...", "empresa_nombre": "opc", "email": "opc", "telefono": "opc", "cargo": "opc", "ciudad": "opc", "sector": "opc" },
    { "tipo": "editar_contacto", "contacto_nombre": "nombre del contacto que ya existe", "email": "opc", "telefono": "opc", "cargo": "opc", "sector": "opc", "ciudad": "opc", "empresa_nombre": "opc para (re)vincularlo a una empresa", "etapa_pipeline": "opc" },
    { "tipo": "editar_empresa", "empresa_nombre": "nombre de la empresa que ya existe", "sector": "opc", "ciudad": "opc", "pais": "opc", "direccion": "opc", "telefono": "opc", "email": "opc", "dominio_web": "opc", "estado": "opc" },
    { "tipo": "crear_oportunidad", "nombre": "...", "empresa_nombre": "...", "valor": 0, "etapa": "Visita_Inicial|Creacion_Cotizacion|Cotizacion_Enviada|Visita_Post_Cotizacion|Decisor_Convencido|Cierre_Ganado|Cierre_Perdido", "fecha_cierre_estimada": "YYYY-MM-DD o null", "contacto_nombre": "opc" },
    { "tipo": "crear_producto", "nombre": "...", "sku": "opc", "categoria": "opc", "tipo_rfid": "NFC|HF|UHF opc", "stock_minimo": 0, "precio_venta": 0 },
    { "tipo": "movimiento_inventario", "producto_nombre": "...", "tipo_mov": "entrada|salida|ajuste", "cantidad": 0, "motivo": "opc" },
    { "tipo": "crear_cotizacion", "empresa_nombre": "...", "contacto_nombre": "opc", "validez_dias": 15, "cot_tipo": "hardware | software",
      "// HARDWARE": "usa items + iva_pct (19)", "iva_pct": 19, "items": [ { "producto_nombre": "...", "cantidad": 1, "precio_unitario": 0, "descuento_pct": 0 } ],
      "// SOFTWARE": "IVA 0%, no lleva items. sw_modulo: 'inventarios' (default, tracking de activos) o 'samm' (plataforma de mantenimiento/activos). Comun a ambos: sw_activos, sw_usuarios, sw_precio, sw_periodicidad. Si sw_modulo=samm ademas: sw_gigas (almacenamiento) y sw_solicitudes (soporte/mes). sw_descripcion opc = texto a la medida; si no lo das, se genera segun el modulo", "sw_modulo": "inventarios | samm", "sw_activos": 0, "sw_usuarios": 0, "sw_gigas": 0, "sw_solicitudes": 0, "sw_precio": 0, "sw_periodicidad": "mensual | anual", "sw_descripcion": "opc",
      "costo_envio": "opc, costo de envío/transporte que se SUMA al total (ej. envío de tags a otra parte de la ciudad)", "notas": "opc, comentario extra que aparece en la cotización" },
    { "tipo": "crear_meta", "titulo": "...", "tipo_meta": "leads | cierres | revenue_usd", "valor_meta": 0, "mes": 1, "anio": 2026, "asignado_a": "email del equipo o null", "descripcion": "opc" },
    { "tipo": "crear_recordatorio", "titulo": "...", "fecha": "YYYY-MM-DD o YYYY-MM-DDTHH:mm:ss", "descripcion": "opc", "ubicacion": "opc" },
    { "tipo": "crear_evento", "titulo": "...", "fecha": "YYYY-MM-DD", "hora": "HH:mm 24h opc (sin hora = evento de día completo)", "fecha_fin": "YYYY-MM-DD opc (rango de varios días)", "descripcion": "opc", "invitados": "correos separados por coma opc (se les envía la invitación)", "con_meet": true },
    { "tipo": "enviar_correo", "para": "correo@destino.com", "asunto": "...", "cuerpo": "texto del correo en texto plano; redáctalo completo y profesional, con saludo y cierre; sale desde ms@grouptso.com" },
    { "tipo": "crear_segmento", "nombre": "...", "tipo_segmento": "contacto | empresa", "logica": "AND | OR", "filtros": [ { "campo": "sector", "operador": "igual | contiene", "valor": "..." } ], "descripcion": "opc" },
    { "tipo": "crear_plantilla", "nombre": "...", "asunto": "... (soporta {{nombre}}, {{empresa}})", "cuerpo_html": "<p>...</p>", "categoria": "Prospeccion | Follow-up | Propuesta | Informativo" },
    { "tipo": "crear_campana", "nombre": "...", "asunto": "...", "segmento_nombre": "opc", "plantilla_nombre": "opc" },
    { "tipo": "agregar_video", "titulo": "...", "url": "link YouTube/Drive/Canva", "categoria": "Redes | Caso_Exito | Informativo | Producto | Otro", "descripcion": "opc" },
    { "tipo": "agregar_presentacion", "titulo": "...", "url": "link Canva/Slides", "categoria": "Comercial | Producto | Caso_Exito | Institucional | Propuesta | Otro", "descripcion": "opc" },
    { "tipo": "enviar_archivo", "clase": "foto_producto | documento | cotizacion | acta | video | presentacion", "producto_nombre": "para foto_producto", "empresa_nombre": "para documento/cotizacion (en cotizacion manda TODAS las de esa empresa)", "documento_nombre": "opc para documento", "numero": "COT-2026-00X SOLO si piden UNA cotizacion específica por número (sin empresa_nombre)", "cot_tipo": "opc software|hardware para filtrar las cotizaciones de la empresa", "reunion_titulo": "para acta", "video_titulo": "para video (título de la lista de VIDEOS)", "presentacion_titulo": "para presentacion (título de la lista de PRESENTACIONES)", "categoria": "opc para video/presentacion" }
  ]
}
Notas: para AGREGAR stock usa movimiento_inventario con "tipo_mov":"entrada"; para QUITAR usa "salida". NUNCA inventes el stock total resultante ("ahora tiene N unidades") porque no lo conoces con certeza — confirma solo lo que hiciste (ej. "Agregué 1 unidad al inventario de X") e invita a verificarlo en Inventario. El precio_unitario de una cotización, si no lo dan, lo toma del producto.
Para MANDAR/ENVIAR archivos cuando te lo pidan (ej. "mándame la foto del lector X", "pásame la cotización COT-2026-002", "el acta de la reunión Y", "el documento de la empresa Z", "mándame el video institucional", "pásame la presentación comercial") usa "enviar_archivo": el sistema agrega el enlace [Abrir](...) o la imagen al final de tu respuesta. En tu "respuesta" solo confirma en palabras (el sistema adjunta el enlace aparte). IMPORTANTE con COTIZACIONES: si te piden "la/las cotización(es) de una empresa", usa "empresa_nombre" (NO pongas "numero") y el sistema manda TODAS las de esa empresa — una empresa suele tener varias (software y hardware). Solo usa "numero" cuando pidan una específica por su número. Si piden solo las de un tipo, agrega "cot_tipo".
Para AGENDAR una reunión o evento en el calendario del equipo (Google Calendar), usa crear_evento (soporta invitados por correo y link de Google Meet con "con_meet": true). NO uses crear_recordatorio para eso — ese es solo una alerta interna sin invitados ni Meet. Si el usuario da fecha/hora relativa ("mañana 3pm", "el viernes"), conviértela a fecha YYYY-MM-DD y hora HH:mm respecto a hoy. Confirma en palabras lo que agendaste.
Para ENVIAR un correo usa enviar_correo (sale desde ms@grouptso.com). Redacta tú el "cuerpo" completo y profesional (saludo, mensaje, cierre) salvo que el usuario te dé el texto exacto. Si no te dan asunto, ponle uno corto y claro. Confirma a quién se lo enviaste. Para el destinatario usa el correo EXACTO de la lista de CONTACTOS (o del EQUIPO); nunca lo inventes.
Tienes acceso COMPLETO a EMPRESAS y CONTACTOS: los ves listados arriba con sus datos (empresa, cargo, teléfono, correo, etapa). Puedes CONSULTARLOS (si te preguntan por un contacto o empresa, búscalo en esas listas y responde con su info — NUNCA digas que no tienes acceso a los contactos), CREARLOS (crear_empresa / crear_contacto) y EDITARLOS (editar_empresa / editar_contacto, identificándolos por su nombre).
Si no hay que ejecutar nada, "acciones" es []. Solo incluye una acción si el usuario realmente la pidió.`;

    // Encabezado de la capa 1 (va pegado a la biblioteca: mismo ritmo de cambio).
    const ctxEquipo = `=== EQUIPO INTERNO DE WETRACKING (nombre <correo> — cargo) ===
${equipoMiembrosTxt}

${ctxBiblioteca}`;

    // Bloque 3 — VOLÁTIL: cambia en CADA mensaje (quién habla, fecha, chat del grupo).
    // Va al FINAL y SIN cache_control: si esto estuviera dentro del prefijo cacheado,
    // invalidaría los ~28k tokens de arriba en cada turno (que es lo que pasaba antes).
    const systemVolatil = `Hoy es ${hoy}.

Estás hablando con: ${miNombre}${miEmail ? ` <${miEmail}>` : ''}.
Si esta persona dice "mi correo", "a mí" o "mándame a mi correo", su correo es${miEmail ? ` ${miEmail}` : ' desconocido (pídeselo)'}. Si piden enviar algo "a <nombre>", usa el correo de esa persona de la lista del EQUIPO. NUNCA inventes un correo.

=== CONVERSACIÓN RECIENTE DEL GRUPO (Telegram, lo que ha hablado el equipo) ===
${grupoTxt}`;

    // Prompt caching por CAPAS (máximo 4 breakpoints; usamos los 4).
    // Orden = de lo que NUNCA cambia a lo que cambia SIEMPRE. Al invalidarse una capa
    // solo se reescribe ella y las de abajo; las de arriba se siguen leyendo a 0.1x.
    // TTL 1h. Medido dia por dia sobre el trafico real: en una conversacion de
  // verdad gana claro (21-ago: 1 escritura de 12 msj = $0.029/msj vs $0.049 con
  // 5 min; 24-ago: $0.0715 vs $0.0948). Escribe el 1er mensaje tras un silencio
  // mayor al TTL; los siguientes leen. Con 5 min se rompe la racha demasiado pronto.
    const system = [
      { type: 'text', text: systemStatic, cache_control: { type: 'ephemeral', ttl: '1h' } },   // instrucciones
      { type: 'text', text: ctxEquipo, cache_control: { type: 'ephemeral', ttl: '1h' } },      // equipo + biblioteca
      { type: 'text', text: ctxDirectorio, cache_control: { type: 'ephemeral', ttl: '1h' } },  // empresas/contactos/actas
      { type: 'text', text: ctxOperacion, cache_control: { type: 'ephemeral', ttl: '1h' } },   // pipeline/cotiz/tareas
      { type: 'text', text: systemVolatil },                                                   // fecha/quién habla/grupo
    ];

    // Memoria persistente por persona (NovaMensaje); si no hay usuario, usa el historial del widget.
    let histMem: { role: string; content: string }[] = [];
    if (memKey) {
      try {
        const rH = await fetch(`${BASE_URL}/api/entities/NovaMensaje?usuario_email=${encodeURIComponent(memKey)}&sort=-fecha&limit=16`, { headers: hdrs });
        if (rH.ok) histMem = (await rH.json()).reverse().map((m: any) => ({ role: m.rol === 'assistant' ? 'assistant' : 'user', content: String(m.contenido || '') })).filter((m: any) => m.content);
      } catch { /* sin memoria */ }
    }
    const baseHist = (memKey && histMem.length)
      ? histMem
      : historial.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
    const messages = [
      ...baseHist,
      { role: 'user', content: mensaje },
    ];

    const rIA = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      // El ttl:'1h' del cache_control es GA: NO lleva beta header (se probó con
      // 'extended-cache-ttl-2025-04-11' y sobra; la doc oficial lo confirma).
      headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      // Modelo: Sonnet 4.6 (decision del usuario; se probo Sonnet 5 y se volvio atras).
      // AVISO si alguien vuelve a migrar a Sonnet 5: alli OMITIR 'thinking' activa
      // adaptive thinking por defecto (en 4.6 omitirlo = sin thinking). Como max_tokens
      // limita thinking + respuesta JUNTOS y NOVA devuelve JSON, hay que pasar
      // thinking: { type: 'disabled' } o el JSON sale truncado y el parse falla.
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2500, system, messages }),
    });
    if (!rIA.ok) return jsonRes({ message: `Anthropic ${rIA.status}: ${(await rIA.text()).slice(0, 200)}` }, 500);
    const iaJson: any = await rIA.json();
    const rawText = iaJson.content?.[0]?.text || '';
    // Medición del caché: si cache_read se queda en 0 entre mensajes seguidos, el prefijo
    // se está invalidando (algo volátil se coló en los bloques con cache_control).
    const u = iaJson.usage || {};
    const _cacheInfo: any = { escrito: u.cache_creation_input_tokens || 0, leido: u.cache_read_input_tokens || 0, sin_cache: u.input_tokens || 0, salida: u.output_tokens || 0 };
    // Costo real de ESTE mensaje con Sonnet ($3/M in, $15/M out; leer = 0.1x, escribir 1h = 2x).
    _cacheInfo.costo_usd = Number((((_cacheInfo.leido * 0.1 + _cacheInfo.escrito * 2 + _cacheInfo.sin_cache) * 3 / 1e6) + (_cacheInfo.salida * 15 / 1e6)).toFixed(4));
    console.log(`[nova-cache] leido=${_cacheInfo.leido} escrito=${_cacheInfo.escrito} sin_cache=${_cacheInfo.sin_cache} salida=${_cacheInfo.salida} costo=$${_cacheInfo.costo_usd}`);

    let parsed: any = {};
    const mMatch = rawText.match(/\{[\s\S]*\}/);
    try { parsed = mMatch ? JSON.parse(mMatch[0]) : { respuesta: rawText }; } catch { parsed = { respuesta: rawText }; }

    let respuesta: string = parsed.respuesta || 'No pude generar una respuesta.';
    const acciones: any[] = Array.isArray(parsed.acciones) ? parsed.acciones : [];
    const ejecutadas: { tipo: string; ok: boolean; detalle: string }[] = [];
    const push = (tipo: string, ok: boolean, detalle: string) => ejecutadas.push({ tipo, ok, detalle });

    for (const acc of acciones) {
      // CREAR_EVENTO: agenda en el Google Calendar del equipo (con invitados y/o Meet).
      if (acc?.tipo === 'crear_evento' && acc.titulo && acc.fecha) {
        try {
          const { accessToken } = await b44.asServiceRole.connectors.getConnection('googlecalendar');
          const r = await crearEventoGoogle(accessToken, acc);
          push('crear_evento', r.ok, r.detalle);
          if (r.ok) respuesta += `\n\n📅 ${r.detalle}${r.link ? ` — [Ver evento](${r.link})` : ''}${r.meet ? `\n🎥 Meet: ${r.meet}` : ''}`;
        } catch (e) {
          push('crear_evento', false, 'No pude crear el evento (revisa que el Google Calendar del equipo esté conectado): ' + String(e).slice(0, 80));
        }
        continue;
      }
      // ENVIAR_CORREO: manda un email desde ms@grouptso.com (conector gmail).
      if (acc?.tipo === 'enviar_correo' && (acc.para || acc.to) && (acc.cuerpo || acc.mensaje)) {
        try {
          const { accessToken } = await b44.asServiceRole.connectors.getConnection('gmail');
          const r = await enviarCorreoGmail(accessToken, acc);
          push('enviar_correo', r.ok, r.detalle);
          if (r.ok) respuesta += `\n\n📧 ${r.detalle}`;
        } catch (e) {
          push('enviar_correo', false, 'No pude enviar el correo (revisa la conexión de Gmail): ' + String(e).slice(0, 80));
        }
        continue;
      }
      // ENVIAR_ARCHIVO: en el chat web adjuntamos enlaces Markdown [Abrir](...) / imágenes al final.
      if (acc?.tipo === 'enviar_archivo') {
        const clase = String(acc.clase || '');
        try {
          if (clase === 'foto_producto') {
            const pid = idPorNombre(String(acc.producto_nombre || acc.nombre || ''), productos);
            const prod = productos.find((p: any) => p.id === pid);
            if (prod?.foto) { respuesta += `\n\n**${prod.nombre}**\n\n![${prod.nombre}](${urlArchivo(prod.foto)})`; push('enviar_archivo', true, `Foto: ${prod.nombre}`); }
            else push('enviar_archivo', false, `No encontré foto de "${acc.producto_nombre || acc.nombre || ''}"`);
          } else if (clase === 'documento') {
            const empId = acc.empresa_nombre ? idPorNombre(String(acc.empresa_nombre), empresas) : null;
            let docs: any[] = [];
            if (empId) { const rD = await fetch(`${BASE_URL}/api/entities/Documento?empresa_id=${empId}&limit=100`, { headers: hdrs }); if (rD.ok) docs = await rD.json(); }
            const objetivo = normalizar(String(acc.documento_nombre || acc.nombre || ''));
            const doc = objetivo ? docs.find((d: any) => normalizar(d.nombre || '').includes(objetivo)) : docs[0];
            if (doc?.contenido) { respuesta += `\n\n📄 [${doc.nombre}](${urlArchivo(doc.contenido)})`; push('enviar_archivo', true, `Documento: ${doc.nombre}`); }
            else push('enviar_archivo', false, 'No encontré ese documento');
          } else if (clase === 'cotizacion') {
            let cots: any[] = [];
            const num = normalizar(String(acc.numero || ''));
            const eid = acc.empresa_nombre ? idPorNombre(String(acc.empresa_nombre), empresas) : null;
            if (eid) {
              cots = cotizaciones.filter((c: any) => c.empresa_id === eid);
              const ft = String(acc.cot_tipo || '').toLowerCase();
              if (ft === 'software' || ft === 'hardware') cots = cots.filter((c: any) => (c.tipo || 'hardware') === ft);
            } else if (num) {
              const c = cotizaciones.find((c: any) => normalizar(c.numero || '') === num);
              if (c) cots = [c];
            }
            if (cots.length) {
              for (const cot of cots) {
                const tt = cot.tipo === 'software' ? 'Software' : 'Hardware';
                respuesta += `\n\n📄 Cotización ${tt} ${cot.numero}: [Abrir](${APP_URL}/comercial/cotizaciones/${cot.id}/print)`;
                push('enviar_archivo', true, `Cotización ${tt} ${cot.numero}`);
              }
            } else push('enviar_archivo', false, 'No encontré esa cotización');
          } else if (clase === 'acta') {
            const objetivo = normalizar(String(acc.reunion_titulo || acc.nombre || ''));
            const reu = objetivo ? reuniones.find((r: any) => normalizar(r.titulo || '').includes(objetivo)) : reuniones[0];
            if (reu?.id) { respuesta += `\n\n📄 Acta "${reu.titulo}": [Abrir](${APP_URL}/crm/reuniones/${reu.id}/acta)`; push('enviar_archivo', true, `Acta: ${reu.titulo}`); }
            else push('enviar_archivo', false, 'No encontré esa acta');
          } else if (clase === 'video') {
            const objetivo = normalizar(String(acc.video_titulo || acc.titulo || acc.nombre || ''));
            const catBusca = normalizar(String(acc.categoria || ''));
            const vactivos = (videos || []).filter((v: any) => v.activo !== false);
            const vid = objetivo
              ? vactivos.find((v: any) => normalizar(v.titulo || '').includes(objetivo))
              : (catBusca ? vactivos.find((v: any) => normalizar(v.categoria || '').includes(catBusca)) : vactivos[0]);
            if (vid?.url) { respuesta += `\n\n🎬 [${vid.titulo}](${urlArchivo(vid.url)})`; push('enviar_archivo', true, `Video: ${vid.titulo}`); }
            else push('enviar_archivo', false, 'No encontré ese video');
          } else if (clase === 'presentacion') {
            const objetivo = normalizar(String(acc.presentacion_titulo || acc.titulo || acc.nombre || ''));
            const catBusca = normalizar(String(acc.categoria || ''));
            const pactivas = (presentaciones || []).filter((p: any) => p.activo !== false);
            const pres = objetivo
              ? pactivas.find((p: any) => normalizar(p.titulo || '').includes(objetivo))
              : (catBusca ? pactivas.find((p: any) => normalizar(p.categoria || '').includes(catBusca)) : pactivas[0]);
            if (pres?.url) { respuesta += `\n\n📊 [${pres.titulo}](${urlArchivo(pres.url)})`; push('enviar_archivo', true, `Presentación: ${pres.titulo}`); }
            else push('enviar_archivo', false, 'No encontré esa presentación');
          }
        } catch (e) { push('enviar_archivo', false, 'No pude preparar el archivo: ' + String(e).slice(0, 80)); }
        continue;
      }
      const r = await ejecutarAccion(acc, { hdrs, empresas, contactos, productos, usuarios, cotizaciones, empresaNombre });
      if (r) push(String(acc.tipo || '?'), r.ok, r.detalle);
    }

    // Guardar el turno en la memoria persistente (por persona).
    if (memKey) {
      const _now = new Date().toISOString();
      try { await fetch(`${BASE_URL}/api/entities/NovaMensaje`, { method: 'POST', headers: hdrs, body: JSON.stringify({ usuario_email: memKey, rol: 'user', contenido: String(mensaje).slice(0, 4000), fecha: _now }) }); } catch { /* */ }
      try { await fetch(`${BASE_URL}/api/entities/NovaMensaje`, { method: 'POST', headers: hdrs, body: JSON.stringify({ usuario_email: memKey, rol: 'assistant', contenido: String(respuesta).slice(0, 8000), fecha: _now }) }); } catch { /* */ }
    }
    // "/cache" o "cache" -> NOVA responde con la métrica real de ESTE mensaje.
    if (/^\/?cache\b/i.test(String(mensaje).trim())) {
      respuesta = `${respuesta}\n\n**📊 Caché de este mensaje**\n- Leído (barato, 0.1x): **${_cacheInfo.leido.toLocaleString('es-CO')}**\n- Escrito (2x): ${_cacheInfo.escrito.toLocaleString('es-CO')}\n- Sin caché: ${_cacheInfo.sin_cache.toLocaleString('es-CO')}\n- Salida: ${_cacheInfo.salida.toLocaleString('es-CO')}\n- Costo: **US$${_cacheInfo.costo_usd}**\n\n${_cacheInfo.leido > 0 ? '✅ El caché SÍ está pegando.' : '⚠️ No leyó caché. Si es tu 1er mensaje en 1h es normal (lo está escribiendo); si pasa en mensajes seguidos, algo lo está invalidando.'}`;
    }
    return jsonRes({ respuesta, acciones_ejecutadas: ejecutadas, _cache: _cacheInfo });
  } catch (e) {
    return jsonRes({ message: String((e as Error)?.message || e).slice(0, 300) }, 500);
  }
});
