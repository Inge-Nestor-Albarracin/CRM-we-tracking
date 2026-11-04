// v2026-07-22.redeploy2
// Verifica la conexión del conector de Google Drive.
// GET/POST -> { connected: boolean, email?: string }

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ connected: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      return Response.json({ connected: false });
    }

    const about = await res.json();
    return Response.json({ connected: true, email: about.user?.emailAddress || '' });
  } catch {
    return Response.json({ connected: false });
  }
});