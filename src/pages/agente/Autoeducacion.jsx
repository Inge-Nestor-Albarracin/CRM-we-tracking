import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { GraduationCap, Gauge, ChevronDown, ChevronRight, Check, AlertTriangle, Lightbulb, Trash2 } from 'lucide-react';
import { construirTranscripcion, promptJuez, invocarIA, extraerJSON, catalogoTexto, cfgEval } from '@/lib/autoeducacion';

function scoreColor(n) { return n >= 80 ? 'text-emerald-600' : n >= 60 ? 'text-amber-600' : 'text-red-600'; }
function Barra({ label, valor }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-muted-foreground w-24">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${valor >= 80 ? 'bg-emerald-500' : valor >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${Math.max(0, Math.min(100, valor))}%` }} />
      </div>
      <span className={`text-[11px] font-semibold w-8 text-right ${scoreColor(valor)}`}>{valor}</span>
    </div>
  );
}

function NotaJuez({ nota }) {
  const cfg = {
    error: { cls: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-300', Icon: AlertTriangle },
    bien: { cls: 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300', Icon: Check },
    mejora: { cls: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300', Icon: Lightbulb },
  };
  const { cls, Icon } = cfg[nota.tipo] || cfg.mejora;
  return (
    <div className={`rounded-xl border p-2.5 text-[11.5px] leading-snug flex gap-1.5 ${cls}`}>
      <Icon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /><span>{nota.comentario}</span>
    </div>
  );
}

function TranscriptAnotado({ transcripcion, anotaciones }) {
  const notasPorMsg = useMemo(() => { const m = {}; (anotaciones || []).forEach(a => { (m[a.msg] = m[a.msg] || []).push(a); }); return m; }, [anotaciones]);
  const lineas = useMemo(() => String(transcripcion || '').split('\n').map(l => {
    const mt = l.match(/^\[(\d+)\]\s*(Emma|Cliente):\s*([\s\S]*)$/);
    return mt ? { n: Number(mt[1]), quien: mt[2], texto: mt[3] } : null;
  }).filter(Boolean), [transcripcion]);
  if (lineas.length === 0) return <pre className="whitespace-pre-wrap text-[11px] text-muted-foreground">{transcripcion}</pre>;
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground italic">La conversación a la izquierda; los comentarios del juez, anclados a cada mensaje, al lado.</p>
      {lineas.map((ln, i) => {
        const esEmma = ln.quien === 'Emma';
        const notas = notasPorMsg[ln.n] || [];
        if (!esEmma) return (
          <div key={i} className="flex">
            <div className="max-w-[55%] bg-muted text-foreground rounded-2xl rounded-tl-sm px-3 py-2 text-[13px] leading-snug">
              <span className="block text-[9px] opacity-60 mb-0.5">[{ln.n}] Lead</span>{ln.texto}
            </div>
          </div>
        );
        return (
          <div key={i} className="flex items-start gap-3">
            <div className="w-[7%] flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-3 py-2 text-[13px] leading-snug">
                <span className="block text-[9px] opacity-70 mb-0.5">[{ln.n}] Emma</span>{ln.texto}
              </div>
            </div>
            <div className="w-[38%] flex-shrink-0 space-y-1.5">{notas.map((a, j) => <NotaJuez key={j} nota={a} />)}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function Autoeducacion() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [expandida, setExpandida] = useState(null);
  const [prog, setProg] = useState(null); // { actual, total, nombre }

  const { data: evaluaciones = [] } = useQuery({ queryKey: ['evaluaciones'], queryFn: () => base44.entities.EvaluacionChat.list('-fecha') });

  const promedio = useMemo(() => evaluaciones.length ? Math.round(evaluaciones.reduce((s, e) => s + (Number(e.score_global) || 0), 0) / evaluaciones.length) : 0, [evaluaciones]);
  const promDim = useMemo(() => {
    if (!evaluaciones.length) return { calificacion: 0, humanizacion: 0, rapidez: 0, cierre: 0 };
    const avg = (k) => Math.round(evaluaciones.reduce((s, e) => s + (Number(e[k]) || 0), 0) / evaluaciones.length);
    return { calificacion: avg('score_calificacion'), humanizacion: avg('score_humanizacion'), rapidez: avg('score_rapidez'), cierre: avg('score_cierre') };
  }, [evaluaciones]);

  async function evaluar(todos) {
    setProg({ actual: 0, total: 0, nombre: '' });
    try {
      const [notasRaw, cfgEvalRec, productos, evalsPrev] = await Promise.all([
        base44.entities.Nota.list('-fecha_nota'),
        base44.entities.ConfigEvaluador.list(),
        base44.entities.Producto.list(),
        base44.entities.EvaluacionChat.list(),
      ]);
      const cfg = cfgEval(cfgEvalRec[0]);
      const catalogo = catalogoTexto(productos);

      // Chats con conversación real
      const chats = notasRaw.map(n => { try { return { n, e: JSON.parse(n.texto) }; } catch { return null; } })
        .filter(x => x && Array.isArray(x.e?.historial) && x.e.historial.filter(m => m.role === 'assistant').length >= 2);

      // Si "borrar todo y reevaluar", borra las evaluaciones previas
      if (todos) {
        for (const ev of evalsPrev) { try { await base44.entities.EvaluacionChat.delete(ev.id); } catch { /* */ } }
      }
      const yaEval = new Set(todos ? [] : evalsPrev.map(ev => ev.cliente_id));
      const objetivo = chats.filter(c => !yaEval.has(c.e.datos?.telefono || c.n.cliente_id));

      if (objetivo.length === 0) { setProg(null); toast({ title: todos ? 'No hay conversaciones' : 'Nada nuevo por evaluar' }); return; }
      setProg({ actual: 0, total: objetivo.length, nombre: '' });

      let hechas = 0;
      for (const c of objetivo) {
        const nombre = c.e.datos?.nombre || c.n.cliente_id || 'Lead';
        setProg({ actual: hechas + 1, total: objetivo.length, nombre });
        try {
          const transcripcion = construirTranscripcion(c.e.historial);
          const txt = await invocarIA(promptJuez({ transcripcion, cfg, catalogo, campana: '' }), cfg.modelo);
          const ev = extraerJSON(txt);
          if (ev) {
            await base44.entities.EvaluacionChat.create({
              cliente_id: c.e.datos?.telefono || c.n.cliente_id || '',
              contacto_nombre: c.e.datos?.nombre || '',
              fecha: new Date().toISOString(),
              score_global: Number(ev.score_global) || 0,
              score_calificacion: Number(ev.scores?.calificacion) || 0,
              score_humanizacion: Number(ev.scores?.humanizacion) || 0,
              score_rapidez: Number(ev.scores?.rapidez) || 0,
              score_cierre: Number(ev.scores?.cierre) || 0,
              veredicto: String(ev.veredicto || '').slice(0, 1000),
              fortalezas: (ev.fortalezas || []).map(String),
              errores: (ev.errores || []).map(String),
              lecciones: (ev.lecciones || []).map(String),
              anotaciones: (ev.anotaciones || []).map(a => ({ msg: Number(a.msg) || 0, tipo: String(a.tipo || 'mejora'), comentario: String(a.comentario || '') })),
              transcripcion: transcripcion.slice(0, 12000),
              num_mensajes: c.e.historial.length,
            });
          }
        } catch (err) { console.error('Eval error', err); }
        hechas++;
        if (cfg.pausa_ms) await new Promise(r => setTimeout(r, cfg.pausa_ms));
      }
      qc.invalidateQueries({ queryKey: ['evaluaciones'] });
      toast({ title: `Evaluación lista (${hechas} chats)`, description: `Promedio actualizado` });
    } catch (err) {
      toast({ title: 'Error al evaluar', description: err?.message || String(err), variant: 'destructive' });
    }
    setProg(null);
  }

  const ocupado = prog !== null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-primary" /> Autoeducación
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Paso MEDIR: un juez (Opus) evalúa cada conversación de Emma como un gerente comercial exigente.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" className="h-9" disabled={ocupado} onClick={() => evaluar(false)}>
            <Gauge className={`w-4 h-4 mr-1 ${ocupado ? 'animate-pulse' : ''}`} /> Evaluar conversaciones
          </Button>
          <Button size="sm" variant="outline" className="h-9 text-destructive border-destructive/30 hover:bg-destructive/5" disabled={ocupado}
            onClick={() => { if (window.confirm('¿Borrar TODAS las evaluaciones y rehacerlas desde cero?')) evaluar(true); }}>
            <Trash2 className="w-4 h-4 mr-1" /> Borrar todo y reevaluar
          </Button>
        </div>
      </div>

      {/* Barra de progreso */}
      {prog && (
        <div className="bg-card border border-primary/30 rounded-xl p-4">
          <p className="text-sm font-medium flex items-center justify-between">
            <span>Evaluando a <span className="text-primary">{prog.nombre}</span></span>
            <span className="text-muted-foreground">{prog.actual}/{prog.total || '?'}</span>
          </p>
          <div className="h-2 rounded-full bg-muted overflow-hidden mt-2">
            <div className="h-full bg-primary transition-all" style={{ width: `${prog.total ? (prog.actual / prog.total) * 100 : 5}%` }} />
          </div>
        </div>
      )}

      {/* Marcadores */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card border border-border/50 rounded-xl p-5">
          <p className="text-xs text-muted-foreground">Puntaje promedio ({evaluaciones.length} evaluaciones)</p>
          <p className={`text-4xl font-bold ${scoreColor(promedio)}`}>{promedio}<span className="text-lg text-muted-foreground">/100</span></p>
        </div>
        <div className="bg-card border border-border/50 rounded-xl p-5 space-y-2">
          <p className="text-xs text-muted-foreground mb-1">Por dimensión</p>
          <Barra label="Calificación" valor={promDim.calificacion} />
          <Barra label="Humanización" valor={promDim.humanizacion} />
          <Barra label="Rapidez" valor={promDim.rapidez} />
          <Barra label="Cierre" valor={promDim.cierre} />
        </div>
      </div>

      {/* Evaluaciones */}
      <section>
        <h2 className="text-base font-semibold flex items-center gap-2 mb-2"><Gauge className="w-4 h-4 text-primary" /> Evaluaciones</h2>
        {evaluaciones.length === 0 ? (
          <p className="text-sm text-muted-foreground bg-card border border-border/40 rounded-xl p-4">Sin evaluaciones. Ten unas conversaciones con Emma y dale "Evaluar conversaciones".</p>
        ) : (
          <div className="space-y-2">
            {evaluaciones.map(e => {
              const abierta = expandida === e.id;
              return (
                <div key={e.id} className="bg-card border border-border/40 rounded-xl overflow-hidden">
                  <button className="w-full flex items-center gap-3 px-4 py-3 text-left" onClick={() => setExpandida(abierta ? null : e.id)}>
                    {abierta ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    <span className={`text-lg font-bold ${scoreColor(e.score_global)}`}>{e.score_global}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {e.contacto_nombre || e.cliente_id || 'Lead'}
                        {e.contacto_nombre && e.cliente_id && <span className="text-[11px] font-normal text-muted-foreground ml-1.5">· {e.cliente_id}</span>}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{e.veredicto}</p>
                    </div>
                    <span className="text-[11px] text-muted-foreground flex-shrink-0">{e.num_mensajes || 0} msgs</span>
                  </button>
                  {abierta && (
                    <div className="px-4 pb-4 pt-1 border-t border-border/30 space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2">
                        <Barra label="Calificación" valor={e.score_calificacion || 0} />
                        <Barra label="Humanización" valor={e.score_humanizacion || 0} />
                        <Barra label="Rapidez" valor={e.score_rapidez || 0} />
                        <Barra label="Cierre" valor={e.score_cierre || 0} />
                      </div>
                      {(e.fortalezas || []).length > 0 && <div><p className="text-xs font-semibold text-emerald-600 mb-1">Fortalezas</p><ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">{e.fortalezas.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
                      {(e.errores || []).length > 0 && <div><p className="text-xs font-semibold text-red-600 mb-1">Errores</p><ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">{e.errores.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
                      {e.transcripcion && (
                        <div>
                          <p className="text-xs font-semibold text-foreground mb-2">Revisión chat por chat</p>
                          <div className="bg-muted/20 rounded-lg p-3 max-h-[28rem] overflow-y-auto">
                            <TranscriptAnotado transcripcion={e.transcripcion} anotaciones={e.anotaciones} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
