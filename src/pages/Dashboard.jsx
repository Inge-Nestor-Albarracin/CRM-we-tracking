import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Conversacion } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Users, TrendingUp, AlertTriangle, CheckCircle2, Clock, Bot,
  DollarSign, FileText, Package, NotebookPen, Target, Percent, Receipt, RefreshCw, Boxes,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, Legend, LabelList, AreaChart, Area,
} from 'recharts';
import { format, addMonths, startOfMonth, endOfMonth, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { estadoEfectivo } from '@/lib/wetracking';

const Contacto = base44.entities.Contacto;
const Tarea = base44.entities.Tarea;
const Oportunidad = base44.entities.Oportunidad;
const Cotizacion = base44.entities.Cotizacion;
const Producto = base44.entities.Producto;
const MovimientoInventario = base44.entities.MovimientoInventario;
const ReunionNota = base44.entities.ReunionNota;

import { ETAPAS_ABIERTAS_OP as ETAPAS_ABIERTAS } from '@/components/crm/OportunidadKanban';

// ── Paleta de gráficas (validada con el skill dataviz) ─────────────────────────
// Sequenciales de una sola serie usan un hue del tema; los pares llevan leyenda.
const C = {
  ganado: 'hsl(145 63% 42%)',    // verde — dinero ganado
  pipeline: 'hsl(211 100% 50%)', // azul — valor en pipeline
  leads: 'hsl(199 89% 48%)',     // cyan — leads
  rotacion: 'hsl(262 83% 58%)',  // púrpura — rotación
  entrada: 'hsl(145 63% 42%)',   // verde — entradas
  salida: 'hsl(25 95% 53%)',     // naranja — salidas (evita verde/rojo por daltonismo)
};
// Colores de ESTADO de cotización (reservados, siempre con etiqueta del estado).
const ESTADO_COT = {
  Aceptada: 'hsl(142 71% 40%)',
  Enviada: 'hsl(211 100% 50%)',
  Vencida: 'hsl(38 92% 45%)',
  Rechazada: 'hsl(0 72% 51%)',
  Borrador: 'hsl(215 16% 62%)',
};
const ORDEN_ESTADO_COT = ['Borrador', 'Enviada', 'Aceptada', 'Rechazada', 'Vencida'];

const ETAPA_LABEL = {
  Visita_Inicial: 'Visita inicial',
  Creacion_Cotizacion: 'Creación cotización',
  Cotizacion_Enviada: 'Cotización enviada',
  Visita_Post_Cotizacion: 'Visita post-cotiz.',
  Decisor_Convencido: 'Decisor convencido',
  Cierre_Ganado: 'Cierre ganado',
  Cierre_Perdido: 'Cierre perdido',
};
const ETAPA_LEAD_LABEL = { Lead: 'Lead', Calificado: 'Calificado', Propuesta: 'Propuesta', Cierre: 'Cierre', Cliente: 'Cliente' };
const ORDEN_LEAD = ['Lead', 'Calificado', 'Propuesta', 'Cierre', 'Cliente'];

const tipoMov = (m) => (m.tipo === 'salida' ? -(Number(m.cantidad) || 0) : (Number(m.cantidad) || 0));

// Estilos de tooltip (respetan light/dark vía tokens).
const TT_STYLE = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 10, fontSize: 12, boxShadow: '0 6px 20px rgb(0 0 0 / 0.10)' };
const TT_LABEL = { color: 'hsl(var(--foreground))', fontWeight: 600, marginBottom: 2 };
const TT_ITEM = { color: 'hsl(var(--muted-foreground))' };
const AXIS_TICK = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' };

function KpiCard({ icon: Icon, label, value, sub, to, tono }) {
  const card = (
    <div className="rounded-xl border border-border/60 bg-card p-5 hover:border-border transition-colors h-full">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">{label}</p>
        {Icon && <Icon className={`w-4 h-4 flex-shrink-0 ${tono || 'text-muted-foreground/40'}`} strokeWidth={1.75} />}
      </div>
      <p className="text-[26px] font-semibold text-foreground mt-2 leading-none tracking-tight">{value}</p>
      {sub && <p className="text-[12px] text-muted-foreground mt-2">{sub}</p>}
    </div>
  );
  return to ? <Link to={to}>{card}</Link> : card;
}

