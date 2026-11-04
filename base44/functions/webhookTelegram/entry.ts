// v2026-08-03.puente-agenda
// Telegram Sandbox — Emma (modo prueba) + PUENTE DE AGENDA con el grupo del equipo.
// RAG dinamico: selecciona chunks relevantes segun la conversacion actual.
// Comandos: /reset /estado /chunks
// En grupos: registra el mensaje y, si el equipo responde a una consulta de disponibilidad
// de Emma (webhookWhatsApp), actualiza el estado del lead, le propone la hora al cliente por
// WhatsApp (ColaEnvio) y confirma en el grupo.

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Mapeo keyword → titulos de chunks que se deben priorizar
const TOPIC_BOOSTS = [
  { regex: /manten|orden de trabajo|OT\b|CMMS|historial|falla|reparacion/i,    titles: ['CMMS ANTES VS DESPUÉS', 'MÓDULO DE MANTENIMIENTO'] },
  { regex: /GPS|rastreo|tiempo real|satelit/i,                                  titles: ['RFID vs GPS'] },
  { regex: /NFC|UHF|HF\b|frecuenci|tipo.*rfid|rfid.*tipo/i,                    titles: ['TIPOS DE RFID'] },
  { regex: /codific|chip|tag|etiquet|21 caracter|consecutiv/i,                  titles: ['LÓGICA DE CODIFICACIÓN DE CHIPS'] },
  { regex: /SAP|ERP|integra|sistema.*actual|conecta/i,                          titles: ['INTEGRACIÓN CON SAP y ERP'] },
  { regex: /club|golf|deport|cancha|piscina|tenis|nauta|marina/i,               titles: ['SECTOR CLUBES'] },
  { regex: /dotacion|EPP|overol|arnes|eslinga|ignifug|HSEQ|ISO 450/i,           titles: ['SECTOR DOTACIÓN Y EPPs'] },
  { regex: /bodega|logistic|despacho|muelle|pallet|retornabl/i,                 titles: ['CONOCIMIENTO TÉCNICO POR SECTOR'] },
  { regex: /precio|costo|inversion|cuanto|retorno|ROI|plata|presupuest/i,       titles: ['VELOCIDAD Y BENEFICIOS MEDIBLES', 'CLIENTES REALES'] },
  { regex: /cliente|referencia|quien.*han|caso.*real|experiencia/i,             titles: ['CLIENTES REALES', 'TRACK RECORD'] },
  { regex: /implementa|proceso|cuanto.*tarda|tiempo.*instala|fase|piloto/i,     titles: ['PROCESO DE IMPLEMENTACIÓN', 'METODOLOGÍA DE IMPLEMENTACIÓN'] },
  { regex: /metal|agua|interferencia|sombra|obstaculo|material/i,               titles: ['INTERFERENCIAS RFID'] },
  { regex: /SAMM|software|plataforma|app|movil|dashboard|reporte/i,             titles: ['PLATAFORMA SAMM'] },
  { regex: /lector|antena|portal|hardware|dispositivo/i,                        titles: ['RFID — Cómo Funciona', 'LAS 4 SOLUCIONES'] },
  { regex: /codigo de barras|barcode|escaner|manual/i,                          titles: ['RFID vs Código de Barras'] },
  { regex: /fabricacion|manufactura|linea.*produc|planta|lote|proceso/i,        titles: ['LAS 4 SOLUCIONES', 'CONOCIMIENTO TÉCNICO POR SECTOR'] },
  { regex: /petroleo|oil|gas|valvula|tuberia|offshore|cumplimiento|auditoria/i, titles: ['CONOCIMIENTO TÉCNICO POR SECTOR'] },
  { regex: /wetracking|empresa|quienes.*son|cuanto.*tiempo/i,                   titles: ['WETRACKING — Empresa', 'TRACK RECORD'] },
  { regex: /inventario|stock|conteo|auditoria.*activo/i,                        titles: ['VELOCIDAD Y BENEFICIOS MEDIBLES', 'LAS 4 SOLUCIONES'] },
];

// Chunks que siempre se cargan (base minimo de contexto)
const ALWAYS_LOAD = [
  'LAS 4 SOLUCIONES DE WETRACKING',
  'WETRACKING — Empresa, Contacto y Valores',
];

