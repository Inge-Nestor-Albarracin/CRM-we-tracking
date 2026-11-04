// Método de autoeducación de Emma (estilo Valentina). La IA (juez y destilador)
// corre desde el PANEL con InvokeLLM (créditos de Base44) usando Opus.
import { base44 } from '@/api/base44Client';

export const DIMENSIONES = ['calificacion', 'humanizacion', 'rapidez', 'cierre'];

// Config por defecto del evaluador (lo que se puede editar en Config Evaluador).
export const DEFAULT_EVAL = {
  como_trabaja: `Emma es una ejecutiva de ventas B2B de WeTracking (soluciones RFID de control de inventario y trazabilidad de activos). Debe:
- Sonar 100% HUMANA (colombiana profesional, tutea, sin emojis, sin guiones largos, sin lenguaje de bot, sin "eco de validación" = repetir lo que dijo el cliente y calificarlo).
- Mensajes CORTOS (1-2 oraciones) partidos en globos; un párrafo largo es falla grave.
- Cuando el lead llega con una necesidad concreta, ir DIRECTO a la solución de WeTracking (no interrogar primero): presentar la solución y solo entonces pedir el poco contexto que falte.
- Pedir el NOMBRE si no lo tiene; una sola pregunta por mensaje; preguntas abiertas.
- Calificar bien y descalificar CORDIALMENTE lo que no es el nicho.
- Llevar SIEMPRE hacia agendar una reunión con un ejecutivo. Nunca inventar precios ni ROI.`,
  crit_calificacion: `¿Sacó los datos clave (empresa, sector, tipo de necesidad, volumen) SIN interrogar de más? ¿Fue directo a la solución concreta cuando el lead expresó su necesidad? ¿Calificó/descalificó correctamente?`,
  crit_humanizacion: `¿Sonó 100% humana? Penaliza SIN piedad guiones largos, párrafos, lenguaje de IA, eco de validación, repetición, emojis.`,
  crit_rapidez: `¿Pidió el nombre? ¿Avanzó directo sin dar vueltas? ¿Buen arranque?`,
  crit_cierre: `¿Empujó a AGENDAR una reunión con un ejecutivo? ¿No inventó precios/ROI? ¿No filtró datos internos?`,
  instrucciones_juez: `Eres un profesor DURÍSIMO, un gerente comercial implacable que NO deja pasar nada. Tu trabajo no es felicitar sino exigir la excelencia. Sé severo, específico y honesto. La mayoría de conversaciones NO merecen buena nota. Ante la duda, BAJA la nota. Cada tic de bot, párrafo largo, pregunta desperdiciada o momento genérico resta fuerte.`,
  modelo: 'claude_opus_4_8',
  pausa_ms: 300,
};

export function cfgEval(rec) {
  const c = rec || {};
  return {
    como_trabaja: c.como_trabaja || c.criterios || DEFAULT_EVAL.como_trabaja,
    crit_calificacion: c.crit_calificacion || DEFAULT_EVAL.crit_calificacion,
    crit_humanizacion: c.crit_humanizacion || DEFAULT_EVAL.crit_humanizacion,
    crit_rapidez: c.crit_rapidez || DEFAULT_EVAL.crit_rapidez,
    crit_cierre: c.crit_cierre || DEFAULT_EVAL.crit_cierre,
    instrucciones_juez: c.instrucciones_juez || DEFAULT_EVAL.instrucciones_juez,
    modelo: c.modelo || DEFAULT_EVAL.modelo,
    pausa_ms: c.pausa_ms != null ? Number(c.pausa_ms) : DEFAULT_EVAL.pausa_ms,
  };
}

export function construirTranscripcion(historial) {
  return (historial || [])
    .map((m, i) => `[${i + 1}] ${m.role === 'assistant' ? 'Emma' : 'Cliente'}: ${String(m.content || '').replace(/\n{2,}/g, ' ⏎ ')}`)
    .join('\n');
}

