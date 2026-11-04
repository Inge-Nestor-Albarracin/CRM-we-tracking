import React, { useState, useRef, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Upload, File, Trash2, Download, X, ChevronLeft, ChevronRight, ExternalLink, FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import PanelAsociado from './PanelAsociado';
import { urlArchivo } from '@/lib/wetracking';
import { useUserRole } from '@/hooks/useUserRole';

const CATEGORIAS = ['Cotizacion', 'Contrato', 'Propuesta', 'Factura', 'Presentacion', 'Otro'];
const CAT_LABEL = { Cotizacion: 'Cotización', Presentacion: 'Presentación' };

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Lightbox (imágenes con navegación, PDF vía blob, otros descargables) ──────
function Lightbox({ docs, initialIndex, onClose }) {
  const [idx, setIdx] = useState(initialIndex);
  const [blobUrl, setBlobUrl] = useState(null);
  const doc = docs[idx];
  const isImage = doc?.tipo_mime?.startsWith('image/');
  const isPDF = doc?.tipo_mime === 'application/pdf';

  const prev = useCallback(() => setIdx(i => Math.max(0, i - 1)), []);
  const next = useCallback(() => setIdx(i => Math.min(docs.length - 1, i + 1)), [docs.length]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, prev, next]);

  useEffect(() => {
    if (!doc?.contenido) return;
    setBlobUrl(null);
    let objectUrl = null;
    fetch(doc.contenido).then(r => r.blob()).then(blob => {
      objectUrl = URL.createObjectURL(blob); setBlobUrl(objectUrl);
    }).catch(() => {});
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [doc?.id]);

  function descargar() {
    const a = document.createElement('a');
    a.href = blobUrl || doc.contenido;
    a.download = doc.nombre;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  if (!doc) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/95">
      <div className="flex items-center justify-between px-5 py-3 bg-black/40 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-white/40 text-sm tabular-nums flex-shrink-0">{idx + 1} / {docs.length}</span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{doc.nombre}</p>
            {doc.descripcion && <p className="text-xs text-white/50 truncate">{doc.descripcion}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-4">
          <a href={urlArchivo(doc.contenido, { nombre: doc.nombre })} target="_blank" rel="noreferrer" className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white" title="Abrir en pestaña"><ExternalLink className="w-4 h-4" /></a>
          <button onClick={descargar} className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white" title="Descargar"><Download className="w-4 h-4" /></button>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
      </div>

      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {idx > 0 && <button onClick={prev} className="absolute left-3 z-10 p-2.5 rounded-full bg-black/40 hover:bg-black/70 text-white"><ChevronLeft className="w-6 h-6" /></button>}
        {isImage ? (
          <img key={doc.id} src={doc.contenido} alt={doc.nombre} className="max-h-full max-w-full object-contain select-none" draggable={false} />
        ) : isPDF ? (
          blobUrl ? <iframe key={blobUrl} src={blobUrl} title={doc.nombre} className="w-full h-full border-0" />
            : <div className="flex flex-col items-center gap-3 text-white/50"><div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" /><p className="text-sm">Cargando PDF…</p></div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-center p-8">
            <File className="w-20 h-20 text-white/20" />
            <p className="text-white font-medium text-lg">{doc.nombre}</p>
            <p className="text-white/50 text-sm">{doc.tipo_mime} · {formatBytes(doc.tamanio_bytes)}</p>
            <button onClick={descargar} className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm"><Download className="w-4 h-4" /> Descargar</button>
          </div>
        )}
        {idx < docs.length - 1 && <button onClick={next} className="absolute right-3 z-10 p-2.5 rounded-full bg-black/40 hover:bg-black/70 text-white"><ChevronRight className="w-6 h-6" /></button>}
      </div>
    </div>
  );
}

// ── Modal de subida ───────────────────────────────────────────────────────────
function UploadModal({ payloadBase, onClose, onUploaded }) {
  const [files, setFiles] = useState([]);
  const [categoria, setCategoria] = useState('Otro');
  const [descripcion, setDescripcion] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef(null);

  const addFiles = (list) => setFiles(prev => [...prev, ...Array.from(list)]);

  async function subir() {
    if (!files.length) return;
    setUploading(true);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await base44.entities.Documento.create({
        ...payloadBase,
        nombre: file.name,
        categoria,
        descripcion: descripcion || undefined,
        tipo_mime: file.type,
        tamanio_bytes: file.size,
        contenido: file_url,
      });
      setProgress(Math.round(((i + 1) / files.length) * 100));
    }
    setUploading(false);
    onUploaded();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-2xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-border/40">
          <h3 className="font-semibold">Subir documentos</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg"><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs text-muted-foreground">Categoría</label>
            <select value={categoria} onChange={e => setCategoria(e.target.value)} className="mt-1 w-full h-9 px-2 text-sm rounded-lg border border-border bg-background">
              {CATEGORIAS.map(c => <option key={c} value={c}>{CAT_LABEL[c] || c}</option>)}
            </select>
          </div>
          <div
            onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed border-border/60 rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
          >
            <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium">Arrastra archivos o haz clic</p>
            <p className="text-xs text-muted-foreground mt-1">Imágenes, PDFs, documentos</p>
            <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
          </div>
          {files.length > 0 && (
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 bg-muted/40 rounded-lg">
                  <File className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs flex-1 truncate">{f.name}</span>
                  <span className="text-xs text-muted-foreground">{formatBytes(f.size)}</span>
                  <button onClick={() => setFiles(prev => prev.filter((_, x) => x !== i))} className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
          )}
          <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Descripción opcional..." className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          {uploading && <div className="w-full bg-muted rounded-full h-2"><div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${progress}%` }} /></div>}
          <Button onClick={subir} disabled={!files.length || uploading} className="w-full rounded-xl">
            {uploading ? `Subiendo... ${progress}%` : `Subir ${files.length || ''} archivo${files.length !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Panel de documentos reutilizable para Empresa o Contacto.
 * Props: empresaId? | contactoId?
 */
export default function DocumentosPanel({ empresaId, contactoId, onCambio }) {
  const qc = useQueryClient();
  const { isAdmin } = useUserRole();
  const [subir, setSubir] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState(null);

  const filtro = empresaId ? { empresa_id: empresaId } : { contacto_id: contactoId };
  const key = empresaId ? ['documentos-empresa', empresaId] : ['documentos-contacto', contactoId];

  const { data: docs = [] } = useQuery({
    queryKey: key,
    queryFn: () => base44.entities.Documento.filter(filtro),
    enabled: !!(empresaId || contactoId),
  });

  async function eliminar(id) {
    if (!confirm('¿Eliminar este documento?')) return;
    await base44.entities.Documento.delete(id);
    qc.invalidateQueries({ queryKey: key });
    onCambio?.('delete');
  }

  return (
    <PanelAsociado
      titulo="Documentos"
      count={docs.length}
      icono={<FileText className="w-4 h-4" />}
      onAgregar={() => setSubir(true)}
      agregarLabel="Subir"
      vacio={docs.length === 0 ? <p className="text-xs text-muted-foreground py-2">Sin documentos. Sube cotizaciones, contratos, propuestas…</p> : null}
    >
      {docs.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {docs.map((doc, i) => {
            const isImage = doc.tipo_mime?.startsWith('image/');
            const isLink = doc.tipo_mime?.startsWith('link/'); // cotizaciones u otros enlaces internos
            const abrir = () => isLink ? window.open(doc.contenido, '_blank') : setLightboxIdx(i);
            return (
              <div key={doc.id} className="group relative bg-muted/40 rounded-lg overflow-hidden border border-border/40">
                <button onClick={abrir} className="w-full h-20 flex items-center justify-center bg-muted/60 overflow-hidden">
                  {isImage
                    ? <img src={doc.contenido} alt={doc.nombre} className="w-full h-full object-cover" />
                    : isLink
                      ? <div className="flex flex-col items-center gap-1 text-primary"><FileText className="w-6 h-6" /><span className="text-[9px] uppercase">PDF</span></div>
                      : <div className="flex flex-col items-center gap-1 text-muted-foreground"><File className="w-6 h-6" /><span className="text-[9px] uppercase">{doc.tipo_mime?.split('/')[1]?.slice(0, 4) || 'doc'}</span></div>}
                </button>
                {isAdmin && (
                <button onClick={() => eliminar(doc.id)} className="absolute top-1 right-1 p-1 bg-black/50 hover:bg-red-600 text-white rounded opacity-0 group-hover:opacity-100 transition-all">
                  <Trash2 className="w-3 h-3" />
                </button>
                )}
                <div className="px-1.5 py-1">
                  <p className="text-[11px] font-medium truncate">{doc.nombre}</p>
                  <p className="text-[10px] text-muted-foreground">{CAT_LABEL[doc.categoria] || doc.categoria}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {subir && (
        <UploadModal
          payloadBase={filtro}
          onClose={() => setSubir(false)}
          onUploaded={() => { qc.invalidateQueries({ queryKey: key }); onCambio?.('upload'); }}
        />
      )}
      {lightboxIdx !== null && (
        <Lightbox docs={docs} initialIndex={lightboxIdx} onClose={() => setLightboxIdx(null)} />
      )}
    </PanelAsociado>
  );
}
