import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ShieldCheck } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import MyProfile from '@/components/perfiles/MyProfile';
import TeamList from '@/components/perfiles/TeamList';
import IntegracionesTab from '@/components/config/IntegracionesTab';
import ListasTab from '@/components/config/ListasTab';
import MiembrosEquipoTab from '@/components/config/MiembrosEquipoTab';
import { useUserRole } from '@/hooks/useUserRole';

export default function Configuracion() {
  const [currentUser, setCurrentUser] = useState(null);
  const queryClientHook = useQueryClient();
  const { isAdmin } = useUserRole();

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
    enabled: isAdmin,
  });

  if (isAdmin && loadingUsers) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight text-foreground">Configuración</h1>
        <p className="text-[15px] text-muted-foreground mt-0.5">Perfil, equipo e integraciones</p>
      </div>

      <Tabs defaultValue={isAdmin ? "perfiles" : "integraciones"} className="w-full">
        <TabsList className="flex gap-1 bg-muted/40 rounded-xl p-1 h-auto">
          {isAdmin && <TabsTrigger value="perfiles" className="px-3.5 py-2 rounded-lg text-sm font-medium">Perfiles</TabsTrigger>}
          {isAdmin && <TabsTrigger value="equipo" className="px-3.5 py-2 rounded-lg text-sm font-medium">Equipo</TabsTrigger>}
          {isAdmin && <TabsTrigger value="listas" className="px-3.5 py-2 rounded-lg text-sm font-medium">Listas</TabsTrigger>}
          <TabsTrigger value="integraciones" className="px-3.5 py-2 rounded-lg text-sm font-medium">Integraciones</TabsTrigger>
        </TabsList>

        {isAdmin && (
        <TabsContent value="perfiles" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <MyProfile user={currentUser} />
            <TeamList users={users} currentUserId={currentUser?.id} />
          </div>
          <RolesPanel users={users} queryClient={queryClientHook} />
        </TabsContent>
        )}

        {isAdmin && (
        <TabsContent value="equipo" className="mt-4">
          <MiembrosEquipoTab />
        </TabsContent>
        )}

        {isAdmin && (
        <TabsContent value="listas" className="mt-4">
          <ListasTab />
        </TabsContent>
        )}

        <TabsContent value="integraciones" className="mt-4">
          <IntegracionesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const ADMIN_EMAIL = 'ms@grouptso.com';

function RolesPanel({ users, queryClient }) {
  const { data: perfiles = [], refetch } = useQuery({
    queryKey: ['perfiles-usuario'],
    queryFn: () => base44.entities.PerfilUsuario.list(),
  });

  const [saving, setSaving] = useState(null);

  const getPerfilRol = (email) => {
    if (email === ADMIN_EMAIL) return 'Admin';
    return perfiles.find(p => p.email === email)?.rol ?? 'Comercial';
  };

  const handleChangeRol = async (user, nuevoRol) => {
    if (user.email === ADMIN_EMAIL) return;
    setSaving(user.email);
    const existing = perfiles.find(p => p.email === user.email);
    if (existing) {
      await base44.entities.PerfilUsuario.update(existing.id, { rol: nuevoRol });
    } else {
      await base44.entities.PerfilUsuario.create({ email: user.email, nombre: user.full_name, rol: nuevoRol });
    }
    await refetch();
    queryClient.invalidateQueries({ queryKey: ['perfiles-usuario'] });
    setSaving(null);
  };

  return (
    <div className="bg-card rounded-xl border border-border/60 overflow-hidden">
      <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Roles y accesos</h2>
        <span className="text-xs text-muted-foreground ml-1">Solo visible para Admin</span>
      </div>
      <div className="divide-y divide-border/20">
        {users.map(user => {
          const rol = getPerfilRol(user.email);
          const isOwner = user.email === ADMIN_EMAIL;
          return (
            <div key={user.id} className="flex items-center gap-4 px-5 py-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-primary">
                  {(user.full_name || user.email || '?').slice(0, 2).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{user.full_name || user.email}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
              {isOwner ? (
                <span className="flex items-center gap-1 text-xs font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-full flex-shrink-0">
                  <ShieldCheck className="w-3 h-3" /> Admin
                </span>
              ) : (
                <select
                  value={rol}
                  disabled={saving === user.email}
                  onChange={e => handleChangeRol(user, e.target.value)}
                  className="text-xs border border-border rounded-lg px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary flex-shrink-0"
                >
                  <option value="Admin">Admin</option>
                  <option value="Comercial">Comercial</option>
                </select>
              )}
            </div>
          );
        })}
        {users.length === 0 && (
          <p className="px-5 py-8 text-sm text-muted-foreground text-center">No hay usuarios registrados</p>
        )}
      </div>
    </div>
  );
}