const MAX_RAG = 10000;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('OK', { status: 200 });

  let body;
  try { body = await req.json(); } catch { return new Response('OK', { status: 200 }); }

  const message = body?.message || body?.edited_message;
  if (!message) return new Response('OK', { status: 200 });

  const chatId       = String(message.chat?.id ?? '');
  const botToken     = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') || '';
  const base44Key    = Deno.env.get('BASE44_API_KEY') || '';
  const BASE_URL     = 'https://wtapp.base44.app';
  // AUTENTICACION (2026-08-20): la app es privada y el header api_key devuelve 403.
  // Base44 inyecta el token de servicio en cada invocacion; es lo que usa el SDK por dentro.
  const svcToken = (req.headers.get('Base44-Service-Authorization') || '').replace(/^Bearer\s+/i, '');
  const apiUrl   = req.headers.get('Base44-Api-Url') || 'https://base44.app';
  const appId44  = req.headers.get('Base44-App-Id') || '';
  const usaToken = !!(svcToken && appId44);
  const ENT      = usaToken ? `${apiUrl}/api/apps/${appId44}/entities` : `${BASE_URL}/api/entities`;
  const hdrs     = usaToken
    ? { 'Authorization': `Bearer ${svcToken}`, 'Content-Type': 'application/json' }
    : { 'api_key': base44Key, 'Content-Type': 'application/json' };
  const clienteId    = `tg_test_${chatId}`;

  // ── GRUPOS: Emma JAMAS contesta en chats de grupo ─────────────────────
  // Regla dura: en el grupo del equipo Emma solo ESCRIBE cuando webhookWhatsApp
  // pide disponibilidad de agenda o avisa una reunion confirmada. Todo mensaje
  // del grupo se registra en MensajeGrupoTelegram (alimenta "Detectar grupos" y
  // el flujo de agenda) y se sale SIN responder nada, ni siquiera a comandos.
  const chatType = message.chat?.type || 'private';
  if (chatType !== 'private' || chatId.startsWith('-')) {
    const textoGrupo = (message.text || message.caption || '').trim();
    if (textoGrupo) {
      try {
        await fetch(`${ENT}/MensajeGrupoTelegram`, {
          method: 'POST', headers: hdrs,
          body: JSON.stringify({
            chat_id: chatId,
            chat_titulo: message.chat?.title || '',
            remitente: [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' ') || (message.from?.username || ''),
            texto: textoGrupo,
            fecha: new Date().toISOString(),
            message_id: String(message.message_id || ''),
          }),
        });
        console.log(`Mensaje de grupo registrado: ${message.chat?.title || chatId}`);
      } catch (err) { console.error('Registro grupo error:', err.message); }

      // PUENTE DE AGENDA: si el equipo RESPONDE (o menciona a Emma) sobre una consulta de
      // disponibilidad, cerramos el loop: le proponemos la hora al cliente por WhatsApp y
      // confirmamos en el grupo. Se corre en segundo plano para responderle rapido a Telegram.
      // Se ESPERA siempre: EdgeRuntime.waitUntil no ejecuta el trabajo en este runtime
      // (comprobado el 20/08), por eso el equipo respondia en el grupo y no pasaba nada.
      try {
        await procesarRespuestaEquipo(message, textoGrupo, { BASE_URL, ENT, hdrs, botToken, anthropicKey, chatId });
      } catch (err) { console.error('procesarRespuestaEquipo error:', err.message); }
    }
    return new Response('OK', { status: 200 });
  }

  if (!message.text) return new Response('OK', { status: 200 });
  const texto = message.text.trim();
  if (!texto) return new Response('OK', { status: 200 });

  // ── 1. Cargar historial ───────────────────────────────────────────────────
  let notaId   = null;
  let historial = [];
  try {
    const r = await fetch(`${ENT}/Nota?q=${encodeURIComponent(JSON.stringify({ cliente_id: clienteId }))}&limit=1`, { headers: hdrs });
    if (r.ok) {
      const arr = await r.json();
      if (arr[0]) {
        notaId = arr[0].id;
        try { const parsed = JSON.parse(arr[0].texto || '{}'); historial = parsed.historial || []; } catch {}
      }
    }
  } catch {}

  // ── Comando /reset ────────────────────────────────────────────────────────
  if (texto === '/reset') {
    historial = [];
    await guardarHistorial(ENT, hdrs, notaId, clienteId, historial);
    await enviarTelegram(chatId, botToken, ['Listo, empezamos de nuevo.']);
    return new Response('OK', { status: 200 });
  }

  historial.push({ role: 'user', content: texto });

  // ── 2. Cargar ConfigAgente y ConocimientoRAG ──────────────────────────────
  let config   = {};
  let ragTodos = [];
  try {
    const [rCfg, rRag] = await Promise.all([
      fetch(`${ENT}/ConfigAgente?limit=1`, { headers: hdrs }),
      fetch(`${ENT}/ConocimientoRAG?q=${encodeURIComponent(JSON.stringify({ activo: true }))}&limit=100`, { headers: hdrs }),
    ]);
    if (rCfg.ok) { const arr = await rCfg.json(); config = arr[0] || {}; }
    if (rRag.ok) { ragTodos = await rRag.json(); }
  } catch (err) { console.error('Config/RAG load error:', err.message); }

  // ── 3. RAG dinamico: seleccion por relevancia ─────────────────────────────
  // Texto de contexto: ultimos 3 mensajes del usuario + mensaje actual
  const textoContexto = historial
    .filter(m => m.role === 'user')
    .slice(-3)
    .map(m => m.content)
    .join(' ');

  // Detectar titulos boosteados segun keywords
  const titulosBoosted = new Set(ALWAYS_LOAD);
  for (const { regex, titles } of TOPIC_BOOSTS) {
    if (regex.test(textoContexto)) {
      for (const t of titles) titulosBoosted.add(t);
    }
  }

  // Asignar score: boosted primero, luego por prioridad original
  const scored = ragTodos.map(chunk => ({
    ...chunk,
    score: titulosBoosted.has(chunk.titulo)
      ? 1000 + (Number(chunk.prioridad) || 5)   // boosted
      : Number(chunk.prioridad) || 5,             // normal
  }));
  scored.sort((a, b) => b.score - a.score);

  let ragSection    = '';
  let ragUsed       = 0;
  const chunksUsados   = [];
  const chunksSaltados = [];

  for (const chunk of scored) {
    const bloque = `[${chunk.titulo}]\n${chunk.contenido}\n\n`;
    if (ragUsed + bloque.length > MAX_RAG) {
      chunksSaltados.push({ titulo: chunk.titulo, prioridad: chunk.prioridad, score: chunk.score, chars: bloque.length });
    } else {
      ragSection += bloque;
      ragUsed    += bloque.length;
      chunksUsados.push({ titulo: chunk.titulo, prioridad: chunk.prioridad, score: chunk.score, chars: bloque.length });
    }
  }
  if (ragSection) ragSection = `=== BASE DE CONOCIMIENTO ===\n${ragSection}\n`;

  const conocimientoSection = (config.conocimiento_base || []).length
    ? `--- CONOCIMIENTO BASE DE WETRACKING ---\n${(config.conocimiento_base).map(k => `- ${k}`).join('\n')}\n\n`
    : '';
  const instruccionesExtra = config.instrucciones_sistema
    ? `--- INSTRUCCIONES ESPECIFICAS ---\n${config.instrucciones_sistema}\n\n`
    : '';

  // ── Comando /chunks — debug RAG ───────────────────────────────────────────
  if (texto === '/chunks') {
    const cargados = chunksUsados.map(c => `[s${c.score}] ${c.titulo} (${c.chars}c)`).join('\n');
    const saltados = chunksSaltados.map(c => `[s${c.score}] ${c.titulo} (${c.chars}c)`).join('\n');
    const ctx = [...titulosBoosted].filter(t => !ALWAYS_LOAD.includes(t));
    const msg = [
      `RAG: ${chunksUsados.length} chunks / ${ragUsed}c (max ${MAX_RAG})`,
      `Topics detectados: ${ctx.length ? ctx.join(', ') : 'ninguno (solo base)'}`,
      `\nCargados:\n${cargados || '(ninguno)'}`,
      saltados ? `\nSaltados:\n${saltados}` : '',
    ].filter(Boolean).join('\n');
    await enviarTelegram(chatId, botToken, [msg]);
    return new Response('OK', { status: 200 });
  }

  // ── 4. Llamar a Claude ────────────────────────────────────────────────────
  const systemPrompt = `Eres Emma Gonzales, ejecutiva de soluciones en WeTracking. Llevas 5 anos trabajando en tecnologia de trazabilidad y gestion de activos con RFID, ayudando a empresas de bodegas, manufactura, industria petrolera, academia, clubes y locativos.

No eres un bot. Nunca dices "soy una IA". Si preguntan si eres humana, dices que si. Eres colombiana profesional: calida, directa, segura. SIEMPRE usas "tu" (tuteo colombiano). JAMAS uses "vos", "podes", "tenes", "sabes" con tilde en la primera silaba, ni ningun conjugado de voseo rioplatense. Ejemplos correctos: "tu puedes", "lo que necesitas", "como te va", "sabes que". No usas emojis.

${conocimientoSection}${instruccionesExtra}${ragSection}
REGLAS:
- Reacciona antes de preguntar. Nunca vayas directo a la pregunta.
- Una sola pregunta por mensaje.
- Preguntas abiertas. Nunca de formulario.
- Maximo 4 oraciones por mensaje.
- Varia el largo de tus respuestas, no siempre igual.

PROHIBICIONES ABSOLUTAS:
- NUNCA decir que eres IA, bot o asistente virtual. Si preguntan: "Si, soy Emma Gonzales de WeTracking."
- NUNCA inventar precios, ROI, tiempos de retorno ni resultados de clientes especificos.
- NUNCA mandar info generica sin preguntar que necesitan primero.
- NUNCA hablar mal de competidores ni mencionar que hay opciones mas baratas en el mercado.
- NUNCA prometer fechas ni precios sin el equipo tecnico.
- NUNCA usar lenguaje de bot: "Entiendo tu consulta", "En que mas puedo ayudarte", "Quedo atenta".
- NUNCA usar el guion largo (—). Usar coma o punto en su lugar.
- NUNCA usar listas con vinetas, negritas, asteriscos ni frases de IA como "Es importante destacar", "Sin embargo", "Adicionalmente", "En este sentido", "Cabe mencionar".
- Los mensajes deben sonar como WhatsApp de una persona real, nunca como informe o chatbot.

FLUJO DE CALIFICACION: nombre → empresa → sector → tipo_necesidad → volumen → presupuesto.
SECTORES: Academia, Bodegas, Industria Petrolera, Manufactura, Clubes, Locativos.

DATOS DE Emma: cerca de 30 anos, le gusta correr y el cafe de filtro, vive en Colombia.

IMPORTANTE — MODO PRUEBA:
Esto es un entorno de prueba interno. Si el tester escribe "/estado" resume los datos del lead que llevas hasta ahora.

Responde siempre en texto plano. No uses JSON ni formato especial.`;

  let respuestaClaude = '';
  try {
    const cr = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        system: systemPrompt,
        messages: historial.slice(-20),
      }),
    });
    if (cr.ok) {
      respuestaClaude = (await cr.json()).content?.[0]?.text?.trim() || 'No pude responder, intenta de nuevo.';
    } else {
      console.error('Claude error:', cr.status, await cr.text());
      respuestaClaude = 'Hubo un error con el modelo. Revisa las credenciales de Anthropic.';
    }
  } catch (err) {
    console.error('Claude fetch error:', err.message);
    respuestaClaude = 'Error de conexion con Claude.';
  }

  historial.push({ role: 'assistant', content: respuestaClaude });
  historial = historial.slice(-30);

  // ── 5. Guardar historial ──────────────────────────────────────────────────
  await guardarHistorial(ENT, hdrs, notaId, clienteId, historial);

  // ── 6. Enviar respuesta por Telegram ─────────────────────────────────────
  const partes   = respuestaClaude.split('\n\n').filter(p => p.trim()).slice(0, 3);
  const mensajes = partes.length > 1 ? partes : [respuestaClaude];

  await enviarTelegram(chatId, botToken, mensajes);
  return new Response('OK', { status: 200 });
});

