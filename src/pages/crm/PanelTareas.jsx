import React, { useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Circle, Building2, Calendar, Users, Briefcase, ClipboardList } from 'lucide-react';
import { useEquipo, crearEsTareaEquipo } from '@/hooks/useMiembrosEquipo';

// esTareaEquipo se calcula DENTRO del componente con la lista de Miembros del Equipo
// (Configuración → Equipo). Ver useMiembrosEquipo / crearEsTareaEquipo.

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

export default function PanelTareas() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { equipo } = useEquipo();
  const esTareaEquipo = useMemo(() => crearEsTareaEquipo(equipo), [equipo]);

  const { data: tareas = [] } = useQuery({
    queryKey: ['tareas-global'],
    queryFn: () => base44.entities.Tarea.list(),
    refetchOnMount: 'always',
  });
  const { data: empresas = [] } = useQuery({ queryKey: ['empresas'], queryFn: () => base44.entities.Empresa.list() });
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: () => base44.entities.User.list() });

  const empresaById = useMemo(() => Object.fromEntries(empresas.map(e => [e.id, e])), [empresas]);
  const userByEmail = useMemo(() => Object.fromEntries(users.map(u => [String(u.email).toLowerCase(), u])), [users]);

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const personaDe = (t) => {
    const u = userByEmail[String(t.asignado_a || '').toLowerCase()];
    return u?.full_name || t.responsable || t.asignado_a || 'Sin asignar';
  };

  // Agrupa las pendientes por persona, dentro de cada ámbito.
  const { columnasEquipo, columnasCliente } = useMemo(() => {
    const pend = tareas.filter(t => !t.completada);
    const armar = (lista) => {
      const map = new Map();
      for (const t of lista) {
        const p = personaDe(t);
        if (!map.has(p)) map.set(p, []);
        map.get(p).push(t);
      }
      const cols = [...map.entries()].map(([persona, items]) => {
        items.sort((a, b) => String(a.fecha_limite || '9999').localeCompare(String(b.fecha_limite || '9999')));
        const vencidas = items.filter(t => t.fecha_limite && new Date(t.fecha_limite + 'T12:00:00') < hoy).length;
        return { persona, items, vencidas };
      });
      // Ordena: más vencidas primero, luego más tareas.
      cols.sort((a, b) => b.vencidas - a.vencidas || b.items.length - a.items.length);
      return cols;
    };
    return {
      columnasEquipo: armar(pend.filter(esTareaEquipo)),
      columnasCliente: armar(pend.filter(t => !esTareaEquipo(t))),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tareas, users, esTareaEquipo]);

  const completar = async (t) => {
    await base44.entities.Tarea.update(t.id, { completada: true });
    qc.invalidateQueries({ queryKey: ['tareas-global'] });
  };

  const totalEquipo = columnasEquipo.reduce((s, c) => s + c.items.length, 0);
  const totalCliente = columnasCliente.reduce((s, c) => s + c.items.length, 0);

  const Columna = ({ col, acento }) => (
    <div className="w-[300px] flex-shrink-0 bg-card border border-border/40 rounded-xl overflow-hidden flex flex-col">
      <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-border/40 bg-muted/20">
        <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: colorDe(col.persona) }}>
          {iniciales(col.persona)}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{col.persona}</p>
          <p className="text-[11px] text-muted-foreground">
            {col.items.length} pendiente{col.items.length !== 1 ? 's' : ''}
            {col.vencidas > 0 && <span className="text-destructive font-medium"> · {col.vencidas} vencida{col.vencidas !== 1 ? 's' : ''}</span>}
          </p>
        </div>
      </div>
      <div className="p-2 space-y-2 overflow-y-auto max-h-[62vh]">
        {col.items.map(t => {
          const empresa = t.empresa_id ? empresaById[t.empresa_id] : null;
          const fecha = t.fecha_limite ? new Date(t.fecha_limite + 'T12:00:00') : null;
          const vencida = fecha && fecha < hoy;
          const esHoy = fecha && fecha.getTime() === hoy.getTime();
          return (
            <div key={t.id} className={`group rounded-lg border border-border/50 p-2.5 border-l-[3px] ${vencida ? 'border-l-red-500 bg-destructive/5' : esHoy ? 'border-l-amber-500 bg-amber-50/40 dark:bg-amber-950/10' : acento}`}>
              <div className="flex items-start gap-2">
                <button onClick={() => completar(t)} title="Marcar completada" className="flex-shrink-0 mt-0.5">
                  <Circle className="w-4 h-4 text-muted-foreground/40 hover:text-green-500 transition-colors" />
                </button>
                <p className="text-[13px] leading-snug text-foreground flex-1">{t.titulo}</p>
              </div>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap pl-6">
                {fecha && (
                  <span className={`flex items-center gap-1 text-[11px] ${vencida ? 'text-destructive font-semibold' : esHoy ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-muted-foreground'}`}>
                    <Calendar className="w-2.5 h-2.5" />
                    {esHoy ? 'Hoy' : fecha.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
                  </span>
                )}
                {empresa && (
                  <span className="flex items-center gap-1 text-[11px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium max-w-full truncate">
                    <Building2 className="w-2.5 h-2.5 flex-shrink-0" />
                    <span className="truncate">{empresa.nombre}</span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const Seccion = ({ titulo, subtitulo, icono: Icon, colorClass, columnas, total, vacio }) => (
    <section>
      <div className="flex items-center gap-2.5 mb-3">
        <span className={`w-9 h-9 rounded-lg flex items-center justify-center ${colorClass}`}>
          <Icon className="w-4 h-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-foreground">{titulo}</h2>
          <p className="text-xs text-muted-foreground">{subtitulo}</p>
        </div>
        <span className="ml-auto text-sm font-semibold text-foreground bg-muted/60 rounded-full px-3 py-1">{total}</span>
      </div>
      {columnas.length === 0 ? (
        <div className="bg-card border border-border/40 rounded-xl py-10 text-center text-sm text-muted-foreground">{vacio}</div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {columnas.map(col => (
            <Columna key={col.persona} col={col} acento={colorClass.includes('emerald') ? 'border-l-emerald-400' : 'border-l-amber-400'} />
          ))}
        </div>
      )}
    </section>
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Panel de tareas</h1>
          <p className="text-sm text-muted-foreground mt-1">Pendientes por persona — equipo y prospectos</p>
        </div>
        <button onClick={() => navigate('/crm/tareas')} className="text-xs text-primary hover:underline">
          Ver lista completa →
        </button>
      </div>

      <Seccion
        titulo="Nuestro equipo"
        subtitulo="Tareas pendientes de cada integrante de WeTracking"
        icono={Users}
        colorClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        columnas={columnasEquipo}
        total={totalEquipo}
        vacio="El equipo está al día 🎉"
      />

      <Seccion
        titulo="Prospectos y clientes"
        subtitulo="Tareas pendientes por responsable (para hacer seguimiento y presionar)"
        icono={Briefcase}
        colorClass="bg-amber-500/10 text-amber-600 dark:text-amber-400"
        columnas={columnasCliente}
        total={totalCliente}
        vacio="No hay tareas pendientes de clientes o prospectos"
      />

      {columnasEquipo.length === 0 && columnasCliente.length === 0 && (
        <div className="text-center py-10 text-muted-foreground">
          <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">No hay tareas pendientes</p>
        </div>
      )}
    </div>
  );
}
