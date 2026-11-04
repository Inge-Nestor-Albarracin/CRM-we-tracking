// v2026-07-30.calendar-connector-nombre
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Conexión APP-USER: verifica si el usuario conectó SU propio Google Calendar.
    const CALENDAR_CONNECTOR_ID = '6a71fb13edc5022fa181955d'; // "WeTracking Calendar" (calendar.events write scope)
    let accessToken: string | undefined;
    try {
      const conn = await base44.asServiceRole.connectors.getCurrentAppUserConnection(CALENDAR_CONNECTOR_ID);
      accessToken = conn?.accessToken;
    } catch {
      return Response.json({ connected: false });
    }
    if (!accessToken) return Response.json({ connected: false });

    // Quick check: list 1 event to verify the token works
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=1', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!res.ok) {
      return Response.json({ connected: false });
    }

    return Response.json({ connected: true });
  } catch (error) {
    return Response.json({ connected: false });
  }
});