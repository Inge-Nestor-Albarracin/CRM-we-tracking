import React, { useState, useMemo, useEffect } from 'react';
import { useEquipo, crearEsTareaEquipo } from '@/hooks/useMiembrosEquipo';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  CheckCircle2, Circle, Plus, Trash2, Building2, X,
  ClipboardList, Calendar, Filter,
} from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';

const FILTROS = [
  { key: 'pendientes', label: 'Pendientes' },
  { key: 'todas',      label: 'Todas' },
  { key: 'completadas', label: 'Completadas' },
];

const FILTROS_AMBITO = [
  { key: 'todos', label: 'Todas' },
  { key: 'equipo', label: 'Nuestro equipo' },
  { key: 'cliente', label: 'Clientes' },
];

// esTareaEquipo se calcula DENTRO del componente con la lista de Miembros del Equipo
// (Configuración → Equipo). Ver useMiembrosEquipo / crearEsTareaEquipo.

// Color estable por persona (hash -> HSL) para diferenciar responsables de un vistazo.
function colorDe(nombre) {
  const s = String(nombre || '?');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return `hsl(${Math.abs(h) % 360} 60% 42%)`;
}
function iniciales(nombre) {
  const p = String(nombre || '?').trim().split(/\s+/);
  return (((p[0] || '')[0] || '') + ((p[1] || '')[0] || '')).toUpperCase() || '?';
}

// Grupos por urgencia (orden de arriba a abajo) con su color de acento.
const GRUPOS = [
  { key: 'vencidas', label: 'Vencidas',      dot: 'bg-red-500',    text: 'text-red-600 dark:text-red-400',       border: 'border-l-red-500',    bg: 'bg-destructive/5' },
  { key: 'hoy',      label: 'Hoy',           dot: 'bg-amber-500',  text: 'text-amber-600 dark:text-amber-400',   border: 'border-l-amber-500',  bg: 'bg-amber-50/40 dark:bg-amber-950/10' },
  { key: 'semana',   label: 'Esta semana',   dot: 'bg-blue-500',   text: 'text-blue-600 dark:text-blue-400',     border: 'border-l-blue-500',   bg: '' },
  { key: 'despues',  label: 'Más adelante',  dot: 'bg-slate-400',  text: 'text-slate-500 dark:text-slate-400',   border: 'border-l-slate-300',  bg: '' },
  { key: 'sinfecha', label: 'Sin fecha',     dot: 'bg-gray-300',   text: 'text-gray-500',                        border: 'border-l-gray-200',   bg: '' },
  { key: 'completadas', label: 'Completadas', dot: 'bg-green-500', text: 'text-green-600 dark:text-green-400',   border: 'border-l-green-500',  bg: '' },
];

