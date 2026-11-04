// v2026-07-23.investigar-tags
// A partir de una reunión inicial (necesidades del cliente), investiga con
// Gemini 2.5 Pro (con búsqueda web) una lista de tags RFID que se adapten a lo
// que pide el cliente, cruzando con el catálogo de WeTracking.
// POST body: { reunion_nota_id: string }
// Env: BASE44_API_KEY, GEMINI_API_KEY (de Google AI Studio).
// AUTOCONTENIDO (sin imports de ../../shared).

const BASE_URL = 'https://wtapp.base44.app';

function jsonRes(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonRes({ message: 'Solo POST' }, 405);

  const apiKey = Deno.env.get('BASE44_API_KEY') || '';
  const geminiKey = Deno.env.get('GEMINI_API_KEY') || '';
  if (!apiKey) return jsonRes({ message: 'BASE44_API_KEY no configurada' }, 500);
  if (!geminiKey) return jsonRes({ message: 'Falta GEMINI_API_KEY. Crea una API key en Google AI Studio (aistudio.google.com) y agrégala en Base44 → Secrets como GEMINI_API_KEY.' }, 500);

  let body: { reunion_nota_id?: string };
  try { body = await req.json(); } catch { return jsonRes({ message: 'Body JSON invalido' }, 400); }
  const notaId = body.reunion_nota_id;
  if (!notaId) return jsonRes({ message: 'reunion_nota_id es requerido' }, 400);

  const hdrs = { 'api_key': apiKey, 'Content-Type': 'application/json' };

  // 1. Cargar la reunión (necesidades del cliente)
  const rNota = await fetch(`${BASE_URL}/api/entities/ReunionNota/${notaId}`, { headers: hdrs });
  if (!rNota.ok) return jsonRes({ message: 'ReunionNota no encontrada' }, 404);
  const nota = await rNota.json();
  const { id: _id, created_date: _cd, updated_date: _ud, created_by: _cb, ...notaBase } = nota;

  // Contenido de la reunión: acta + resumen + contenido completo si está.
  let contenido = '';
  if (nota.contenido_url) {
    try { const r = await fetch(nota.contenido_url); if (r.ok) contenido = (await r.text()).slice(0, 20000); } catch { /* */ }
  }
  const necesidades = [
    nota.titulo ? `Reunión: ${nota.titulo}` : '',
    nota.acta_md ? `ACTA:\n${nota.acta_md}` : '',
    nota.resumen ? `RESUMEN:\n${nota.resumen}` : '',
    contenido ? `NOTAS/TRANSCRIPCIÓN:\n${contenido}` : (nota.extracto ? `EXTRACTO:\n${nota.extracto}` : ''),
  ].filter(Boolean).join('\n\n');

  if (!necesidades.trim()) return jsonRes({ message: 'La reunión no tiene contenido procesado. Procésala primero con "Reprocesar IA".' }, 400);

  // 2. Catálogo actual de WeTracking (con ficha técnica)
  const rProd = await fetch(`${BASE_URL}/api/entities/Producto?limit=500`, { headers: hdrs });
  const productos: any[] = rProd.ok ? await rProd.json() : []; // eslint-disable-line @typescript-eslint/no-explicit-any
  const catalogo = productos.filter((p) => p.activo !== false).map((p) => {
    const specs = [
      p.tipo_rfid, p.superficie ? `superficie ${p.superficie}` : '', p.temp_max != null ? `hasta ${p.temp_max}°C` : '',
      p.rango_m != null ? `rango ${p.rango_m}m` : '', p.entorno ? `entorno ${p.entorno}` : '', p.aplicacion ? `aplicación ${p.aplicacion}` : '',
    ].filter(Boolean).join(', ');
    return `- ${p.nombre}${p.categoria ? ` (${p.categoria})` : ''}${specs ? `: ${specs}` : ''}`;
  }).join('\n') || '(catálogo vacío)';

  // 3. Prompt para Gemini
  const prompt = `Eres un ingeniero senior experto en identificación por radiofrecuencia (RFID) que asesora al equipo comercial de WeTracking (empresa colombiana B2B de trazabilidad y gestión de activos con RFID).

Salimos de una reunión INICIAL con un cliente/prospecto donde nos presentaron su necesidad. Con base en lo que se habló, investiga (usa búsqueda web para modelos y specs reales del mercado) y arma una lista concreta de TAGS RFID que se adapten a lo que pide el cliente.

=== LO QUE PIDIÓ EL CLIENTE (contenido de la reunión) ===
${necesidades.slice(0, 24000)}

=== CATÁLOGO ACTUAL DE WETRACKING (lo que ya manejamos) ===
${catalogo}

Entrega en Markdown, en español, claro y accionable:
1. **Resumen de la necesidad**: qué van a rastrear, superficie (metal/no metal), entorno, temperatura, distancia de lectura y volumen aproximado.
2. **Tags recomendados** (una lista de 3 a 6). Para cada uno: tecnología (UHF/HF/NFC), si es on-metal, temperatura máx, rango de lectura, protección (IP) y material; y **por qué encaja** con la necesidad.
   - Marca con ✅ los que **ya están en el catálogo de WeTracking**.
   - Marca con 🔎 los que **habría que conseguir en el mercado**, con marca/modelo real y, si puedes, dónde/proveedor típico.
3. **Datos que faltan por confirmar** con el cliente antes de cerrar la recomendación.
4. **Siguiente paso comercial** sugerido (ej. muestra, prueba piloto, cotización).

Sé fiel a specs reales; no inventes. Si algo no se sabe, dilo.`;

  // 4. Llamar a Gemini 2.5 Pro con búsqueda web (grounding)
  let texto = '';
  try {
    const rG = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 8000 },
        }),
      },
    );
    if (!rG.ok) return jsonRes({ message: `Gemini ${rG.status}: ${(await rG.text()).slice(0, 300)}` }, 500);
    const data = await rG.json();
    const cand = data.candidates?.[0];
    texto = (cand?.content?.parts || []).map((p: any) => p.text || '').join('').trim(); // eslint-disable-line @typescript-eslint/no-explicit-any
    // Fuentes citadas por la búsqueda web
    const chunks = cand?.groundingMetadata?.groundingChunks || [];
    const fuentes = chunks.map((c: any) => c.web?.uri).filter(Boolean).slice(0, 8); // eslint-disable-line @typescript-eslint/no-explicit-any
    if (fuentes.length) texto += `\n\n---\n**Fuentes consultadas:**\n${fuentes.map((u: string) => `- ${u}`).join('\n')}`;
  } catch (e) {
    return jsonRes({ message: 'Error llamando a Gemini: ' + String((e as Error)?.message || e).slice(0, 200) }, 500);
  }

  if (!texto) return jsonRes({ message: 'Gemini no devolvió resultado.' }, 500);

  // 5. Guardar en la reunión
  Object.assign(notaBase, { research_tags_md: texto });
  await fetch(`${BASE_URL}/api/entities/ReunionNota/${notaId}`, { method: 'PUT', headers: hdrs, body: JSON.stringify(notaBase) });

  return jsonRes({ ok: true, research_tags_md: texto });
});
