import { useAuth } from '@/lib/AuthContext';

// SEG-07: el rol sale de Base44 (user.role = 'admin' | 'user'), que solo un admin puede
// cambiar desde el panel de Base44 → Usuarios de la app.
// Antes salía de un correo fijo en el código o de PerfilUsuario.rol, una entidad que
// cualquier usuario podía editar para darse rol Admin a sí mismo.
export function useUserRole() {
  const { user, isLoadingAuth } = useAuth();
  const isAdmin = user?.role === 'admin';
  const rol = isAdmin ? 'Admin' : 'Comercial';

  return {
    rol,
    email: user?.email,
    isAdmin,
    isComercial: !isAdmin,
    isLoading: isLoadingAuth,
  };
}
