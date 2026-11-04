// v2026-07-22.redeploy2
// Verifica la conexión de Gmail integrada de Base44 (conector compartido "gmail").
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('gmail');

    // Verifica que el token sirva leyendo el perfil de la cuenta
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