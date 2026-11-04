// Herramienta de diagnóstico/gestión del webhook del bot copiloto de Telegram (NOVA).
//   POST ?token=wtsofia2026&action=info            -> getWebhookInfo (a dónde llegan los updates)
//   POST ?token=wtsofia2026&action=set&url=<URL>   -> setWebhook a esa URL
function json(o: unknown, s = 200) { return new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } }); }
Deno.serve(async (req) => {
  const cronToken = Deno.env.get('CRON_TOKEN') || 'wtsofia2026';
  const botToken = Deno.env.get('TELEGRAM_COPILOTO_TOKEN') || '';
  const url = new URL(req.url);
  let body: any = {}; try { body = await req.json(); } catch { /* */ }
  if ((url.searchParams.get('token') || body.token) !== cronToken) return json({ error: 'Unauthorized' }, 401);
  if (!botToken) return json({ error: 'TELEGRAM_COPILOTO_TOKEN no configurado' }, 500);
  const action = url.searchParams.get('action') || body.action || 'info';
  try {
    if (action === 'set') {
      const target = url.searchParams.get('url') || body.url || '';
      if (!target) return json({ error: 'Falta url' }, 400);
      const secret = Deno.env.get('TELEGRAM_COPILOTO_SECRET') || '';
      const r = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: target, ...(secret ? { secret_token: secret } : {}), allowed_updates: ['message', 'edited_message'] }),
      });
      return json({ action: 'set', target, resultado: await r.json() });
    }
    const r = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
    return json({ action: 'info', resultado: await r.json() });
  } catch (e) { return json({ error: String(e).slice(0, 200) }, 500); }
});
