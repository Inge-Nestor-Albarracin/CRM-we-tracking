import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

/**
 * Mapa correo -> nombre para mostrar QUIÉN hizo cada cosa en el feed.
 * Combina PerfilUsuario (nombre configurado) y User (full_name de Base44).
 * Se cachea 5 min y comparte cache con otras pantallas por las mismas queryKeys.
 */
export function useUsuariosMap() {
  const { data: perfiles = [] } = useQuery({
    queryKey: ['perfiles-usuario'],
    queryFn: () => base44.entities.PerfilUsuario.list(),
    staleTime: 5 * 60 * 1000,
  });
  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
    staleTime: 5 * 60 * 1000,
  });
  return useMemo(() => {
    const map = {};
    for (const u of users) if (u.email) map[String(u.email).toLowerCase()] = u.full_name || u.email;
    for (const p of perfiles) if (p.email && p.nombre) map[String(p.email).toLowerCase()] = p.nombre; // el perfil manda
    return map;
  }, [perfiles, users]);
}
