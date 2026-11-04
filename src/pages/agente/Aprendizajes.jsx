import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { Sparkles, Check, X, Trash2, Lightbulb, Pencil, Rocket } from 'lucide-react';
import { promptDestilar, invocarIA, extraerJSON } from '@/lib/autoeducacion';

const CAT_COLOR = {
  humanizacion: 'bg-pink-100 text-pink-700', calificacion: 'bg-blue-100 text-blue-700',
  cierre: 'bg-emerald-100 text-emerald-700', rapidez: 'bg-amber-100 text-amber-700', general: 'bg-gray-100 text-gray-600',
};

export default function Aprendizajes() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [generando, setGenerando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [editando, setEditando] = useState(null);
  const [texto, setTexto] = useState('');

  const { data: aprendizajes = [] } = useQuery({ queryKey: ['aprendizajes'], queryFn: () => base44.entities.Aprendizaje.list('-fecha') });
  const { data: evaluaciones = [] } = useQuery({ queryKey: ['evaluaciones'], queryFn: () => base44.entities.EvaluacionChat.list('-fecha') });
  const { data: cfgAgente = [] } = useQuery({ queryKey: ['config-agente'], queryFn: () => base44.entities.ConfigAgente.list() });
  const config = cfgAgente[0];

  const pendientes = aprendizajes.filter(a => a.estado === 'pendiente');
  const aprobados = aprendizajes.filter(a => a.estado === 'aprobada');

  async function generar() {
    if (evaluaciones.length === 0) { toast({ title: 'Primero evalúa conversaciones en Autoeducación' }); return; }
    setGenerando(true);
    try {
      const lecciones = [], errores = [];
      for (const ev of evaluaciones) { (ev.lecciones || []).forEach(l => l && lecciones.push(l)); (ev.errores || []).forEach(e => e && errores.push(e)); }
      const existentes = aprendizajes.map(a => a.regla).filter(Boolean);
      const txt = await invocarIA(promptDestilar({ lecciones, errores, existentes }));
      const parsed = extraerJSON(txt) || { reglas: [] };
      const norm = s => s.toLowerCase().replace(/\s+/g, ' ').trim();
      const yaSet = new Set(existentes.map(norm));
      let creadas = 0;
      for (const r of (parsed.reglas || []).slice(0, 12)) {
        const regla = String(r.regla || '').trim();
        if (!regla || yaSet.has(norm(regla))) continue;
        await base44.entities.Aprendizaje.create({ regla: regla.slice(0, 500), categoria: String(r.categoria || 'general'), estado: 'pendiente', soporte: evaluaciones.length, fecha: new Date().toISOString() });
        yaSet.add(norm(regla)); creadas++;
      }
      qc.invalidateQueries({ queryKey: ['aprendizajes'] });
      toast({ title: `${creadas} regla(s) nuevas propuestas` });
    } catch (err) {
      toast({ title: 'Error al generar', description: err?.message || String(err), variant: 'destructive' });
    }
    setGenerando(false);
  }

  async function aplicar() {
    setAplicando(true);
    try {
      const bloque = aprobados.map(a => `- ${a.regla}`).join('\n');
      if (config?.id) await base44.entities.ConfigAgente.update(config.id, { aprendizajes: bloque });
      else await base44.entities.ConfigAgente.create({ aprendizajes: bloque });
      qc.invalidateQueries({ queryKey: ['config-agente'] });
      toast({ title: `Aplicado a Emma (${aprobados.length} reglas)`, description: 'Ya se inyectan en su prompt.' });
    } catch (err) { toast({ title: 'Error al aplicar', description: err?.message || String(err), variant: 'destructive' }); }
    setAplicando(false);
  }

  const cambiar = useMutation({ mutationFn: ({ id, estado }) => base44.entities.Aprendizaje.update(id, { estado }), onSuccess: () => qc.invalidateQueries({ queryKey: ['aprendizajes'] }) });
  const editarRegla = useMutation({ mutationFn: ({ id, regla }) => base44.entities.Aprendizaje.update(id, { regla }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['aprendizajes'] }); setEditando(null); } });
  const borrar = useMutation({ mutationFn: (id) => base44.entities.Aprendizaje.delete(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['aprendizajes'] }) });

  const aplicadoBloque = config?.aprendizajes || '';
  const desactualizado = aprobados.map(a => `- ${a.regla}`).join('\n') !== aplicadoBloque;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Lightbulb className="w-6 h-6 text-amber-500" /> Aprendizajes
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Convierte las lecciones de las evaluaciones en reglas que Emma sigue. Genera → aprueba → aplica.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="h-9" disabled={generando} onClick={generar}>
            <Sparkles className={`w-4 h-4 mr-1 ${generando ? 'animate-pulse' : ''}`} /> {generando ? 'Generando...' : 'Generar aprendizajes'}
          </Button>
          <Button size="sm" className="h-9" disabled={aplicando || aprobados.length === 0} onClick={aplicar}>
            <Rocket className={`w-4 h-4 mr-1 ${aplicando ? 'animate-pulse' : ''}`} /> {aplicando ? 'Aplicando...' : 'Aplicar a Emma'}
          </Button>
        </div>
      </div>

      {/* Pendientes por aprobar */}
      <section>
        <h2 className="text-base font-semibold flex items-center gap-2 mb-2">
          <Lightbulb className="w-4 h-4 text-amber-500" /> Reglas propuestas por aprobar
          {pendientes.length > 0 && <Badge className="bg-amber-100 text-amber-700 border-transparent">{pendientes.length}</Badge>}
        </h2>
        {pendientes.length === 0 ? (
          <p className="text-sm text-muted-foreground bg-card border border-border/40 rounded-xl p-4">Nada pendiente. Dale "Generar aprendizajes" para proponer reglas desde las evaluaciones.</p>
        ) : (
          <div className="space-y-2">
            {pendientes.map(a => (
              <div key={a.id} className="bg-card border border-amber-500/30 rounded-xl p-4">
                {editando === a.id ? (
                  <div className="space-y-2">
                    <Textarea value={texto} onChange={e => setTexto(e.target.value)} rows={2} />
                    <div className="flex gap-2"><Button size="sm" onClick={() => editarRegla.mutate({ id: a.id, regla: texto })}>Guardar</Button><Button size="sm" variant="ghost" onClick={() => setEditando(null)}>Cancelar</Button></div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1"><p className="text-sm">{a.regla}</p><Badge className={`mt-1.5 text-[10px] border-transparent ${CAT_COLOR[a.categoria] || CAT_COLOR.general}`}>{a.categoria || 'general'}</Badge></div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700" onClick={() => cambiar.mutate({ id: a.id, estado: 'aprobada' })}><Check className="w-3.5 h-3.5 mr-1" /> Aprobar</Button>
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => { setEditando(a.id); setTexto(a.regla); }}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="h-8 text-muted-foreground hover:text-destructive" onClick={() => cambiar.mutate({ id: a.id, estado: 'rechazada' })}><X className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Reglas aprobadas */}
      <section>
        <h2 className="text-base font-semibold flex items-center gap-2 mb-2">
          <Check className="w-4 h-4 text-emerald-600" /> Reglas aprobadas
          {aprobados.length > 0 && <Badge className="bg-emerald-100 text-emerald-700 border-transparent">{aprobados.length}</Badge>}
          {desactualizado && aprobados.length > 0 && <Badge className="bg-amber-100 text-amber-700 border-transparent">Sin aplicar — dale "Aplicar a Emma"</Badge>}
        </h2>
        {aprobados.length === 0 ? (
          <p className="text-sm text-muted-foreground bg-card border border-border/40 rounded-xl p-4">Aprueba reglas arriba. Luego "Aplicar a Emma" las inyecta a su prompt.</p>
        ) : (
          <div className="bg-card border border-border/40 rounded-xl divide-y divide-border/30">
            {aprobados.map(a => (
              <div key={a.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                <div className="flex-1"><p className="text-sm">{a.regla}</p><Badge className={`mt-1 text-[10px] border-transparent ${CAT_COLOR[a.categoria] || CAT_COLOR.general}`}>{a.categoria || 'general'}</Badge></div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => cambiar.mutate({ id: a.id, estado: 'rechazada' })}>Quitar</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-muted-foreground hover:text-destructive" onClick={() => borrar.mutate(a.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Lo aplicado ahora en Emma */}
      <section>
        <h2 className="text-base font-semibold flex items-center gap-2 mb-2"><Rocket className="w-4 h-4 text-primary" /> Lo que Emma tiene aplicado ahora</h2>
        {aplicadoBloque ? (
          <pre className="text-[13px] whitespace-pre-wrap bg-muted/30 border border-border/40 rounded-xl p-4 text-foreground">{aplicadoBloque}</pre>
        ) : (
          <p className="text-sm text-muted-foreground bg-card border border-border/40 rounded-xl p-4">Emma aún no tiene aprendizajes aplicados. Aprueba reglas y dale "Aplicar a Emma".</p>
        )}
      </section>
    </div>
  );
}
