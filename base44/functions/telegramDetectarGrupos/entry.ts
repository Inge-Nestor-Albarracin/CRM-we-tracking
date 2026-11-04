// Detecta los grupos de Telegram donde esta el bot de Emma.
// Fuentes: getMe (username del bot para mostrarlo en el CRM) +
// MensajeGrupoTelegram (grupos ya vistos por los webhooks de Telegram).
// Lo usa el boton "Detectar grupos" en Configuracion del Agente.

Deno.serve(async (_req) => {
  const botToken  = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
  const base44Key = Deno.env.get('BASE44_API_KEY') || '';
  const BASE_URL  = 'https://wtapp.base44.app';
  const hdrs      = { 'api_key': base44Key, 'Content-Type': 'application/json' };

  let botUsername = '';
  try {
    const r = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    if (r.ok) { const j = await r.json(); botUsername = j?.result?.username || ''; }
  } catch { /* no critico */ }

  const grupos = [];
  try {
    const r = await fetch(`${BASE_URL}/api/entities/MensajeGrupoTelegram?limit=200&sort=-fecha`, { headers: hdrs });
    if (r.ok) {
      const msgs = await r.json();
      const vistos = new Map();
      for (const m of msgs) {
        if (!m.chat_id || vistos.has(m.chat_id)) continue;
        vistos.set(m.chat_id, {
          chat_id: String(m.chat_id),
          titulo: m.chat_titulo || '(sin titulo)',
          ultimo_mensaje: m.fecha || '',
        });
      }
      grupos.push(...vistos.values());
    }
  } catch { /* no critico */ }

  return Response.json({ bot_username: botUsername, grupos });
});
