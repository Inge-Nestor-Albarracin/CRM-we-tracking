import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Presentation, Trash2, Link2, Upload, ExternalLink, FileText, Image as ImageIcon } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { urlArchivo } from '@/lib/wetracking';
import { useUserRole } from '@/hooks/useUserRole';

const CATEGORIAS = [
  { value: 'Comercial', label: 'Comercial' },
  { value: 'Producto', label: 'Producto' },
  { value: 'Caso_Exito', label: 'Caso de éxito' },
  { value: 'Institucional', label: 'Institucional' },
  { value: 'Propuesta', label: 'Propuesta' },
  { value: 'Otro', label: 'Otro' },
];
const CAT_COLOR = {
  Comercial: 'bg-blue-100 text-blue-700', Producto: 'bg-violet-100 text-violet-700',
  Caso_Exito: 'bg-emerald-100 text-emerald-700', Institucional: 'bg-sky-100 text-sky-700',
  Propuesta: 'bg-amber-100 text-amber-700', Otro: 'bg-gray-100 text-gray-600',
};
const catLabel = (v) => CATEGORIAS.find(c => c.value === v)?.label || v;
const VACIO = { titulo: '', categoria: 'Comercial', tipo: 'link', url: '', descripcion: '' };
const esImagen = (v) => (v.tipo_mime || '').startsWith('image/');

