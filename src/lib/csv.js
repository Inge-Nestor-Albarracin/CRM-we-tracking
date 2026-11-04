// Exportación e importación CSV compatible con Excel en español y HubSpot.
// Export: BOM UTF-8 + separador ;  ·  Import: autodetecta , o ; y comillas.

function escaparCelda(valor) {
  if (valor == null) return '';
  const s = String(valor);
  if (/[";\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Descarga un CSV.
 * @param {string} nombreArchivo - sin extensión (ej: "contactos-wetracking")
 * @param {string[]} columnas - encabezados en orden
 * @param {Array<Object>} filas - objetos con claves = columnas
 */
export function exportarCSV(nombreArchivo, columnas, filas) {
  const lineas = [
    columnas.map(escaparCelda).join(';'),
    ...filas.map(f => columnas.map(c => escaparCelda(f[c])).join(';')),
  ];
  // BOM para que Excel detecte UTF-8 (tildes/ñ correctas)
  const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nombreArchivo}-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Parsea un CSV con soporte de comillas, saltos de línea dentro de celdas
 * y autodetección de separador (, o ;). Devuelve { encabezados, filas }
 * donde filas es un array de objetos { encabezado: valor }.
 */
export function parsearCSV(texto) {
  // Quitar BOM
  if (texto.charCodeAt(0) === 0xFEFF) texto = texto.slice(1);

  // Autodetectar separador con la primera línea (fuera de comillas)
  const primeraLinea = texto.split(/\r?\n/)[0] || '';
  let comas = 0, puntoycomas = 0, enComillas = false;
  for (const ch of primeraLinea) {
    if (ch === '"') enComillas = !enComillas;
    else if (!enComillas && ch === ',') comas++;
    else if (!enComillas && ch === ';') puntoycomas++;
  }
  const sep = puntoycomas > comas ? ';' : ',';

  // Tokenizar respetando comillas
  const registros = [];
  let fila = [];
  let celda = '';
  let dentro = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (dentro) {
      if (ch === '"') {
        if (texto[i + 1] === '"') { celda += '"'; i++; }
        else dentro = false;
      } else {
        celda += ch;
      }
    } else if (ch === '"') {
      dentro = true;
    } else if (ch === sep) {
      fila.push(celda); celda = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      fila.push(celda); celda = '';
      if (fila.some(c => c.trim() !== '')) registros.push(fila);
      fila = [];
    } else {
      celda += ch;
    }
  }
  fila.push(celda);
  if (fila.some(c => c.trim() !== '')) registros.push(fila);

  if (registros.length === 0) return { encabezados: [], filas: [] };

  const encabezados = registros[0].map(h => h.trim());
  const filas = registros.slice(1).map(r => {
    const obj = {};
    encabezados.forEach((h, idx) => { obj[h] = (r[idx] ?? '').trim(); });
    return obj;
  });
  return { encabezados, filas };
}

/** Normaliza para comparar: minúsculas, sin tildes, sin espacios repetidos */
export function normalizarTexto(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
