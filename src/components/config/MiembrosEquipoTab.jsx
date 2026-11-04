import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X, Users, Download } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useMiembrosEquipo, EQUIPO_DEFAULT } from '@/hooks/useMiembrosEquipo';

// Mantiene la lista "comerciales" (dropdowns de Comercial asignado / Propietario)
// alineada con los miembros activos del equipo. Best-effort: si falla, no rompe el guardado.
async function sincronizarComerciales(nombresActivos) {
  try {
    const registros = await base44.entities.ListaOpciones.filter({ clave: 'comerciales' });
    const reg = registros?.[0];
    const datos = { clave: 'comerciales', valores: nombresActivos };
    if (reg?.id) await base44.entities.ListaOpciones.update(reg.id, datos);
    else await base44.entities.ListaOpciones.create(datos);
  } catch { /* opcional */ }
}

function MiembroRow({ m, onGuardar, onBorrar }) {
  const [local, setLocal] = useState({ nombre: m.nombre || '', email: m.email || '', cargo: m.cargo || '' });
  useEffect(() => { setLocal({ nombre: m.nombre || '', email: m.email || '', cargo: m.cargo || '' }); }, [m.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const guardarCampo = (campo) => {
    const val = (local[campo] || '').trim();
    if (val === (m[campo] || '')) return;
    if (campo === 'nombre' && !val) { setLocal(l => ({ ...l, nombre: m.nombre })); return; }
    onGuardar(m.id, { [campo]: val });
  };

  const activo = m.activo !== false;
  return (
    <div className={`grid grid-cols-[1.2fr_1.4fr_1fr_auto_auto] items-center gap-2 ${activo ? '' : 'opacity-50'}`}>
      <Input value={local.nombre} onChange={e => setLocal(l => ({ ...l, nombre: e.target.value }))} onBlur={() => guardarCampo('nombre')} className="h-8 text-sm" placeholder="Nombre" />
      <Input value={local.email} onChange={e => setLocal(l => ({ ...l, email: e.target.value }))} onBlur={() => guardarCampo('email')} className="h-8 text-sm" placeholder="correo@empresa.com" />
      <Input value={local.cargo} onChange={e => setLocal(l => ({ ...l, cargo: e.target.value }))} onBlur={() => guardarCampo('cargo')} className="h-8 text-sm" placeholder="Cargo" />
      <button
        onClick={() => onGuardar(m.id, { activo: !activo })}
        className={`text-[11px] font-medium px-2 py-1 rounded-full flex-shrink-0 ${activo ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}
        title={activo ? 'Activo (clic para desactivar)' : 'Inactivo (clic para activar)'}
      >
        {activo ? 'Activo' : 'Inactivo'}
      </button>
      <button onClick={() => onBorrar(m.id)} className="p-1.5 text-muted-foreground hover:text-destructive flex-shrink-0" title="Eliminar">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function MiembrosEquipoTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: miembros = [], isLoading } = useMiembrosEquipo();
  const [nuevo, setNuevo] = useState({ nombre: '', email: '', cargo: '' });

  const refrescar = async () => {
    try {
      const actuales = await base44.entities.MiembroEquipo.list('orden');
      const nombres = actuales.filter(m => m.activo !== false).map(m => m.nombre).filter(Boolean);
      await sincronizarComerciales(nombres);
    } catch { /* ignore */ }
    qc.invalidateQueries({ queryKey: ['miembros-equipo'] });
    qc.invalidateQueries({ queryKey: ['listas-opciones'] });
  };

  const guardar = useMutation({
    mutationFn: ({ id, patch }) => base44.entities.MiembroEquipo.update(id, patch),
    onSuccess: refrescar,
    onError: (e) => toast({ title: 'Error al guardar', description: e?.message || String(e), variant: 'destructive' }),
  });
  const crear = useMutation({
    mutationFn: (m) => base44.entities.MiembroEquipo.create(m),
    onSuccess: async () => { await refrescar(); toast({ title: 'Miembro agregado' }); },
    onError: (e) => toast({ title: 'Error', description: e?.message || String(e), variant: 'destructive' }),
  });
  const borrar = useMutation({
    mutationFn: (id) => base44.entities.MiembroEquipo.delete(id),
    onSuccess: async () => { await refrescar(); toast({ title: 'Miembro eliminado' }); },
  });

  async function sembrar() {
    for (let i = 0; i < EQUIPO_DEFAULT.length; i++) {
      try { await base44.entities.MiembroEquipo.create({ ...EQUIPO_DEFAULT[i], activo: true, orden: i }); } catch { /* ignore */ }
    }
    await refrescar();
    toast({ title: 'Equipo cargado', description: `${EQUIPO_DEFAULT.length} miembros agregados. Edítalos a tu gusto.` });
  }

  function agregar() {
    const nombre = nuevo.nombre.trim();
    if (!nombre) return;
    crear.mutate({ nombre, email: nuevo.email.trim(), cargo: nuevo.cargo.trim(), activo: true, orden: miembros.length });
    setNuevo({ nombre: '', email: '', cargo: '' });
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-32"><div className="w-5 h-5 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <Users className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
        <p className="text-sm text-muted-foreground">
          El equipo interno de WeTracking. Con esta lista el sistema sabe quién es del equipo (para separar tareas de <b>equipo</b> vs <b>cliente</b>),
          la IA asigna las tareas de las reuniones a la persona correcta, y las reuniones donde participan varios miembros se procesan <b>una sola vez</b>.
          El correo debe ser el mismo con el que la persona se conecta a las reuniones.
        </p>
      </div>

      <div className="bg-card border border-border/60 rounded-xl p-4 space-y-3">
        {miembros.length > 0 && (
          <div className="grid grid-cols-[1.2fr_1.4fr_1fr_auto_auto] gap-2 px-0.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            <span>Nombre</span><span>Correo</span><span>Cargo</span><span>Estado</span><span></span>
          </div>
        )}
        <div className="space-y-2">
          {miembros.map(m => (
            <MiembroRow key={m.id} m={m} onGuardar={(id, patch) => guardar.mutate({ id, patch })} onBorrar={(id) => borrar.mutate(id)} />
          ))}
        </div>

        {miembros.length === 0 && (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground mb-3">Todavía no hay miembros del equipo cargados.</p>
            <Button variant="outline" size="sm" onClick={sembrar}>
              <Download className="w-3.5 h-3.5 mr-1.5" /> Cargar equipo por defecto (5)
            </Button>
          </div>
        )}

        <div className="grid grid-cols-[1.2fr_1.4fr_1fr_auto] items-center gap-2 pt-2 border-t border-border/40">
          <Input value={nuevo.nombre} onChange={e => setNuevo(n => ({ ...n, nombre: e.target.value }))} onKeyDown={e => e.key === 'Enter' && agregar()} placeholder="Nombre" className="h-8 text-sm" />
          <Input value={nuevo.email} onChange={e => setNuevo(n => ({ ...n, email: e.target.value }))} onKeyDown={e => e.key === 'Enter' && agregar()} placeholder="correo@empresa.com" className="h-8 text-sm" />
          <Input value={nuevo.cargo} onChange={e => setNuevo(n => ({ ...n, cargo: e.target.value }))} onKeyDown={e => e.key === 'Enter' && agregar()} placeholder="Cargo" className="h-8 text-sm" />
          <Button size="sm" variant="outline" className="h-8" onClick={agregar} disabled={!nuevo.nombre.trim()}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Agregar
          </Button>
        </div>
      </div>
    </div>
  );
}
