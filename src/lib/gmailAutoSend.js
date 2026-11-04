import { base44 } from '@/api/base44Client';
import { APP_URL, formatMoneda } from '@/lib/wetracking';

const inv = async (fn, args) => { const r = await base44.functions.invoke(fn, args); return r?.data ?? r; };

// Envía automáticamente una cotización recién creada por Gmail a la cuenta de la
// empresa o del contacto vinculado. Devuelve { ok, to?, error? }.
export async function enviarCotizacionGmail(cot) {
  if (!cot?.id) return { ok: false, error: 'cotizacion invalida' };
  let contacto = null;
  let empresa = null;
  if (cot.contacto_id) {
    try { contacto = await base44.entities.Contacto.get(cot.contacto_id); } catch { /* */ }
  }
  if (cot.empresa_id) {
    try { empresa = await base44.entities.Empresa.get(cot.empresa_id); } catch { /* */ }
  }
  const to = String(contacto?.email || empresa?.email || '').trim();
  if (!to) return { ok: false, error: 'sin-email' };

  const nombre = (contacto?.nombre || empresa?.nombre || '').trim();
  const saludo = nombre ? `Hola ${nombre.split(' ')[0]},` : 'Hola,';
  const tt = cot.tipo === 'software' ? 'Software' : 'Hardware';
  const link = `${APP_URL}/comercial/cotizaciones/${cot.id}/print`;
  const asunto = `Cotización ${tt} ${cot.numero || ''} — WeTracking`.replace('  ', ' ').trim();
  const cuerpo = [
    saludo,
    '',
    `Adjunto su cotización ${tt} ${cot.numero || ''} por un total de ${formatMoneda(cot.total, cot.moneda)}.`,
    '',
    'Puede ver la cotización completa en el siguiente enlace:',
    link,
    '',
    `Validez de la oferta: ${cot.validez_dias || 15} días.`,
    '',
    'Quedamos atentos a cualquier comentario o ajuste.',
    '',
    'Cordialmente,',
    'WeTracking',
  ].join('\n');

  const r = await inv('gmailEnviar', { to, asunto, cuerpo });
  return { ok: !!r?.ok, to, error: r?.error || '' };
}

// Envía un correo de bienvenida a una empresa recién creada (si tiene email).
export async function enviarBienvenidaEmpresa(empresa) {
  const to = String(empresa?.email || '').trim();
  if (!to) return { ok: false, error: 'sin-email' };
  const nombre = (empresa?.nombre || '').trim();
  const saludo = nombre ? `Hola,` : 'Hola,';
  const asunto = 'Bienvenido a WeTracking';
  const cuerpo = [
    saludo,
    '',
    `Gracias por su interés en WeTracking${nombre ? `, ${nombre}` : ''}. Somos una empresa colombiana especializada en tecnología RFID para trazabilidad y gestión de activos e inventarios.`,
    '',
    'Nuestro equipo se pondrá en contacto con usted para entender sus necesidades y ayudarle a encontrar la mejor solución.',
    '',
    'Quedamos atentos a sus comentarios.',
    '',
    'Cordialmente,',
    'WeTracking',
  ].join('\n');

  const r = await inv('gmailEnviar', { to, asunto, cuerpo });
  return { ok: !!r?.ok, to, error: r?.error || '' };
}