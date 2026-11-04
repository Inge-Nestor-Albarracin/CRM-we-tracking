import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlantillaEmail } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Send } from 'lucide-react';
import EmailBuilder, { htmlToBlocks } from '@/components/email/EmailBuilder';
import { useToast } from '@/components/ui/use-toast';
import { base44 } from '@/api/base44Client';

const CATEGORIAS = ['Prospeccion', 'Follow-up', 'Propuesta', 'Informativo'];
const EJEMPLO = { nombre: 'Carlos Ramirez', empresa: 'Bodegas del Norte', sector: 'Bodegas', ciudad: 'Bogota', cargo: 'Gerente de Operaciones' };

const COLOR_CAT = {
  Prospeccion: 'bg-blue-100 text-blue-700',
  'Follow-up': 'bg-yellow-100 text-yellow-700',
  Propuesta: 'bg-purple-100 text-purple-700',
  Informativo: 'bg-gray-100 text-gray-700',
};

function previsualizarHTML(html, datos) {
  return html
    .replace(/\{\{nombre\}\}/gi, datos.nombre)
    .replace(/\{\{empresa\}\}/gi, datos.empresa)
    .replace(/\{\{sector\}\}/gi, datos.sector)
    .replace(/\{\{ciudad\}\}/gi, datos.ciudad)
    .replace(/\{\{cargo\}\}/gi, datos.cargo);
}

const VACIO = { nombre: '', asunto: '', cuerpo_html: '', variables: [], categoria: 'Prospeccion', activo: true };

