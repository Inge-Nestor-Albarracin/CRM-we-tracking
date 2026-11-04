// v2026-07-22.redeploy2
// Proxy backend para obtener el HTML de una plantilla sin CORS.
// POST /api/functions/getPlantillaHtml
// Body: { id: "<plantilla_id>" }
// Retorna: { html: "<html>..." }

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Solo POST' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }

  const base44Key = Deno.env.get('BASE44_API_KEY') || '';
  if (!base44Key) {
    return new Response(JSON.stringify({ error: 'BASE44_API_KEY no configurada' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'Body JSON invalido' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const id = body.id as string;
  if (!id) {
    return new Response(JSON.stringify({ error: 'id requerido' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const BASE_URL = 'https://wtapp.base44.app';
  const hdrs = { 'api_key': base44Key, 'Content-Type': 'application/json' };

  const rP = await fetch(`${BASE_URL}/api/entities/PlantillaEmail/${id}`, { headers: hdrs });
  if (!rP.ok) {
    return new Response(JSON.stringify({ error: 'Plantilla no encontrada' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
  const plantilla = await rP.json();

  let html = plantilla.cuerpo_html || '';

  if (!html && plantilla.cuerpo_html_url) {
    const rHtml = await fetch(plantilla.cuerpo_html_url);
    if (rHtml.ok) html = await rHtml.text();
  }

  return new Response(JSON.stringify({ html }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});