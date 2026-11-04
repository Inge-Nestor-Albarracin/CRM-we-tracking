// Detecta la tecnología RFID a partir del nombre del producto.
// UHF se comprueba antes que HF porque "UHF" contiene "HF".
export function detectarTipoRfid(nombre) {
  const n = (nombre || '').toLowerCase();
  if (/\buhf\b|uhf/.test(n)) return 'UHF';
  if (/\bnfc\b|nfc/.test(n)) return 'NFC';
  if (/\bhf\b|hf/.test(n)) return 'HF';
  return '';
}