export default function Plantillas() {
  const qc = useQueryClient();
  const fileInputRef = useRef(null);
  const { toast } = useToast();

  const [modal, setModal] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [pruebaData, setPruebaData] = useState(null); // { plantilla_id?, cuerpo_html?, asunto }
  const [emailPrueba, setEmailPrueba] = useState('ms@grouptso.com');
  const [enviandoPrueba, setEnviandoPrueba] = useState(false);
  const [form, setForm] = useState(VACIO);
  const [editId, setEditId] = useState(null);
  const [previewTarget, setPreviewTarget] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [modo, setModo] = useState('constructor'); // 'constructor' | 'html'

  const { data: plantillas = [], isLoading } = useQuery({
    queryKey: ['plantillas-email'],
    queryFn: () => PlantillaEmail.list(),
  });

  const crear = useMutation({
    mutationFn: (data) => PlantillaEmail.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plantillas-email'] });
      setModal(null);
      setForm(VACIO);
      toast({ title: 'Plantilla guardada' });
    },
    onError: (err) => {
      console.error('Error creando plantilla:', err);
      toast({ title: 'Error al guardar', description: err?.message || String(err), variant: 'destructive' });
    },
  });

  const actualizar = useMutation({
    mutationFn: ({ id, data }) => PlantillaEmail.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plantillas-email'] });
      setModal(null);
      toast({ title: 'Plantilla actualizada' });
    },
    onError: (err) => {
      console.error('Error actualizando plantilla:', err);
      toast({ title: 'Error al guardar', description: err?.message || String(err), variant: 'destructive' });
    },
  });

  const eliminar = useMutation({
    mutationFn: (id) => PlantillaEmail.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plantillas-email'] }),
    onError: (err) => toast({ title: 'Error al eliminar', description: err?.message || String(err), variant: 'destructive' }),
  });

  async function abrirPreview(p) {
    let cuerpo_html = p.cuerpo_html || '';
    if (!cuerpo_html && p.cuerpo_html_url) {
      setPreviewLoading(true);
      setModal('preview');
      try {
        const res = await base44.functions.invoke('getPlantillaHtml', { id: p.id });
        cuerpo_html = res.data?.html || '';
      } catch (err) {
        toast({ title: 'No se pudo cargar el HTML', description: err?.message || 'Error al obtener la plantilla', variant: 'destructive' });
      } finally {
        setPreviewLoading(false);
      }
    }
    setPreviewTarget({ ...p, cuerpo_html });
    setModal('preview');
  }

  function abrirCrear() {
    setForm(VACIO);
    setEditId(null);
    setModo('constructor');
    setModal('crear');
  }

  async function abrirEditar(p) {
    let cuerpo_html = p.cuerpo_html || '';
    if (!cuerpo_html && p.cuerpo_html_url) {
      try {
        const res = await base44.functions.invoke('getPlantillaHtml', { id: p.id });
        cuerpo_html = res.data?.html || '';
      } catch (err) {
        toast({ title: 'No se pudo cargar el HTML', description: err?.message || 'Error al obtener la plantilla', variant: 'destructive' });
      }
    }
    setForm({ nombre: p.nombre, asunto: p.asunto, cuerpo_html, variables: p.variables || [], categoria: p.categoria || 'Prospeccion', activo: p.activo !== false });
    setEditId(p.id);
    setModo(htmlToBlocks(cuerpo_html) ? 'constructor' : 'html');
    setModal('editar');
  }

  function cambiarModo(nuevoModo) {
    if (nuevoModo === 'constructor' && form.cuerpo_html && !htmlToBlocks(form.cuerpo_html)) {
      if (!window.confirm('El HTML actual no fue creado con el constructor. Al cambiar al modo constructor se perderá el HTML actual. ¿Continuar?')) return;
      setForm(f => ({ ...f, cuerpo_html: '' }));
    }
    setModo(nuevoModo);
  }

  function importarHTML(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result || '';
      setForm(f => ({ ...f, cuerpo_html: content }));
      setModo(htmlToBlocks(content) ? 'constructor' : 'html');
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function guardar() {
    // Campos base sin cuerpo_html
    const base = { nombre: form.nombre, asunto: form.asunto, categoria: form.categoria, activo: form.activo, variables: form.variables || [] };

    if (form.cuerpo_html) {
      setUploading(true);
      let url;
      try {
        const blob = new Blob([form.cuerpo_html], { type: 'application/octet-stream' });
        const file = new File([blob], `email-${Date.now()}.bin`, { type: 'application/octet-stream' });
        const result = await base44.integrations.Core.UploadFile({ file });
        url = result?.file_url;
        if (!url) throw new Error('UploadFile no devolvió file_url — resultado: ' + JSON.stringify(result));
      } catch (uploadErr) {
        setUploading(false);
        toast({ title: 'Fallo en UploadFile', description: String(uploadErr?.message || uploadErr).slice(0, 200), variant: 'destructive' });
        return;
      }
      setUploading(false);
      // cuerpo_html: '' fuerza el PUT a limpiar cualquier valor grande previo
      const datos = { ...base, cuerpo_html: '', cuerpo_html_url: url };
      if (modal === 'crear') crear.mutate(datos);
      else actualizar.mutate({ id: editId, data: datos });
    } else {
      if (modal === 'crear') crear.mutate(base);
      else actualizar.mutate({ id: editId, data: base });
    }
  }

  async function enviarPrueba() {
    if (!emailPrueba) return;
    setEnviandoPrueba(true);
    try {
      const payload = { modo: 'prueba', email: emailPrueba, asunto: pruebaData.asunto };
      if (pruebaData.plantilla_id) payload.plantilla_id = pruebaData.plantilla_id;
      if (pruebaData.cuerpo_html) payload.cuerpo_html = pruebaData.cuerpo_html;
      const res = await base44.functions.invoke('sendEmail', payload);
      // El SDK unwrapea response.data, así que res ya es el body directo
      const resultados = res?.resultados ?? [];
      const primerError = resultados[0]?.error;
      if (resultados.length > 0 && !resultados[0]?.ok) {
        toast({ title: 'Email no enviado', description: primerError || 'El proveedor rechazó el envío.', variant: 'destructive' });
      } else {
        toast({ title: 'Prueba enviada', description: `Revisa ${emailPrueba}` });
        setPruebaData(null);
      }
    } catch (err) {
      toast({ title: 'Error al enviar prueba', description: err?.message || String(err), variant: 'destructive' });
    }
    setEnviandoPrueba(false);
  }

  const esPendiente = crear.isPending || actualizar.isPending || uploading;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Plantillas de email</h1>
          <p className="text-muted-foreground text-sm mt-1">Crea y gestiona las plantillas para tus campanas</p>
        </div>
        <Button onClick={abrirCrear}>
          <Plus className="w-4 h-4 mr-2" /> Nueva plantilla
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Cargando...</p>
      ) : plantillas.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg mb-2">No hay plantillas todavia</p>
          <p className="text-sm">Crea una plantilla para empezar a enviar campanas</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {plantillas.map((p) => (
            <div key={p.id} className="border rounded-lg p-4 flex items-start justify-between gap-4 bg-card">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium">{p.nombre}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${COLOR_CAT[p.categoria] || 'bg-gray-100 text-gray-700'}`}>{p.categoria}</span>
                  {p.activo === false && <Badge variant="outline" className="text-xs">Inactiva</Badge>}
                  {htmlToBlocks(p.cuerpo_html) && <span className="text-xs text-muted-foreground">Constructor</span>}
                </div>
                <p className="text-sm text-muted-foreground truncate">{p.asunto}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0 text-sm">
                <button className="text-muted-foreground hover:text-foreground" onClick={() => abrirPreview(p)}>Ver</button>
                <button className="text-muted-foreground hover:text-foreground" onClick={() => abrirEditar(p)}>Editar</button>
                <button className="text-blue-600 hover:text-blue-800" onClick={() => setPruebaData({ plantilla_id: p.id, asunto: p.asunto, cuerpo_html: p.cuerpo_html || '', tieneHtml: !!(p.cuerpo_html || p.cuerpo_html_url) })}>Prueba</button>
                <button className="text-destructive hover:text-destructive/80" onClick={() => eliminar.mutate(p.id)}>Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal crear/editar */}
      <Dialog open={modal === 'crear' || modal === 'editar'} onOpenChange={(open) => !open && setModal(null)}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-0">
          {/* Header sticky */}
          <div className="sticky top-0 z-10 bg-background px-6 pt-5 pb-3 border-b">
            <div className="flex items-center justify-between">
              <DialogTitle>{modal === 'crear' ? 'Nueva plantilla' : 'Editar plantilla'}</DialogTitle>
              <div className="flex items-center gap-2">
                <input ref={fileInputRef} type="file" accept=".html,.htm" className="hidden" onChange={importarHTML} />
                <button type="button" onClick={() => fileInputRef.current?.click()} className="text-xs text-muted-foreground hover:text-foreground border rounded px-2 py-1">
                  Importar HTML
                </button>
                <div className="flex border rounded overflow-hidden text-xs">
                  <button type="button" onClick={() => cambiarModo('constructor')} className={`px-3 py-1 ${modo === 'constructor' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>Constructor</button>
                  <button type="button" onClick={() => cambiarModo('html')} className={`px-3 py-1 ${modo === 'html' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>HTML</button>
                </div>
              </div>
            </div>
          </div>

          {/* Cuerpo del form */}
          <div className="px-6 py-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Nombre</Label>
                <Input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Propuesta inicial RFID" />
              </div>
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select value={form.categoria} onValueChange={v => setForm(f => ({ ...f, categoria: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Asunto</Label>
              <Input value={form.asunto} onChange={e => setForm(f => ({ ...f, asunto: e.target.value }))} placeholder="Ej: {{nombre}}, te contamos cómo WeTracking puede ayudarte" />
              <p className="text-xs text-muted-foreground">Variables: {'{{nombre}} {{empresa}} {{sector}} {{ciudad}} {{cargo}}'}</p>
            </div>
            <div className="space-y-1.5">
              <Label>Cuerpo del email</Label>
              {modo === 'constructor'
                ? <EmailBuilder
                    key={editId || 'nuevo'}
                    value={form.cuerpo_html}
                    onChange={html => setForm(f => ({ ...f, cuerpo_html: html }))}
                  />
                : <div className="space-y-1">
                    <Textarea
                      value={form.cuerpo_html}
                      onChange={e => setForm(f => ({ ...f, cuerpo_html: e.target.value }))}
                      rows={14}
                      className="font-mono text-xs"
                      placeholder="<p>Hola {{nombre}},</p><p>...</p>"
                    />
                    <p className="text-xs text-muted-foreground">El pixel de tracking se inyecta automáticamente al enviar.</p>
                  </div>
              }
            </div>
          </div>

          {/* Footer sticky */}
          <div className="sticky bottom-0 bg-background px-6 py-4 border-t flex items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              {!form.nombre && <span className="text-destructive">Falta: Nombre · </span>}
              {!form.asunto && <span className="text-destructive">Falta: Asunto</span>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setModal(null)}>Cancelar</Button>
              <Button variant="outline" onClick={() => { setPreviewTarget({ ...form }); setModal('preview'); }}>
                Previsualizar
              </Button>
              <Button variant="outline" onClick={() => setPruebaData({ cuerpo_html: form.cuerpo_html, asunto: form.asunto })} disabled={!form.cuerpo_html || !form.asunto}>
                <Send className="w-3.5 h-3.5 mr-1.5" />Enviar prueba
              </Button>
              <Button onClick={guardar} disabled={!form.nombre || !form.asunto || esPendiente}>
                {uploading ? 'Subiendo HTML...' : esPendiente ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal preview */}
      <Dialog open={modal === 'preview'} onOpenChange={open => !open && setModal(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Previsualizar — datos de ejemplo</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-3">
            {previewLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                <div className="w-5 h-5 border-2 border-muted border-t-primary rounded-full animate-spin mr-2" />
                Cargando HTML...
              </div>
            ) : previewTarget && (
              <>
                <div className="text-sm">
                  <span className="text-muted-foreground">Asunto: </span>
                  <span className="font-medium">{previsualizarHTML(previewTarget.asunto || '', EJEMPLO)}</span>
                </div>
                <div className="border rounded p-4 bg-white text-black text-sm overflow-x-auto" dangerouslySetInnerHTML={{ __html: previsualizarHTML(previewTarget.cuerpo_html || '', EJEMPLO) }} />
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal correo de prueba */}
      <Dialog open={!!pruebaData} onOpenChange={open => !open && setPruebaData(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Correo de prueba</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {pruebaData && pruebaData.plantilla_id && !pruebaData.tieneHtml && !pruebaData.cuerpo_html && (
              <div className="rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2 text-xs text-yellow-800">
                Esta plantilla no tiene cuerpo HTML guardado. Editala, agrega el cuerpo y usa "Enviar prueba" desde el modal de edicion.
              </div>
            )}
            <p className="text-sm text-muted-foreground">Se envía con datos de ejemplo (Carlos Ramirez / Bodegas del Norte).</p>
            <div className="space-y-1.5">
              <Label>Email destino</Label>
              <Input
                type="email"
                value={emailPrueba}
                onChange={e => setEmailPrueba(e.target.value)}
                placeholder="tu@email.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPruebaData(null)}>Cancelar</Button>
            <Button onClick={enviarPrueba} disabled={!emailPrueba || enviandoPrueba || (pruebaData?.plantilla_id && !pruebaData?.tieneHtml && !pruebaData?.cuerpo_html)}>
              <Send className="w-3.5 h-3.5 mr-1.5" />
              {enviandoPrueba ? 'Enviando...' : 'Enviar prueba'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}