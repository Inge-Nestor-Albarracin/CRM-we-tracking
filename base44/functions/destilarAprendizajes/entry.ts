// v2026-07-24.destilar
// FASE B.1 de la autoeducación: lee las lecciones/errores de las evaluaciones y las
// sintetiza en una lista corta de reglas concretas (máx 12), sin repetir las que ya
// existen. Crea Aprendizaje con estado "pendiente" (un humano las aprueba después).
// POST {}  Env: BASE44_API_KEY. LLM: InvokeLLM de Base44 (créditos de integración, NO Anthropic API).

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
const BASE_URL = 'https://wtapp.base44.app';

function jsonRes(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

const ESQUEMA_REGLAS = {
  type: 'object',
  properties: {
    reglas: { type: 'array', items: { type: 'object', properties: { regla: { type: 'string' }, categoria: { type: 'string' } } } },
  },
};

/* eslint-disable @typescript-eslint/no-explicit-any */
Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonRes({ message: 'Solo POST' }, 405);
  const apiKey = Deno.env.get('BASE44_API_KEY') || '';
  if (!apiKey) return jsonRes({ message: 'BASE44_API_KEY no configurada' }, 500);
  const b44 = createClientFromRequest(req);

  const hdrs = { 'api_key': apiKey, 'Content-Type': 'application/json' };
  const get = async (path: string): Promise<any[]> => {
    try { const r = await fetch(`${BASE_URL}/api/entities/${path}`, { headers: hdrs }); return r.ok ? await r.json() : []; }
    catch { return []; }
  };

  const evals = await get('EvaluacionChat?limit=80&sort=-fecha');
  if (evals.length === 0) return jsonRes({ message: 'No hay evaluaciones para destilar. Primero evalúa conversaciones.', creadas: 0 });

  // Junta lecciones y errores
  const lecciones: string[] = [];
  const errores: string[] = [];
  for (const ev of evals) {
    for (const l of (ev.lecciones || [])) if (l) lecciones.push(String(l));
    for (const e of (ev.errores || [])) if (e) errores.push(String(e));
  }
  if (lecciones.length === 0 && errores.length === 0) return jsonRes({ message: 'Las evaluaciones no tienen lecciones aún.', creadas: 0 });

  // Reglas ya existentes (para no repetir)
  const existentes = (await get('Aprendizaje?limit=300')).map((a) => String(a.regla || '')).filter(Boolean);

  const prompt = `Eres el destilador de aprendizajes de Emma (agente de ventas B2B RFID de WeTracking). Te doy las LECCIONES y ERRORES que un juez detectó en muchas conversaciones reales. Sintetiza el PATRÓN que se repite en una lista CORTA de reglas concretas y accionables para mejorar a Emma.

INSTRUCCIONES:
- Máximo 12 reglas. Prioriza las que aparecen varias veces.
- Cada regla: una frase imperativa, concreta y aplicable en el prompt (no genérica).
- NO repitas ni parafrasees reglas que ya existen (te las listo abajo).
- Si no hay nada nuevo relevante, devuelve lista vacía.
- Clasifica cada regla en una categoría: humanizacion | calificacion | cierre | rapidez | general.

REGLAS QUE YA EXISTEN (no las repitas):
${existentes.length ? existentes.map((r) => `- ${r}`).join('\n') : '(ninguna aún)'}

LECCIONES DETECTADAS:
${lecciones.slice(0, 120).map((l) => `- ${l}`).join('\n') || '(ninguna)'}

ERRORES DETECTADOS:
${errores.slice(0, 120).map((e) => `- ${e}`).join('\n') || '(ninguno)'}

Responde SOLO JSON válido:
{"reglas":[{"regla":"...","categoria":"humanizacion|calificacion|cierre|rapidez|general"}]}`;

  let reglas: { regla: string; categoria: string }[] = [];
  try {
    // Créditos de INTEGRACIÓN de Base44 (InvokeLLM), NO la API pagada de Anthropic.
    const resp: any = await b44.integrations.Core.InvokeLLM({ prompt, response_json_schema: ESQUEMA_REGLAS });
    const parsed = (resp && typeof resp === 'object' && !Array.isArray(resp)) ? (resp.data && typeof resp.data === 'object' ? resp.data : resp) : { reglas: [] };
    reglas = (parsed.reglas || []).map((x: any) => ({ regla: String(x.regla || '').trim(), categoria: String(x.categoria || 'general') })).filter((x: any) => x.regla);
  } catch (e) {
    return jsonRes({ message: 'Error destilando: ' + String((e as Error)?.message || e).slice(0, 200) }, 500);
  }

  // Crear Aprendizaje pendientes (evitando duplicados exactos con los existentes)
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const yaSet = new Set(existentes.map(norm));
  let creadas = 0;
  for (const rr of reglas.slice(0, 12)) {
    if (yaSet.has(norm(rr.regla))) continue;
    await fetch(`${BASE_URL}/api/entities/Aprendizaje`, {
      method: 'POST', headers: hdrs,
      body: JSON.stringify({ regla: rr.regla.slice(0, 500), categoria: rr.categoria, estado: 'pendiente', soporte: evals.length, fecha: new Date().toISOString() }),
    });
    yaSet.add(norm(rr.regla));
    creadas++;
  }

  return jsonRes({ ok: true, creadas, evaluaciones_usadas: evals.length });
});
