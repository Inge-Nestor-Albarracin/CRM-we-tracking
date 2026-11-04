import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

// Equipo interno por defecto (se usa mientras no se hayan cargado miembros en
// Configuración → Equipo). En cuanto haya al menos un miembro guardado, esa lista
// manda: NO se mezcla con estos defaults.
export const EQUIPO_DEFAULT = [
  { nombre: 'David Pernett', email: 'ingenierodesarrollo@wetracking.co', cargo: 'Ingeniería de Desarrollo' },
  { nombre: 'Karen Rojas', email: 'karen@grouptso.com', cargo: 'Comercial' },
  { nombre: 'Thomas Schonlau', email: 'ts@grouptso.com', cargo: 'Dirección' },
  { nombre: 'Massimiliano Schonlau', email: 'ms@grouptso.com', cargo: 'Comercial' },
  { nombre: 'Gisell Reyes', email: 'direccioncomercial@grouptso.com', cargo: 'Dirección Comercial' },
];

/** Carga cruda de MiembroEquipo (cacheada). */
export function useMiembrosEquipo() {
  return useQuery({
    queryKey: ['miembros-equipo'],
    queryFn: () => base44.entities.MiembroEquipo.list('orden'),
    staleTime: 5 * 60 * 1000,
  });
}

/** Lista EFECTIVA del equipo activo: los guardados o, si no hay ninguno, los default.
 *  Memoizado para dar una referencia estable (evita recomputar filtros en cada render). */
export function useEquipo() {
  const { data = [], isLoading } = useMiembrosEquipo();
  return useMemo(() => {
    const activos = data.filter(m => m.activo !== false);
    return { equipo: activos.length ? activos : EQUIPO_DEFAULT, isLoading, personalizado: activos.length > 0 };
  }, [data, isLoading]);
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Fabrica una función esTareaEquipo(t) con el mismo criterio de siempre pero
 * usando la lista de miembros dada (nombres + correos). Preserva el comportamiento:
 * asignado_a/responsable del equipo → equipo; ambito explícito manda; sin datos → equipo.
 */
export function crearEsTareaEquipo(equipo) {
  const nombres = equipo.map(m => norm(m.nombre)).filter(Boolean);
  const emails = equipo.map(m => String(m.email || '').toLowerCase()).filter(Boolean);
  const nombreEsEquipo = (nombre) => {
    const n = norm(nombre);
    if (!n) return false;
    return nombres.some((tn) => {
      const [nom, ape] = tn.split(' ');
      if (n === tn || n.includes(tn)) return true;
      return !!ape && n.includes(nom) && n.includes(ape);
    });
  };
  return (t) => {
    const email = String(t?.asignado_a || '').toLowerCase();
    if (email && emails.includes(email)) return true;
    if (nombreEsEquipo(t?.responsable) || nombreEsEquipo(t?.asignado_a)) return true;
    if (t?.ambito === 'equipo') return true;
    if (t?.ambito === 'cliente') return false;
    return true; // sin datos claros → equipo por defecto (comportamiento actual)
  };
}
