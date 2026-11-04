// Lista los eventos del Google Calendar adicional del usuario ("WeTracking Calendar Karen").
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const CALENDAR2_CONNECTOR_ID = '6a739d78248267b88077301d';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ connected: false, eventos: [] });

    let body: any = {};
    try { body = await req.json(); } catch { /* sin body */ }
    const timeMin = body.timeMin || new Date(Date.now() - 45 * 864e5).toISOString();
    const timeMax = body.timeMax || new Date(Date.now() + 120 * 864e5).toISOString();

    let accessToken: string | undefined;
    try {
      const conn = await base44.asServiceRole.connectors.getCurrentAppUserConnection(CALENDAR2_CONNECTOR_ID);
      accessToken = conn?.accessToken;
    } catch {
      return Response.json({ connected: false, eventos: [] });
    }
    if (!accessToken) return Response.json({ connected: false, eventos: [] });

    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events`
      + `?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`
      + `&singleEvents=true&orderBy=startTime&maxResults=250`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return Response.json({ connected: true, error: `Calendar ${res.status}`, eventos: [] });

    const data = await res.json();
    const eventos = (data.items || []).map((e: any) => {
      const start = e.start || {};
      const allDay = !!start.date;
      const fecha = start.date || (start.dateTime ? String(start.dateTime).slice(0, 10) : '');
      const hora = start.dateTime ? String(start.dateTime).slice(11, 16) : '';
      return { id: e.id, titulo: e.summary || '(sin título)', fecha, hora, allDay, htmlLink: e.htmlLink || '', ubicacion: e.location || '' };
    }).filter((e: any) => e.fecha);

    return Response.json({ connected: true, eventos });
  } catch (error) {
    return Response.json({ connected: false, error: (error as Error).message, eventos: [] });
  }
});