function ChartCard({ title, subtitle, action, children, className = '' }) {
  return (
    <Card className={`rounded-2xl border-border/60 ${className}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-[15px] font-semibold tracking-tight">{title}</CardTitle>
            {subtitle && <p className="text-[12px] text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function formatCOP(n) {
  if (!n) return '$0';
  const a = Math.abs(n);
  if (a >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (a >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

export default function Dashboard() {
  const { data: contactos = [] } = useQuery({ queryKey: ['contactos'], queryFn: () => Contacto.list() });
  const { data: tareas = [] } = useQuery({ queryKey: ['tareas'], queryFn: () => Tarea.list() });
  const { data: oportunidades = [] } = useQuery({ queryKey: ['oportunidades'], queryFn: () => Oportunidad.list() });
  const { data: cotizaciones = [] } = useQuery({ queryKey: ['cotizaciones'], queryFn: () => Cotizacion.list() });
  const { data: productos = [] } = useQuery({ queryKey: ['productos'], queryFn: () => Producto.list() });
  const { data: movimientos = [] } = useQuery({ queryKey: ['movimientos-inventario'], queryFn: () => MovimientoInventario.list('-created_date') });
  const { data: reuniones = [] } = useQuery({ queryKey: ['reuniones'], queryFn: () => ReunionNota.list('-fecha_reunion') });
  const { data: conversaciones = [] } = useQuery({
    queryKey: ['conversaciones_dash'],
    queryFn: () => Conversacion.list('-fecha_ultimo_mensaje'),
    refetchInterval: 30000,
  });

  const stats = useMemo(() => {
    const hoy = new Date();
    const hoyStart = new Date(); hoyStart.setHours(0, 0, 0, 0);
    const mesStart = startOfMonth(hoy);
    const anioStart = new Date(hoy.getFullYear(), 0, 1);
    const hace90 = subDays(hoy, 90);

    // ── Negocios / pipeline ──
    const soloCOP = (o) => (o.moneda || 'COP') === 'COP';
    const abiertas = oportunidades.filter(o => ETAPAS_ABIERTAS.includes(o.etapa));
    const valorPipeline = abiertas.filter(soloCOP).reduce((s, o) => s + (o.valor_estimado || 0), 0);
    const ganadas = oportunidades.filter(o => o.etapa === 'Cierre_Ganado');
    const perdidas = oportunidades.filter(o => o.etapa === 'Cierre_Perdido');
    const ganadoAnio = ganadas
      .filter(o => o.fecha_cierre_real && new Date(o.fecha_cierre_real + 'T12:00:00') >= anioStart && soloCOP(o))
      .reduce((s, o) => s + (o.valor_estimado || 0), 0);
    const cerradas = ganadas.length + perdidas.length;
    const winRate = cerradas > 0 ? Math.round((ganadas.length / cerradas) * 100) : 0;
    const ganadasCOP = ganadas.filter(soloCOP);
    const ticketPromedio = ganadasCOP.length > 0
      ? Math.round(ganadasCOP.reduce((s, o) => s + (o.valor_estimado || 0), 0) / ganadasCOP.length) : 0;

    // Embudo del pipeline: valor por etapa (abiertas, en orden del pipeline).
    const pipelinePorEtapa = ETAPAS_ABIERTAS.map(et => {
      const ops = abiertas.filter(o => o.etapa === et && soloCOP(o));
      return { etapa: ETAPA_LABEL[et] || et, valor: ops.reduce((s, o) => s + (o.valor_estimado || 0), 0), n: ops.length };
    }).filter(x => x.n > 0 || x.valor > 0);

    // Oportunidades por cerrar (30 días)
    const en30 = new Date(hoy); en30.setDate(en30.getDate() + 30);
    const porCerrar = abiertas
      .filter(o => o.fecha_cierre_estimada && new Date(o.fecha_cierre_estimada + 'T12:00:00') <= en30)
      .sort((a, b) => new Date(a.fecha_cierre_estimada) - new Date(b.fecha_cierre_estimada))
      .slice(0, 5);

    // ── Cotizaciones ──
    const cotsMes = cotizaciones.filter(c => c.fecha_emision && new Date(c.fecha_emision + 'T12:00:00') >= mesStart);
    const cotsEnviadas = cotsMes.filter(c => ['Enviada', 'Aceptada', 'Rechazada', 'Vencida'].includes(estadoEfectivo(c)));
    const cotsAceptadas = cotsMes.filter(c => c.estado === 'Aceptada');
    const tasaAceptacion = cotsEnviadas.length > 0 ? Math.round((cotsAceptadas.length / cotsEnviadas.length) * 100) : 0;
    const cotPorEstado = ORDEN_ESTADO_COT.map(est => {
      const cs = cotizaciones.filter(c => estadoEfectivo(c) === est);
      return { estado: est, n: cs.length, valor: cs.reduce((s, c) => s + (Number(c.total) || 0), 0) };
    }).filter(x => x.n > 0);

    // ── Leads / contactos por etapa ──
    const leadsActivos = contactos.filter(c => c.etapa_pipeline && c.etapa_pipeline !== 'Descalificado').length;
    const leadsHoy = contactos.filter(c => new Date(c.created_date || c.created_at) >= hoyStart).length;
    const leadsPorEtapa = ORDEN_LEAD.map(et => ({
      etapa: ETAPA_LEAD_LABEL[et], n: contactos.filter(c => c.etapa_pipeline === et).length,
    })).filter(x => x.n > 0);

    // ── Tareas ──
    const tareasPendientes = tareas.filter(t => !t.completada);
    const tareasVencidas = tareasPendientes.filter(t => t.fecha_limite && new Date(t.fecha_limite + 'T23:59:59') < hoy).length;

    // ── Inventario ──
    const stockMap = {};
    movimientos.filter(m => m.producto_id).forEach(m => { stockMap[m.producto_id] = (stockMap[m.producto_id] || 0) + tipoMov(m); });
    const activos = productos.filter(p => p.activo !== false);
    const bajoStock = activos.filter(p => (stockMap[p.id] || 0) < (p.stock_minimo || 0)).length;
    const unidadesTotales = Object.values(stockMap).reduce((a, b) => a + b, 0);
    // Valor comercial del inventario (precio de venta, no costo — visible a todos).
    const valorInventario = activos.reduce((s, p) => s + Math.max(0, stockMap[p.id] || 0) * (Number(p.precio_venta) || 0), 0);

    // Salidas por producto en los últimos 90 días (rotación).
    const salidas90 = {};
    movimientos.forEach(m => {
      if (m.tipo !== 'salida' || !m.producto_id) return;
      if (!m.created_date || new Date(m.created_date) < hace90) return;
      salidas90[m.producto_id] = (salidas90[m.producto_id] || 0) + (Number(m.cantidad) || 0);
    });
    const totalSalidas90 = Object.values(salidas90).reduce((a, b) => a + b, 0);
    const stockActualTotal = Object.values(stockMap).reduce((a, b) => a + Math.max(0, b), 0);
    const rotacion90 = stockActualTotal > 0 ? (totalSalidas90 / stockActualTotal) : 0;
    const topRotacion = activos
      .map(p => ({ nombre: p.nombre, salidas: salidas90[p.id] || 0 }))
      .filter(x => x.salidas > 0)
      .sort((a, b) => b.salidas - a.salidas)
      .slice(0, 8);

    // Movimiento de inventario por mes (6 meses): entradas vs salidas.
    const movPorMes = Array.from({ length: 6 }, (_, i) => {
      const m = addMonths(hoy, -(5 - i));
      const ini = startOfMonth(m); const fin = endOfMonth(m);
      let entradas = 0, salidas = 0;
      movimientos.forEach(mv => {
        if (!mv.created_date) return;
        const f = new Date(mv.created_date);
        if (f < ini || f > fin) return;
        if (mv.tipo === 'salida') salidas += Number(mv.cantidad) || 0;
        else if (mv.tipo === 'entrada') entradas += Number(mv.cantidad) || 0;
      });
      return { mes: format(m, 'MMM', { locale: es }), entradas, salidas };
    });

    // Valor ganado por mes (12 meses).
    const meses = Array.from({ length: 12 }, (_, i) => {
      const m = addMonths(hoy, -(11 - i));
      const ini = startOfMonth(m); const fin = endOfMonth(m);
      const ganado = ganadas
        .filter(o => o.fecha_cierre_real && soloCOP(o) && new Date(o.fecha_cierre_real + 'T12:00:00') >= ini && new Date(o.fecha_cierre_real + 'T12:00:00') <= fin)
        .reduce((s, o) => s + (o.valor_estimado || 0), 0);
      return { mes: format(m, 'MMM', { locale: es }), ganado: Math.round(ganado) };
    });

    return {
      valorPipeline, abiertas: abiertas.length, ganadoAnio, winRate, ticketPromedio,
      pipelinePorEtapa, porCerrar,
      cotsEnviadas: cotsEnviadas.length, cotsAceptadas: cotsAceptadas.length, tasaAceptacion, cotPorEstado,
      leadsActivos, leadsHoy, leadsPorEtapa,
      tareasPendientes, tareasVencidas,
      bajoStock, unidadesTotales, valorInventario, rotacion90, topRotacion, movPorMes, meses,
    };
  }, [oportunidades, cotizaciones, contactos, tareas, productos, movimientos]);

  const esperando = conversaciones.filter(c => c.estado === 'En_Espera_Humano');
  const iaActivas = conversaciones.filter(c => c.estado === 'IA_Activa');
  const reunionesRecientes = reuniones.slice(0, 5);
  const sinDatos = (arr) => (arr || []).length === 0;

  const Vacio = ({ children }) => (
    <div className="h-[220px] flex items-center justify-center text-[13px] text-muted-foreground">{children}</div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-bold text-foreground tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-[15px] mt-0.5">Resumen financiero, comercial y de inventario de WeTracking</p>
      </div>

      {/* KPIs financieros */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={DollarSign} tono="text-blue-500/70" label="Pipeline abierto" value={formatCOP(stats.valorPipeline)} sub={`${stats.abiertas} oportunidades`} to="/crm/pipeline" />
        <KpiCard icon={Target} tono="text-emerald-500/70" label="Ganado este año" value={formatCOP(stats.ganadoAnio)} sub="Cerrado ganado (COP)" to="/crm/pipeline" />
        <KpiCard icon={Receipt} label="Ticket promedio" value={formatCOP(stats.ticketPromedio)} sub="Por negocio ganado" to="/crm/pipeline" />
        <KpiCard icon={Percent} label="Win rate" value={`${stats.winRate}%`} sub="Ganadas vs cerradas" to="/crm/pipeline" />
      </div>

      {/* KPIs inventario + operación */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={Boxes} label="Valor de inventario" value={formatCOP(stats.valorInventario)} sub={`${stats.unidadesTotales} uds en stock`} to="/comercial/inventario" />
        <KpiCard icon={RefreshCw} tono="text-violet-500/70" label="Rotación (90 días)" value={`${stats.rotacion90.toFixed(1)}×`} sub={stats.bajoStock > 0 ? `${stats.bajoStock} bajo mínimo` : 'Inventario al día'} to="/comercial/inventario" />
        <KpiCard icon={FileText} label="Cotizaciones del mes" value={`${stats.cotsAceptadas}/${stats.cotsEnviadas}`} sub={stats.cotsEnviadas > 0 ? `${stats.tasaAceptacion}% aceptación` : 'Sin enviadas'} to="/comercial/cotizaciones" />
        <KpiCard icon={Clock} label="Tareas pendientes" value={stats.tareasPendientes.length} sub={stats.tareasVencidas > 0 ? `${stats.tareasVencidas} vencidas` : 'Al día'} to="/crm/tareas" />
      </div>

      {esperando.length > 0 && (
        <Link to="/inbox">
          <div className="flex items-center gap-3 p-3.5 bg-red-500/10 border border-red-500/20 rounded-2xl hover:bg-red-500/15 transition-colors">
            <div className="w-9 h-9 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-4.5 h-4.5 text-red-500" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-red-700 dark:text-red-400 text-[14px]">
                {esperando.length} {esperando.length === 1 ? 'conversación esperando' : 'conversaciones esperando'} agente humano
              </p>
              <p className="text-[12px] text-red-600 dark:text-red-500">La IA escaló estas conversaciones — revisa la bandeja</p>
            </div>
            <Badge variant="destructive" className="font-semibold">{esperando.length}</Badge>
          </div>
        </Link>
      )}

      {/* ── Financiero ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard className="lg:col-span-2" title="Ingresos ganados por mes" subtitle="Negocios cerrados ganados (COP) · últimos 12 meses">
          {sinDatos(stats.meses.filter(m => m.ganado > 0)) ? <Vacio>Aún no hay negocios ganados registrados</Vacio> : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={stats.meses} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="gGanado" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.ganado} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={C.ganado} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="mes" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={formatCOP} tick={AXIS_TICK} width={54} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TT_STYLE} labelStyle={TT_LABEL} itemStyle={TT_ITEM} formatter={(v) => [formatCOP(v), 'Ganado']} cursor={{ stroke: 'hsl(var(--border))' }} />
                <Area type="monotone" dataKey="ganado" name="Ganado" stroke={C.ganado} strokeWidth={2} fill="url(#gGanado)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Cotizaciones por estado" subtitle="Todas las cotizaciones"
          action={<Link to="/comercial/cotizaciones"><Button variant="ghost" size="sm" className="text-[13px] h-7 text-primary">Ver</Button></Link>}>
          {sinDatos(stats.cotPorEstado) ? <Vacio>Sin cotizaciones</Vacio> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={stats.cotPorEstado} layout="vertical" margin={{ top: 4, right: 40, left: 4, bottom: 0 }} barCategoryGap={10}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="estado" tick={AXIS_TICK} width={72} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TT_STYLE} labelStyle={TT_LABEL} itemStyle={TT_ITEM} cursor={{ fill: 'hsl(var(--muted))' }}
                  formatter={(v, _n, p) => [`${v} cot. · ${formatCOP(p.payload.valor)}`, p.payload.estado]} />
                <Bar dataKey="n" radius={[0, 4, 4, 0]} barSize={18}>
                  {stats.cotPorEstado.map((e) => <Cell key={e.estado} fill={ESTADO_COT[e.estado] || 'hsl(var(--muted-foreground))'} />)}
                  <LabelList dataKey="n" position="right" style={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Embudo del pipeline" subtitle="Valor de oportunidades abiertas por etapa (COP)">
          {sinDatos(stats.pipelinePorEtapa) ? <Vacio>Sin oportunidades abiertas</Vacio> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stats.pipelinePorEtapa} layout="vertical" margin={{ top: 4, right: 56, left: 4, bottom: 0 }} barCategoryGap={8}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tickFormatter={formatCOP} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="etapa" tick={AXIS_TICK} width={130} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TT_STYLE} labelStyle={TT_LABEL} itemStyle={TT_ITEM} cursor={{ fill: 'hsl(var(--muted))' }}
                  formatter={(v, _n, p) => [`${formatCOP(v)} · ${p.payload.n} op.`, p.payload.etapa]} />
                <Bar dataKey="valor" fill={C.pipeline} radius={[0, 4, 4, 0]} barSize={20}>
                  <LabelList dataKey="valor" position="right" formatter={formatCOP} style={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Leads por etapa" subtitle="Contactos activos en el pipeline comercial">
          {sinDatos(stats.leadsPorEtapa) ? <Vacio>Sin leads registrados</Vacio> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stats.leadsPorEtapa} layout="vertical" margin={{ top: 4, right: 40, left: 4, bottom: 0 }} barCategoryGap={8}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="etapa" tick={AXIS_TICK} width={82} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TT_STYLE} labelStyle={TT_LABEL} itemStyle={TT_ITEM} cursor={{ fill: 'hsl(var(--muted))' }}
                  formatter={(v) => [`${v} leads`, 'Contactos']} />
                <Bar dataKey="n" fill={C.leads} radius={[0, 4, 4, 0]} barSize={20}>
                  <LabelList dataKey="n" position="right" style={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* ── Inventario ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Movimiento de inventario" subtitle="Entradas vs. salidas por mes (unidades)">
          {sinDatos(stats.movPorMes.filter(m => m.entradas || m.salidas)) ? <Vacio>Sin movimientos de inventario</Vacio> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={stats.movPorMes} margin={{ top: 8, right: 8, left: 4, bottom: 0 }} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="mes" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS_TICK} width={40} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TT_STYLE} labelStyle={TT_LABEL} itemStyle={TT_ITEM} cursor={{ fill: 'hsl(var(--muted))' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={9} />
                <Bar dataKey="entradas" name="Entradas" fill={C.entrada} radius={[3, 3, 0, 0]} barSize={16} />
                <Bar dataKey="salidas" name="Salidas" fill={C.salida} radius={[3, 3, 0, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Rotación por producto" subtitle="Unidades que salieron en los últimos 90 días"
          action={<Link to="/comercial/inventario"><Button variant="ghost" size="sm" className="text-[13px] h-7 text-primary">Inventario</Button></Link>}>
          {sinDatos(stats.topRotacion) ? <Vacio>Sin salidas en los últimos 90 días</Vacio> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={stats.topRotacion} layout="vertical" margin={{ top: 4, right: 36, left: 4, bottom: 0 }} barCategoryGap={6}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="nombre" tick={AXIS_TICK} width={120} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TT_STYLE} labelStyle={TT_LABEL} itemStyle={TT_ITEM} cursor={{ fill: 'hsl(var(--muted))' }}
                  formatter={(v) => [`${v} uds`, 'Salidas 90d']} />
                <Bar dataKey="salidas" fill={C.rotacion} radius={[0, 4, 4, 0]} barSize={16}>
                  <LabelList dataKey="salidas" position="right" style={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* ── Operación: por cerrar + reuniones + tareas ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="rounded-2xl border-border/60">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[15px] font-semibold tracking-tight">Por cerrar (30 días)</CardTitle>
              <Link to="/crm/pipeline"><Button variant="ghost" size="sm" className="text-[13px] h-7 text-primary">Pipeline</Button></Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {stats.porCerrar.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                  <TrendingUp className="w-6 h-6 text-muted-foreground/40" />
                </div>
                <p className="text-[14px] text-muted-foreground">Sin cierres próximos</p>
              </div>
            ) : stats.porCerrar.map(o => {
              const dias = Math.ceil((new Date(o.fecha_cierre_estimada + 'T12:00:00') - new Date()) / 86400000);
              const cls = dias < 0 ? 'bg-red-500/10 text-red-600' : 'bg-muted text-muted-foreground';
              return (
                <div key={o.id} className="flex items-center justify-between gap-2 py-1.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium truncate">{o.nombre}</p>
                    <p className="text-[12px] text-muted-foreground truncate">{formatCOP(o.valor_estimado)} · {ETAPA_LABEL[o.etapa] || o.etapa}</p>
                  </div>
                  <Badge className={`text-[11px] flex-shrink-0 font-semibold border-transparent ${cls}`}>
                    {dias < 0 ? 'Vencida' : `${dias}d`}
                  </Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/60">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[15px] font-semibold tracking-tight">Reuniones recientes</CardTitle>
              <Link to="/crm/reuniones"><Button variant="ghost" size="sm" className="text-[13px] h-7 text-primary">Ver todas</Button></Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            {reunionesRecientes.length === 0 && (
              <div className="text-center py-6">
                <NotebookPen className="w-8 h-8 mx-auto mb-2 text-muted-foreground/20" />
                <p className="text-[14px] text-muted-foreground">Sin reuniones registradas</p>
              </div>
            )}
            {reunionesRecientes.map(r => (
              <Link key={r.id} to={`/crm/reuniones/${r.id}`}>
                <div className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0 hover:bg-muted/20 rounded-lg px-2 -mx-2 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <NotebookPen className="w-4 h-4 text-muted-foreground/70" strokeWidth={1.75} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] truncate">{r.titulo}</p>
                    <p className="text-[12px] text-muted-foreground truncate">
                      {r.fecha_reunion && format(new Date(r.fecha_reunion + 'T12:00:00'), 'dd MMM', { locale: es })}
                      {r.tipo === 'Comite_Comercial' ? ' · Comité' : r.tipo === 'Reunion_Cliente' ? ' · Cliente' : ''}
                      {(r.action_items || []).length > 0 && ` · ${r.action_items.length} tareas`}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[10px] flex-shrink-0">{r.estado_procesamiento}</Badge>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/60">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[15px] font-semibold tracking-tight">Tareas pendientes</CardTitle>
              <Link to="/crm/tareas"><Button variant="ghost" size="sm" className="text-[13px] h-7 text-primary">Ver todas</Button></Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            {stats.tareasPendientes.slice(0, 5).map(t => (
              <div key={t.id} className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <Clock className="w-4 h-4 text-muted-foreground/70" strokeWidth={1.75} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] truncate">{t.titulo}</p>
                  {t.fecha_limite && (
                    <p className="text-[12px] text-muted-foreground">{format(new Date(t.fecha_limite + 'T12:00:00'), 'dd MMM', { locale: es })}</p>
                  )}
                </div>
                <Badge variant="outline" className="text-[11px] flex-shrink-0">{t.prioridad || 'Media'}</Badge>
              </div>
            ))}
            {stats.tareasPendientes.length === 0 && (
              <div className="text-center py-6">
                <CheckCircle2 className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" strokeWidth={1.75} />
                <p className="text-[14px] text-muted-foreground">Sin tareas pendientes</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