export default function Presentaciones() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isAdmin } = useUserRole();
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(VACIO);
  const [archivo, setArchivo] = useState(null);
  const [portada, setPortada] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const [filterCat, setFilterCat] = useState('todas');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data: items = [], isLoading } = useQuery({ queryKey: ['presentaciones'], queryFn: () => base44.entities.Presentacion.list('-created_date') });

  const guardar = useMutation({
    mutationFn: async () => {
      if (!form.titulo) throw new Error('Ponle un título a la presentación');
      let url = form.url, tipo_mime;
      if (form.tipo === 'archivo') {
        if (!archivo && !url) throw new Error('Sube el archivo (PDF o PowerPoint)');
        if (archivo) { const { file_url } = await base44.integrations.Core.UploadFile({ file: archivo }); url = file_url; tipo_mime = archivo.type || undefined; }
      } else if (!url) throw new Error('Pega el link (Canva / Google Slides)');
      let portada_url;
      if (portada) { const { file_url } = await base44.integrations.Core.UploadFile({ file: portada }); portada_url = file_url; }
      return base44.entities.Presentacion.create({ titulo: form.titulo, categoria: form.categoria, tipo: form.tipo, url, tipo_mime, portada_url, descripcion: form.descripcion || undefined, activo: true });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['presentaciones'] }); setModal(false); setForm(VACIO); setArchivo(null); setPortada(null); toast({ title: 'Presentación agregada' }); },
    onError: (err) => toast({ title: 'Error', description: err?.message || String(err), variant: 'destructive' }),
  });
  const eliminar = useMutation({
    mutationFn: (id) => base44.entities.Presentacion.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['presentaciones'] }); toast({ title: 'Presentación eliminada' }); },
  });

  // Cambiar/poner portada a una presentación YA existente.
  const portadaRef = useRef(null);
  const [portadaTargetId, setPortadaTargetId] = useState(null);
  const cambiarPortada = useMutation({
    mutationFn: async ({ id, file }) => {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      return base44.entities.Presentacion.update(id, { portada_url: file_url });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['presentaciones'] }); toast({ title: 'Portada actualizada' }); },
    onError: (err) => toast({ title: 'Error', description: err?.message || String(err), variant: 'destructive' }),
  });
  const onPortadaFile = (e) => {
    const f = e.target.files?.[0];
    if (f && portadaTargetId) cambiarPortada.mutate({ id: portadaTargetId, file: f });
    e.target.value = ''; setPortadaTargetId(null);
  };

  const visibles = items.filter(v => filterCat === 'todas' || v.categoria === filterCat);
  const esPDF = (v) => (v.tipo_mime || '').includes('pdf') || /\.pdf($|\?)/i.test(v.url || '');

  return (
    <div className="space-y-5">
      <input ref={portadaRef} type="file" accept="image/*" className="hidden" onChange={onPortadaFile} />
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Presentaciones</h1>
          <p className="text-sm text-muted-foreground mt-1">Canva/Slides (link) o PDF/PowerPoint (archivo): {items.length}. Nova puede enviarlas por Telegram.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filterCat} onValueChange={setFilterCat}>
            <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="todas">Todas las categorías</SelectItem>{CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" className="h-9" onClick={() => { setForm(VACIO); setArchivo(null); setPortada(null); setModal(true); }}><Plus className="w-4 h-4 mr-1" /> Nueva presentación</Button>
        </div>
      </div>

      {isLoading ? <div className="text-center py-12 text-muted-foreground">Cargando...</div> : visibles.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Presentation className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">No hay presentaciones. Agrega un link de Canva/Slides o sube un PDF/PowerPoint.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibles.map(v => (
            <div key={v.id} className="group bg-card border border-border/60 rounded-xl overflow-hidden hover:shadow-md transition-all">
              <a href={urlArchivo(v.url)} target="_blank" rel="noreferrer" className="relative block w-full aspect-video bg-muted flex items-center justify-center overflow-hidden">
                {v.portada_url ? (
                  <img src={v.portada_url} alt={v.titulo} className="w-full h-full object-cover" loading="lazy" />
                ) : (v.tipo === 'archivo' && esPDF(v)) ? (
                  <iframe src={`${urlArchivo(v.url)}#toolbar=0&navpanes=0&scrollbar=0&view=FitH&page=1`} title={v.titulo} loading="lazy" className="w-full h-full pointer-events-none border-0 bg-white" />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-muted-foreground group-hover:text-primary transition-colors">
                    {v.tipo === 'archivo' ? <FileText className="w-10 h-10" /> : <Presentation className="w-10 h-10" />}
                    <span className="text-[9px] uppercase font-semibold">{v.tipo === 'archivo' ? (esPDF(v) ? 'PDF' : 'PPT') : 'Canva/Slides'}</span>
                  </div>
                )}
              </a>
              <div className="p-3">
                <div className="flex items-start justify-between gap-1">
                  <p className="font-medium text-sm leading-snug line-clamp-2 flex-1" title={v.titulo}>{v.titulo}</p>
                  <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-1 hover:bg-muted rounded text-muted-foreground/60 hover:text-foreground" title="Cambiar portada" onClick={() => { setPortadaTargetId(v.id); portadaRef.current?.click(); }}><ImageIcon className="w-3.5 h-3.5" /></button>
                    {isAdmin && (<button className="p-1 hover:bg-destructive/10 hover:text-destructive rounded text-muted-foreground/50" onClick={() => { if (confirm(`¿Eliminar "${v.titulo}"?`)) eliminar.mutate(v.id); }}><Trash2 className="w-3.5 h-3.5" /></button>)}
                  </div>
                </div>
                {v.descripcion && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{v.descripcion}</p>}
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <Badge className={`text-[10px] border-transparent ${CAT_COLOR[v.categoria] || ''}`}>{catLabel(v.categoria)}</Badge>
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">{v.tipo === 'archivo' ? <><Upload className="w-2.5 h-2.5" /> Archivo</> : <><Link2 className="w-2.5 h-2.5" /> Enlace</>}</span>
                  <a href={urlArchivo(v.url)} target="_blank" rel="noreferrer" className="ml-auto text-[10px] text-primary inline-flex items-center gap-0.5 hover:underline">Abrir <ExternalLink className="w-2.5 h-2.5" /></a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nueva presentación</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5"><Label>Título *</Label><Input value={form.titulo} onChange={e => set('titulo', e.target.value)} placeholder="Presentación comercial WeTracking" /></div>
            <div className="space-y-1.5"><Label>Categoría</Label>
              <Select value={form.categoria} onValueChange={v => set('categoria', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-1.5"><Label>Fuente</Label>
              <div className="flex gap-1 bg-muted/40 rounded-xl p-1 w-fit">
                {[{ k: 'link', l: 'Link (Canva/Slides)' }, { k: 'archivo', l: 'Subir PDF/PPT' }].map(o => (
                  <button key={o.k} type="button" onClick={() => { set('tipo', o.k); setArchivo(null); }} className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${form.tipo === o.k ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{o.l}</button>
                ))}
              </div>
            </div>
            {form.tipo === 'link' ? (
              <div className="space-y-1.5"><Label>Link de la presentación</Label><Input value={form.url} onChange={e => set('url', e.target.value)} placeholder="https://www.canva.com/design/... o https://docs.google.com/presentation/..." /></div>
            ) : (
              <div className="space-y-1.5"><Label>Archivo (PDF o PowerPoint)</Label>
                <input type="file" accept=".pdf,.ppt,.pptx,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={e => { const f = e.target.files?.[0] || null; setArchivo(f); if (f && !form.titulo.trim()) set('titulo', f.name.replace(/\.[^.]+$/, '')); }} className="w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-primary file:text-primary-foreground file:text-sm" />
                {archivo && <p className="text-xs text-muted-foreground">{archivo.name} ({(archivo.size / (1024 * 1024)).toFixed(1)} MB)</p>}
                <p className="text-[11px] text-amber-600">Para que Nova lo mande por Telegram, el archivo debe pesar menos de ~20 MB. Si es más pesado, mejor súbelo a Canva/Drive y usa el link.</p>
              </div>
            )}
            <div className="space-y-1.5"><Label>Descripción (opcional)</Label><Textarea value={form.descripcion} onChange={e => set('descripcion', e.target.value)} rows={2} placeholder="De qué trata..." /></div>
            <div className="space-y-1.5">
              <Label>Portada (opcional)</Label>
              <input type="file" accept="image/*" onChange={e => setPortada(e.target.files?.[0] || null)} className="w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-primary file:text-primary-foreground file:text-sm" />
              {portada ? <p className="text-xs text-muted-foreground">{portada.name}</p> : <p className="text-[11px] text-muted-foreground">Sube una imagen de portada. Si es PDF y no subes portada, se muestra la primera página automáticamente.</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(false)}>Cancelar</Button>
            <Button onClick={() => { setSubiendo(true); guardar.mutate(undefined, { onSettled: () => setSubiendo(false) }); }} disabled={!form.titulo || guardar.isPending || subiendo}>{guardar.isPending || subiendo ? 'Guardando...' : 'Guardar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
