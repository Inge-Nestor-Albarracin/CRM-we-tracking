// v2026-07-22.redeploy2
// Envía las campañas en estado "Programada" cuya fecha_programada ya llegó.
// Pensada para ejecutarse como CRON (ej: cada hora) desde el panel de Base44.
// También se puede invocar manualmente (POST). Delega el envío a la función sendEmail.
// Env: BASE44_API_KEY.

const BASE_URL = 'https://wtapp.base44.app';

function jsonRes(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async () => {
  const apiKey = Deno.env.get('BASE44_API_KEY') || '';
  if (!apiKey) return jsonRes({ message: 'BASE44_API_KEY no configurada' }, 500);
  const hdrs = { 'api_key': apiKey, 'Content-Type': 'application/json' };

  const ahora = new Date();

  const r = await fetch(`${BASE_URL}/api/entities/Campana?estado=Programada&limit=100`, { headers: hdrs });
  const programadas: Record<string, string>[] = r.ok ? await r.json() : [];

  const enviadas: string[] = [];
  const errores: string[] = [];

  for (const c of programadas) {
    if (!c.fecha_programada) continue;
    if (new Date(c.fecha_programada) > ahora) continue; // aún no le toca

    try {
      const rSend = await fetch(`${BASE_URL}/api/functions/sendEmail`, {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({
          modo: 'campana',
          campana_id: c.id,
          asunto: c.asunto,
          plantilla_id: c.plantilla_id,
        }),
      });
      if (rSend.ok) enviadas.push(c.id);
      else errores.push(`${c.nombre}: sendEmail ${rSend.status}`);
    } catch (e) {
      errores.push(`${c.nombre}: ${String(e).slice(0, 120)}`);
    }
  }

  return jsonRes({ revisadas: programadas.length, enviadas, errores });
});