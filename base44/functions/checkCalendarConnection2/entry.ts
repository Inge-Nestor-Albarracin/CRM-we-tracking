// Verifica la conexión app-user del conector "WeTracking Calendar Karen" (calendario adicional por usuario).
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const CALENDAR2_CONNECTOR_ID = '6a739d78248267b88077301d';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ connected: false });

    let accessToken: string | undefined;
    try {
      const conn = await base44.asServiceRole.connectors.getCurrentAppUserConnection(CALENDAR2_CONNECTOR_ID);
      accessToken = conn?.accessToken;
    } catch {
      return Response.json({ connected: false });
    }
    if (!accessToken) return Response.json({ connected: false });

    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=1', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!res.ok) return Response.json({ connected: false });

    return Response.json({ connected: true });
  } catch {
    return Response.json({ connected: false });
  }
});