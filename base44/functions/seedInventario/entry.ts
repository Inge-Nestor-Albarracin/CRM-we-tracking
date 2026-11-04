// v2026-07-22.redeploy2
// Carga inicial del inventario de bodega: crea Productos (sin precio) y registra
// las unidades disponibles como movimiento de entrada.
// GET /api/functions/seedInventario?token=SEMELLENASVALENTINA
// Idempotente: si un producto ya existe (por SKU o nombre) se omite y NO se
// vuelve a sumar stock. Env: BASE44_API_KEY.

const TOKEN = 'SEMELLENASVALENTINA';
const BASE_URL = 'https://wtapp.base44.app';

// Datos del CSV de bodega. categoria: Lectores | Tags_RFID
const ITEMS: { sku?: string; categoria: string; nombre: string; cantidad: number }[] = [
  { sku: 'WT-CRF01', categoria: 'Lectores', nombre: 'Celular RFID', cantidad: 1 },
  { sku: 'WT-COP01', categoria: 'Lectores', nombre: 'Copiadora RFID', cantidad: 1 },
  { sku: 'WT-L134HF1', categoria: 'Lectores', nombre: 'Lector HF Animales', cantidad: 8 },
  { sku: 'WT-LANT30', categoria: 'Lectores', nombre: 'Lector Antena RFID UHF - Blancas', cantidad: 2 },
  { sku: 'WT-LBR01', categoria: 'Lectores', nombre: 'Lector Bluethoot tipo reloj', cantidad: 1 },
  { sku: 'WT-LHFUM1', categoria: 'Lectores', nombre: 'Lector hf Plug USB', cantidad: 1 },
  { sku: 'WT-LHFUC1', categoria: 'Lectores', nombre: 'Lector hf Plug USB C', cantidad: 20 },
  { sku: 'WT-LSQ01', categoria: 'Lectores', nombre: 'Lector cuadrado Negro', cantidad: 1 },
  { sku: 'WT-LNFC02', categoria: 'Lectores', nombre: 'Lector NFC bluethoot', cantidad: 5 },
  { sku: 'WT-LUBT01', categoria: 'Lectores', nombre: 'Lector UHF Bluethoot', cantidad: 4 },
  { categoria: 'Lectores', nombre: 'Lector Azul - Remarcador', cantidad: 2 },
  { categoria: 'Lectores', nombre: 'Lector Gris Estanterias', cantidad: 1 },
  { categoria: 'Antenas', nombre: 'Antenas Negras - Estanterias Inteligentes', cantidad: 3 },
  { sku: 'WT-PIS01', categoria: 'Lectores', nombre: 'Pistola teclado', cantidad: 2 },
  { sku: 'WT-T5MM01', categoria: 'Tags_RFID', nombre: 'Tag 5mm diámetro UHF petrolera', cantidad: 27 },
  { sku: 'WT-TAB01', categoria: 'Tags_RFID', nombre: 'Tag abrazadera', cantidad: 23 },
  { sku: 'WT-ANM01', categoria: 'Tags_RFID', nombre: 'Tag Animales', cantidad: 679 },
  { sku: 'WT-TAG02', categoria: 'Tags_RFID', nombre: 'Tag Antimetalico UHF 9CM X 2,5', cantidad: 70 },
  { sku: 'WT-TAP01', categoria: 'Tags_RFID', nombre: 'Tag Antimetalico Papel', cantidad: 7 },
  { sku: 'WT-TBT01', categoria: 'Tags_RFID', nombre: 'Tag Boton', cantidad: 7 },
  { sku: 'WT-THF01', categoria: 'Tags_RFID', nombre: 'Tag HF redondo fibra de carbono', cantidad: 435 },
  { sku: 'WT-TMA19', categoria: 'Tags_RFID', nombre: 'Tag Metálico Inoxidable', cantidad: 18 },
  { sku: 'WT-TNG01', categoria: 'Tags_RFID', nombre: 'Tag Naranja Gas', cantidad: 212 },
  { sku: 'WT-TAM01', categoria: 'Tags_RFID', nombre: 'Tag NFC amarillo', cantidad: 120 },
  { sku: 'WT-TAZ01', categoria: 'Tags_RFID', nombre: 'Tag NFC azul', cantidad: 94 },
  { sku: 'WT-TNR02', categoria: 'Tags_RFID', nombre: 'Tag NFC rojo', cantidad: 87 },
  { sku: 'WT-PAP01', categoria: 'Tags_RFID', nombre: 'Tag Papel UHF', cantidad: 229 },
  { sku: 'WT-TPB01', categoria: 'Tags_RFID', nombre: 'Tag Puntilla HF Blanco Cabeza plana', cantidad: 86 },
  { sku: 'WT-TPH02', categoria: 'Tags_RFID', nombre: 'Tag puntilla HF', cantidad: 263 },
  { sku: 'WT-TFC02', categoria: 'Tags_RFID', nombre: 'Tag redondo fibra de carbono NFC con adhesivo', cantidad: 0 },
  { sku: 'WT-TFC03', categoria: 'Tags_RFID', nombre: 'Tag redondo fibra de carbono NFC sin adhesivo', cantidad: 0 },
  { sku: 'WT-TTR01', categoria: 'Tags_RFID', nombre: 'Tag tornillo UHF', cantidad: 24 },
  { sku: 'WT-TLL01', categoria: 'Tags_RFID', nombre: 'Tag UHF Llanta', cantidad: 5 },
  { sku: 'WT-TTE01', categoria: 'Tags_RFID', nombre: 'Tag UHF Tela', cantidad: 0 },
  { sku: 'WT-TNF01', categoria: 'Tags_RFID', nombre: 'Tag UHF Plug', cantidad: 1 },
  { sku: 'WT-UPF01', categoria: 'Tags_RFID', nombre: 'Papel antimetalico UHF flexible', cantidad: 95 },
  { sku: 'WT-MTA01', categoria: 'Tags_RFID', nombre: 'Mini Tag Antimetalico', cantidad: 17 },
];

