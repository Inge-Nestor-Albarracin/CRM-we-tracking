// v2026-07-30.1
// Speech-to-Text con ElevenLabs (Scribe). Recibe audio en base64 (grabado en el
// navegador) y devuelve el texto transcrito. AUTOCONTENIDO.
// POST { audio_base64: string, mime?: string } -> { texto }
// Env: ELEVENLABS_API_KEY.

function jsonRes(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonRes({ message: 'Solo POST' }, 405);
  const key = Deno.env.get('ELEVENLABS_API_KEY') || '';
  if (!key) return jsonRes({ message: 'ELEVENLABS_API_KEY no configurada en Base44' }, 500);

  let body: { audio_base64?: string; mime?: string };
  try { body = await req.json(); } catch { return jsonRes({ message: 'Body JSON invalido' }, 400); }
  const b64 = (body.audio_base64 || '').trim();
  if (!b64) return jsonRes({ message: 'audio_base64 es requerido' }, 400);
  const mime = body.mime || 'audio/webm';

  try {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const ext = mime.includes('mp4') ? 'mp4' : mime.includes('ogg') ? 'ogg' : mime.includes('wav') ? 'wav' : mime.includes('mpeg') ? 'mp3' : 'webm';
    const form = new FormData();
    form.append('file', new Blob([bin], { type: mime }), `audio.${ext}`);
    form.append('model_id', 'scribe_v1');

    const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST', headers: { 'xi-api-key': key }, body: form,
    });
    if (!r.ok) return jsonRes({ message: `ElevenLabs STT ${r.status}: ${(await r.text()).slice(0, 200)}` }, 500);
    const data = await r.json();
    return jsonRes({ texto: (data.text || data.transcript || '').trim() });
  } catch (e) {
    return jsonRes({ message: String((e as Error)?.message || e).slice(0, 300) }, 500);
  }
});
