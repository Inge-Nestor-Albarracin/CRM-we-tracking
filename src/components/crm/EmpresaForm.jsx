import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Empresa } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Favicon } from './SelectorEmpresa';
import { useOpciones } from '@/hooks/useOpciones';
import { enviarBienvenidaEmpresa } from '@/lib/gmailAutoSend';

const ESTADOS = [
  { value: 'Prospecto', label: 'Prospecto' },
  { value: 'Cliente_Activo', label: 'Cliente activo' },
  { value: 'Cliente_Inactivo', label: 'Cliente inactivo' },
];

const VACIO = { nombre: '', dominio_web: '', sector: '', ciudad: '', pais: 'Colombia', direccion: '', telefono: '', email: '', estado: 'Prospecto', propietario: '', notas: '' };

/**
 * Modal crear/editar Empresa.
 * Props: open, onOpenChange, empresa (null = crear), onSaved(empresa)
 */
export default function EmpresaForm({ open, onOpenChange, empresa = null, onSaved }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const sectores = useOpciones('sectores');
  const [form, setForm] = useState(VACIO);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (open) setForm(empresa ? { ...VACIO, ...empresa } : VACIO);
  }, [open, empresa]);

  const guardar = useMutation({
    mutationFn: async () => {
      const datos = {
        nombre: form.nombre, dominio_web: form.dominio_web?.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, ''),
        sector: form.sector || undefined, ciudad: form.ciudad, pais: form.pais, direccion: form.direccion,
        telefono: form.telefono, email: form.email, estado: form.estado, propietario: form.propietario, notas: form.notas,
      };
      if (empresa?.id) return Empresa.update(empresa.id, datos);
      return Empresa.create(datos);
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['empresas'] });
      if (empresa?.id) qc.invalidateQueries({ queryKey: ['empresa', empresa.id] });
      toast({ title: empresa?.id ? 'Empresa actualizada' : 'Empresa creada' });
      onOpenChange(false);
      onSaved?.(res);
      // Auto-envío de bienvenida por Gmail solo al crear (si tiene email).
      if (!empresa?.id && res?.email) {
        enviarBienvenidaEmpresa(res).then(r => {
          if (r?.ok) toast({ title: 'Bienvenida enviada por Gmail', description: `A ${r.to}` });
          else toast({ title: 'No se pudo enviar la bienvenida', description: r?.error || '', variant: 'destructive' });
        }).catch(() => {});
      }
    },
    onError: (err) => toast({ title: 'Error al guardar', description: err?.message || String(err), variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{empresa?.id ? 'Editar empresa' : 'Nueva empresa'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label>Nombre *</Label>
            <Input value={form.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Bodegas del Norte SAS" />
          </div>
          <div className="space-y-1.5">
            <Label>Dominio web</Label>
            <div className="flex items-center gap-2">
              <Input value={form.dominio_web} onChange={e => set('dominio_web', e.target.value)} placeholder="empresa.com" className="flex-1" />
              <Favicon
                empresa={{ dominio_web: form.dominio_web?.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').trim() }}
                className="w-9 h-9 border border-border/40 p-0.5"
              />
            </div>
            <p className="text-xs text-muted-foreground">Con el dominio sale el logo real de la página web en todo el CRM.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Sector</Label>
              <Select value={form.sector} onValueChange={v => set('sector', v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>{sectores.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={form.estado} onValueChange={v => set('estado', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ESTADOS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Ciudad</Label>
              <Input value={form.ciudad} onChange={e => set('ciudad', e.target.value)} placeholder="Bogotá" />
            </div>
            <div className="space-y-1.5">
              <Label>País</Label>
              <Input value={form.pais} onChange={e => set('pais', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Dirección</Label>
            <Input value={form.direccion} onChange={e => set('direccion', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Teléfono</Label>
              <Input value={form.telefono} onChange={e => set('telefono', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={form.email} onChange={e => set('email', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Propietario</Label>
            <Input value={form.propietario} onChange={e => set('propietario', e.target.value)} placeholder="Ejecutivo responsable de la cuenta" />
          </div>
          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea value={form.notas} onChange={e => set('notas', e.target.value)} rows={3} />
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