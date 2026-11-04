// v2026-08-04.evaluar-invokellm (usa CRÉDITOS DE INTEGRACIÓN de Base44, NO la API pagada de Anthropic)
// FASE A de la autoeducación: un "juez" evalúa las conversaciones reales de Emma como un
// gerente comercial exigente y guarda una EvaluacionChat por chat.
// POST { cliente_id?: string, limite?: number }  (sin cliente_id => evalúa las más recientes)
// Env: BASE44_API_KEY. LLM: InvokeLLM de Base44 (créditos de integración, NO Anthropic API).

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
const BASE_URL = 'https://wtapp.base44.app';

function jsonRes(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

const CRITERIOS_DEFAULT = `Emma es una ejecutiva de ventas B2B de WeTracking (soluciones RFID de control de inventario y trazabilidad de activos). Evalúala con MÁXIMA EXIGENCIA. Debe:
- Sonar 100% HUMANA (colombiana profesional, tutea, sin emojis, sin guiones largos, sin NADA de lenguaje de bot, sin "eco de validación" = repetir lo que dijo el cliente y calificarlo). CUALQUIER tic de bot es una falla grave.
- Mensajes CORTOS (1-2 oraciones), partidos en globos; un párrafo largo es falla grave.
- Cuando el lead llega con una necesidad concreta, IR DIRECTO A LA SOLUCIÓN de WeTracking (no interrogar primero). Presentar la solución y solo entonces pedir el poco contexto que falte.
- Pedir el NOMBRE si no lo tiene. Una sola pregunta por mensaje. Preguntas abiertas.
- CALIFICAR bien y descalificar CORDIALMENTE lo que no es el nicho (ej. retail NO es su enfoque).
- Llevar SIEMPRE hacia agendar una reunión con un ejecutivo. NUNCA inventar precios ni ROI.`;

// Esquema de salida para InvokeLLM (garantiza JSON válido con la rúbrica del juez).
const ESQUEMA_EVAL = {
  type: 'object',
  properties: {
    score_global: { type: 'number' },
    scores: { type: 'object', properties: { calificacion: { type: 'number' }, humanizacion: { type: 'number' }, rapidez: { type: 'number' }, cierre: { type: 'number' } } },
    veredicto: { type: 'string' },
    fortalezas: { type: 'array', items: { type: 'string' } },
    errores: { type: 'array', items: { type: 'string' } },
    lecciones: { type: 'array', items: { type: 'string' } },
    anotaciones: { type: 'array', items: { type: 'object', properties: { msg: { type: 'number' }, tipo: { type: 'string' }, comentario: { type: 'string' } } } },
  },
};

/* eslint-disable @typescript-eslint/no-explicit-any */
Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonRes({ message: 'Solo POST' }, 405);
  const apiKey = Deno.env.get('BASE44_API_KEY') || '';
  if (!apiKey) return jsonRes({ message: 'BASE44_API_KEY no configurada' }, 500);
  const b44 = createClientFromRequest(req);

  let body: { cliente_id?: string; limite?: number };
  try { body = await req.json(); } catch { body = {}; }
  const hdrs = { 'api_key': apiKey, 'Content-Type': 'application/json' };
  const get = async (path: string): Promise<any[]> => {
    try { const r = await fetch(`${BASE_URL}/api/entities/${path}`, { headers: hdrs }); return r.ok ? await r.json() : []; }
    catch { return []; }
  };

  // Criterios editables del evaluador
  const cfgEval = await get('ConfigEvaluador?limit=1');
  const criterios = cfgEval[0]?.criterios?.trim() || CRITERIOS_DEFAULT;

  // Catálogo para dar contexto al juez (que detecte si inventó productos/precios)
  const productos = await get('Producto?limit=500');
  const catalogo = productos.filter((p) => p.activo !== false).map((p) =>
    `- ${p.nombre}${p.categoria ? ` (${p.categoria})` : ''}${p.tipo_rfid ? ` ${p.tipo_rfid}` : ''}`
  ).join('\n') || '(catálogo vacío)';

  // Notas (estado de cada chat). Filtramos las que tengan conversación real.
  let notas: any[] = [];
  if (body.cliente_id) {
    notas = await get(`Nota?cliente_id=${encodeURIComponent(body.cliente_id)}&limit=1`);
  } else {
    const todas = await get('Nota?limit=200&sort=-fecha_nota');
    notas = todas
      .map((n) => { try { return { ...n, _e: JSON.parse(n.texto) }; } catch { return null; } })
      .filter((n) => n && Array.isArray(n._e?.historial) && n._e.historial.filter((m: any) => m.role === 'assistant').length >= 2)
      .slice(0, Math.min(Number(body.limite) || 5, 15));
  }

  if (notas.length === 0) return jsonRes({ message: 'No hay conversaciones para evaluar', evaluadas: 0 });

  const evaluarUna = async (nota: any) => {
    let e: any;
    try { e = nota._e || JSON.parse(nota.texto); } catch { return null; }
    const historial: any[] = e.historial || [];
    if (historial.filter((m) => m.role === 'assistant').length < 2) return null;

    // Transcripción con mensajes numerados
    const transcripcion = historial.map((m, i) =>
      `[${i + 1}] ${m.role === 'assistant' ? 'Emma' : 'Cliente'}: ${String(m.content || '').replace(/\n{2,}/g, ' ⏎ ')}`
    ).join('\n');

    const prompt = `Eres el EVALUADOR de calidad de Emma y eres un profesor DURÍSIMO, un gerente comercial implacable que NO deja pasar NADA. Tu trabajo NO es felicitar: es exigir la excelencia y encontrar cada fallo para que Emma mejore. Un examen fácil no sirve. Sé severo, específico y honesto. La mayoría de conversaciones NO merecen buena nota.

CÓMO DEBE TRABAJAR SOFIA (evalúa contra esto, sin excepciones):
${criterios}

ESCALA DE PUNTAJE (sé TACAÑO con las notas altas):
- 90-100: excepcional, casi perfecta. Prácticamente ninguna conversación real llega aquí.
- 70-89: buena pero con detalles claros que corregir.
- 50-69: MEDIOCRE. Varios errores, se siente a bot en partes, desaprovechó oportunidades. La mayoría de conversaciones promedio caen AQUÍ O MÁS ABAJO.
- 30-49: mala. Errores graves, robótica, no avanzó, no presentó la solución, o interrogó sin aportar.
- 0-29: muy mala.
Regla: ante la duda, BAJA la nota. Cada tic de bot, cada párrafo largo, cada pregunta desperdiciada, cada vez que no fue directo a la solución, cada momento genérico = resta puntos fuerte. NO regales puntos por "buena intención".

RÚBRICA (cada dimensión 0-100, con el mismo rigor):
- calificacion: ¿sacó los datos clave sin interrogar de más? ¿fue directo a la solución concreta cuando el lead expresó su necesidad? ¿descalificó/calificó bien?
- humanizacion: ¿sonó 100% humana? Penaliza SIN piedad guiones largos, párrafos, lenguaje de IA, eco de validación, repetición.
- rapidez: ¿pidió el nombre?, ¿avanzó sin dar vueltas?, ¿buen arranque?
- cierre: ¿empujó a AGENDAR una reunión?, ¿no inventó precios/ROI?, ¿no filtró datos internos?

COMENTARIOS POR MENSAJE (obligatorio, es lo más importante): deja una anotación por CADA mensaje de Emma [N] — di si estuvo mal (por qué y qué debió decir), bien, o mejorable. Sé concreto y crítico, como corrigiendo un examen.

Responde SOLO JSON válido (sin texto extra):
{"score_global":0-100,"scores":{"calificacion":0-100,"humanizacion":0-100,"rapidez":0-100,"cierre":0-100},"veredicto":"1-2 frases directas y críticas","fortalezas":["solo lo que de verdad hizo bien"],"errores":["cada fallo concreto"],"lecciones":["regla concreta y accionable para que no vuelva a pasar","..."],"anotaciones":[{"msg":N,"tipo":"error|bien|mejora","comentario":"crítica concreta del mensaje [N]"}]}

=== CATÁLOGO DE WETRACKING (para detectar productos/precios inventados) ===
${catalogo}

=== TRANSCRIPCIÓN (mensajes numerados) ===
${transcripcion}`;

    try {
      // Créditos de INTEGRACIÓN de Base44 (InvokeLLM), NO la API pagada de Anthropic.
      const resp: any = await b44.integrations.Core.InvokeLLM({ prompt, response_json_schema: ESQUEMA_EVAL });
      const ev = (resp && typeof resp === 'object' && !Array.isArray(resp)) ? (resp.data && typeof resp.data === 'object' ? resp.data : resp) : null;
      if (!ev || typeof ev.score_global === 'undefined') return null;

      const payload = {
        cliente_id: e.datos?.telefono || nota.cliente_id || '',
        contacto_nombre: e.datos?.nombre || '',
        fecha: new Date().toISOString(),
        score_global: Number(ev.score_global) || 0,
        score_calificacion: Number(ev.scores?.calificacion) || 0,
        score_humanizacion: Number(ev.scores?.humanizacion) || 0,
        score_rapidez: Number(ev.scores?.rapidez) || 0,
        score_cierre: Number(ev.scores?.cierre) || 0,
        veredicto: String(ev.veredicto || '').slice(0, 1000),
        fortalezas: (ev.fortalezas || []).map(String),
        errores: (ev.errores || []).map(String),
        lecciones: (ev.lecciones || []).map(String),
        anotaciones: (ev.anotaciones || []).map((a: any) => ({ msg: Number(a.msg) || 0, tipo: String(a.tipo || 'mejora'), comentario: String(a.comentario || '') })),
        transcripcion: transcripcion.slice(0, 12000),
        num_mensajes: historial.length,
      };
      await fetch(`${BASE_URL}/api/entities/EvaluacionChat`, { method: 'POST', headers: hdrs, body: JSON.stringify(payload) });
      return payload.score_global;
    } catch { return null; }
  };

  let evaluadas = 0;
  const scores: number[] = [];
  for (const nota of notas) {
    const s = await evaluarUna(nota);
    if (s !== null) { evaluadas++; scores.push(s); }
    await new Promise((r) => setTimeout(r, 150));
  }
  const promedio = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  return jsonRes({ ok: true, evaluadas, promedio });
});
