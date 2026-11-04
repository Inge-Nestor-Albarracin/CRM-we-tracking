import { useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { GripVertical, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

// ── Definición de tipos de bloque ─────────────────────────────────────────
export const BLOCK_DEFS = {
  titulo: {
    label: 'Título',
    emoji: 'H1',
    defaultDatos: { texto: 'Título aquí', color: '#007aed', size: 22, bgColor: '#f2f3f7', align: 'center' },
  },
  texto: {
    label: 'Texto',
    emoji: 'T',
    defaultDatos: { html: '<p style="font-size:17px;line-height:1.75;color:#23496d;margin:0;">Escribe tu texto aquí...</p>', bgColor: '#f2f3f7', padding: '15px 30px' },
  },
  imagen: {
    label: 'Imagen',
    emoji: '🖼',
    defaultDatos: { src: '', alt: '', width: 560, bgColor: '#f2f3f7', borderRadius: '' },
  },
  boton: {
    label: 'Botón',
    emoji: '▶',
    defaultDatos: { texto: 'Contáctanos', url: '#', btnColor: '#07f5d9', textColor: '#000000', fontSize: 18, bgColor: '#f2f3f7' },
  },
  separador: {
    label: 'Separador',
    emoji: '—',
    defaultDatos: { color: '#CCCCCC', bgColor: '#f2f3f7' },
  },
  dos_columnas: {
    label: '2 Columnas',
    emoji: '⬛⬛',
    defaultDatos: {
      bgColor: '#f2f3f7',
      izq: { tipo: 'texto', html: '<p style="font-size:17px;line-height:1.75;color:#23496d;margin:0;">Texto columna izquierda.</p>' },
      der: { tipo: 'imagen', src: '', alt: '', borderRadius: '' },
    },
  },
};

// ── Bloque → HTML email ───────────────────────────────────────────────────
function blockToHTML(block) {
  const d = block.datos;
  const bg = d.bgColor || '#f2f3f7';
  switch (block.tipo) {
    case 'titulo':
      return `<tr><td style="padding:15px 30px;background-color:${bg};">\n  <h2 style="margin:0;font-size:${d.size || 22}px;color:${d.color || '#007aed'};font-family:Arial,sans-serif;text-align:${d.align || 'center'};">${d.texto || ''}</h2>\n</td></tr>`;
    case 'texto':
      return `<tr><td style="padding:${d.padding || '15px 30px'};background-color:${bg};">\n  <div style="font-family:Arial,sans-serif;">${d.html || ''}</div>\n</td></tr>`;
    case 'imagen':
      if (!d.src) return `<tr><td style="padding:10px 30px;background-color:${bg};text-align:center;font-size:12px;color:#999;">[Imagen pendiente]</td></tr>`;
      return `<tr><td align="center" style="padding:10px 30px;background-color:${bg};">\n  <img src="${d.src}" alt="${d.alt || ''}" width="${d.width || 560}" style="display:block;max-width:100%;${d.borderRadius ? `border-radius:${d.borderRadius};` : ''}">\n</td></tr>`;
    case 'boton':
      return `<tr><td align="center" style="padding:25px 30px;background-color:${bg};">\n  <table border="0" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="${d.btnColor || '#07f5d9'}" style="border-radius:8px;background-color:${d.btnColor || '#07f5d9'};"><a href="${d.url || '#'}" target="_blank" style="color:${d.textColor || '#000000'};font-size:${d.fontSize || 18}px;font-family:Arial,sans-serif;font-weight:normal;text-decoration:none;padding:18px 28px;display:block;">${d.texto || 'Clic aquí'}</a></td></tr></table>\n</td></tr>`;
    case 'separador':
      return `<tr><td style="padding:5px 30px;background-color:${bg};">\n  <p style="border-top:1px solid ${d.color || '#CCCCCC'};margin:10px 0;font-size:1px;line-height:1px;">&nbsp;</p>\n</td></tr>`;
    case 'dos_columnas': {
      const renderCol = (col) => {
        if (!col) return '';
        if (col.tipo === 'texto') return `<div style="font-family:Arial,sans-serif;">${col.html || ''}</div>`;
        if (col.tipo === 'imagen') return col.src ? `<img src="${col.src}" alt="${col.alt || ''}" style="display:block;max-width:100%;${col.borderRadius ? `border-radius:${col.borderRadius};` : ''}">`  : `<div style="font-size:12px;color:#999;text-align:center;">[Imagen pendiente]</div>`;
        return '';
      };
      return `<tr><td style="padding:0;background-color:${bg};">\n  <table width="100%" cellpadding="0" cellspacing="0"><tr><td width="50%" valign="top" style="padding:15px 20px 15px 30px;vertical-align:top;">${renderCol(d.izq)}</td><td width="50%" valign="top" style="padding:15px 30px 15px 20px;vertical-align:top;">${renderCol(d.der)}</td></tr></table>\n</td></tr>`;
    }
    default: return '';
  }
}

export function blocksToHTML(blocks) {
  if (!blocks || blocks.length === 0) return '';
  const meta = JSON.stringify(blocks).replace(/-->/g, '--&gt;');
  const rows = blocks.map(blockToHTML).filter(Boolean).join('\n');
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional //EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>body{margin:0;padding:0;font-family:Arial,sans-serif;}table{border-spacing:0;}img{border:none;outline:none;max-width:100%;}a{text-decoration:none;}</style>
</head>
<!-- wt-builder:${meta} -->
<body bgcolor="#ffffff" style="margin:0;padding:0;background-color:#ffffff;">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff">
<tr><td align="center" style="padding:20px 10px;">
  <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;">
${rows}
  </table>
</td></tr>
</table>
</body>
</html>`;
}

export function htmlToBlocks(html) {
  if (!html) return null;
  const match = html.match(/<!-- wt-builder:([\s\S]*?) -->/);
  if (!match) return null;
  try { return JSON.parse(match[1].replace(/--&gt;/g, '-->')); } catch { return null; }
}

// ── Editores inline por tipo ──────────────────────────────────────────────
function EditorTitulo({ datos, onChange }) {
  return (
    <div className="space-y-3 p-3 border-t bg-muted/30">
      <div>
        <Label className="text-xs">Texto</Label>
        <Input value={datos.texto || ''} onChange={e => onChange({ texto: e.target.value })} className="mt-1" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-xs">Color texto</Label>
          <div className="flex gap-1 mt-1">
            <Input type="color" value={datos.color || '#007aed'} onChange={e => onChange({ color: e.target.value })} className="w-10 h-8 p-0.5 cursor-pointer" />
            <Input value={datos.color || '#007aed'} onChange={e => onChange({ color: e.target.value })} className="h-8 text-xs flex-1" />
          </div>
        </div>
        <div>
          <Label className="text-xs">Tamaño (px)</Label>
          <Input type="number" value={datos.size || 22} onChange={e => onChange({ size: Number(e.target.value) })} className="h-8 mt-1" />
        </div>
        <div>
          <Label className="text-xs">Alineación</Label>
          <select value={datos.align || 'center'} onChange={e => onChange({ align: e.target.value })} className="w-full h-8 mt-1 border rounded text-sm px-2 bg-background">
            <option value="left">Izquierda</option>
            <option value="center">Centro</option>
            <option value="right">Derecha</option>
          </select>
        </div>
      </div>
      <div>
        <Label className="text-xs">Color de fondo</Label>
        <div className="flex gap-1 mt-1">
          <Input type="color" value={datos.bgColor || '#f2f3f7'} onChange={e => onChange({ bgColor: e.target.value })} className="w-10 h-8 p-0.5 cursor-pointer" />
          <Input value={datos.bgColor || '#f2f3f7'} onChange={e => onChange({ bgColor: e.target.value })} className="h-8 text-xs flex-1" />
        </div>
      </div>
    </div>
  );
}

function EditorTexto({ datos, onChange }) {
  return (
    <div className="space-y-3 p-3 border-t bg-muted/30">
      <div>
        <Label className="text-xs">Contenido HTML</Label>
        <Textarea value={datos.html || ''} onChange={e => onChange({ html: e.target.value })} rows={4} className="font-mono text-xs mt-1" />
        <p className="text-xs text-muted-foreground mt-1">Variables: {'{{nombre}} {{empresa}} {{sector}} {{ciudad}} {{cargo}}'}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Color de fondo</Label>
          <div className="flex gap-1 mt-1">
            <Input type="color" value={datos.bgColor || '#f2f3f7'} onChange={e => onChange({ bgColor: e.target.value })} className="w-10 h-8 p-0.5 cursor-pointer" />
            <Input value={datos.bgColor || '#f2f3f7'} onChange={e => onChange({ bgColor: e.target.value })} className="h-8 text-xs flex-1" />
          </div>
        </div>
        <div>
          <Label className="text-xs">Padding</Label>
          <Input value={datos.padding || '15px 30px'} onChange={e => onChange({ padding: e.target.value })} className="h-8 mt-1 text-xs" />
        </div>
      </div>
    </div>
  );
}

function EditorImagen({ datos, onChange }) {
  return (
    <div className="space-y-3 p-3 border-t bg-muted/30">
      <div>
        <Label className="text-xs">URL de la imagen</Label>
        <Input value={datos.src || ''} onChange={e => onChange({ src: e.target.value })} placeholder="https://..." className="mt-1" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Texto alternativo</Label>
          <Input value={datos.alt || ''} onChange={e => onChange({ alt: e.target.value })} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Ancho (px)</Label>
          <Input type="number" value={datos.width || 560} onChange={e => onChange({ width: Number(e.target.value) })} className="mt-1" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Border radius</Label>
          <Input value={datos.borderRadius || ''} onChange={e => onChange({ borderRadius: e.target.value })} placeholder="5% ó 8px" className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Color de fondo</Label>
          <div className="flex gap-1 mt-1">
            <Input type="color" value={datos.bgColor || '#f2f3f7'} onChange={e => onChange({ bgColor: e.target.value })} className="w-10 h-8 p-0.5 cursor-pointer" />
            <Input value={datos.bgColor || '#f2f3f7'} onChange={e => onChange({ bgColor: e.target.value })} className="h-8 text-xs flex-1" />
          </div>
        </div>
      </div>
    </div>
  );
}

function EditorBoton({ datos, onChange }) {
  return (
    <div className="space-y-3 p-3 border-t bg-muted/30">
      <div>
        <Label className="text-xs">Texto del botón</Label>
        <Input value={datos.texto || ''} onChange={e => onChange({ texto: e.target.value })} className="mt-1" />
      </div>
      <div>
        <Label className="text-xs">URL destino</Label>
        <Input value={datos.url || ''} onChange={e => onChange({ url: e.target.value })} placeholder="https://..." className="mt-1" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-xs">Color botón</Label>
          <div className="flex gap-1 mt-1">
            <Input type="color" value={datos.btnColor || '#07f5d9'} onChange={e => onChange({ btnColor: e.target.value })} className="w-10 h-8 p-0.5 cursor-pointer" />
            <Input value={datos.btnColor || '#07f5d9'} onChange={e => onChange({ btnColor: e.target.value })} className="h-8 text-xs flex-1" />
          </div>
        </div>
        <div>
          <Label className="text-xs">Color texto</Label>
          <div className="flex gap-1 mt-1">
            <Input type="color" value={datos.textColor || '#000000'} onChange={e => onChange({ textColor: e.target.value })} className="w-10 h-8 p-0.5 cursor-pointer" />
            <Input value={datos.textColor || '#000000'} onChange={e => onChange({ textColor: e.target.value })} className="h-8 text-xs flex-1" />
          </div>
        </div>
        <div>
          <Label className="text-xs">Tamaño (px)</Label>
          <Input type="number" value={datos.fontSize || 18} onChange={e => onChange({ fontSize: Number(e.target.value) })} className="h-8 mt-1" />
        </div>
      </div>
      <div>
        <Label className="text-xs">Color de fondo sección</Label>
        <div className="flex gap-1 mt-1">
          <Input type="color" value={datos.bgColor || '#f2f3f7'} onChange={e => onChange({ bgColor: e.target.value })} className="w-10 h-8 p-0.5 cursor-pointer" />
          <Input value={datos.bgColor || '#f2f3f7'} onChange={e => onChange({ bgColor: e.target.value })} className="h-8 text-xs flex-1" />
        </div>
      </div>
    </div>
  );
}

function EditorSeparador({ datos, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-2 p-3 border-t bg-muted/30">
      <div>
        <Label className="text-xs">Color línea</Label>
        <div className="flex gap-1 mt-1">
          <Input type="color" value={datos.color || '#CCCCCC'} onChange={e => onChange({ color: e.target.value })} className="w-10 h-8 p-0.5 cursor-pointer" />
          <Input value={datos.color || '#CCCCCC'} onChange={e => onChange({ color: e.target.value })} className="h-8 text-xs flex-1" />
        </div>
      </div>
      <div>
        <Label className="text-xs">Color de fondo</Label>
        <div className="flex gap-1 mt-1">
          <Input type="color" value={datos.bgColor || '#f2f3f7'} onChange={e => onChange({ bgColor: e.target.value })} className="w-10 h-8 p-0.5 cursor-pointer" />
          <Input value={datos.bgColor || '#f2f3f7'} onChange={e => onChange({ bgColor: e.target.value })} className="h-8 text-xs flex-1" />
        </div>
      </div>
    </div>
  );
}

function EditorDosColumnas({ datos, onChange }) {
  const izq = datos.izq || { tipo: 'texto', html: '' };
  const der = datos.der || { tipo: 'imagen', src: '' };
  return (
    <div className="space-y-4 p-3 border-t bg-muted/30">
      <div>
        <Label className="text-xs font-semibold">Columna izquierda</Label>
        <div className="flex gap-2 mt-1 items-center">
          <Label className="text-xs shrink-0">Tipo</Label>
          <select value={izq.tipo || 'texto'} onChange={e => onChange({ izq: { ...izq, tipo: e.target.value } })} className="border rounded text-xs px-2 h-7 bg-background">
            <option value="texto">Texto</option>
            <option value="imagen">Imagen</option>
          </select>
        </div>
        {(izq.tipo === 'texto' || !izq.tipo)
          ? <Textarea value={izq.html || ''} onChange={e => onChange({ izq: { ...izq, html: e.target.value } })} rows={3} className="font-mono text-xs mt-1" />
          : <Input value={izq.src || ''} onChange={e => onChange({ izq: { ...izq, src: e.target.value } })} placeholder="https://..." className="mt-1 text-xs" />}
      </div>
      <div>
        <Label className="text-xs font-semibold">Columna derecha</Label>
        <div className="flex gap-2 mt-1 items-center">
          <Label className="text-xs shrink-0">Tipo</Label>
          <select value={der.tipo || 'imagen'} onChange={e => onChange({ der: { ...der, tipo: e.target.value } })} className="border rounded text-xs px-2 h-7 bg-background">
            <option value="texto">Texto</option>
            <option value="imagen">Imagen</option>
          </select>
        </div>
        {(der.tipo === 'imagen' || !der.tipo)
          ? <div className="space-y-1 mt-1">
              <Input value={der.src || ''} onChange={e => onChange({ der: { ...der, src: e.target.value } })} placeholder="https://... URL imagen" className="text-xs" />
              <Input value={der.borderRadius || ''} onChange={e => onChange({ der: { ...der, borderRadius: e.target.value } })} placeholder="border-radius: 5% ó 8px (opcional)" className="text-xs" />
            </div>
          : <Textarea value={der.html || ''} onChange={e => onChange({ der: { ...der, html: e.target.value } })} rows={3} className="font-mono text-xs mt-1" />}
      </div>
      <div>
        <Label className="text-xs">Color de fondo sección</Label>
        <div className="flex gap-1 mt-1">
          <Input type="color" value={datos.bgColor || '#f2f3f7'} onChange={e => onChange({ bgColor: e.target.value })} className="w-10 h-8 p-0.5 cursor-pointer" />
          <Input value={datos.bgColor || '#f2f3f7'} onChange={e => onChange({ bgColor: e.target.value })} className="h-8 text-xs flex-1" />
        </div>
      </div>
    </div>
  );
}

// ── Preview de cada bloque ────────────────────────────────────────────────
function BlockPreview({ block }) {
  const d = block.datos;
  const bg = d.bgColor || '#f2f3f7';
  switch (block.tipo) {
    case 'titulo':
      return <div style={{ backgroundColor: bg, padding: '12px 20px' }}>
        <h2 style={{ margin: 0, fontSize: d.size || 22, color: d.color || '#007aed', textAlign: d.align || 'center', fontFamily: 'Arial, sans-serif' }}>{d.texto || 'Título'}</h2>
      </div>;
    case 'texto':
      return <div style={{ backgroundColor: bg, padding: '8px 20px' }}>
        <div style={{ fontFamily: 'Arial', fontSize: 13, color: '#23496d' }} dangerouslySetInnerHTML={{ __html: d.html || '' }} />
      </div>;
    case 'imagen':
      return <div style={{ backgroundColor: bg, padding: '8px 20px', textAlign: 'center' }}>
        {d.src
          ? <img src={d.src} alt={d.alt || ''} style={{ maxWidth: '100%', display: 'block', margin: '0 auto', borderRadius: d.borderRadius || '' }} />
          : <div style={{ background: '#e5e7eb', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, color: '#9ca3af', fontSize: 12 }}>Sin URL — agrega la imagen</div>}
      </div>;
    case 'boton':
      return <div style={{ backgroundColor: bg, padding: '14px 20px', textAlign: 'center' }}>
        <span style={{ display: 'inline-block', backgroundColor: d.btnColor || '#07f5d9', color: d.textColor || '#000', borderRadius: 8, padding: '10px 20px', fontSize: d.fontSize || 18, fontFamily: 'Arial', cursor: 'default' }}>{d.texto || 'Botón'}</span>
      </div>;
    case 'separador':
      return <div style={{ backgroundColor: bg, padding: '4px 20px' }}>
        <hr style={{ borderTop: `1px solid ${d.color || '#CCCCCC'}`, margin: '6px 0', borderBottom: 'none', borderLeft: 'none', borderRight: 'none' }} />
      </div>;
    case 'dos_columnas': {
      const renderCol = (col) => {
        if (!col) return null;
        if (col.tipo === 'texto') return <div style={{ fontFamily: 'Arial', fontSize: 12, color: '#23496d' }} dangerouslySetInnerHTML={{ __html: col.html || '' }} />;
        if (col.tipo === 'imagen') return col.src
          ? <img src={col.src} alt={col.alt || ''} style={{ maxWidth: '100%', borderRadius: col.borderRadius || '' }} />
          : <div style={{ background: '#e5e7eb', height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, color: '#9ca3af', fontSize: 11 }}>Imagen</div>;
        return null;
      };
      return <div style={{ backgroundColor: bg, padding: '6px 0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody><tr>
            <td style={{ width: '50%', padding: '6px 20px', verticalAlign: 'top' }}>{renderCol(d.izq)}</td>
            <td style={{ width: '50%', padding: '6px 20px', verticalAlign: 'top' }}>{renderCol(d.der)}</td>
          </tr></tbody>
        </table>
      </div>;
    }
    default: return null;
  }
}

// ── Fila de bloque individual ─────────────────────────────────────────────
function BlockRow({ block, isEditing, onToggleEdit, onDelete, onUpdate, onDragStart, onDragOver, onDrop, isDragOver }) {
  const def = BLOCK_DEFS[block.tipo];
  const EDITORS = { titulo: EditorTitulo, texto: EditorTexto, imagen: EditorImagen, boton: EditorBoton, separador: EditorSeparador, dos_columnas: EditorDosColumnas };
  const Editor = EDITORS[block.tipo];

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`rounded border mb-2 overflow-hidden select-none ${isDragOver ? 'border-primary border-2' : 'border-border'}`}
    >
      <div
        className={`flex items-center justify-between px-3 py-1.5 text-xs cursor-pointer ${isEditing ? 'bg-primary/10 text-primary' : 'bg-muted/50 text-muted-foreground hover:bg-muted'}`}
        onClick={onToggleEdit}
      >
        <div className="flex items-center gap-2">
          <GripVertical className="w-3.5 h-3.5 cursor-grab text-muted-foreground/60" />
          <span className="font-medium">{def?.label || block.tipo}</span>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={e => { e.stopPropagation(); onDelete(); }} className="p-1 hover:text-destructive rounded">
            <Trash2 className="w-3 h-3" />
          </button>
          {isEditing ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </div>
      <div className="bg-white dark:bg-background">
        <BlockPreview block={block} />
      </div>
      {isEditing && Editor && <Editor datos={block.datos} onChange={patch => onUpdate(patch)} />}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────
export default function EmailBuilder({ value, onChange }) {
  const [blocks, setBlocks] = useState(() => htmlToBlocks(value) || []);
  const [editingId, setEditingId] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const updateBlocks = useCallback((newBlocks) => {
    setBlocks(newBlocks);
    onChange(blocksToHTML(newBlocks));
  }, [onChange]);

  function addBlock(tipo) {
    const def = BLOCK_DEFS[tipo];
    if (!def) return;
    const newBlock = { id: crypto.randomUUID(), tipo, datos: JSON.parse(JSON.stringify(def.defaultDatos)) };
    const updated = [...blocks, newBlock];
    updateBlocks(updated);
    setEditingId(newBlock.id);
  }

  function updateBlock(id, patch) {
    updateBlocks(blocks.map(b => b.id === id ? { ...b, datos: { ...b.datos, ...patch } } : b));
  }

  function deleteBlock(id) {
    updateBlocks(blocks.filter(b => b.id !== id));
    if (editingId === id) setEditingId(null);
  }

  function handleDrop(targetId) {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOver(null); return; }
    const items = [...blocks];
    const fromIdx = items.findIndex(x => x.id === dragId);
    const toIdx = items.findIndex(x => x.id === targetId);
    if (fromIdx === -1 || toIdx === -1) { setDragId(null); setDragOver(null); return; }
    items.splice(toIdx, 0, items.splice(fromIdx, 1)[0]);
    updateBlocks(items);
    setDragId(null);
    setDragOver(null);
  }

  return (
    <div className="flex gap-3" style={{ minHeight: 460 }}>
      {/* Paleta */}
      <div className="w-32 shrink-0">
        <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Bloques</p>
        {Object.entries(BLOCK_DEFS).map(([tipo, def]) => (
          <button
            key={tipo}
            type="button"
            onClick={() => addBlock(tipo)}
            className="w-full text-left px-2.5 py-1.5 rounded border mb-1.5 hover:bg-muted hover:border-primary/50 flex items-center gap-2 transition-colors"
          >
            <span className="text-xs font-mono w-6 text-center shrink-0">{def.emoji}</span>
            <span className="text-xs">{def.label}</span>
          </button>
        ))}
      </div>

      {/* Canvas */}
      <div className="flex-1 border rounded bg-muted/10 p-3 overflow-y-auto">
        {blocks.length === 0
          ? <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12 text-sm">
              <p className="mb-1">Canvas vacío</p>
              <p className="text-xs">Haz clic en un bloque de la izquierda para agregarlo</p>
            </div>
          : blocks.map(block => (
              <BlockRow
                key={block.id}
                block={block}
                isEditing={editingId === block.id}
                isDragOver={dragOver === block.id}
                onToggleEdit={() => setEditingId(editingId === block.id ? null : block.id)}
                onDelete={() => deleteBlock(block.id)}
                onUpdate={patch => updateBlock(block.id, patch)}
                onDragStart={() => setDragId(block.id)}
                onDragOver={e => { e.preventDefault(); setDragOver(block.id); }}
                onDrop={() => handleDrop(block.id)}
              />
            ))
        }
      </div>
    </div>
  );
}
