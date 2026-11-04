import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

// Valores por defecto (si el usuario no ha personalizado la lista todavía)
export const OPCIONES_DEFAULT = {
  sectores: ['Academia', 'Bodegas', 'Industria Petrolera', 'Manufactura', 'Clubes', 'Locativos', 'Otro'],
  tipos_necesidad: ['Activos', 'Inventarios', 'Locativos'],
  canales: ['WhatsApp', 'Manual', 'Referido', 'Web', 'Evento', 'Importacion'],
  origenes: ['WhatsApp', 'Referido', 'Web', 'Evento', 'Frio', 'Otro'],
  comerciales: ['David Pernett', 'Karen Rojas', 'Thomas Schonlau', 'Massimiliano Schonlau', 'Gisell Reyes'],
  estados_empresa: ['Prospecto', 'Cliente_Activo', 'Cliente_Inactivo'],
  ciudades: ['Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Cartagena', 'Bucaramanga', 'Cúcuta', 'Pereira', 'Yumbo'],
  paises: ['Colombia', 'México', 'Ecuador', 'Perú', 'Panamá', 'Estados Unidos'],
};

// Listas editables desde Configuración (las que no rompen lógica al ampliarse)
export const LISTAS_META = [
  { clave: 'sectores', label: 'Sectores', descripcion: 'Industria/sector de empresas y contactos' },
  { clave: 'estados_empresa', label: 'Estados de empresa', descripcion: 'Estado de la cuenta (prospecto, cliente activo/inactivo)' },
  { clave: 'tipos_necesidad', label: 'Tipos de necesidad', descripcion: 'Qué tipo de solución busca el cliente' },
  { clave: 'comerciales', label: 'Comerciales', descripcion: 'Equipo comercial (propietario y comercial asignado)' },
  { clave: 'ciudades', label: 'Ciudades', descripcion: 'Ciudades de empresas y contactos' },
  { clave: 'paises', label: 'Países', descripcion: 'Países de las empresas' },
  { clave: 'canales', label: 'Canales de adquisición', descripcion: 'Por dónde llegó el contacto' },
  { clave: 'origenes', label: 'Orígenes de oportunidad', descripcion: 'De dónde salió el negocio' },
];

/** Carga todos los registros de ListaOpciones (cacheado). */
export function useListasOpciones() {
  return useQuery({
    queryKey: ['listas-opciones'],
    queryFn: () => base44.entities.ListaOpciones.list(),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Devuelve los valores de una lista por su clave, cayendo a los defaults
 * si no hay registro personalizado. Ej: const sectores = useOpciones('sectores')
 */
export function useOpciones(clave) {
  const { data = [] } = useListasOpciones();
  const registro = data.find(r => r.clave === clave);
  const valores = registro?.valores?.filter(Boolean);
  return (valores && valores.length ? valores : OPCIONES_DEFAULT[clave]) || [];
}