export default function TareasCRM() {
  const queryClient = useQueryClient();
  const { isAdmin, email: userEmail } = useUserRole();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ titulo: '', fecha_limite: '', hora: '', asignado_a: '', empresa_id: '' });
  const [filtro, setFiltro] = useState('pendientes');
  const [filtroAmbito, setFiltroAmbito] = useState('todos');
  const [filtroEmpresa, setFiltroEmpresa] = useState('');
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const { data: tareas = [], refetch } = useQuery({
    queryKey: ['tareas-global'],
    queryFn: () => base44.entities.Tarea.list(),
    refetchOnMount: 'always',
  });

  const { data: empresas = [] } = useQuery({
    queryKey: ['empresas'],
    queryFn: () => base44.entities.Empresa.list(),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
    staleTime: 0,
  });

  const { equipo } = useEquipo();
  const esTareaEquipo = useMemo(() => crearEsTareaEquipo(equipo), [equipo]);

  const handleCrear = async () => {
    if (!form.titulo || !form.fecha_limite) return;
    const payload = {
      titulo: form.titulo,
      fecha_limite: form.fecha_limite,
      asignado_a: form.asignado_a || currentUser?.email || '',
    };
    if (form.hora) payload.hora = form.hora;
    if (form.empresa_id) payload.empresa_id = form.empresa_id;
    await base44.entities.Tarea.create(payload);
    setForm({ titulo: '', fecha_limite: '', hora: '', asignado_a: '', empresa_id: '' });
    setShowForm(false);
    refetch();
  };

  const handleCompletar = async (tarea) => {
    await base44.entities.Tarea.update(tarea.id, { completada: !tarea.completada });
    refetch();
  };

  const handleEliminar = async (id) => {
    await base44.entities.Tarea.delete(id);
    refetch();
  };

  const tareasFiltradas = useMemo(() => {
    return tareas
      .filter(t => {
        if (filtro === 'pendientes' && t.completada) return false;
        if (filtro === 'completadas' && !t.completada) return false;
        if (filtroAmbito === 'equipo' && !esTareaEquipo(t)) return false;
        if (filtroAmbito === 'cliente' && esTareaEquipo(t)) return false;
        if (filtroEmpresa === '__general__' && (t.empresa_id || t.cliente_id)) return false;
        if (filtroEmpresa && filtroEmpresa !== '__general__' && t.empresa_id !== filtroEmpresa) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.completada !== b.completada) return a.completada ? 1 : -1;
        return new Date(a.fecha_limite) - new Date(b.fecha_limite);
      });
  }, [tareas, filtro, filtroAmbito, filtroEmpresa, esTareaEquipo]);

  const pendientes = tareas.filter(t => !t.completada).length;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  // Reparte las tareas filtradas en cubetas por urgencia.
  const grupos = useMemo(() => {
    const finSemana = new Date(hoy); finSemana.setDate(hoy.getDate() + 7);
    const b = { vencidas: [], hoy: [], semana: [], despues: [], sinfecha: [], completadas: [] };
    for (const t of tareasFiltradas) {
      if (t.completada) { b.completadas.push(t); continue; }
      if (!t.fecha_limite) { b.sinfecha.push(t); continue; }
      const fd = new Date(t.fecha_limite + 'T12:00:00'); fd.setHours(0, 0, 0, 0);
      if (fd < hoy) b.vencidas.push(t);
      else if (fd.getTime() === hoy.getTime()) b.hoy.push(t);
      else if (fd < finSemana) b.semana.push(t);
      else b.despues.push(t);
    }
    return b;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tareasFiltradas]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Tareas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {pendientes > 0 ? `${pendientes} pendiente${pendientes !== 1 ? 's' : ''}` : 'Todo al día'}
          </p>
        </div>
        <Button onClick={() => setShowForm(v => !v)} size="sm" className="gap-1.5 rounded-lg">
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Cancelar' : 'Nueva tarea'}
        </Button>
      </div>

      {/* New task form */}
      {showForm && (
        <div className="bg-card rounded-xl p-5 space-y-3 border border-border/60">
          <h3 className="text-sm font-semibold text-foreground">Nueva tarea</h3>
          <Input
            value={form.titulo}
            onChange={e => setForm({ ...form, titulo: e.target.value })}
            onKeyDown={e => e.key === 'Enter' && handleCrear()}
            placeholder="Título de la tarea *"
            className="rounded-lg"
            autoFocus
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Fecha límite *</label>
              <Input type="date" value={form.fecha_limite}
                onChange={e => setForm({ ...form, fecha_limite: e.target.value })}
                className="mt-1 rounded-lg" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Hora (opcional)</label>
              <Input type="time" value={form.hora}
                onChange={e => setForm({ ...form, hora: e.target.value })}
                className="mt-1 rounded-lg" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Asignar a</label>
              <select value={form.asignado_a} onChange={e => setForm({ ...form, asignado_a: e.target.value })}
                className="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="">Yo mismo</option>
                {users.map(u => <option key={u.id} value={u.email}>{u.full_name || u.email}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Empresa (opcional)</label>
              <select value={form.empresa_id} onChange={e => setForm({ ...form, empresa_id: e.target.value })}
                className="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="">— Tarea general —</option>
                {[...empresas].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')).map(e => (
                  <option key={e.id} value={e.id}>{e.nombre}</option>
                ))}
              </select>
            </div>
          </div>
          <Button onClick={handleCrear} disabled={!form.titulo || !form.fecha_limite} className="w-full rounded-lg">
            Crear tarea
          </Button>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 bg-muted/40 rounded-xl p-1">
        {FILTROS.map(f => (
          <button key={f.key} onClick={() => setFiltro(f.key)}
            className={`px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${filtro === f.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            {f.label}
          </button>
        ))}
        </div>
        <div className="flex gap-1 bg-muted/40 rounded-xl p-1">
        {FILTROS_AMBITO.map(f => (
          <button key={f.key} onClick={() => setFiltroAmbito(f.key)}
            className={`px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${filtroAmbito === f.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            {f.label}
          </button>
        ))}
        </div>
        <select value={filtroEmpresa} onChange={e => setFiltroEmpresa(e.target.value)}
          className="h-8 px-3 text-xs rounded-lg border border-border bg-background text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary ml-auto">
          <option value="">Todas las empresas</option>
          <option value="__general__">Solo generales</option>
          {[...empresas].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')).map(e => (
            <option key={e.id} value={e.id}>{e.nombre}</option>
          ))}
        </select>
      </div>

      {/* Task list agrupada por urgencia */}
      {tareasFiltradas.length === 0 ? (
        <div className="bg-card rounded-xl flex flex-col items-center justify-center py-16 text-muted-foreground">
          <ClipboardList className="w-10 h-10 mb-3 opacity-20" />
          <p className="text-sm">Sin tareas en esta vista</p>
          <button onClick={() => setShowForm(true)} className="mt-3 text-xs text-primary hover:underline">
            Crear la primera tarea
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {GRUPOS.map(g => {
            const items = grupos[g.key];
            if (!items || items.length === 0) return null;
            return (
              <div key={g.key}>
                {/* Encabezado del grupo */}
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className={`w-2.5 h-2.5 rounded-full ${g.dot}`} />
                  <h3 className={`text-sm font-semibold ${g.text}`}>{g.label}</h3>
                  <span className="text-xs font-medium text-muted-foreground bg-muted/60 rounded-full px-2 py-0.5">{items.length}</span>
                </div>
                <div className="bg-card rounded-xl overflow-hidden divide-y divide-border/30 border border-border/40">
                  {items.map(tarea => {
                    const empresa = tarea.empresa_id ? empresas.find(e => e.id === tarea.empresa_id) : null;
                    const fechaTarea = tarea.fecha_limite ? new Date(tarea.fecha_limite + 'T12:00:00') : null;
                    const responsable = users.find(u => u.email === tarea.asignado_a)?.full_name || tarea.responsable || tarea.asignado_a || '';
                    const esCliente = !esTareaEquipo(tarea);

                    return (
                      <div key={tarea.id} className={`flex items-start gap-3 px-4 py-3.5 border-l-[3px] ${g.border} transition-colors ${tarea.completada ? 'opacity-50 border-l-transparent' : g.bg}`}>
                        <button onClick={() => handleCompletar(tarea)} className="flex-shrink-0 mt-0.5">
                          {tarea.completada
                            ? <CheckCircle2 className="w-5 h-5 text-green-500" />
                            : <Circle className="w-5 h-5 text-muted-foreground/40 hover:text-primary transition-colors" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${tarea.completada ? 'line-through text-muted-foreground' : 'text-foreground font-medium'}`}>
                            {tarea.titulo}
                          </p>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            {fechaTarea && (
                              <span className={`flex items-center gap-1 text-xs ${g.key === 'vencidas' ? 'text-destructive font-semibold' : g.key === 'hoy' ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-muted-foreground'}`}>
                                <Calendar className="w-3 h-3" />
                                {g.key === 'hoy' ? 'Hoy' : fechaTarea.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: fechaTarea.getFullYear() !== hoy.getFullYear() ? 'numeric' : undefined })}
                                {tarea.hora && ` · ${tarea.hora}`}
                              </span>
                            )}
                            {responsable && (
                              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <span className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0" style={{ backgroundColor: colorDe(responsable) }}>
                                  {iniciales(responsable)}
                                </span>
                                {responsable}
                              </span>
                            )}
                            <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${esCliente ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'}`}>
                              {esCliente ? 'Cliente' : 'Equipo'}
                            </span>
                            {empresa && (
                              <span className="flex items-center gap-1 text-[11px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
                                <Building2 className="w-2.5 h-2.5" />
                                {empresa.nombre}
                              </span>
                            )}
                          </div>
                        </div>
                        {(isAdmin || tarea.created_by === userEmail) && (
                          <button onClick={() => handleEliminar(tarea.id)}
                            className="flex-shrink-0 p-1.5 hover:bg-destructive/10 rounded-lg text-muted-foreground/40 hover:text-destructive transition-colors mt-0.5">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
