// Verifica la conexión app-user del conector "WeTracking Gmail Karen" (cuenta Gmail adicional por usuario).
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const GMAIL_KAREN_CONNECTOR_ID = '6a739cba0cfbf2c423f6d6f2';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ connected: false });

    let accessToken: string | undefined;
    try {
      const conn = await base44.asServiceRole.connectors.getCurrentAppUserConnection(GMAIL_KAREN_CONNECTOR_ID);
      accessToken = conn?.accessToken;
    } catch {
      return Response.json({ connected: false });
    }
    if (!accessToken) return Response.json({ connected: false });

    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!res.ok) return Response.json({ connected: false });

    const profile = await res.json();
    return Response.json({ connected: true, email: profile.emailAddress });
  } catch {
    return Response.json({ connected: false });
  }
});