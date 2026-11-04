import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  MessageSquare, DollarSign, Layers, TrendingDown, Info, Users, Send,
} from 'lucide-react';

// ── Precios de Anthropic para Sonnet 4.6 (USD por millón de tokens) ──────────
const P_IN = 3 / 1e6;          // entrada normal
const P_OUT = 15 / 1e6;        // salida
const MULT_LECTURA = 0.1;      // leer del caché cuesta 0.1x
const MULT_ESCRITURA_1H = 2;   // escribir con TTL de 1 hora cuesta 2x

// Una "conversación" son mensajes seguidos sin un silencio mayor a esto.
// Coincide con el TTL del caché: por eso el 1º de cada conversación escribe.
const VENTANA_MIN = 60;

function Stat({ icon, label, value, sub, tone = 'text-blue-600' }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`p-2 rounded-lg bg-muted/50 ${tone}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold text-foreground">{value}</p>
          {sub && <p className="text-xs text-muted-foreground/80">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

const hoyISO = () => new Date().toISOString().slice(0, 10);
const haceISO = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);

export default function ConsumoIA() {
  // Parámetros del modelo de costo — editables para simular recortes de contexto.
  const [tokCache, setTokCache] = useState(29781);   // lo que se cachea (instrucciones + CRM)
  const [tokVolatil, setTokVolatil] = useState(1165); // fecha, quién habla, chat del grupo
  const [tokSalida, setTokSalida] = useState(160);    // respuesta de NOVA
  // Rango de fechas (inclusive) + filtro por persona.
  const [desdeStr, setDesdeStr] = useState('2026-07-24');
  const [hastaStr, setHastaStr] = useState(hoyISO());
  const [usuarioSel, setUsuarioSel] = useState('todos');

  const { data: novaMsgs = [], isLoading } = useQuery({
    queryKey: ['consumo-nova'],
    queryFn: () => base44.entities.NovaMensaje.list('-fecha', 3000),
  });
  const { data: grupoMsgs = [] } = useQuery({
    queryKey: ['consumo-grupo'],
    queryFn: () => base44.entities.MensajeGrupoTelegram.list('-fecha', 2000),
  });

  // Lista de personas para el filtro (sobre TODO el histórico, no solo el rango).
  const todosUsuarios = useMemo(() => {
    const s = new Set();
    for (const m of novaMsgs) if (m.usuario_email) s.add(m.usuario_email);
    return [...s].sort();
  }, [novaMsgs]);

  const an = useMemo(() => {
    const desde = new Date(desdeStr + 'T00:00:00');
    const hasta = new Date(hastaStr + 'T23:59:59');
    // Cada turno guarda 2 filas (user + assistant) con la MISMA fecha -> deduplicar
    // por fecha para contar TURNOS, que es lo que dispara una llamada al modelo.
    const porFecha = new Map();
    for (const m of novaMsgs) {
      if (!m.fecha) continue;
      if (usuarioSel !== 'todos' && m.usuario_email !== usuarioSel) continue;
      const d = new Date(m.fecha);
      if (isNaN(d) || d < desde || d > hasta) continue;
      if (!porFecha.has(m.fecha)) porFecha.set(m.fecha, { t: d, quien: m.usuario_email || '—' });
    }
    const turnos = [...porFecha.values()].sort((a, b) => a.t - b.t);
    // Sin resultados devolvemos ceros (no null) para que los FILTROS se sigan
    // viendo y el usuario pueda ampliar el rango en vez de quedar atrapado.
    if (!turnos.length) {
      return {
        sinDatos: true, turnos: 0, convs: 0, escriben: 0, leen: 0, serie: [], buckets: [],
        usuarios: [], diasActivos: 0, grupoEnRango: 0, diasRango: 0,
        primero: desde, ultimo: hasta, promDia: 0, largoProm: 0,
        total: 0, porMsj: 0, sinCache: 0, cEscribe: 0, cLee: 0, ahorro: 0, proyMes: 0,
      };
    }

    // Recorrido cronológico: el 1er mensaje tras un silencio > VENTANA escribe el
    // caché completo; los siguientes lo leen a 0.1x. Eso arma las conversaciones.
    const convs = [];
    let actual = null;
    for (const x of turnos) {
      if (!actual || (x.t - actual.fin) / 60000 >= VENTANA_MIN) {
        actual = { ini: x.t, fin: x.t, n: 1, quien: x.quien };
        convs.push(actual);
      } else {
        actual.n++; actual.fin = x.t;
      }
    }
    const escriben = convs.length;              // 1 escritura por conversación
    const leen = turnos.length - escriben;

    const cEscribe = tokCache * MULT_ESCRITURA_1H * P_IN + tokVolatil * P_IN + tokSalida * P_OUT;
    const cLee = tokCache * MULT_LECTURA * P_IN + tokVolatil * P_IN + tokSalida * P_OUT;
    const total = escriben * cEscribe + leen * cLee;
    const sinCache = turnos.length * ((tokCache + tokVolatil) * P_IN + tokSalida * P_OUT);

    // Mensajes por día
    const porDia = new Map();
    for (const x of turnos) {
      const k = x.t.toISOString().slice(0, 10);
      porDia.set(k, (porDia.get(k) || 0) + 1);
    }
    const serie = [...porDia.entries()].sort().map(([d, n]) => ({
      dia: d.slice(5), n,
      etiqueta: new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }),
    }));
    const diasActivos = porDia.size;

    // Distribución del largo de las conversaciones (esto explica el costo)
    const buckets = [
      { rango: '1 mensaje', n: convs.filter(c => c.n === 1).length, color: '#ef4444' },
      { rango: '2 a 3', n: convs.filter(c => c.n >= 2 && c.n <= 3).length, color: '#f59e0b' },
      { rango: '4 a 7', n: convs.filter(c => c.n >= 4 && c.n <= 7).length, color: '#3b82f6' },
      { rango: '8 o más', n: convs.filter(c => c.n >= 8).length, color: '#10b981' },
    ];

    // Uso por persona
    const porUsuario = new Map();
    for (const x of turnos) porUsuario.set(x.quien, (porUsuario.get(x.quien) || 0) + 1);
    const usuarios = [...porUsuario.entries()].sort((a, b) => b[1] - a[1]);

    const grupoEnRango = grupoMsgs.filter(m => {
      if (!m.fecha) return false;
      const d = new Date(m.fecha);
      return d >= desde && d <= hasta;
    }).length;

    const diasRango = Math.max(1, Math.round((hasta - desde) / 864e5));

    return {
      turnos: turnos.length, convs: convs.length, escriben, leen, serie, buckets, usuarios,
      diasActivos, grupoEnRango, diasRango,
      primero: turnos[0].t, ultimo: turnos[turnos.length - 1].t,
      promDia: turnos.length / Math.max(diasActivos, 1),
      largoProm: turnos.length / convs.length,
      total, porMsj: total / turnos.length, sinCache,
      cEscribe, cLee,
      ahorro: 1 - total / sinCache,
      proyMes: (total / Math.max(diasActivos, 1)) * 30,
    };
  }, [novaMsgs, grupoMsgs, desdeStr, hastaStr, usuarioSel, tokCache, tokVolatil, tokSalida]);

  const money = (n, d = 4) => `US$${n.toFixed(d)}`;

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Cargando datos de uso…</div>;

  const meta = 0.04;
  const cumple = an.porMsj <= meta;

  return (
    <div className="space-y-5 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Consumo de IA</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Uso real de NOVA y cuánto cuesta cada mensaje. Los números salen de los chats guardados.
        </p>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {[
              { l: 'Desde el 24 de julio', d: '2026-07-24', h: hoyISO() },
              { l: 'Todo el histórico', d: '2026-01-01', h: hoyISO() },
              { l: 'Últimos 7 días', d: haceISO(7), h: hoyISO() },
              { l: 'Últimos 30 días', d: haceISO(30), h: hoyISO() },
              { l: 'Este mes', d: hoyISO().slice(0, 8) + '01', h: hoyISO() },
            ].map(p => {
              const activo = desdeStr === p.d && hastaStr === p.h;
              return (
                <button key={p.l} onClick={() => { setDesdeStr(p.d); setHastaStr(p.h); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${activo ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                  {p.l}
                </button>
              );
            })}
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Desde</Label>
              <Input type="date" value={desdeStr} onChange={e => setDesdeStr(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Hasta</Label>
              <Input type="date" value={hastaStr} onChange={e => setHastaStr(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Persona</Label>
              <select value={usuarioSel} onChange={e => setUsuarioSel(e.target.value)}
                className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="todos">Todo el equipo</option>
                {todosUsuarios.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          {an.sinDatos ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              No hay mensajes de NOVA con estos filtros. Amplía el rango o cambia la persona.
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Mostrando <strong>{an.turnos}</strong> mensajes entre el{' '}
              {an.primero.toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })} y el{' '}
              {an.ultimo.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}
              {' '}· {an.diasActivos} días con actividad de {an.diasRango} del rango
              {usuarioSel !== 'todos' && <> · solo <strong>{usuarioSel}</strong></>}
            </p>
          )}
        </CardContent>
      </Card>

      {!an.sinDatos && (<>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={<MessageSquare className="w-5 h-5" />} label="Mensajes a NOVA"
          value={an.turnos} sub={`${an.promDia.toFixed(1)} por día activo`} />
        <Stat icon={<Layers className="w-5 h-5" />} label="Conversaciones"
          value={an.convs} sub={`${an.largoProm.toFixed(1)} mensajes cada una`} tone="text-violet-600" />
        <Stat icon={<DollarSign className="w-5 h-5" />} label="Costo por mensaje"
          value={money(an.porMsj)} sub={cumple ? '✅ bajo la meta de US$0,04' : `⚠️ meta: US$${meta.toFixed(2)}`}
          tone={cumple ? 'text-emerald-600' : 'text-amber-600'} />
        <Stat icon={<TrendingDown className="w-5 h-5" />} label="Proyección mensual"
          value={money(an.proyMes, 2)} sub={`ahorro del ${(an.ahorro * 100).toFixed(0)}% por el caché`} tone="text-emerald-600" />
      </div>

      {/* Explicación del mecanismo */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="w-4 h-4 text-primary" /> Por qué cuesta lo que cuesta
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            NOVA manda todo el contexto del CRM en cada mensaje. La primera vez lo <strong>escribe</strong> en
            el caché (caro); mientras sigas escribiendo dentro de la hora, lo <strong>lee</strong> (20 veces más barato).
            Por eso una conversación larga sale mucho más barata por mensaje que un mensaje suelto.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20 p-3">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">
                ESCRIBEN el caché — {an.escriben} mensajes ({((an.escriben / an.turnos) * 100).toFixed(0)}%)
              </p>
              <p className="text-2xl font-bold text-foreground">{money(an.cEscribe)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                El primero de cada conversación (tras más de 1 hora de silencio).
              </p>
            </div>
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/60 dark:bg-emerald-950/20 p-3">
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-1">
                LEEN el caché — {an.leen} mensajes ({((an.leen / an.turnos) * 100).toFixed(0)}%)
              </p>
              <p className="text-2xl font-bold text-foreground">{money(an.cLee)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Todos los que siguen dentro de la misma hora.
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Sin caché cada mensaje costaría {money(an.sinCache / an.turnos)} — el caché ya está ahorrando
            un {(an.ahorro * 100).toFixed(0)}%.
          </p>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Mensajes por día</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={an.serie}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                <XAxis dataKey="etiqueta" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip formatter={(v) => [`${v} mensajes`, '']} labelFormatter={(l) => l} />
                <Bar dataKey="n" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Largo de las conversaciones</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={an.buckets} layout="vertical" margin={{ left: 18 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="rango" tick={{ fontSize: 11 }} width={70} />
                <Tooltip formatter={(v) => [`${v} conversaciones`, '']} />
                <Bar dataKey="n" radius={[0, 4, 4, 0]}>
                  {an.buckets.map((b, i) => <Cell key={i} fill={b.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="text-xs text-muted-foreground mt-1">
              Las de <span className="text-red-500 font-medium">1 mensaje</span> son las caras: pagan el caché
              completo sin que nadie lo aproveche después.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Simulador */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Simulador: ¿qué pasa si achico el contexto?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Lo que domina el costo es cuántos tokens se escriben. Cambia los valores y mira el efecto
            sobre el costo por mensaje (arriba se recalcula todo en vivo).
          </p>
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Contexto cacheado (tokens)</Label>
              <Input type="number" value={tokCache} onChange={e => setTokCache(Number(e.target.value) || 0)} />
              <p className="text-[11px] text-muted-foreground">Hoy: 29.781 · Para bajar de US$0,04 hace falta ~18.000</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Parte volátil (tokens)</Label>
              <Input type="number" value={tokVolatil} onChange={e => setTokVolatil(Number(e.target.value) || 0)} />
              <p className="text-[11px] text-muted-foreground">Fecha, quién habla, chat del grupo</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Respuesta de NOVA (tokens)</Label>
              <Input type="number" value={tokSalida} onChange={e => setTokSalida(Number(e.target.value) || 0)} />
              <p className="text-[11px] text-muted-foreground">Promedio observado: ~160</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {[
              { l: 'Hoy (sin recortar)', c: 29781 },
              { l: '6 actas en vez de 12', c: 21800 },
              { l: '6 actas + 120 contactos', c: 18200 },
              { l: 'Contexto mínimo', c: 12000 },
            ].map(p => (
              <button key={p.l} onClick={() => setTokCache(p.c)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${tokCache === p.c ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                {p.l}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" /> Quién usa NOVA
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {an.usuarios.map(([email, n]) => (
              <div key={email} className="flex items-center justify-between text-sm">
                <span className="text-foreground truncate">{email}</span>
                <span className="text-muted-foreground flex-shrink-0 ml-2">
                  {n} <span className="text-xs">({((n / an.turnos) * 100).toFixed(0)}%)</span>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Send className="w-4 h-4 text-primary" /> Actividad del grupo de Telegram
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{an.grupoEnRango}</p>
            <p className="text-sm text-muted-foreground mt-1">
              mensajes en el grupo dentro del rango seleccionado.
            </p>
            <p className="text-xs text-muted-foreground/80 mt-2">
              Estos NO gastan API por sí solos: solo se le entregan a NOVA como contexto cuando alguien
              le escribe. Van en la parte volátil (no se cachea) porque cambian todo el tiempo.
            </p>
          </CardContent>
        </Card>
      </div>

      <p className="text-[11px] text-muted-foreground/70">
        Precios de Claude Sonnet 4.6: US$3 por millón de tokens de entrada, US$15 de salida.
        Leer del caché cuesta 0,1× y escribirlo (TTL de 1 hora) cuesta 2×. Una conversación se cuenta
        como mensajes separados por menos de {VENTANA_MIN} minutos, que es justo lo que dura el caché.
      </p>
      </>)}
    </div>
  );
}
