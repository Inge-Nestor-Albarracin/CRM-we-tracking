// v2026-08-19.emma-agenda
// Crea la reunion comercial que Emma cerro por WhatsApp, en el calendario de ms@grouptso.com.
//
// Diferencias con createCalendarEvent (que NO sirve para Emma):
//  1. createCalendarEvent usa getCurrentAppUserConnection, que exige una SESION de usuario
//     logueado. Emma corre desde un webhook de WhatsApp: no hay usuario. Aqui se usa
//     getWorkspaceConnection, que da el token compartido del mismo conector sin sesion.
//  2. createCalendarEvent arma eventos de 30 minutos. Las reuniones comerciales son de 1 hora.
//
// POST { nombre_cliente, correo_cliente, fecha: "YYYY-MM-DD", hora: "HH:MM", descripcion? }
// Header x-emma-token con el valor de CRON_TOKEN.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Conector "WeTracking Calendar" (tiene scope calendar.events de escritura).
const CALENDAR_CONNECTOR_ID = '6a71fb13edc5022fa181955d';

// Equipo que se invita a toda reunion comercial.
// ts@grouptso.com queda EXCLUIDO a peticion de Massi (2026-08-19).
const EQUIPO_REUNIONES = [
  'ms@grouptso.com',
  'karen@grouptso.com',
  'direccioncomercial@grouptso.com',
  'ingenierodesarrollo@wetracking.co',
];

const DURACION_MINUTOS = 60;
const VERSION = 'v2026-08-19.2-telegram';

// Avisa al grupo del equipo con el link del Meet. Vive aca (y no solo en el webhook) para que
// el que crea la reunion sea el mismo que la anuncia: si el evento existe, el aviso sale.
async function avisarGrupo(base44: unknown, texto: string) {
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
  if (!botToken) { console.log('Sin TELEGRAM_BOT_TOKEN: no se avisa al grupo'); return false; }
  let chatId = '';
  try {
    // deno-lint-ignore no-explicit-any
    const cfgs = await (base44 as any).asServiceRole.entities.ConfigAgente.list();
    chatId = (cfgs && cfgs[0] && cfgs[0].telegram_grupo_chat_id) || '';
  } catch (err) { console.error('No se pudo leer ConfigAgente:', (err as Error).message); }
  if (!chatId) { console.log('Sin telegram_grupo_chat_id configurado: no se avisa al grupo'); return false; }
  try {
    const r = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: texto, disable_web_page_preview: false }),
    });
    if (!r.ok) { console.error('Telegram aviso error:', r.status, (await r.text()).slice(0, 200)); return false; }
    console.log('Aviso de reunion enviado al grupo de Telegram');
    return true;
  } catch (err) { console.error('Telegram aviso excepcion:', (err as Error).message); return false; }
}

