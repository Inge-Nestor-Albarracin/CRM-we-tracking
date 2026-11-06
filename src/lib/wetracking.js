// Datos de la empresa para membretes de cotizaciones y documentos.
// TODO: reemplazar con los datos reales de WeTracking (NIT, dirección, teléfono).
export const WETRACKING = {
  nombre: 'WeTracking SAS',
  nit: 'NIT 900.000.000-0',
  direccion: 'Bogotá, Colombia',
  telefono: '+57 310 000 0000',
  email: 'ms@grouptso.com',
  web: 'wetracking.co',
  tagline: 'The future of logistics, streamlined with AI',
  logo: 'https://media.base44.com/images/public/6a43f4eff47c0d92cfe2b575/e332deb61_Logo-WeTr-RGB_V-Original-color2.png',
  // Remitente que firma las cotizaciones
  remitente_nombre: 'Massimiliano Schonlau',
  remitente_cargo: 'Comercial',
  remitente_email: 'ms@grouptso.com',
  // URL de la imagen de la firma (PNG con fondo transparente). Pegar aquí la firma escaneada.
  firma_url: '',
};

// Comerciales de WeTracking (equipo interno) — opciones del campo "Comercial asignado".
export const COMERCIALES = ['David Pernett', 'Karen Rojas', 'Thomas Schonlau', 'Massimiliano Schonlau', 'Gisell Reyes'];

// Dominio público canónico de la app. Se usa para links compartibles/imprimibles
// (cotizaciones, actas) para que NO salgan con el dominio preview/base44 según dónde
// esté parado el usuario.
export const APP_URL = 'https://crm.wetracking.co';

