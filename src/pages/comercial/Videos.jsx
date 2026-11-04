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
import { Plus, Video as VideoIcon, Trash2, Play, Link2, Upload, X, ExternalLink, Image as ImageIcon } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { urlArchivo } from '@/lib/wetracking';
import { useUserRole } from '@/hooks/useUserRole';

const CATEGORIAS = [
  { value: 'Redes', label: 'Redes' },
  { value: 'Caso_Exito', label: 'Caso de éxito' },
  { value: 'Informativo', label: 'Informativo' },
  { value: 'Producto', label: 'Producto' },
  { value: 'Otro', label: 'Otro' },
];
const CAT_COLOR = {
  Redes: 'bg-pink-100 text-pink-700',
  Caso_Exito: 'bg-emerald-100 text-emerald-700',
  Informativo: 'bg-blue-100 text-blue-700',
  Producto: 'bg-violet-100 text-violet-700',
  Otro: 'bg-gray-100 text-gray-600',
};
const catLabel = (v) => CATEGORIAS.find(c => c.value === v)?.label || v;

// Thumbnail automático de YouTube a partir del link.
function youtubeThumb(url) {
  const m = String(url || '').match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` : '';
}
// Portada a mostrar: la subida manualmente, o el thumbnail de YouTube si es un link.
const portadaDe = (v) => v.portada_url || (v.tipo === 'link' ? youtubeThumb(v.url) : '');

const VACIO = { titulo: '', categoria: 'Informativo', tipo: 'link', url: '', descripcion: '' };

export default function Videos() {
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

  const { data: videos = [], isLoading } = useQuery({
    queryKey: ['videos'],
    queryFn: () => base44.entities.Video.list('-created_date'),
  });

  const guardar = useMutation({
    mutationFn: async () => {
      if (!form.titulo) throw new Error('Ponle un título al video');
      let url = form.url;
      let tipo_mime;
      if (form.tipo === 'archivo') {
        if (!archivo && !url) throw new Error('Sube el archivo de video');
        if (archivo) {
          const { file_url } = await base44.integrations.Core.UploadFile({ file: archivo });
          url = file_url;
          tipo_mime = archivo.type || 'video/mp4';
        }
      } else if (!url) {
        throw new Error('Pega el link del video (YouTube/Drive)');
      }
      let portada_url;
      if (portada) { const { file_url } = await base44.integrations.Core.UploadFile({ file: portada }); portada_url = file_url; }
      return base44.entities.Video.create({
        titulo: form.titulo, categoria: form.categoria, tipo: form.tipo, url,
        tipo_mime, portada_url, descripcion: form.descripcion || undefined, activo: true,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['videos'] });
      setModal(false); setForm(VACIO); setArchivo(null); setPortada(null);
      toast({ title: 'Video agregado' });
    },
    onError: (err) => toast({ title: 'Error', description: err?.message || String(err), variant: 'destructive' }),
  });

  const eliminar = useMutation({
    mutationFn: (id) => base44.entities.Video.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['videos'] }); toast({ title: 'Video eliminado' }); },
    onError: (err) => toast({ title: 'Error al eliminar', description: err?.message || String(err), variant: 'destructive' }),
  });

  // Cambiar/poner portada a un video YA existente (sube imagen -> actualiza portada_url).
  const portadaRef = useRef(null);
  const [portadaTargetId, setPortadaTargetId] = useState(null);
  const cambiarPortada = useMutation({
    mutationFn: async ({ id, file }) => {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      return base44.entities.Video.update(id, { portada_url: file_url });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['videos'] }); toast({ title: 'Portada actualizada' }); },
    onError: (err) => toast({ title: 'Error', description: err?.message || String(err), variant: 'destructive' }),
  });
  const onPortadaFile = (e) => {
    const f = e.target.files?.[0];
    if (f && portadaTargetId) cambiarPortada.mutate({ id: portadaTargetId, file: f });
    e.target.value = ''; setPortadaTargetId(null);
  };

  const visibles = videos.filter(v => filterCat === 'todas' || v.categoria === filterCat);

  return (
    <div className="space-y-5">
      <input ref={portadaRef} type="file" accept="image/*" className="hidden" onChange={onPortadaFile} />
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Videos</h1>
          <p className="text-sm text-muted-foreground mt-1">Biblioteca de videos: {videos.length}. Nova puede enviarlos por Telegram.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filterCat} onValueChange={setFilterCat}>
            <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las categorías</SelectItem>
              {CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-9" onClick={() => { setForm(VACIO); setArchivo(null); setPortada(null); setModal(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Nuevo video
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando...</div>
      ) : visibles.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <VideoIcon className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">No hay videos todavía. Agrega un link de YouTube/Drive o sube un mp4.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibles.map(v => (
            <div key={v.id} className="group bg-card border border-border/60 rounded-xl overflow-hidden hover:shadow-md transition-all">
              <a href={urlArchivo(v.url)} target="_blank" rel="noreferrer" className="relative block w-full aspect-video bg-muted flex items-center justify-center overflow-hidden">
                {portadaDe(v)
                  ? <img src={portadaDe(v)} alt={v.titulo} className="w-full h-full object-cover" loading="lazy" />
                  : (v.tipo === 'archivo' && (v.tipo_mime || '').startsWith('video/'))
                    ? <video src={v.url} className="w-full h-full object-cover" muted />
                    : <div className="flex flex-col items-center gap-1 text-muted-foreground"><Play className="w-10 h-10" /></div>}
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
                  <Play className="w-10 h-10 text-white/0 group-hover:text-white/90 transition-colors" />
                </span>
              </a>
              <div className="p-3">
                <div className="flex items-start justify-between gap-1">
                  <p className="font-medium text-sm leading-snug line-clamp-2 flex-1" title={v.titulo}>{v.titulo}</p>
                  <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-1 hover:bg-muted rounded text-muted-foreground/60 hover:text-foreground" title="Cambiar portada"
                      onClick={() => { setPortadaTargetId(v.id); portadaRef.current?.click(); }}>
                      <ImageIcon className="w-3.5 h-3.5" />
                    </button>
                    {isAdmin && (
                    <button className="p-1 hover:bg-destructive/10 hover:text-destructive rounded text-muted-foreground/50"
                      onClick={() => { if (confirm(`¿Eliminar "${v.titulo}"?`)) eliminar.mutate(v.id); }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    )}
                  </div>
                </div>
                {v.descripcion && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{v.descripcion}</p>}
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <Badge className={`text-[10px] border-transparent ${CAT_COLOR[v.categoria] || ''}`}>{catLabel(v.categoria)}</Badge>
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                    {v.tipo === 'archivo' ? <><Upload className="w-2.5 h-2.5" /> Archivo</> : <><Link2 className="w-2.5 h-2.5" /> Enlace</>}
                  </span>
                  <a href={urlArchivo(v.url)} target="_blank" rel="noreferrer" className="ml-auto text-[10px] text-primary inline-flex items-center gap-0.5 hover:underline">
                    Abrir <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal agregar */}
      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nuevo video</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>Título *</Label>
              <Input value={form.titulo} onChange={e => set('titulo', e.target.value)} placeholder="Video institucional WeTracking" />
            </div>
            <div className="space-y-1.5">
              <Label>Categoría</Label>
              <Select value={form.categoria} onValueChange={v => set('categoria', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fuente</Label>
              <div className="flex gap-1 bg-muted/40 rounded-xl p-1 w-fit">
                {[{ k: 'link', l: 'Link (YouTube/Drive)' }, { k: 'archivo', l: 'Subir archivo' }].map(o => (
                  <button key={o.k} type="button" onClick={() => { set('tipo', o.k); setArchivo(null); }}
                    className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${form.tipo === o.k ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                    {o.l}
                  </button>
                ))}
              </div>
            </div>
            {form.tipo === 'link' ? (
              <div className="space-y-1.5">
                <Label>Link del video</Label>
                <Input value={form.url} onChange={e => set('url', e.target.value)} placeholder="https://youtu.be/... o https://drive.google.com/..." />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Archivo de video (mp4)</Label>
                <input type="file" accept="video/*" onChange={e => { const f = e.target.files?.[0] || null; setArchivo(f); if (f && !form.titulo.trim()) set('titulo', f.name.replace(/\.[^.]+$/, '')); }}
                  className="w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-primary file:text-primary-foreground file:text-sm" />
                {archivo && <p className="text-xs text-muted-foreground">{archivo.name} ({(archivo.size / (1024 * 1024)).toFixed(1)} MB)</p>}
                <p className="text-[11px] text-amber-600">Nota: para enviarlo por Telegram como video, el archivo debe pesar menos de ~20 MB. Si es más pesado, mejor súbelo a Drive y usa el link.</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Descripción (opcional)</Label>
              <Textarea value={form.descripcion} onChange={e => set('descripcion', e.target.value)} rows={2} placeholder="De qué trata el video..." />
            </div>
            <div className="space-y-1.5">
              <Label>Portada (opcional)</Label>
              <input type="file" accept="image/*" onChange={e => setPortada(e.target.files?.[0] || null)} className="w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-primary file:text-primary-foreground file:text-sm" />
              {portada ? <p className="text-xs text-muted-foreground">{portada.name}</p> : <p className="text-[11px] text-muted-foreground">Si es de YouTube y no subes portada, se usa el thumbnail del video automáticamente.</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(false)}>Cancelar</Button>
            <Button onClick={() => { setSubiendo(true); guardar.mutate(undefined, { onSettled: () => setSubiendo(false) }); }}
              disabled={!form.titulo || guardar.isPending || subiendo}>
              {guardar.isPending || subiendo ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
