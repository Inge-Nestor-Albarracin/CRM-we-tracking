import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Radar, Sparkles } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useUserRole } from '@/hooks/useUserRole';

const VACIO = { escenario: '', condiciones: '', sector: '', tag_recomendado: '', por_que: '' };

export default function GuiaTags() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isAdmin } = useUserRole();
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(VACIO);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data: guias = [], isLoading } = useQuery({
    queryKey: ['guia-tags'],
    queryFn: () => base44.entities.GuiaTag.list('-created_date'),
  });

  const guardar = useMutation({
    mutationFn: async () => {
      if (!form.escenario || !form.tag_recomendado) throw new Error('Escenario y tag recomendado son obligatorios');
      const datos = {
        escenario: form.escenario, condiciones: form.condiciones || undefined, sector: form.sector || undefined,
        tag_recomendado: form.tag_recomendado, por_que: form.por_que || undefined, activo: true,
      };
      if (editando?.id) return base44.entities.GuiaTag.update(editando.id, datos);
      return base44.entities.GuiaTag.create(datos);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['guia-tags'] });
      setModal(false); setForm(VACIO); setEditando(null);
      toast({ title: editando?.id ? 'Escenario actualizado' : 'Escenario agregado' });
    },
    onError: (err) => toast({ title: 'Error', description: err?.message || String(err), variant: 'destructive' }),
  });

  const eliminar = useMutation({
    mutationFn: (id) => base44.entities.GuiaTag.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['guia-tags'] }); toast({ title: 'Escenario eliminado' }); },
    onError: (err) => toast({ title: 'Error al eliminar', description: err?.message || String(err), variant: 'destructive' }),
  });

  function abrir(g) {
    if (g) { setEditando(g); setForm({ escenario: g.escenario || '', condiciones: g.condiciones || '', sector: g.sector || '', tag_recomendado: g.tag_recomendado || '', por_que: g.por_que || '' }); }
    else { setEditando(null); setForm(VACIO); }
    setModal(true);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Guía de tags</h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            Escenarios de selección que Nova usa para recomendar el tag adecuado. {guias.length} escenario{guias.length !== 1 ? 's' : ''}.
          </p>
        </div>
        <Button size="sm" className="h-9" onClick={() => abrir(null)}>
          <Plus className="w-4 h-4 mr-1" /> Nuevo escenario
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando...</div>
      ) : guias.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Radar className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">Sin escenarios todavía.</p>
          <p className="text-xs mt-1">Ej: "Activos metálicos a la intemperie → Tag UHF on-metal, porque resiste agua y lee sobre metal".</p>
        </div>
      ) : (
        <div className="space-y-2">
          {guias.map(g => (
            <div key={g.id} className="group bg-card border border-border/50 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Radar className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{g.escenario}</span>
                    {g.sector && <span className="text-[10px] bg-muted text-muted-foreground rounded-full px-2 py-0.5">{g.sector}</span>}
                  </div>
                  {g.condiciones && <p className="text-xs text-muted-foreground mt-1"><span className="font-medium text-foreground">Condiciones:</span> {g.condiciones}</p>}
                  <p className="text-xs mt-1"><span className="font-medium text-primary">→ Recomendado:</span> {g.tag_recomendado}</p>
                  {g.por_que && <p className="text-xs text-muted-foreground mt-1"><span className="font-medium text-foreground">Por qué:</span> {g.por_que}</p>}
                </div>
                <div className="flex opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button className="p-1.5 hover:bg-muted rounded text-muted-foreground" onClick={() => abrir(g)}><Pencil className="w-3.5 h-3.5" /></button>
                  {isAdmin && (<button className="p-1.5 hover:bg-destructive/10 hover:text-destructive rounded text-muted-foreground" onClick={() => { if (confirm(`¿Eliminar "${g.escenario}"?`)) eliminar.mutate(g.id); }}><Trash2 className="w-3.5 h-3.5" /></button>)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editando ? 'Editar escenario' : 'Nuevo escenario'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>Escenario / necesidad *</Label>
              <Input value={form.escenario} onChange={e => set('escenario', e.target.value)} placeholder="Activos metálicos a la intemperie" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Condiciones</Label>
                <Input value={form.condiciones} onChange={e => set('condiciones', e.target.value)} placeholder="metal, exterior, agua, alta temp" />
              </div>
              <div className="space-y-1.5">
                <Label>Sector (opcional)</Label>
                <Input value={form.sector} onChange={e => set('sector', e.target.value)} placeholder="Bodegas, clubes, industria..." />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Tag / producto recomendado *</Label>
              <Input value={form.tag_recomendado} onChange={e => set('tag_recomendado', e.target.value)} placeholder="Tag UHF on-metal RTECK" />
            </div>
            <div className="space-y-1.5">
              <Label>Por qué</Label>
              <Textarea value={form.por_que} onChange={e => set('por_que', e.target.value)} rows={2} placeholder="Resiste intemperie, lee sobre metal, largo alcance..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(false)}>Cancelar</Button>
            <Button onClick={() => guardar.mutate()} disabled={!form.escenario || !form.tag_recomendado || guardar.isPending}>
              {guardar.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
