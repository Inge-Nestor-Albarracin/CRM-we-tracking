// v2026-07-30.calendar-connector-nombre
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { titulo, fecha_limite, hora, descripcion, fecha_fin, invitados, con_meet } = await req.json();
    if (!titulo || !fecha_limite) {
      return Response.json({ error: 'titulo and fecha_limite are required' }, { status: 400 });
    }

    // Invitados: correos separados por coma/espacio/; -> attendees válidos.
    const attendees = String(invitados || '')
      .split(/[,;\s]+/)
      .map((s: string) => s.trim().toLowerCase())
      .filter((s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s))
      .map((email: string) => ({ email }));

    // Conexión APP-USER: usa el Google Calendar del propio usuario (con scope calendar.events = escritura).
    // La conexión compartida (getConnection por tipo) solo tiene scopes read-only y NO puede crear eventos.
    const CALENDAR_CONNECTOR_ID = '6a71fb13edc5022fa181955d'; // "WeTracking Calendar" (calendar.events write scope)
    let accessToken: string | undefined;
    try {
      const conn = await base44.asServiceRole.connectors.getCurrentAppUserConnection(CALENDAR_CONNECTOR_ID);
      accessToken = conn?.accessToken;
    } catch {
      return Response.json({ error: 'Google Calendar no conectado. Conecta tu calendario primero.', connected: false }, { status: 401 });
    }
    if (!accessToken) {
      return Response.json({ error: 'Google Calendar no conectado. Conecta tu calendario primero.', connected: false }, { status: 401 });
    }

    // Build start/end objects
    let startObj, endObj;
    if (hora) {
      const [h, min] = hora.split(':').map(n => parseInt(n, 10));
      const totalEnd = h * 60 + (min || 0) + 30;
      const eH = String(Math.floor(totalEnd / 60) % 24).padStart(2, '0');
      const eM = String(totalEnd % 60).padStart(2, '0');
      const endDate = totalEnd >= 1440
        ? new Date(new Date(fecha_limite).getTime() + 86400000).toISOString().slice(0, 10)
        : fecha_limite;
      startObj = { dateTime: `${fecha_limite}T${hora}:00`, timeZone: 'America/Bogota' };
      endObj = { dateTime: `${endDate}T${eH}:${eM}:00`, timeZone: 'America/Bogota' };
    } else {
      // Evento de día completo (posible rango de varios días). En Google el end.date es EXCLUSIVO,
      // así que el fin = (fecha_fin o inicio) + 1 día.
      const base = (fecha_fin && fecha_fin >= fecha_limite) ? fecha_fin : fecha_limite;
      const finExcl = new Date(base + 'T00:00:00'); finExcl.setDate(finExcl.getDate() + 1);
      startObj = { date: fecha_limite };
      endObj = { date: finExcl.toISOString().slice(0, 10) };
    }

    const eventBody: Record<string, unknown> = {
      summary: titulo,
      colorId: '5',
      start: startObj,
      end: endObj,
      ...(descripcion && { description: descripcion }),
      ...(attendees.length ? { attendees } : {}),
    };
    // Google Meet: pide crear una conferencia (requiere conferenceDataVersion=1).
    if (con_meet) {
      eventBody.conferenceData = {
        createRequest: {
          requestId: `wt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }

    const params = new URLSearchParams();
    if (con_meet) params.set('conferenceDataVersion', '1');
    if (attendees.length) params.set('sendUpdates', 'all'); // envía la invitación a los correos
    const qs = params.toString() ? `?${params.toString()}` : '';

    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events${qs}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventBody),
    });

    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: `Calendar API error: ${res.status}`, details: err }, { status: res.status });
    }

    const event = await res.json();
    const meetLink = event.hangoutLink
      || (event.conferenceData?.entryPoints || []).find((e: { entryPointType?: string }) => e.entryPointType === 'video')?.uri
      || '';
    return Response.json({ success: true, eventId: event.id, htmlLink: event.htmlLink, meetLink });
  } catch (error) {
    // If connector is not connected, return a clear message
    return Response.json({ error: error.message, connected: false }, { status: 500 });
  }
});