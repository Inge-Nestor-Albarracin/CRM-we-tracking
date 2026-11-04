import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { SlidersHorizontal, Save, RotateCcw } from 'lucide-react';
import { DEFAULT_EVAL, cfgEval } from '@/lib/autoeducacion';

export default function ConfigEvaluadorPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: lista = [], isLoading } = useQuery({ queryKey: ['config-evaluador'], queryFn: () => base44.entities.ConfigEvaluador.list() });
  const rec = lista[0];
  const [form, setForm] = useState(DEFAULT_EVAL);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => { setForm(cfgEval(rec)); }, [rec]);

  const guardar = useMutation({
    mutationFn: async () => {
      const datos = { ...form, pausa_ms: Number(form.pausa_ms) || 300 };
      if (rec?.id) return base44.entities.ConfigEvaluador.update(rec.id, datos);
      return base44.entities.ConfigEvaluador.create(datos);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['config-evaluador'] }); toast({ title: 'Criterios del juez guardados', description: 'Aplican en la próxima corrida de "Evaluar".' }); },
    onError: (err) => toast({ title: 'Error', description: err?.message || String(err), variant: 'destructive' }),
  });

  const Campo = ({ k, label, rows = 3, hint }) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {hint && <p className="text-[11px] text-muted-foreground -mt-1">{hint}</p>}
      <Textarea value={form[k] || ''} onChange={e => set(k, e.target.value)} rows={rows} />
    </div>
  );

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
          <SlidersHorizontal className="w-6 h-6 text-primary" /> Config Evaluador
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Los criterios con los que el juez califica a Emma. Mejora al profesor para mejorar a la estudiante. Aplica en la próxima corrida de "Evaluar".</p>
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">Cargando...</p> : (
        <div className="bg-card border border-border/50 rounded-xl p-5 space-y-4">
          <Campo k="como_trabaja" label="Cómo debe trabajar Emma" rows={8} hint="Las reglas contra las que el juez la compara." />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Campo k="crit_calificacion" label="Criterio: Calificación" />
            <Campo k="crit_humanizacion" label="Criterio: Humanización" />
            <Campo k="crit_rapidez" label="Criterio: Rapidez" />
            <Campo k="crit_cierre" label="Criterio: Cierre" />
          </div>
          <Campo k="instrucciones_juez" label="Instrucciones extra para el juez" rows={4} hint="El tono del profesor (severidad, cómo puntuar)." />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Modelo del juez</Label>
              <Input value={form.modelo || ''} onChange={e => set('modelo', e.target.value)} placeholder="claude_opus_4_8" />
              <p className="text-[11px] text-muted-foreground">Opus (más potente que la Sonnet de Emma) para que el juez sea más exigente.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Pausa entre chats (ms)</Label>
              <Input type="number" value={form.pausa_ms} onChange={e => set('pausa_ms', e.target.value)} placeholder="300" />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button onClick={() => guardar.mutate()} disabled={guardar.isPending}><Save className="w-4 h-4 mr-1" /> {guardar.isPending ? 'Guardando...' : 'Guardar criterios'}</Button>
            <Button variant="outline" onClick={() => setForm(DEFAULT_EVAL)}><RotateCcw className="w-4 h-4 mr-1" /> Restablecer por defecto</Button>
          </div>
        </div>
      )}
    </div>
  );
}
