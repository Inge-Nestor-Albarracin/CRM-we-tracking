// v2026-07-22.redeploy2
// Pixel de tracking de apertura de emails.
// GET /api/functions/trackEmailOpen?tid=<tracking_id>
// Endpoint publico — sin token requerido.
// Retorna un GIF transparente 1x1 y actualiza el estado del EmailEnviado.

const GIF_1X1 = new Uint8Array([
  0x47,0x49,0x46,0x38,0x39,0x61,0x01,0x00,0x01,0x00,0x80,0x00,0x00,
  0xff,0xff,0xff,0x00,0x00,0x00,0x21,0xf9,0x04,0x00,0x00,0x00,0x00,
  0x00,0x2c,0x00,0x00,0x00,0x00,0x01,0x00,0x01,0x00,0x00,0x02,0x02,
  0x44,0x01,0x00,0x3b,
]);

Deno.serve(async (req) => {
  const gifResponse = new Response(GIF_1X1, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
    },
  });

  const url = new URL(req.url);
  const tid = url.searchParams.get('tid');
  if (!tid) return gifResponse;

  const base44Key = Deno.env.get('BASE44_API_KEY') || '';
  if (!base44Key) return gifResponse;

  const BASE_URL = 'https://wtapp.base44.app';
  const hdrs = { 'api_key': base44Key, 'Content-Type': 'application/json' };

  try {
    // Buscar el EmailEnviado por tracking_id
    const rList = await fetch(
      `${BASE_URL}/api/entities/EmailEnviado?tracking_id=${encodeURIComponent(tid)}&limit=1`,
      { headers: hdrs }
    );
    if (!rList.ok) return gifResponse;

    const arr = await rList.json();
    const email = arr[0];
    if (!email || email.estado !== 'Enviado') return gifResponse;

    // Actualizar estado a Abierto
    await fetch(`${BASE_URL}/api/entities/EmailEnviado/${email.id}`, {
      method: 'PUT',
      headers: hdrs,
      body: JSON.stringify({ estado: 'Abierto', fecha_apertura: new Date().toISOString() }),
    });

    // Incrementar total_abiertos en la Campaña si aplica
    if (email.campana_id) {
      const rCamp = await fetch(`${BASE_URL}/api/entities/Campana/${email.campana_id}`, { headers: hdrs });
      if (rCamp.ok) {
        const camp = await rCamp.json();
        await fetch(`${BASE_URL}/api/entities/Campana/${email.campana_id}`, {
          method: 'PUT',
          headers: hdrs,
          body: JSON.stringify({ total_abiertos: (camp.total_abiertos || 0) + 1 }),
        });
      }
    }
  } catch (err) {
    console.error('trackEmailOpen error:', err.message);
  }

  return gifResponse;
});