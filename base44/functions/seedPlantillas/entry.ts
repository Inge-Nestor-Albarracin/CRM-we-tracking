// v2026-07-22.redeploy2
// Seeding de PlantillaEmail
// GET /api/functions/seedPlantillas?token=SEMELLENASVALENTINA

const SEED_TOKEN = 'SEMELLENASVALENTINA';

const HTML_INVENTARIOS = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional //EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
body{margin:0;padding:0;font-family:Arial,sans-serif;background:#ffffff;}
table{border-spacing:0;}
img{border:none;outline:none;text-decoration:none;max-width:100%;}
a{text-decoration:none;}
</style>
</head>
<body bgcolor="#ffffff" style="margin:0;padding:0;background-color:#ffffff;">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff">
<tr><td align="center" style="padding:20px 10px;">
  <table width="600" cellpadding="0" cellspacing="0" bgcolor="#f2f3f7" style="max-width:600px;background-color:#f2f3f7;">

    <!-- Hook -->
    <tr><td style="padding:20px 20px 10px;">
      <p style="font-size:18px;line-height:175%;text-align:center;color:#23496d;margin:0;font-family:Arial,sans-serif;">Tus operarios salen a campo todos los días con equipos de protección.</p>
      <h2 style="font-size:22px;line-height:175%;text-align:center;color:#007aed;margin:10px 0 0;font-family:Arial,sans-serif;">¿Puedes garantizar que ninguno está vencido, mal asignado o sin certificación?</h2>
    </td></tr>

    <!-- Image 1 -->
    <tr><td align="center" style="padding:10px 20px;">
      <img src="https://51490537.fs1.hubspotusercontent-na1.net/hub/51490537/hubfs/Email%20Marketing%20Designs%20-%20WeTracking%20(1).png?width=1120&amp;upscale=true" width="560" alt="WeTracking Inventarios Inteligentes" style="display:block;max-width:100%;">
    </td></tr>

    <!-- Divider -->
    <tr><td style="padding:0 20px;"><p style="border-top:1px solid #CCCCCC;margin:10px 0;font-size:1px;line-height:1px;">&nbsp;</p></td></tr>

    <!-- Image 2 + text -->
    <tr><td align="center" style="padding:10px 20px;">
      <img src="https://51490537.fs1.hubspotusercontent-na1.net/hub/51490537/hubfs/Email%20Marketing%20Designs%20-%20WeTracking.png?width=1120&amp;upscale=true" width="560" alt="WeTracking" style="display:block;max-width:100%;border-radius:5%;">
    </td></tr>
    <tr><td style="padding:10px 20px;">
      <p style="font-size:18px;line-height:131%;text-align:center;color:#23496d;margin:0;font-family:Arial,sans-serif;">La mayoría de empresas no tiene visibilidad real sobre el estado de sus equipos de protección.</p>
      <p style="font-size:18px;line-height:131%;text-align:center;color:#23496d;margin:15px 0 0;font-family:Arial,sans-serif;"><strong><span style="color:#007aed;">Eso es un riesgo legal, operativo y humano.</span></strong></p>
    </td></tr>

    <!-- Divider -->
    <tr><td style="padding:0 20px;"><p style="border-top:1px solid #CCCCCC;margin:10px 0;font-size:1px;line-height:1px;">&nbsp;</p></td></tr>

    <!-- Title image -->
    <tr><td align="center" style="padding:10px 20px;">
      <img src="https://51490537.fs1.hubspotusercontent-na1.net/hub/51490537/hubfs/T%C3%ADtulo%20(2).png?width=1000&amp;upscale=true" width="500" alt="Tags RFID para todo tipo de condiciones y EPPs" style="display:block;max-width:100%;">
    </td></tr>

    <!-- RFID text -->
    <tr><td style="padding:10px 20px;">
      <h2 style="margin:0;font-size:22px;color:#007aed;font-family:Arial,sans-serif;">Tags RFID para todo tipo de condiciones y EPPs</h2>
      <p style="font-size:18px;line-height:175%;color:#23496d;margin:10px 0 0;font-family:Arial,sans-serif;">El tag va cosido o adherido directamente al equipo. Aguanta calor, humedad e impacto sin degradarse. Y cada vez que alguien lo toma de la estantería, el sistema registra automáticamente quién lo tomó, cuándo y en qué estado está.</p>
    </td></tr>

    <!-- Divider -->
    <tr><td style="padding:0 20px;"><p style="border-top:1px solid #CCCCCC;margin:10px 0;font-size:1px;line-height:1px;">&nbsp;</p></td></tr>

    <!-- Two column -->
    <tr><td style="padding:0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td width="300" valign="top" style="padding:10px 20px;vertical-align:top;">
            <h2 style="margin:0;font-size:22px;color:#007aed;font-family:Arial,sans-serif;">Tu bodega sabe exactamente qué EPP tiene, de qué talla es y cuándo vence.</h2>
            <p style="font-size:18px;line-height:175%;color:#23496d;margin:10px 0 0;font-family:Arial,sans-serif;">Cada casco, cada bota, cada chaleco tiene su posición asignada en la estantería. El lector RFID registra automáticamente las entradas y salidas, sin que nadie tenga que anotar nada.</p>
            <p style="font-weight:bold;font-size:18px;line-height:175%;font-family:Arial,sans-serif;margin:10px 0 0;"><span style="color:#007aed;">Menos tiempo contando. Más tiempo operando.</span></p>
          </td>
          <td width="300" align="center" valign="top" style="padding:10px 20px;vertical-align:top;">
            <img src="https://51490537.fs1.hubspotusercontent-na1.net/hub/51490537/hubfs/cd495adb-3c0e-4339-ae56-c70edb4c6612.png?width=520&amp;upscale=true" width="260" alt="WeTracking EPP Inventario" style="display:block;max-width:100%;border-radius:6%;">
          </td>
        </tr>
      </table>
    </td></tr>

    <!-- CTA -->
    <tr><td align="center" style="padding:40px 20px 30px;">
      <table border="0" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" bgcolor="#07f5d9" style="border-radius:8px;background-color:#07f5d9;mso-padding-alt:20px 25px;">
            <a href="https://api.whatsapp.com/send/?phone=573117001527&amp;text&amp;type=phone_number&amp;app_absent=0" target="_blank" style="color:#000000;font-size:18px;font-family:Arial,sans-serif;font-weight:normal;text-decoration:none;padding:20px 25px;display:block;">
              Contáctanos para implementarlo en tu empresa
            </a>
          </td>
        </tr>
      </table>
    </td></tr>

    <!-- Divider -->
    <tr><td style="padding:0 20px;"><p style="border-top:1px solid #CCCCCC;margin:10px 0;font-size:1px;line-height:1px;">&nbsp;</p></td></tr>

    <!-- Logo -->
    <tr><td align="center" style="padding:10px 20px;">
      <img src="https://51490537.fs1.hubspotusercontent-na1.net/hub/51490537/hubfs/Logo-WeTr-RGB_V-Original-color%20(2).png?width=400&amp;upscale=true" width="200" alt="WeTracking" style="display:block;max-width:200px;margin:0 auto;">
    </td></tr>

    <!-- Social -->
    <tr><td align="center" style="padding:10px 20px;">
      <a href="https://www.facebook.com/profile.php?id=61568929877267" style="margin:0 5px;display:inline-block;"><img src="https://hs-51490537.f.hubspotfree.net/hs/hsstatic/TemplateAssets/static-1.262/img/hs_default_template_images/modules/Follow+Me+-+Email/facebook_circle_color.png" alt="Facebook" height="33" style="height:33px;width:auto;border:none;outline:none;"></a>
      <a href="https://www.linkedin.com/company/wetracking/" style="margin:0 5px;display:inline-block;"><img src="https://hs-51490537.f.hubspotfree.net/hs/hsstatic/TemplateAssets/static-1.262/img/hs_default_template_images/modules/Follow+Me+-+Email/linkedin_circle_color.png" alt="LinkedIn" height="33" style="height:33px;width:auto;border:none;outline:none;"></a>
      <a href="https://www.instagram.com/wetracking_/" style="margin:0 5px;display:inline-block;"><img src="https://hs-51490537.f.hubspotfree.net/hs/hsstatic/TemplateAssets/static-1.262/img/hs_default_template_images/modules/Follow+Me+-+Email/instagram_circle_color.png" alt="Instagram" height="33" style="height:33px;width:auto;border:none;outline:none;"></a>
    </td></tr>

    <!-- Footer -->
    <tr><td align="center" style="padding:10px 20px 30px;">
      <p style="font-family:Arial,sans-serif;font-size:12px;color:#23496d;text-align:center;margin:0;">WeTracking — Soluciones RFID para empresas industriales</p>
    </td></tr>

  </table>
</td></tr>
</table>
</body>
</html>`;

const PLANTILLAS = [
  {
    nombre: 'Inventarios Inteligentes — EPP RFID',
    asunto: '¿Puedes garantizar que ningún EPP está vencido o mal asignado?',
    categoria: 'Prospeccion',
    activo: true,
    variables: ['nombre', 'empresa'],
    cuerpo_html: HTML_INVENTARIOS,
  },
];

Deno.serve(async (req) => {
  const url   = new URL(req.url);
  const token = url.searchParams.get('token');

  if (token !== SEED_TOKEN) {
    return new Response(JSON.stringify({ error: 'Token incorrecto. Usa ?token=SEMELLENASVALENTINA' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const base44Key = Deno.env.get('BASE44_API_KEY') || '';
  if (!base44Key) return new Response(JSON.stringify({ error: 'BASE44_API_KEY no configurada' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

  const BASE_URL = 'https://wtapp.base44.app';
  const hdrs = { 'api_key': base44Key, 'Content-Type': 'application/json' };

  const resultados = [];
  for (const p of PLANTILLAS) {
    const rExist = await fetch(`${BASE_URL}/api/entities/PlantillaEmail?nombre=${encodeURIComponent(p.nombre)}&limit=1`, { headers: hdrs });
    const existing = rExist.ok ? await rExist.json() : [];
    if (existing.length > 0) {
      resultados.push({ nombre: p.nombre, status: '409 ya existe' });
      continue;
    }
    const r = await fetch(`${BASE_URL}/api/entities/PlantillaEmail`, {
      method: 'POST', headers: hdrs, body: JSON.stringify(p),
    });
    if (r.ok) {
      const created = await r.json();
      resultados.push({ nombre: p.nombre, id: created.id, status: 'creada' });
    } else {
      const err = await r.text();
      resultados.push({ nombre: p.nombre, status: 'error', error: err.slice(0, 200) });
    }
  }

  const exitosas = resultados.filter(r => r.status === 'creada').length;
  return new Response(JSON.stringify({
    mensaje: `Seeding plantillas: ${exitosas}/${PLANTILLAS.length} creadas`,
    resultados,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});