async function guardarHistorial(ENT, hdrs, notaId, clienteId, historial) {
  try {
    const notaData   = { cliente_id: clienteId, texto: JSON.stringify({ historial }), fecha_nota: new Date().toISOString() };
    const saveUrl    = notaId ? `${ENT}/Nota/${notaId}` : `${ENT}/Nota`;
    const saveMethod = notaId ? 'PUT' : 'POST';
    const sr = await fetch(saveUrl, { method: saveMethod, headers: hdrs, body: JSON.stringify(notaData) });
    if (!sr.ok) console.error('Nota save error:', (await sr.text()).slice(0, 200));
  } catch (err) { console.error('Save error:', err.message); }
}

async function enviarTelegram(chatId, botToken, mensajes) {
  for (const msg of mensajes) {
    const delay = Math.min(Math.max(msg.length * 12, 500), 2000);
    await sleep(delay);
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
      });
      await sleep(600);
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: msg }),
      });
    } catch (err) { console.error('TG send error:', err.message); }
  }
}

// ── PUENTE DE AGENDA ────────────────────────────────────────────────────────
// El equipo respondio en el grupo a una consulta de disponibilidad de Emma
// (posteada por webhookWhatsApp con "wa.me/<tel>"). Cerramos el loop:
//   1. identificamos el lead (por el wa.me del mensaje respondido, o el unico en espera),
//   2. interpretamos la respuesta del equipo con Claude (disponible? que hora?),
//   3. actualizamos e.agenda -> fecha_propuesta y encolamos el WhatsApp al cliente,
//   4. confirmamos en el grupo (asi Emma "responde" cuando le responden/tagean).
async function procesarRespuestaEquipo(message, textoGrupo, ctx) {
  const { BASE_URL, ENT, hdrs, botToken, anthropicKey, chatId } = ctx;
  const replyGrupo = async (txt) => {
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: txt, reply_to_message_id: message.message_id }),
      });
    } catch (err) { console.error('replyGrupo error:', err.message); }
  };

  const replyText = message.reply_to_message?.text || message.reply_to_message?.caption || '';
  const esRespuestaDisponibilidad = /disponibilidad para reunion/i.test(replyText);
  const mRep = replyText.match(/wa\.me\/(\d{7,15})/);
  const viaReply = !!(esRespuestaDisponibilidad && mRep);   // respuesta DIRECTA a la consulta de Emma
  const mencionaEmma = /\bemma\b/i.test(textoGrupo) || (message.entities || []).some(en => en.type === 'mention' || en.type === 'text_mention');

  // 1. Identificar el lead.
  let tel = '';
  if (esRespuestaDisponibilidad && mRep) {
    tel = mRep[1];
  } else if (mencionaEmma && !message.reply_to_message) {
    // Tag sin reply: si hay UN solo lead esperando al equipo, es ese.
    try {
      const rAll = await fetch(`${ENT}/Nota?limit=300`, { headers: hdrs });
      if (rAll.ok) {
        const esperando = [];
        for (const n of await rAll.json()) {
          try { const st = JSON.parse(n.texto || '{}'); if (st?.agenda?.estado === 'esperando_equipo' && n.cliente_id) esperando.push(n.cliente_id); } catch { /* no es un lead */ }
        }
        if (esperando.length === 1) tel = esperando[0];
        else if (esperando.length > 1) { await replyGrupo('Hay varias reuniones por cuadrar. Respondan al mensaje de la reunion especifica y la confirmo.'); return; }
      }
    } catch (err) { console.error('scan esperando error:', err.message); }
  }
  if (!tel) return; // no es una respuesta de agenda identificable -> solo quedo registrada

  // 2. Cargar el estado del lead.
  const rN = await fetch(`${ENT}/Nota?q=${encodeURIComponent(JSON.stringify({ cliente_id: tel }))}&limit=1`, { headers: hdrs });
  if (!rN.ok) return;
  const nota = (await rN.json())[0];
  if (!nota) { await replyGrupo('No encontre a ese lead en el sistema.'); return; }
  let e;
  try { e = JSON.parse(nota.texto || '{}'); } catch { return; }
  if (!e.agenda) { await replyGrupo('Ese lead todavia no tiene un proceso de agenda abierto.'); return; }
  if (e.agenda.equipo_msg_id === String(message.message_id)) return;          // retry de Telegram, ya procesado
  if (!['esperando_equipo', 'fecha_propuesta'].includes(e.agenda.estado)) return;

  // 3. Interpretar la respuesta del equipo con Claude.
  const nombreLead = e.datos?.nombre || 'el cliente';
  const pedido = (e.agenda.fecha_solicitada && e.agenda.fecha_solicitada !== 'sin preferencia')
    ? `El cliente habia propuesto: ${e.agenda.fecha_solicitada}.`
    : 'El cliente no propuso una fecha.';
  const prompt = `Eres Emma Gonzales, ejecutiva de WeTracking. El equipo interno acaba de responder en el grupo a tu consulta de disponibilidad para una reunion con ${nombreLead}. ${pedido}
Interpreta la respuesta del equipo y devuelve SOLO este JSON (sin texto extra):
{
  "disponible": true si el equipo confirma una hora concreta (la del cliente u otra), false si no hay hora aun,
  "fecha_hora": "la hora ACORDADA en lenguaje natural (ej: 'el jueves a las 10 am'); si confirmaron la del cliente, repitela; si dieron otra, esa; si no hay, null",
  "mensaje_cliente": "el mensaje que Emma le enviara al cliente por WhatsApp proponiendo esa hora. Voz de Emma: tuteo colombiano, calido, corto (1 a 2 frases), sin emojis, sin guion largo. Pide que confirme y dile que con eso le manda la invitacion. Si NO hay hora concreta, deja cadena vacia.",
  "ack_grupo": "confirmacion corta para el grupo de lo que vas a hacer (ej: 'Listo, le propongo el jueves 10am al cliente y les confirmo cuando acepte')"
}
Respuesta del equipo: """${textoGrupo}"""`;

  let parsed = { disponible: false, fecha_hora: null, mensaje_cliente: '', ack_grupo: '' };
  try {
    const cr = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 400, messages: [{ role: 'user', content: prompt }] }),
    });
    if (cr.ok) {
      const txt = (await cr.json()).content?.[0]?.text || '';
      const m = txt.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    } else { console.error('Claude equipo error:', cr.status); }
  } catch (err) { console.error('parse equipo error:', err.message); }

  // 4. Actualizar estado + (si hay hora concreta) encolar el WhatsApp al cliente.
  const hayHora = !!(parsed.disponible && parsed.fecha_hora);
  const enviarEn = Date.now() + 40 * 1000;   // ~40s para sentirse humano
  e.agenda = hayHora
    ? { ...e.agenda, estado: 'fecha_propuesta', fecha_propuesta: parsed.fecha_hora, ts: new Date().toISOString(), equipo_msg_id: String(message.message_id) }
    : { ...e.agenda, equipo_msg_id: String(message.message_id) };

  const msgCliente = hayHora ? (parsed.mensaje_cliente || '').trim() : '';
  if (msgCliente) {
    e.historial = e.historial || [];
    e.historial.push({ role: 'assistant', content: msgCliente, ts: new Date(enviarEn).toISOString() });
    e.historial = e.historial.slice(-30);
    try {
      const destino = tel.startsWith('57') ? tel : '57' + tel;
      // Antes de encolar: borrar lo que Emma tenia pendiente para este cliente.
      // Si no, sale una respuesta vieja tipo "sigo esperando al equipo" JUNTO con la
      // fecha ya confirmada, y se contradice sola (paso el 20/08 a las 11:10).
      try {
        const rPrev = await fetch(`${ENT}/ColaEnvio?q=${encodeURIComponent(JSON.stringify({ destino: tel }))}&limit=50`, { headers: hdrs });
        if (rPrev.ok) {
          for (const it of await rPrev.json()) {
            try { await fetch(`${ENT}/ColaEnvio/${it.id}`, { method: 'DELETE', headers: hdrs }); } catch { /* lo reintenta el cron */ }
          }
        }
      } catch (err) { console.error('limpiar cola previa error:', err.message); }

      await fetch(`${ENT}/ColaEnvio`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ destino, canal: 'whatsapp', globos_json: JSON.stringify([msgCliente]), enviar_en: enviarEn, nota_id: nota.id || '' }),
      });
    } catch (err) { console.error('ColaEnvio equipo error:', err.message); }
  }
  try {
    await fetch(`${ENT}/Nota/${nota.id}`, {
      method: 'PUT', headers: hdrs,
      body: JSON.stringify({ cliente_id: tel, texto: JSON.stringify(e), fecha_nota: new Date().toISOString() }),
    });
  } catch (err) { console.error('Nota save equipo error:', err.message); }

  // 5. Responder en el grupo (asi Emma "contesta" cuando le responden/tagean).
  //    Si hay hora: confirma que se la propone al cliente. Si NO hay hora clara: solo
  //    responde cuando fue una respuesta DIRECTA a su consulta (evita reaccionar a charla suelta).
  if (hayHora) {
    await replyGrupo((parsed.ack_grupo || '').trim() || `Listo, le propongo ${parsed.fecha_hora} al cliente y les confirmo cuando acepte.`);
  } else if (viaReply) {
    await replyGrupo((parsed.ack_grupo || '').trim() || 'Anotado. No me quedo clara la hora: me pasan dia y hora y yo le confirmo al cliente.');
  }
}