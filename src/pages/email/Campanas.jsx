import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Campana, PlantillaEmail, Segmento, Contacto, Empresa, base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Send, Clock } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { destinatariosDeSegmento } from '@/lib/segmentos';

const ESTADO_COLOR = {
  Borrador: 'bg-muted text-muted-foreground',
  Programada: 'bg-amber-100 text-amber-700',
  Enviando: 'bg-blue-100 text-blue-700',
  Enviada: 'bg-green-100 text-green-700',
  Pausada: 'bg-orange-100 text-orange-700',
};

const PASO_VACIO = { nombre: '', plantilla_id: '', asunto: '', segmento_id: '', envio: 'ahora', fecha_programada: '' };

function tasa(num, total) {
  if (!total) return '0%';
  return `${Math.round((num / total) * 100)}%`;
}

export default function Campanas() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [modal, setModal] = useState(false);
  const [paso, setPaso] = useState(1);
  const [form, setForm] = useState(PASO_VACIO);
  const [enviando, setEnviando] = useState(null);

  const { data: campanas = [], isLoading } = useQuery({ queryKey: ['campanas'], queryFn: () => Campana.list('-fecha_creacion') });
  const { data: plantillas = [] } = useQuery({ queryKey: ['plantillas-email'], queryFn: () => PlantillaEmail.list() });
  const { data: segmentos = [] } = useQuery({ queryKey: ['segmentos'], queryFn: () => Segmento.list('-updated_date') });
  const { data: contactos = [] } = useQuery({ queryKey: ['contactos'], queryFn: () => Contacto.list() });
  const { data: empresas = [] } = useQuery({ queryKey: ['empresas'], queryFn: () => Empresa.list() });

  const segmentosById = useMemo(() => Object.fromEntries(segmentos.map(s => [s.id, s])), [segmentos]);

  const crear = useMutation({
    mutationFn: (data) => Campana.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campanas'] }),
  });

  function abrirModal() { setForm(PASO_VACIO); setPaso(1); setModal(true); }
  const plantilla = plantillas.find(p => p.id === form.plantilla_id);
  const segmento = segmentosById[form.segmento_id];

  const countSegmento = useMemo(
    () => destinatariosDeSegmento(segmento || null, contactos, empresas).length,
    [segmento, contactos, empresas]
  );

  async function enviarCampana(camp) {
    setEnviando(camp.id);
    try {
      const res = await base44.functions.invoke('sendEmail', { modo: 'campana', campana_id: camp.id, asunto: camp.asunto, plantilla_id: camp.plantilla_id });
      const msg = res?.mensaje || res?.data?.mensaje;
      toast({ title: 'Campaña enviada', description: msg });
      qc.invalidateQueries({ queryKey: ['campanas'] });
    } catch (err) {
      toast({ title: 'Error al enviar', description: err?.message || String(err), variant: 'destructive' });
    }
    setEnviando(null);
  }

  async function confirmar() {
    const base = {
      nombre: form.nombre,
      asunto: form.asunto || plantilla?.asunto || '',
      plantilla_id: form.plantilla_id,
      segmento_id: form.segmento_id || null,
      total_enviados: 0, total_abiertos: 0, total_respondidos: 0, total_rebotados: 0,
    };
    if (form.envio === 'programar' && form.fecha_programada) {
      await crear.mutateAsync({ ...base, estado: 'Programada', fecha_programada: new Date(form.fecha_programada).toISOString() });
      toast({ title: 'Campaña programada', description: `Se enviará el ${new Date(form.fecha_programada).toLocaleString('es-CO')}` });
      setModal(false);
    } else {
      const camp = await crear.mutateAsync({ ...base, estado: 'Borrador' });
      setModal(false);
      await enviarCampana(camp);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campañas de email</h1>
          <p className="text-muted-foreground text-sm mt-1">Envía a un segmento de contactos, ahora o programado</p>
        </div>
        <Button onClick={abrirModal}><Plus className="w-4 h-4 mr-1" /> Nueva campaña</Button>
      </div>

      {segmentos.length === 0 && (
        <div className="mb-4 text-sm bg-muted/40 border rounded-lg px-4 py-3">
          Primero creá un <Link to="/email/segmentos" className="font-medium underline">segmento</Link> para elegir a quién enviar. Podés usar varios criterios (etapa, sector, fecha...).
        </div>
      )}

      {isLoading ? (
        <p className="text-muted-foreground">Cargando...</p>
      ) : campanas.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg mb-2">No hay campañas todavía</p>
          <p className="text-sm">Crea tu primera campaña para empezar a enviar emails</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-3 pr-4 font-medium">Campaña</th>
                <th className="text-left py-3 pr-4 font-medium">Segmento</th>
                <th className="text-left py-3 pr-4 font-medium">Estado</th>
                <th className="text-right py-3 pr-4 font-medium">Enviados</th>
                <th className="text-right py-3 pr-4 font-medium">Abiertos</th>
                <th className="text-right py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {campanas.map((c) => (
                <tr key={c.id} className="border-b hover:bg-muted/30">
                  <td className="py-3 pr-4">
                    <div className="font-medium">{c.nombre}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-xs">{c.asunto}</div>
                    {c.estado === 'Programada' && c.fecha_programada && (
                      <div className="text-xs text-amber-600 flex items-center gap-1 mt-0.5"><Clock className="w-3 h-3" />{new Date(c.fecha_programada).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">{segmentosById[c.segmento_id]?.nombre || (c.segmento ? 'Filtro legacy' : 'Todos')}</td>
                  <td className="py-3 pr-4">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${ESTADO_COLOR[c.estado] || 'bg-muted text-muted-foreground'}`}>{c.estado}</span>
                  </td>
                  <td className="py-3 pr-4 text-right">{c.total_enviados || 0}</td>
                  <td className="py-3 pr-4 text-right">
                    {c.total_abiertos || 0}
                    {c.total_enviados > 0 && <span className="text-muted-foreground ml-1">({tasa(c.total_abiertos, c.total_enviados)})</span>}
                  </td>
                  <td className="py-3 text-right">
                    {(c.estado === 'Borrador' || c.estado === 'Programada') && (
                      <Button size="sm" variant="outline" onClick={() => enviarCampana(c)} disabled={enviando === c.id}>
                        {enviando === c.id ? 'Enviando...' : c.estado === 'Programada' ? 'Enviar ya' : 'Enviar'}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal nueva campaña */}
      <Dialog open={modal} onOpenChange={(open) => !open && setModal(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nueva campaña — Paso {paso} de 3</DialogTitle></DialogHeader>

          {paso === 1 && (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Nombre de la campaña</Label>
                <Input value={form.nombre} onChange={(e) => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Prospección Oil & Energy julio" />
              </div>
              <div className="space-y-1.5">
                <Label>Segmento de destinatarios</Label>
                <Select value={form.segmento_id} onValueChange={(v) => setForm(f => ({ ...f, segmento_id: v === 'todos' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Elegir segmento..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los contactos con email</SelectItem>
                    {segmentos.map(s => <SelectItem key={s.id} value={s.id}>{s.nombre} — {s.tipo === 'empresa' ? 'empresa' : 'contacto'}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="flex items-center justify-between bg-muted/40 rounded-lg px-3 py-2 mt-1">
                  <span className="text-xs text-muted-foreground">Destinatarios</span>
                  <span className="text-sm font-semibold">{countSegmento}</span>
                </div>
                <p className="text-xs text-muted-foreground">¿Necesitas otro segmento? <Link to="/email/segmentos" className="underline">Crearlo</Link></p>
              </div>
            </div>
          )}

          {paso === 2 && (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Plantilla</Label>
                <Select value={form.plantilla_id} onValueChange={(v) => { const p = plantillas.find(p => p.id === v); setForm(f => ({ ...f, plantilla_id: v, asunto: p?.asunto || '' })); }}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar plantilla..." /></SelectTrigger>
                  <SelectContent>
                    {plantillas.filter(p => p.activo !== false).map(p => <SelectItem key={p.id} value={p.id}>{p.nombre} — {p.categoria}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {plantilla && (
                <div className="space-y-1.5">
                  <Label>Asunto <span className="text-muted-foreground font-normal">(puedes personalizarlo)</span></Label>
                  <Input value={form.asunto} onChange={(e) => setForm(f => ({ ...f, asunto: e.target.value }))} />
                </div>
              )}
            </div>
          )}

          {paso === 3 && plantilla && (
            <div className="space-y-3 py-2">
              <div className="rounded-lg border p-3 bg-muted/30 text-sm space-y-1">
                <div><span className="text-muted-foreground">Campaña:</span> <span className="font-medium">{form.nombre}</span></div>
                <div><span className="text-muted-foreground">Segmento:</span> {segmento?.nombre || 'Todos los contactos con email'} ({countSegmento} destinatarios)</div>
                <div><span className="text-muted-foreground">Plantilla:</span> {plantilla.nombre}</div>
                <div><span className="text-muted-foreground">Asunto:</span> {form.asunto}</div>
              </div>

              <div className="space-y-2">
                <Label>¿Cuándo enviar?</Label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setForm(f => ({ ...f, envio: 'ahora' }))} className={`flex-1 border rounded-lg px-3 py-2 text-sm ${form.envio === 'ahora' ? 'border-primary bg-primary/5 font-medium' : 'hover:bg-muted'}`}>Enviar ahora</button>
                  <button type="button" onClick={() => setForm(f => ({ ...f, envio: 'programar' }))} className={`flex-1 border rounded-lg px-3 py-2 text-sm ${form.envio === 'programar' ? 'border-primary bg-primary/5 font-medium' : 'hover:bg-muted'}`}>Programar</button>
                </div>
                {form.envio === 'programar' && (
                  <Input type="datetime-local" value={form.fecha_programada} onChange={(e) => setForm(f => ({ ...f, fecha_programada: e.target.value }))} />
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                {form.envio === 'programar'
                  ? 'La campaña quedará programada y se enviará automáticamente a la fecha indicada (requiere el cron de campañas programadas activo).'
                  : 'Los emails se enviarán inmediatamente a los contactos del segmento que tengan email.'}
              </p>
            </div>
          )}

          <DialogFooter className="gap-2">
            {paso > 1 && <Button variant="outline" onClick={() => setPaso(p => p - 1)}>Atrás</Button>}
            <Button variant="outline" onClick={() => setModal(false)}>Cancelar</Button>
            {paso < 3 ? (
              <Button onClick={() => setPaso(p => p + 1)} disabled={paso === 1 ? !form.nombre : paso === 2 ? !form.plantilla_id : false}>Siguiente</Button>
            ) : (
              <Button onClick={confirmar} disabled={crear.isPending || (form.envio === 'programar' && !form.fecha_programada)}>
                <Send className="w-4 h-4 mr-2" />
                {crear.isPending ? 'Guardando...' : form.envio === 'programar' ? 'Programar' : 'Confirmar y enviar'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