function jsonRes(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

const esCorreo = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonRes({ error: 'Solo POST' }, 405);

  const token = req.headers.get('x-emma-token') || '';
  const esperado = Deno.env.get('CRON_TOKEN') || 'wtsofia2026';
  if (token !== esperado) return jsonRes({ error: 'Unauthorized' }, 401);

  let body: Record<string, string>;
  try { body = await req.json(); } catch { return jsonRes({ error: 'Body JSON invalido' }, 400); }

  const nombreCliente = String(body.nombre_cliente || '').trim() || 'Cliente';
  const correoCliente = String(body.correo_cliente || '').trim().toLowerCase();
  const fecha = String(body.fecha || '').trim();   // YYYY-MM-DD
  const hora  = String(body.hora  || '').trim();   // HH:MM

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return jsonRes({ error: `fecha invalida: "${fecha}" (se espera YYYY-MM-DD)`, version: VERSION }, 400);
  if (!/^\d{2}:\d{2}$/.test(hora))        return jsonRes({ error: `hora invalida: "${hora}" (se espera HH:MM)`, version: VERSION }, 400);

  // ── Token de calendario SIN sesion de usuario ──────────────────────────────
  const base44 = createClientFromRequest(req);
  let accessToken = '';
  let via = '';
  try {
    const c = await base44.asServiceRole.connectors.getWorkspaceConnection(CALENDAR_CONNECTOR_ID);
    if (c?.accessToken) { accessToken = c.accessToken; via = 'workspace'; }
  } catch (err) {
    console.error('getWorkspaceConnection fallo:', (err as Error).message);
  }
  if (!accessToken) {
    // Respaldo: conector compartido de plataforma. Ojo, puede venir con scopes de solo lectura.
    try {
      const c = await base44.asServiceRole.connectors.getConnection('googlecalendar');
      if (c?.accessToken) { accessToken = c.accessToken; via = 'shared'; }
    } catch (err) {
      console.error('getConnection(googlecalendar) fallo:', (err as Error).message);
    }
  }
  if (!accessToken) {
    return jsonRes({
      error: 'No hay token de Google Calendar disponible sin sesion de usuario.',
      remedio: 'Conectar el conector "WeTracking Calendar" a nivel de workspace (no solo por usuario) para que los procesos automaticos puedan crear eventos.',
      connected: false,
    }, 401);
  }

  // ── Armar el evento ───────────────────────────────────────────────────────
  const [h, m] = hora.split(':').map(Number);
  const finMin = h * 60 + m + DURACION_MINUTOS;
  const fechaFin = finMin >= 1440
    ? new Date(new Date(`${fecha}T00:00:00`).getTime() + 86400000).toISOString().slice(0, 10)
    : fecha;
  const horaFin = `${String(Math.floor(finMin / 60) % 24).padStart(2, '0')}:${String(finMin % 60).padStart(2, '0')}`;

  const invitados = [...EQUIPO_REUNIONES];
  if (correoCliente && esCorreo(correoCliente)) invitados.push(correoCliente);
  const attendees = [...new Set(invitados.filter(esCorreo))].map((email) => ({ email }));

  // Titulo: solo la empresa. "Reunion Comercial TADA - WeTracking". Sin descripcion,
  // el calendario del equipo se lee mejor limpio (decision de Massi, 2026-08-19).
  // Sin colorId: el evento toma el color por defecto del calendario.
  const eventBody = {
    summary: `Reunion Comercial ${nombreCliente} - WeTracking`,
    start: { dateTime: `${fecha}T${hora}:00`, timeZone: 'America/Bogota' },
    end:   { dateTime: `${fechaFin}T${horaFin}:00`, timeZone: 'America/Bogota' },
    attendees,
    conferenceData: {
      createRequest: {
        requestId: `emma-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
  };

  const params = new URLSearchParams({ conferenceDataVersion: '1', sendUpdates: 'all' });
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(eventBody),
  });

  if (!res.ok) {
    const details = (await res.text()).slice(0, 500);
    console.error('Calendar API error:', res.status, details);
    return jsonRes({ error: `Calendar API ${res.status}`, details, via }, res.status);
  }

  const event = await res.json();
  const meetLink = event.hangoutLink
    || (event.conferenceData?.entryPoints || []).find((e: { entryPointType?: string }) => e.entryPointType === 'video')?.uri
    || '';

  console.log(`Reunion creada (${via}): ${eventBody.summary} | ${fecha} ${hora}-${horaFin} | ${attendees.length} invitados`);

  // Aviso al grupo con el link. El webhook manda avisar_grupo:false para no duplicar el mensaje.
  let avisado = false;
  if (body.avisar_grupo !== false) {
    avisado = await avisarGrupo(base44,
      `[Emma] Reunion agendada\n\n` +
      `${eventBody.summary}\n` +
      `Cuando: ${fecha} de ${hora} a ${horaFin} (hora Colombia)\n` +
      `Meet: ${meetLink || 'sin link'}\n` +
      `Invitados: ${attendees.map((a) => a.email).join(', ')}\n\n` +
      `La invitacion ya salio por correo a todos.`);
  }

  return jsonRes({
    success: true,
    eventId: event.id,
    htmlLink: event.htmlLink,
    meetLink,
    titulo: eventBody.summary,
    inicio: `${fecha} ${hora}`,
    fin: `${fechaFin} ${horaFin}`,
    invitados: attendees.map((a) => a.email),
    via,
    avisado_grupo: avisado,
    version: VERSION,
  });
});
