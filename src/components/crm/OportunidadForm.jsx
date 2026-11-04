import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Oportunidad, Contacto } from '@/api/base44Client';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import SelectorEmpresa from './SelectorEmpresa';
import { ETAPAS_OPORTUNIDAD } from './OportunidadKanban';

const TIPOS_SOLUCION = ['Activos', 'Inventarios', 'Locativos', 'Otro'];

const VACIO = {
  nombre: '', empresa_id: '', etapa: 'Visita_Inicial', valor_estimado: '', moneda: 'COP',
  tipo_solucion: '', contacto_id: '', responsable: '', fecha_cierre_estimada: '', origen: '', descripcion: '',
};

/**
 * Modal crear/editar Oportunidad.
 * Props: open, onOpenChange, oportunidad (null = crear), empresaFija (empresa_id para preseleccionar), onSaved
 */
export default function OportunidadForm({ open, onOpenChange, oportunidad = null, empresaFija = '', onSaved }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState(VACIO);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (open) {
      if (oportunidad) setForm({ ...VACIO, ...oportunidad, valor_estimado: oportunidad.valor_estimado ?? '' });
      else setForm({ ...VACIO, empresa_id: empresaFija || '' });
    }
  }, [open, oportunidad, empresaFija]);

  const { data: contactos = [] } = useQuery({
    queryKey: ['contactos'],
    queryFn: () => Contacto.list(),
    enabled: open,
  });

  const { data: usuarios = [] } = useQuery({
    queryKey: ['usuarios'],
    queryFn: () => base44.entities.User.list(),
    enabled: open,
  });

  const contactosDeEmpresa = form.empresa_id
    ? contactos.filter(c => c.empresa_id === form.empresa_id)
    : contactos;

  const guardar = useMutation({
    mutationFn: async () => {
      const datos = {
        nombre: form.nombre,
        empresa_id: form.empresa_id || undefined,
        etapa: form.etapa,
        valor_estimado: form.valor_estimado ? Number(form.valor_estimado) : undefined,
        moneda: form.moneda,
        tipo_solucion: form.tipo_solucion || undefined,
        contacto_id: form.contacto_id || undefined,
        responsable: form.responsable || undefined,
        fecha_cierre_estimada: form.fecha_cierre_estimada || undefined,
        origen: form.origen || undefined,
        descripcion: form.descripcion || undefined,
      };
      if (oportunidad?.id) return Oportunidad.update(oportunidad.id, datos);
      return Oportunidad.create(datos);
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['oportunidades'] });
      toast({ title: oportunidad?.id ? 'Oportunidad actualizada' : 'Oportunidad creada' });
      onOpenChange(false);
      onSaved?.(res);
    },
    onError: (err) => toast({ title: 'Error al guardar', description: err?.message || String(err), variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{oportunidad?.id ? 'Editar oportunidad' : 'Nueva oportunidad'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label>Nombre del negocio *</Label>
            <Input value={form.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Ej: RFID bodega Funza" />
          </div>
          <div className="space-y-1.5">
            <Label>Empresa</Label>
            <SelectorEmpresa value={form.empresa_id} onChange={(id) => set('empresa_id', id)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Valor estimado</Label>
              <Input type="number" value={form.valor_estimado} onChange={e => set('valor_estimado', e.target.value)} placeholder="45000000" />
            </div>
            <div className="space-y-1.5">
              <Label>Moneda</Label>
              <Select value={form.moneda} onValueChange={v => set('moneda', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="COP">COP</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo de solución</Label>
              <Select value={form.tipo_solucion} onValueChange={v => set('tipo_solucion', v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>{TIPOS_SOLUCION.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Etapa</Label>
              <Select value={form.etapa} onValueChange={v => set('etapa', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ETAPAS_OPORTUNIDAD.map(e => <SelectItem key={e.key} value={e.key}>{e.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Contacto principal</Label>
            <Select value={form.contacto_id} onValueChange={v => set('contacto_id', v)}>
              <SelectTrigger><SelectValue placeholder="Seleccionar contacto..." /></SelectTrigger>
              <SelectContent>
                {contactosDeEmpresa.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.nombre}{c.empresa ? ` — ${c.empresa}` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.empresa_id && contactosDeEmpresa.length === 0 && (
              <p className="text-xs text-muted-foreground">Esta empresa no tiene contactos vinculados aún.</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Responsable</Label>
              <Select value={form.responsable} onValueChange={v => set('responsable', v)}>
                <SelectTrigger><SelectValue placeholder="Comercial..." /></SelectTrigger>
                <SelectContent>
                  {usuarios.map(u => <SelectItem key={u.email} value={u.email}>{u.full_name || u.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cierre estimado</Label>
              <Input type="date" value={form.fecha_cierre_estimada} onChange={e => set('fecha_cierre_estimada', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Origen</Label>
            <Select value={form.origen} onValueChange={v => set('origen', v)}>
              <SelectTrigger><SelectValue placeholder="¿De dónde salió?" /></SelectTrigger>
              <SelectContent>
                {['WhatsApp', 'Referido', 'Web', 'Evento', 'Frio', 'Otro'].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Textarea value={form.descripcion} onChange={e => set('descripcion', e.target.value)} rows={3} placeholder="Alcance, necesidad, contexto..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => guardar.mutate()} disabled={!form.nombre || guardar.isPending}>
            {guardar.isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
