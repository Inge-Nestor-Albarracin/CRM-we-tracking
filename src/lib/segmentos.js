// Motor de segmentación (estilo listas de HubSpot).
// Un segmento tiene un TIPO ('contacto' | 'empresa'), una lista de criterios
// { campo, operador, valor } y una lógica AND/OR.
// Los destinatarios de una campaña siempre son CONTACTOS con email:
//  - segmento de contacto → los contactos que cumplen.
//  - segmento de empresa  → los contactos de las empresas que cumplen.

export const CAMPOS_CONTACTO = [
  { key: 'etapa_pipeline', label: 'Etapa del lead', tipo: 'select', opciones: ['Lead', 'Calificado', 'Propuesta', 'Cierre', 'Cliente', 'Descalificado'] },
  { key: 'sector', label: 'Sector', tipo: 'select', listaClave: 'sectores' },
  { key: 'tipo_necesidad', label: 'Tipo de necesidad', tipo: 'select', listaClave: 'tipos_necesidad' },
  { key: 'temperatura', label: 'Temperatura', tipo: 'select', opciones: ['Frio', 'Tibio', 'Caliente', 'Urgente'] },
  { key: 'ciudad', label: 'Ciudad', tipo: 'text' },
  { key: 'empresa', label: 'Empresa (texto)', tipo: 'text' },
  { key: 'cargo', label: 'Cargo', tipo: 'text' },
  { key: 'canal_adquisicion', label: 'Canal de adquisición', tipo: 'text' },
  { key: 'broker_asignado', label: 'Ejecutivo asignado', tipo: 'text' },
  { key: 'presupuesto', label: 'Presupuesto', tipo: 'number' },
  { key: 'score_lead', label: 'Score del lead', tipo: 'number' },
  { key: 'fecha_primer_contacto', label: 'Fecha de primer contacto', tipo: 'date' },
  { key: 'ultima_actividad', label: 'Última actividad', tipo: 'date' },
];

export const CAMPOS_EMPRESA = [
  { key: 'sector', label: 'Sector', tipo: 'select', listaClave: 'sectores' },
  { key: 'estado', label: 'Estado', tipo: 'select', opciones: ['Prospecto', 'Cliente_Activo', 'Cliente_Inactivo'] },
  { key: 'ciudad', label: 'Ciudad', tipo: 'text' },
  { key: 'pais', label: 'País', tipo: 'text' },
  { key: 'dominio_web', label: 'Dominio web', tipo: 'text' },
  { key: 'propietario', label: 'Propietario', tipo: 'text' },
  { key: 'nombre', label: 'Nombre de la empresa', tipo: 'text' },
  { key: 'fecha_creacion', label: 'Fecha de creación', tipo: 'date' },
  { key: 'ultima_actividad', label: 'Última actividad', tipo: 'date' },
];

export function camposDe(tipo) {
  return tipo === 'empresa' ? CAMPOS_EMPRESA : CAMPOS_CONTACTO;
}

export const OPERADORES = {
  text: [
    { v: 'es', l: 'es' }, { v: 'no_es', l: 'no es' }, { v: 'contiene', l: 'contiene' },
    { v: 'vacio', l: 'está vacío' }, { v: 'no_vacio', l: 'tiene algún valor' },
  ],
  select: [
    { v: 'es', l: 'es' }, { v: 'no_es', l: 'no es' },
    { v: 'vacio', l: 'está vacío' }, { v: 'no_vacio', l: 'tiene algún valor' },
  ],
  number: [
    { v: 'es', l: 'igual a' }, { v: 'mayor', l: 'mayor que' }, { v: 'menor', l: 'menor que' },
    { v: 'mayor_igual', l: 'mayor o igual' }, { v: 'menor_igual', l: 'menor o igual' },
  ],
  date: [
    { v: 'despues', l: 'después de' }, { v: 'antes', l: 'antes de' },
  ],
};

export const OPERADORES_SIN_VALOR = ['vacio', 'no_vacio'];

export function campoMeta(tipo, key) {
  return camposDe(tipo).find(c => c.key === key);
}

export function operadoresDe(tipo, campoKey) {
  const meta = campoMeta(tipo, campoKey);
  return OPERADORES[meta?.tipo || 'text'] || OPERADORES.text;
}

function norm(s) {
  return String(s ?? '').toLowerCase().trim();
}

export function evaluarCriterio(registro, criterio) {
  const { campo, operador, valor } = criterio || {};
  if (!campo || !operador) return true;
  const cv = registro[campo];
  switch (operador) {
    case 'es': return norm(cv) === norm(valor);
    case 'no_es': return norm(cv) !== norm(valor);
    case 'contiene': return norm(cv).includes(norm(valor));
    case 'vacio': return cv == null || String(cv).trim() === '';
    case 'no_vacio': return cv != null && String(cv).trim() !== '';
    case 'mayor': return Number(cv) > Number(valor);
    case 'menor': return Number(cv) < Number(valor);
    case 'mayor_igual': return Number(cv) >= Number(valor);
    case 'menor_igual': return Number(cv) <= Number(valor);
    case 'despues': return !!cv && new Date(cv) > new Date(valor);
    case 'antes': return !!cv && new Date(cv) < new Date(valor);
    default: return true;
  }
}

export function evaluarRegistro(registro, filtros = [], logica = 'AND') {
  const activos = (filtros || []).filter(f => f.campo && f.operador);
  if (activos.length === 0) return true;
  const res = activos.map(f => evaluarCriterio(registro, f));
  return logica === 'OR' ? res.some(Boolean) : res.every(Boolean);
}

export function filtrarRegistros(registros, filtros, logica) {
  return (registros || []).filter(r => evaluarRegistro(r, filtros, logica));
}

/**
 * Destinatarios (contactos con email) de un segmento.
 * @param segmento { tipo, filtros, logica } | null (null = todos con email)
 */
export function destinatariosDeSegmento(segmento, contactos = [], empresas = []) {
  const conEmail = contactos.filter(c => c.email);
  if (!segmento) return conEmail;
  if (segmento.tipo === 'empresa') {
    const empresasMatch = filtrarRegistros(empresas, segmento.filtros || [], segmento.logica || 'AND');
    const ids = new Set(empresasMatch.map(e => e.id));
    return conEmail.filter(c => c.empresa_id && ids.has(c.empresa_id));
  }
  return filtrarRegistros(conEmail, segmento.filtros || [], segmento.logica || 'AND');
}

export function describirCriterio(tipo, criterio) {
  const meta = campoMeta(tipo, criterio.campo);
  const op = (OPERADORES[meta?.tipo || 'text'] || []).find(o => o.v === criterio.operador);
  const label = meta?.label || criterio.campo;
  if (OPERADORES_SIN_VALOR.includes(criterio.operador)) return `${label} ${op?.l || criterio.operador}`;
  return `${label} ${op?.l || criterio.operador} "${criterio.valor}"`;
}
