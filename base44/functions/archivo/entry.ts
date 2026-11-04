// v2026-07-29.proxy-archivos-3 (soporta base44.app/api/apps/.../files)
// Proxy de archivos para que la URL visible sea del dominio propio (crm.wetracking.co)
// y NO aparezca "media.base44.com" en ningun lado (ni en la barra de direcciones).
//
// Uso:  /api/apps/<appId>/functions/archivo?p=<ruta>&n=<nombre>&dl=1
//   p  = ruta del archivo dentro del storage, p.ej. /files/public/<appId>/xxx.pdf
//        (SOLO la ruta, sin el host media.base44.com)
//   n  = nombre de archivo para mostrar/descargar (opcional)
//   dl = 1 -> fuerza descarga (Content-Disposition: attachment); si no, se abre inline
//
// Seguridad: la ruta debe ser /files/public/... o /images/public/... y pertenecer a ESTA app.
// AUTOCONTENIDO (sin imports de ../../shared) para que Base44 lo despliegue siempre.

const APP_ID = '6a43f4eff47c0d92cfe2b575';
const MEDIA_HOST = 'https://media.base44.com';
const APP_HOST = 'https://base44.app';

function corsHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...extra,
  };
}

// Acepta la ruta directa (?p=) o, por compatibilidad, la URL completa (?u=) y le quita el host.
// Devuelve la ruta + el upstream del que hay que traer el archivo (media CDN o base44.app),
// para que "base44" NO aparezca nunca en la URL visible.
function resolverArchivo(p: string): { ruta: string; upstream: string } | null {
  let ruta = p.trim();
  if (!ruta) return null;
  // Si por error llega una URL completa, nos quedamos solo con la ruta.
  if (ruta.startsWith('http')) {
    try { ruta = new URL(ruta).pathname; } catch { return null; }
  }
  if (!ruta.startsWith('/')) ruta = '/' + ruta;
  if (ruta.includes('..')) return null;                 // sin path traversal
  // 1) CDN de media: /files/public/... o /images/public/...
  if (/^\/(files|images)\/public\//.test(ruta) && ruta.includes(APP_ID)) {
    return { ruta, upstream: MEDIA_HOST + ruta };
  }
  // 2) Archivos servidos por la app: /api/apps/<APP_ID>/files|images/...
  if (new RegExp(`^/api/apps/${APP_ID}/(files|images)/`).test(ruta)) {
    return { ruta, upstream: APP_HOST + ruta };
  }
  return null;
}

function nombreDesdeRuta(ruta: string): string {
  const base = decodeURIComponent(ruta.split('/').pop() || 'archivo');
  const m = base.match(/^\d+_(.+)$/);           // el storage antepone un id numerico
  return m ? m[1] : base;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
  if (req.method !== 'GET') return new Response('Solo GET', { status: 405, headers: corsHeaders() });

  const reqUrl = new URL(req.url);
  const p = reqUrl.searchParams.get('p') || reqUrl.searchParams.get('u') || '';
  const nombreParam = reqUrl.searchParams.get('n') || '';
  const forzarDescarga = reqUrl.searchParams.get('dl') === '1';

  const resuelto = resolverArchivo(p);
  if (!resuelto) return new Response('Ruta no permitida', { status: 400, headers: corsHeaders() });
  const ruta = resuelto.ruta;

  let upstream: Response;
  try {
    upstream = await fetch(resuelto.upstream, { redirect: 'follow' });
  } catch {
    return new Response('No se pudo obtener el archivo', { status: 502, headers: corsHeaders() });
  }
  if (!upstream.ok || !upstream.body) {
    return new Response('Archivo no disponible', { status: upstream.status || 502, headers: corsHeaders() });
  }

  const nombre = (nombreParam || nombreDesdeRuta(ruta)).replace(/[\r\n"]/g, '');
  const tipo = upstream.headers.get('content-type') || 'application/octet-stream';
  const disp = forzarDescarga ? 'attachment' : 'inline';

  const headers = corsHeaders({
    'Content-Type': tipo,
    'Content-Disposition': `${disp}; filename="${nombre}"`,
    'Cache-Control': 'public, max-age=3600',
  });
  const len = upstream.headers.get('content-length');
  if (len) headers['Content-Length'] = len;

  return new Response(upstream.body, { status: 200, headers });
});
