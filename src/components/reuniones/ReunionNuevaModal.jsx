import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ReunionNota, base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Sparkles } from 'lucide-react';

function hoyISO() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Modal para pegar notas de reunión manualmente.
 * Sube el texto crudo via UploadFile, crea la ReunionNota y dispara el procesamiento IA.
 */
export default function ReunionNuevaModal({ open, onOpenChange }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [titulo, setTitulo] = useState('');
  const [fecha, setFecha] = useState(hoyISO());
  const [texto, setTexto] = useState('');
  const [fase, setFase] = useState(''); // '' | 'subiendo' | 'procesando'

  const crear = useMutation({
    mutationFn: async () => {
      // 1. Subir texto crudo (límite de campo string en Base44 → file storage)
      setFase('subiendo');
      const blob = new Blob([texto], { type: 'application/octet-stream' });
      const file = new File([blob], `reunion-${Date.now()}.txt`, { type: 'application/octet-stream' });
      const up = await base44.integrations.Core.UploadFile({ file });
      const contenido_url = up?.file_url;
      if (!contenido_url) throw new Error('No se pudo subir el contenido (UploadFile sin file_url)');

      // 2. Crear la nota
      const nota = await ReunionNota.create({
        titulo,
        fecha_reunion: fecha || undefined,
        origen: 'Manual',
        contenido_url,
        extracto: texto.slice(0, 800),
        estado_procesamiento: 'Pendiente',
      });

      // 3. Procesar con IA
      setFase('procesando');
      try {
        await base44.functions.invoke('procesarReunion', { reunion_nota_id: nota.id });
      } catch (err) {
        // La nota queda Pendiente/Error y se puede reprocesar desde la lista
        console.error('Procesamiento IA falló:', err);
      }
      return nota;
    },
    onSuccess: (nota) => {
      qc.invalidateQueries({ queryKey: ['reuniones'] });
      qc.invalidateQueries({ queryKey: ['tareas-global'] });
      toast({ title: 'Nota de reunión creada' });
      onOpenChange(false);
      setTitulo(''); setTexto(''); setFecha(hoyISO()); setFase('');
      navigate(`/crm/reuniones/${nota.id}`);
    },
    onError: (err) => {
      setFase('');
      toast({ title: 'Error al crear la nota', description: err?.message || String(err), variant: 'destructive' });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!crear.isPending) onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva nota de reunión</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Título *</Label>
              <Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ej: Comité Comercial 14 julio / Reunión Bodegas del Norte" />
            </div>
            <div className="space-y-1.5">
              <Label>Fecha</Label>
              <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notas de la reunión *</Label>
            <Textarea
              value={texto}
              onChange={e => setTexto(e.target.value)}
              rows={14}
              className="font-mono text-xs"
              placeholder="Pega aquí las notas completas de la reunión (de Google Meet, Gemini, apuntes propios...).&#10;&#10;La IA extraerá automáticamente: resumen, decisiones, tareas con responsables, y vinculará las empresas y contactos mencionados."
            />
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Al guardar, la IA procesa las notas y crea las tareas automáticamente.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={crear.isPending}>Cancelar</Button>
          <Button onClick={() => crear.mutate()} disabled={!titulo.trim() || !texto.trim() || crear.isPending}>
            {fase === 'subiendo' ? 'Subiendo...' : fase === 'procesando' ? 'Procesando con IA...' : 'Guardar y procesar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
