// Verifica la conexion de Microsoft Teams del usuario actual (conector app-user).
// POST {} -> { connected: boolean, email?: string, displayName?: string }
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const TEAMS_CONNECTOR_ID = '6a6abe4e8046024839fa9ea7';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { accessToken } = await base44.asServiceRole.connectors.getCurrentAppUserConnection(TEAMS_CONNECTOR_ID);

    // Verifica que el token sirva leyendo el perfil del usuario en Microsoft Graph
    const res = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!res.ok) return Response.json({ connected: false });

    const profile = await res.json();
    return Response.json({
      connected: true,
      email: profile.mail || profile.userPrincipalName || '',
      displayName: profile.displayName || '',
    });
  } catch {
    return Response.json({ connected: false });
  }
});