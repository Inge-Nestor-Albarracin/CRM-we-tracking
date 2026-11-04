// v2026-07-27.cola-liviana
// Cron cada 1 minuto: envía las respuestas de Emma ENCOLADAS con demora.
// El webhook crea un registro liviano en la entidad ColaEnvio { destino, canal,
// globos_json, enviar_en, nota_id }. Este cron lee SOLO esa cola (pocos registros
// pequeños) -> corridas de <2s en vez de escanear 500 Notas grandes (que tardaba 20-40s).
// GET/POST  /api/apps/{appId}/functions/enviarPendientes?token=...
// Env: BASE44_API_KEY, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_API_TOKEN, CRON_TOKEN (obligatorio).

const BASE_URL = 'https://wtapp.base44.app';
const MAX_POR_CORRIDA = 12;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* eslint-disable @typescript-eslint/no-explicit-any */
Deno.serve(async (req) => {
  const base44Key = Deno.env.get('BASE44_API_KEY') || '';
  const waPhoneId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '';
  const waToken   = Deno.env.get('WHATSAPP_API_TOKEN') || '';
  const cronToken = Deno.env.get('CRON_TOKEN') || '';
  if (!cronToken) return new Response(JSON.stringify({ error: 'CRON_TOKEN no configurado' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

  const url = new URL(req.url);
  let body: any = {};
  try { body = await req.json(); } catch { /* GET sin body */ }
  // Preferir la cabecera x-cron-token (no queda en logs). ?token= se mantiene por compatibilidad con cron-job.org.
  const token = req.headers.get('x-cron-token') || url.searchParams.get('token') || body.token || '';
  if (token !== cronToken) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  // AUTENTICACION (2026-08-20). La app es privada: el header api_key devuelve 403
  // "auth_required" y esta funcion lo interpretaba como "cola vacia", asi que los mensajes
  // de Emma quedaban encolados para siempre. Base44 inyecta el token de servicio en cada
  // invocacion (es lo que usa el SDK por dentro); se usa ese y la ruta real de entidades.
  const svcToken = (req.headers.get('Base44-Service-Authorization') || '').replace(/^Bearer\s+/i, '');
  const apiUrl   = req.headers.get('Base44-Api-Url') || 'https://base44.app';
  const appId44  = req.headers.get('Base44-App-Id') || '';
  const usaToken = !!(svcToken && appId44);
  const ENT  = usaToken ? `${apiUrl}/api/apps/${appId44}/entities` : `${BASE_URL}/api/entities`;
  const hdrs = usaToken
    ? { 'Authorization': `Bearer ${svcToken}`, 'Content-Type': 'application/json' }
    : { 'api_key': base44Key, 'Content-Type': 'application/json' };
  if (!usaToken && !base44Key) return new Response(JSON.stringify({ error: 'Sin token de servicio ni BASE44_API_KEY' }), { status: 500 });
  const ahora = Date.now();

  const enviarWa = async (destino: string, texto: string) => {
    try {
      const r = await fetch(`https://graph.facebook.com/v19.0/${waPhoneId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${waToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: destino, type: 'text', text: { body: texto } }),
      });
      if (!r.ok) console.error('WA send error:', r.status, (await r.text()).slice(0, 150));
      return r.ok;
    } catch (err) { console.error('WA send exception:', (err as Error).message); return false; }
  };

  const borrar = async (id: string) => {
    try { await fetch(`${ENT}/ColaEnvio/${id}`, { method: 'DELETE', headers: hdrs }); }
    catch (err) { console.error('Cola delete error:', (err as Error).message); }
  };

  // Leer SOLO la cola (registros livianos), ordenada por hora de envío (los más vencidos primero).
  const rC = await fetch(`${ENT}/ColaEnvio?sort=enviar_en&limit=100`, { headers: hdrs });
  // Ya NO se traga el error en silencio: si la lectura falla, se dice y se devuelve el detalle.
  let colaError = '';
  let cola: any[] = [];
  if (rC.ok) { cola = await rC.json(); }
  else { colaError = `http=${rC.status}: ${(await rC.text()).slice(0, 200)}`; console.error('Cola read error:', colaError); }

  let items = 0, globosEnviados = 0;
  for (const c of cola) {
    if (items >= MAX_POR_CORRIDA) break;
    if (Number(c.enviar_en || 0) > ahora) continue; // aún no es su hora

    let globos: any[] = [];
    try { globos = JSON.parse(c.globos_json || '[]'); } catch { globos = []; }
    if (!Array.isArray(globos) || globos.length === 0) { await borrar(c.id); continue; } // item inválido: limpiar

    const canal = c.canal || 'whatsapp';
    if (canal === 'whatsapp' && (!waPhoneId || !waToken)) { console.error('WA creds faltan; no envío'); continue; }

    items++;
    let ok = true;
    if (canal === 'whatsapp') {
      for (let i = 0; i < globos.length; i++) {
        if (i > 0) await sleep(400); // espaciado entre globos
        if (!(await enviarWa(c.destino, String(globos[i])))) ok = false;
        globosEnviados++;
      }
    }
    // Enviado correctamente -> sacar de la cola. Si falló, se queda y reintenta en la próxima corrida.
    if (ok) await borrar(c.id);
  }

  console.log(`Cron latido — ${items} envio(s), ${globosEnviados} globo(s), cola=${cola.length} auth=${usaToken ? 'service-token' : 'api_key'}${colaError ? ' ERROR=' + colaError : ''}`);
  return new Response(JSON.stringify({
    ok: !colaError,
    items,
    globosEnviados,
    enCola: cola.length,
    auth: usaToken ? 'service-token' : 'api_key(legacy)',
    ...(colaError ? { colaError } : {}),
    wa: { phoneId: waPhoneId ? 'si' : 'NO', token: waToken ? 'si' : 'NO' },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