function norm(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}
// UHF antes que HF porque "UHF" contiene "HF"
function detectarTipoRfid(nombre: string): string {
  const n = (nombre || '').toLowerCase();
  if (n.includes('uhf')) return 'UHF';
  if (n.includes('nfc')) return 'NFC';
  if (n.includes('hf')) return 'HF';
  return '';
}
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get('token') !== TOKEN) return json({ error: 'token invalido' }, 401);

  const apiKey = Deno.env.get('BASE44_API_KEY') || '';
  if (!apiKey) return json({ error: 'BASE44_API_KEY no configurada' }, 500);
  const hdrs = { 'api_key': apiKey, 'Content-Type': 'application/json' };

  // Productos existentes (idempotencia por SKU o nombre)
  const rP = await fetch(`${BASE_URL}/api/entities/Producto?limit=1000`, { headers: hdrs });
  const existentes: Record<string, string>[] = rP.ok ? await rP.json() : [];
  const porSku = new Map(existentes.filter(p => p.sku).map(p => [String(p.sku).toLowerCase(), p]));
  const porNombre = new Map(existentes.map(p => [norm(p.nombre), p]));

  let creados = 0, movimientos = 0, omitidos = 0, actualizados = 0;
  const errores: string[] = [];

  for (const it of ITEMS) {
    const tipoRfid = detectarTipoRfid(it.nombre);
    const ya = (it.sku && porSku.get(it.sku.toLowerCase())) || porNombre.get(norm(it.nombre));
    if (ya) {
      // Ya existe: rellenar tipo_rfid si le falta (para cuando ya se cargó antes)
      if (tipoRfid && !ya.tipo_rfid) {
        try {
          const { id, created_date, updated_date, created_by, ...resto } = ya;
          await fetch(`${BASE_URL}/api/entities/Producto/${ya.id}`, { method: 'PUT', headers: hdrs, body: JSON.stringify({ ...resto, tipo_rfid: tipoRfid }) });
          actualizados++;
        } catch { /* ignorar */ }
      }
      omitidos++;
      continue;
    }

    try {
      const rNew = await fetch(`${BASE_URL}/api/entities/Producto`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ nombre: it.nombre, sku: it.sku || undefined, categoria: it.categoria, tipo_rfid: tipoRfid || undefined, unidad: 'unidad', activo: true }),
      });
      if (!rNew.ok) { errores.push(`${it.nombre}: create ${rNew.status}`); continue; }
      const prod = await rNew.json();
      creados++;
      porNombre.set(norm(it.nombre), prod);
      if (it.sku) porSku.set(it.sku.toLowerCase(), prod);

      if (it.cantidad > 0) {
        const rMov = await fetch(`${BASE_URL}/api/entities/MovimientoInventario`, {
          method: 'POST', headers: hdrs,
          body: JSON.stringify({ producto_id: prod.id, tipo: 'entrada', cantidad: it.cantidad, motivo: 'Carga inicial inventario bodega' }),
        });
        if (rMov.ok) movimientos++;
      }
    } catch (e) {
      errores.push(`${it.nombre}: ${String(e).slice(0, 120)}`);
    }
  }

  return json({ creados, movimientos, omitidos, actualizados, total: ITEMS.length, errores });
});