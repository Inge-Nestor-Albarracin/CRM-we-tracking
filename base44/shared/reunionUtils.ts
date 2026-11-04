// Utilidades compartidas por las funciones de sync de notas de reuniones
// (Drive, Gmail, Teams, OneDrive).

export function jsonRes(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

// Reuniones que NUNCA se importan ni se procesan (Comité Comercial, LINK trabajo remoto, Gastii, AAXA).
// OJO: "Comité W.T." (WeTracking) SÍ se conserva.
export function tituloExcluido(titulo: string): boolean {
  const t = (titulo || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return /comite\s*comercial/.test(t) || /trabajo\s*remoto/.test(t) || /gasti+/.test(t) || t.includes('aaxa');
}

// Normaliza un t\u00edtulo de reuni\u00f3n para comparar si dos notas son la MISMA reuni\u00f3n.
// Quita lo que var\u00eda entre fuentes del MISMO evento: prefijo/sufijo "Notas de Gemini",
// fecha (2026/07/06, 6 jul 2026), hora (09:59), zona (GMT-05:00), a\u00f1os sueltos, tildes y
// puntuaci\u00f3n. As\u00ed "Reunion de Empalme - Wetracking 6 jul 2026" y "Reunion de Empalme -
// Wetracking - 2026/07/06 09:59 GMT-05:00 - Notas de Gemini" quedan iguales.
export function normalizarTitulo(titulo: string): string {
  return (titulo || '')
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/notas?\s+de\s+gemini/g, ' ')
    .replace(/^\s*notas?\s*:?\s*/i, '')
    .replace(/gmt\s*[+-]?\s*\d{1,2}:?\d{2}/g, ' ')
    .replace(/\d{4}[/.-]\d{1,2}[/.-]\d{1,2}/g, ' ')
    .replace(/\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/g, ' ')
    .replace(/\d{1,2}:\d{2}(:\d{2})?/g, ' ')
    .replace(/\d{1,2}\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[a-z]*\.?\s+\d{2,4}/g, ' ')
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// Clave de identidad de una reuni\u00f3n: fecha (YYYY-MM-DD) + t\u00edtulo normalizado.
// Sirve para deduplicar la MISMA reuni\u00f3n que lleg\u00f3 por varias cuentas/fuentes
// (los comit\u00e9s con varios del equipo generan una nota por participante).
export function claveReunion(titulo: string, fecha: string): string {
  return `${String(fecha || '').slice(0, 10)}|${normalizarTitulo(titulo)}`;
}