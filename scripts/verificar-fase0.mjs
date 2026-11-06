// Verifica desde afuera que las correcciones de la Fase 0 están PUBLICADAS.
//
// Uso (desde wtapp):  node scripts/verificar-fase0.mjs
// Opcional:           $env:B44_FUNCTIONS_URL = "https://crm.wetracking.co/api/functions"
//
// Todas las pruebas son inofensivas: peticiones sin sesión y con cuerpo vacío, que el código
// viejo rechaza por "faltan datos" (400) y el nuevo por "no autorizado" (401/403).
// No envía correos ni mensajes, no crea registros y no gasta créditos de IA.

const BASE = (process.env.B44_FUNCTIONS_URL || 'https://wtapp.base44.app/api/functions').replace(/\/$/, '');

const pruebas = [
  { nombre: 'emmaWhatsApp: versión publicada', metodo: 'GET', fn: 'emmaWhatsApp', query: '?_probe=version',
    ok: (s, t) => s === 200 && t.includes('fase0'), espera: 'texto con "fase0"' },
  { nombre: 'novaTelegram: versión publicada', metodo: 'GET', fn: 'novaTelegram', query: '?_probe=version',
    ok: (s, t) => s === 200 && t.includes('fase0'), espera: 'texto con "fase0"' },
  { nombre: 'emmaWhatsApp rechaza POST sin firma de Meta (SEG-05)', metodo: 'POST', fn: 'emmaWhatsApp',
    ok: (s) => s === 403, espera: '403 (500 = falta META_APP_SECRET)' },
  { nombre: 'novaTelegram rechaza update sin secret (SEG-01)', metodo: 'POST', fn: 'novaTelegram',
    ok: (s) => s === 403, espera: '403 (500 = falta TELEGRAM_COPILOTO_SECRET)' },
  { nombre: 'novaTelegram: sondas protegidas (SEG-11)', metodo: 'GET', fn: 'novaTelegram', query: '?_probe=contexto',
    ok: (s) => s === 401, espera: '401' },
  { nombre: 'copilotoEmpresa exige sesión (SEG-02)', metodo: 'POST', fn: 'copilotoEmpresa',
    ok: (s) => s === 401, espera: '401' },
  { nombre: 'sendEmail exige sesión (SEG-03)', metodo: 'POST', fn: 'sendEmail',
    ok: (s) => s === 401, espera: '401' },
  { nombre: 'gmailEnviar exige sesión (SEG-03)', metodo: 'POST', fn: 'gmailEnviar',
    ok: (s) => s === 401, espera: '401' },
  { nombre: 'enviarCampanasProgramadas exige token (SEG-03)', metodo: 'POST', fn: 'enviarCampanasProgramadas',
    ok: (s) => s === 401, espera: '401' },
  // Con cuerpo vacío, el código viejo responde 400 ("fecha invalida") ANTES de crear nada.
  { nombre: 'emmaCrearReunion rechaza token viejo wtsofia2026 (SEG-04)', metodo: 'POST', fn: 'emmaCrearReunion',
    headers: { 'x-emma-token': 'wtsofia2026' },
    ok: (s) => s === 401, espera: '401 (500 = falta CRON_TOKEN; 400 = sigue aceptando el token viejo)' },
  { nombre: 'checkCredenciales ya no existe (SEG-09)', metodo: 'GET', fn: 'checkCredenciales', query: '?token=x',
    ok: (s) => s === 404, espera: '404' },
  { nombre: 'novaWebhook ya no existe (SEG-04)', metodo: 'GET', fn: 'novaWebhook',
    ok: (s) => s === 404, espera: '404' },
];

let fallos = 0;
for (const p of pruebas) {
  let status = 0, texto = '';
  try {
    const r = await fetch(`${BASE}/${p.fn}${p.query || ''}`, {
      method: p.metodo,
      headers: { ...(p.metodo === 'POST' ? { 'Content-Type': 'application/json' } : {}), ...(p.headers || {}) },
      body: p.metodo === 'POST' ? '{}' : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    status = r.status;
    texto = (await r.text()).slice(0, 120).replace(/\s+/g, ' ');
  } catch (e) { texto = String(e?.message || e); }
  const bien = p.ok(status, texto);
  if (!bien) fallos++;
  console.log(`${bien ? '✔' : '✘'} ${p.nombre}`);
  if (!bien) console.log(`    recibido: ${status} ${texto}\n    esperado: ${p.espera}`);
}
console.log(fallos ? `\n${fallos} prueba(s) fallaron. ¿Falta configurar una variable o pulsar Publicar?` : '\nTodo en orden: la Fase 0 está publicada.');
process.exit(fallos ? 1 : 0);
