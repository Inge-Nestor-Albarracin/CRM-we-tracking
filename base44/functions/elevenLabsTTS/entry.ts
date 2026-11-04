// v2026-07-30.1
// Text-to-Speech con ElevenLabs. Recibe texto (respuesta de Nova), lo limpia de
// Markdown y devuelve el audio (mp3 en base64) para reproducir en el navegador.
// POST { texto: string } -> { audio_base64, mime }
// Env: ELEVENLABS_API_KEY. Opcional: ELEVENLABS_VOICE_ID.

function jsonRes(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

// Quita el Markdown para que la voz no lea símbolos/tablas; recorta a un largo razonable.
function limpiarParaVoz(md: string): string {
  return (md || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*\|.*\|\s*$/gm, ' ')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .replace(/^[-*•]\s+/gm, '')
    .replace(/[#>*_~|]/g, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1500);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonRes({ message: 'Solo POST' }, 405);
  const key = Deno.env.get('ELEVENLABS_API_KEY') || '';
  if (!key) return jsonRes({ message: 'ELEVENLABS_API_KEY no configurada en Base44' }, 500);
  // Voz por defecto (multilingüe, sirve para español). Se puede sobreescribir por env.
  const voiceId = Deno.env.get('ELEVENLABS_VOICE_ID') || 'EXAVITQu4vr4xnSDxMaL';

  let body: { texto?: string };
  try { body = await req.json(); } catch { return jsonRes({ message: 'Body JSON invalido' }, 400); }
  const texto = limpiarParaVoz(body.texto || '');
  if (!texto) return jsonRes({ message: 'texto es requerido' }, 400);

  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
      body: JSON.stringify({
        text: texto,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });
    if (!r.ok) return jsonRes({ message: `ElevenLabs TTS ${r.status}: ${(await r.text()).slice(0, 200)}` }, 500);
    const buf = new Uint8Array(await r.arrayBuffer());
    // base64 por bloques (evita desbordar el call stack con audios grandes).
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < buf.length; i += CH) bin += String.fromCharCode(...buf.subarray(i, i + CH));
    return jsonRes({ audio_base64: btoa(bin), mime: 'audio/mpeg' });
  } catch (e) {
    return jsonRes({ message: String((e as Error)?.message || e).slice(0, 300) }, 500);
  }
});