export function promptJuez({ transcripcion, cfg, catalogo, campana }) {
  const c = cfgEval(cfg);
  return `${c.instrucciones_juez}

CÓMO DEBE TRABAJAR SOFIA (evalúa contra esto, sin excepciones):
${c.como_trabaja}

ESCALA DE PUNTAJE (sé TACAÑO): 90-100 excepcional (casi ninguna llega); 70-89 buena con detalles; 50-69 MEDIOCRE (la mayoría cae aquí o más abajo); 30-49 mala; 0-29 muy mala.

RÚBRICA (cada dimensión 0-100, con el mismo rigor):
- calificacion: ${c.crit_calificacion}
- humanizacion: ${c.crit_humanizacion}
- rapidez: ${c.crit_rapidez}
- cierre: ${c.crit_cierre}

COMENTARIOS POR MENSAJE (obligatorio): deja una anotación por CADA mensaje de Emma [N] — di si estuvo mal (por qué y qué debió decir), bien, o mejorable. Concreto y crítico, como corrigiendo un examen.

Responde SOLO JSON válido (sin texto extra):
{"score_global":0-100,"scores":{"calificacion":0-100,"humanizacion":0-100,"rapidez":0-100,"cierre":0-100},"veredicto":"1-2 frases directas y críticas","fortalezas":["solo lo que de verdad hizo bien"],"errores":["cada fallo concreto"],"lecciones":["regla concreta y accionable","..."],"anotaciones":[{"msg":N,"tipo":"error|bien|mejora","comentario":"crítica concreta del mensaje [N]"}]}

=== CATÁLOGO / SOLUCIONES DE WETRACKING (para detectar productos/precios inventados) ===
${catalogo || '(sin catálogo)'}
${campana ? `\n=== CAMPAÑA ACTIVA (para ver si conectó la referencia al anuncio) ===\n${campana}\n` : ''}
=== TRANSCRIPCIÓN (mensajes numerados) ===
${transcripcion}`;
}

export function promptDestilar({ lecciones, errores, existentes }) {
  return `Eres el destilador de aprendizajes de Emma (agente de ventas B2B RFID de WeTracking). Te doy las LECCIONES y ERRORES que un juez detectó en muchas conversaciones reales. Sintetiza el PATRÓN que se repite en una lista CORTA de reglas concretas y accionables para mejorar a Emma.

INSTRUCCIONES:
- Máximo 12 reglas. Prioriza las que aparecen varias veces.
- Cada regla: una frase imperativa, concreta y aplicable en el prompt (no genérica).
- NO repitas ni parafrasees reglas que ya existen (te las listo abajo).
- Si no hay nada nuevo relevante, devuelve lista vacía.
- Clasifica cada regla: humanizacion | calificacion | cierre | rapidez | general.

REGLAS QUE YA EXISTEN (no las repitas):
${(existentes || []).length ? existentes.map((r) => `- ${r}`).join('\n') : '(ninguna aún)'}

LECCIONES DETECTADAS:
${(lecciones || []).slice(0, 120).map((l) => `- ${l}`).join('\n') || '(ninguna)'}

ERRORES DETECTADOS:
${(errores || []).slice(0, 120).map((e) => `- ${e}`).join('\n') || '(ninguno)'}

Responde SOLO JSON válido:
{"reglas":[{"regla":"...","categoria":"humanizacion|calificacion|cierre|rapidez|general"}]}`;
}

export async function invocarIA(prompt, model) {
  const res = await base44.integrations.Core.InvokeLLM({ prompt, model: model || DEFAULT_EVAL.modelo });
  return typeof res === 'string' ? res : (res?.data ?? JSON.stringify(res) ?? '');
}

export function extraerJSON(txt) {
  const m = String(txt || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

// Catálogo de WeTracking en texto (para el contexto del juez).
export function catalogoTexto(productos) {
  return (productos || [])
    .filter((p) => p.activo !== false)
    .map((p) => `- ${p.nombre}${p.categoria ? ` (${p.categoria})` : ''}${p.tipo_rfid ? ` ${p.tipo_rfid}` : ''}${p.aplicacion ? ` | ${p.aplicacion}` : ''}`)
    .join('\n') || '(catálogo vacío)';
}
