import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Oportunidad, Empresa } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Upload } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import OportunidadKanban from '@/components/crm/OportunidadKanban';
import OportunidadForm from '@/components/crm/OportunidadForm';
import ImportarOportunidadesModal from '@/components/crm/ImportarOportunidadesModal';

export default function Pipeline() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [importarOpen, setImportarOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [perdidaPendiente, setPerdidaPendiente] = useState(null); // oportunidad esperando motivo
  const [motivoPerdida, setMotivoPerdida] = useState('');
  const [filtroResponsable, setFiltroResponsable] = useState('todos');

  const { data: oportunidades = [], isLoading } = useQuery({
    queryKey: ['oportunidades'],
    queryFn: () => Oportunidad.list('-updated_date'),
  });

  const { data: empresas = [] } = useQuery({
    queryKey: ['empresas'],
    queryFn: () => Empresa.list(),
  });

  const empresasById = useMemo(() => Object.fromEntries(empresas.map(e => [e.id, e])), [empresas]);

  const responsables = useMemo(
    () => [...new Set(oportunidades.map(o => o.responsable).filter(Boolean))],
    [oportunidades]
  );

  const visibles = filtroResponsable === 'todos'
    ? oportunidades
    : oportunidades.filter(o => o.responsable === filtroResponsable);

  const mover = useMutation({
    mutationFn: ({ id, data }) => Oportunidad.update(id, data),
    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey: ['oportunidades'] });
      const prev = qc.getQueryData(['oportunidades']);
      qc.setQueryData(['oportunidades'], (old = []) => old.map(o => o.id === id ? { ...o, ...data } : o));
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['oportunidades'], ctx.prev);
      toast({ title: 'Error al mover', description: err?.message || String(err), variant: 'destructive' });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['oportunidades'] }),
  });

  function handleMove(op, nuevaEtapa) {
    if (nuevaEtapa === 'Cierre_Perdido') {
      setPerdidaPendiente(op);
      setMotivoPerdida('');
      return;
    }
    const data = { etapa: nuevaEtapa };
    if (nuevaEtapa === 'Cierre_Ganado') data.fecha_cierre_real = new Date().toISOString().split('T')[0];
    mover.mutate({ id: op.id, data });
  }

  function confirmarPerdida() {
    mover.mutate({
      id: perdidaPendiente.id,
      data: { etapa: 'Cierre_Perdido', motivo_perdida: motivoPerdida, fecha_cierre_real: new Date().toISOString().split('T')[0] },
    });
    setPerdidaPendiente(null);
    setMotivoPerdida('');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight">Pipeline</h1>
          <p className="text-sm text-muted-foreground">Oportunidades de negocio — arrastra las tarjetas entre etapas</p>
        </div>
        <div className="flex items-center gap-2">
          {responsables.length > 0 && (
            <Select value={filtroResponsable} onValueChange={setFiltroResponsable}>
              <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los comerciales</SelectItem>
                {responsables.map(r => <SelectItem key={r} value={r}>{r.split('@')[0]}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button size="sm" variant="outline" className="h-9" onClick={() => setImportarOpen(true)}>
            <Upload className="w-4 h-4 mr-1" /> Importar CSV
          </Button>
          <Button size="sm" className="h-9" onClick={() => { setEditando(null); setFormOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Nueva oportunidad
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <OportunidadKanban
          oportunidades={visibles}
          empresasById={empresasById}
          onMove={handleMove}
          onEdit={(op) => { setEditando(op); setFormOpen(true); }}
        />
      )}

      <OportunidadForm
        open={formOpen}
        onOpenChange={setFormOpen}
        oportunidad={editando}
      />

      <ImportarOportunidadesModal open={importarOpen} onOpenChange={setImportarOpen} />

      {/* Modal motivo de pérdida */}
      <Dialog open={!!perdidaPendiente} onOpenChange={(o) => !o && setPerdidaPendiente(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Marcar como perdida</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-1">
            <p className="text-sm text-muted-foreground">
              {perdidaPendiente?.nombre} — {empresasById[perdidaPendiente?.empresa_id]?.nombre}
            </p>
            <Label>Motivo de pérdida</Label>
            <Textarea
              value={motivoPerdida}
              onChange={e => setMotivoPerdida(e.target.value)}
              rows={3}
              placeholder="Precio, se fue con competencia, proyecto cancelado..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPerdidaPendiente(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmarPerdida} disabled={!motivoPerdida.trim()}>
              Confirmar pérdida
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