// Proxy de archivos: hace que la URL visible sea del dominio propio (crm.wetracking.co)
// en vez de media.base44.com. Solo envuelve archivos SUBIDOS a nuestro storage;
// los links externos (Canva, Drive, YouTube, etc.) se devuelven tal cual.
const PROXY_ARCHIVO = 'https://crm.wetracking.co/api/apps/6a43f4eff47c0d92cfe2b575/functions/archivo';
// ¿Es un archivo de nuestro storage de Base44? (media.base44.com o base44.app/api/apps/.../files)
// Los links externos (Canva, Drive, YouTube, etc.) NO se tocan.
function esArchivoBase44(parsed) {
  const host = parsed.hostname;
  if (host === 'media.base44.com') return true;
  if (/(^|\.)base44\.app$/.test(host) && /\/(files|images)\//.test(parsed.pathname)) return true;
  if (host === 'app.base44.com' && /\/(files|images)\//.test(parsed.pathname)) return true;
  return false;
}
export function urlArchivo(url, { descargar = false, nombre } = {}) {
  if (!url || typeof url !== 'string') return url;
  let parsed;
  try { parsed = new URL(url); } catch { return url; }
  if (!esArchivoBase44(parsed)) return url; // links externos (Canva/Drive/YouTube) sin cambio
  // Solo pasamos la RUTA (sin el host) para que "base44" no aparezca en la URL visible.
  const params = new URLSearchParams({ p: parsed.pathname });
  if (descargar) params.set('dl', '1');
  if (nombre) params.set('n', nombre);
  return `${PROXY_ARCHIVO}?${params.toString()}`;
}

export function formatMoneda(n, moneda = 'COP') {
  if (n == null) return '—';
  if (moneda === 'USD') return `USD ${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${Math.round(Number(n)).toLocaleString('es-CO')}`;
}

// Cálculo de totales de una cotización a partir de sus ítems.
// total_linea = cantidad × precio × (1 − dcto%); iva sobre la base con descuento.
export function calcularTotales(items, ivaPct = 19) {
  let subtotal = 0;
  let descuentoTotal = 0;
  const itemsCalculados = (items || []).map(it => {
    const cantidad = Number(it.cantidad) || 0;
    const precio = Number(it.precio_unitario) || 0;
    const dcto = Number(it.descuento_pct) || 0;
    const bruto = cantidad * precio;
    const totalLinea = bruto * (1 - dcto / 100);
    subtotal += bruto;
    descuentoTotal += bruto - totalLinea;
    return { ...it, cantidad, precio_unitario: precio, descuento_pct: dcto, total_linea: Math.round(totalLinea) };
  });
  const base = subtotal - descuentoTotal;
  const ivaValor = Math.round(base * (Number(ivaPct) || 0) / 100);
  return {
    items: itemsCalculados,
    subtotal: Math.round(subtotal),
    descuento_total: Math.round(descuentoTotal),
    iva_valor: ivaValor,
    total: Math.round(base + ivaValor),
  };
}

// Resumen para MOSTRAR una cotización ya guardada (PDF y correo), calculado desde sus ítems.
// No se usan subtotal/descuento_total guardados porque no son uniformes: el formulario guarda
// subtotal = bruto (antes del descuento), pero las cotizaciones creadas por NOVA guardan
// subtotal = neto y descuento_total = 0 aunque los ítems traigan descuento_pct.
// El total y el IVA sí se toman de lo guardado: es lo que se le cotizó al cliente.
export function resumenCotizacion(cot) {
  const lineas = (cot?.items || []).map(it => {
    const cantidad = Number(it.cantidad) || 0;
    const precio = Number(it.precio_unitario) || 0;
    const dcto = Number(it.descuento_pct) || 0;
    const bruto = cantidad * precio;
    const neto = it.total_linea != null && it.total_linea !== '' ? Number(it.total_linea) : bruto * (1 - dcto / 100);
    return { ...it, cantidad, precio_unitario: precio, descuento_pct: dcto, bruto, neto, ahorro: Math.max(0, bruto - neto) };
  });
  const bruto = lineas.reduce((s, l) => s + l.bruto, 0);
  const neto = lineas.reduce((s, l) => s + l.neto, 0);
  const descuento = Math.round(Math.max(0, bruto - neto));
  const iva = Number(cot?.iva_valor) || 0;
  const envio = Number(cot?.costo_envio) || 0;
  const total = cot?.total != null ? Number(cot.total) : Math.round(neto) + iva + envio;
  return {
    lineas,
    hayDescuento: descuento > 0,
    bruto: Math.round(bruto),
    descuento,
    descuentoPct: bruto > 0 ? (descuento / bruto) * 100 : 0,
    base: Math.round(neto),
    ivaPct: Number(cot?.iva_pct) || 0,
    iva,
    envio,
    total,
  };
}

// Textos de las secciones 2, 3 y 4 de la cotización impresa (VALIDEZ DE LA OFERTA,
// CONTRATO y METODOLOGÍA DE TRABAJO). Son solo un PUNTO DE PARTIDA: cada cotización guarda
// su propio texto (texto_validez, texto_contrato, texto_metodologia) y el usuario lo edita o
// lo borra por completo en el formulario, igual que la descripción del software. Una sección
// vacía no se imprime. Cada salto de línea es un párrafo aparte en el PDF.
//
// Antes estos textos estaban quemados en CotizacionPrint.jsx y no se podían cambiar por
// cotización. Las cotizaciones viejas (sin textos_propios) siguen imprimiendo estos mismos
// predeterminados, así que no cambian.
// Títulos de las tres secciones. También son editables por cotización (titulo_validez,
// titulo_contrato, titulo_metodologia); vacío o ausente = este predeterminado. El número
// ("2.", "3.", "4.") no forma parte del título: lo pone la impresión, de corrido, para que
// una sección vacía no deje un hueco en la numeración.
export const TITULOS_SECCIONES = {
  validez: 'VALIDEZ DE LA OFERTA.',
  contrato: 'CONTRATO.',
  metodologia: 'METODOLOGÍA DE TRABAJO.',
};

export function textosPorDefecto({ tipo, sw_periodicidad, validez_dias } = {}) {
  const dias = Number(validez_dias) > 0 ? Math.round(Number(validez_dias)) : 15;
  const diasTxt = dias === 15 ? 'quince (15)' : String(dias);
  const esSoftware = tipo === 'software';
  const anual = esSoftware && sw_periodicidad === 'anual';
  const validez = esSoftware
    ? (anual
      ? `La presente cotización tiene una vigencia de ${dias} días hábiles a partir de la fecha de emisión. El servicio se ofrece bajo la modalidad de pago anual.`
      : `La presente cotización tiene una vigencia de ${dias} días hábiles a partir de la fecha de emisión. El servicio se ofrece bajo la modalidad de FEE mensual, con pago los primeros 5 días de cada mes del valor indicado.`)
    : `La presente cotización tendrá una vigencia de ${diasTxt} días hábiles contados a partir de la fecha de su emisión. El pago deberá realizarse en una única cuota con vencimiento a treinta (30) días calendario contados desde la fecha de facturación.`;
  const contrato = esSoftware
    ? ['Contrato mínimo a 2 años.', 'Se envía previo al pago efectivo.'].join('\n')
    : '';
  const metodologia = esSoftware
    ? [
      'Visita presencial al inicio del proyecto con el fin de realizar la instalación de los chips. A partir de allí, el soporte será mensual de manera remota.',
      'La propuesta contempla un paquete de 8 horas mensuales de acompañamiento y soporte, las cuales deberán consumirse dentro del mismo mes. En caso de superar este tiempo, las horas adicionales se facturarán con un valor de 35 USD por hora.',
    ].join('\n')
    : '';
  return { validez, contrato, metodologia };
}

// Los textos que imprime UNA cotización concreta. Con textos_propios manda lo guardado,
// aunque esté vacío. Sin textos_propios es una cotización de antes del cambio: imprime el
// predeterminado de siempre, incluida la excepción de las dos cotizaciones con pago anual que
// se hicieron antes de que existiera sw_periodicidad. El formulario usa esto mismo al abrir
// una cotización vieja, para que se edite a partir de lo que hoy imprime.
export function textosDeCotizacion(cot) {
  if (cot?.textos_propios) {
    return { validez: cot.texto_validez || '', contrato: cot.texto_contrato || '', metodologia: cot.texto_metodologia || '' };
  }
  const anualPorNumero = ['COT-2026-016', 'COT-2026-015'].includes(cot?.numero);
  return textosPorDefecto({ tipo: cot?.tipo, sw_periodicidad: anualPorNumero ? 'anual' : cot?.sw_periodicidad, validez_dias: 15 });
}

// Los títulos que imprime una cotización concreta: el guardado si lo hay, si no el predeterminado.
export function titulosDeCotizacion(cot) {
  return {
    validez: (cot?.titulo_validez || '').trim() || TITULOS_SECCIONES.validez,
    contrato: (cot?.titulo_contrato || '').trim() || TITULOS_SECCIONES.contrato,
    metodologia: (cot?.titulo_metodologia || '').trim() || TITULOS_SECCIONES.metodologia,
  };
}

// Estado efectivo: Enviada + vencida → Vencida (computado en render, sin job)
export function estadoEfectivo(cotizacion) {
  if (cotizacion.estado === 'Enviada' && cotizacion.fecha_vencimiento) {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    if (new Date(cotizacion.fecha_vencimiento + 'T00:00:00') < hoy) return 'Vencida';
  }
  return cotizacion.estado;
}
