import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Producto, MovimientoInventario, base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Search, Pencil, Trash2, Tags, ImageIcon, Upload, X, Download } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useUserRole } from '@/hooks/useUserRole';
import { detectarTipoRfid } from '@/lib/rfid';
import { INVENTARIO_BODEGA } from '@/data/inventarioBodega';
import ConversorUSD from '@/components/ConversorUSD';

function normNombre(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

const TIPOS_RFID = ['NFC', 'HF', 'UHF'];

const CATEGORIAS = [
  { value: 'Tags_RFID', label: 'Tags RFID' },
  { value: 'Lectores', label: 'Lectores' },
  { value: 'Antenas', label: 'Antenas' },
  { value: 'Impresoras', label: 'Impresoras' },
  { value: 'Software', label: 'Software' },
  { value: 'Servicios', label: 'Servicios' },
  { value: 'Otro', label: 'Otro' },
];

const CAT_COLOR = {
  Tags_RFID: 'bg-blue-100 text-blue-700',
  Lectores: 'bg-violet-100 text-violet-700',
  Antenas: 'bg-cyan-100 text-cyan-700',
  Impresoras: 'bg-orange-100 text-orange-700',
  Software: 'bg-green-100 text-green-700',
  Servicios: 'bg-amber-100 text-amber-700',
  Otro: 'bg-gray-100 text-gray-600',
};

const VACIO = { nombre: '', sku: '', categoria: '', tipo_rfid: '', foto: '', descripcion: '', superficie: '', temp_max: '', rango_m: '', entorno: '', aplicacion: '', precio_venta: '', costo: '', stock_minimo: '', unidad: 'unidad', activo: true };

function fmtCOP(n) {
  if (n == null || n === '') return '—';
  return '$' + Math.round(Number(n)).toLocaleString('es-CO');
}

export default function Productos() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isAdmin } = useUserRole();

  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('todas');
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(VACIO);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [cargandoBodega, setCargandoBodega] = useState(false);
  const fotoRef = useRef(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Carga inicial del inventario de bodega (un clic, idempotente por SKU/nombre)
  async function cargarBodega() {
    if (!confirm(`Se cargarán ${INVENTARIO_BODEGA.length} productos con su stock inicial. Los que ya existan se omiten. ¿Continuar?`)) return;
    setCargandoBodega(true);
    try {
      const existentes = await Producto.list();
      const porSku = new Map(existentes.filter(p => p.sku).map(p => [p.sku.toLowerCase(), p]));
      const porNombre = new Map(existentes.map(p => [normNombre(p.nombre), p]));
      let creados = 0, omitidos = 0;
      for (const it of INVENTARIO_BODEGA) {
        const ya = (it.sku && porSku.get(it.sku.toLowerCase())) || porNombre.get(normNombre(it.nombre));
        if (ya) { omitidos++; continue; }
        const prod = await Producto.create({
          nombre: it.nombre, sku: it.sku || undefined, categoria: it.categoria,
          tipo_rfid: detectarTipoRfid(it.nombre) || undefined, unidad: 'unidad', activo: true,
        });
        porNombre.set(normNombre(it.nombre), prod);
        if (it.sku) porSku.set(it.sku.toLowerCase(), prod);
        if (it.cantidad > 0) {
          await MovimientoInventario.create({ producto_id: prod.id, tipo: 'entrada', cantidad: it.cantidad, motivo: 'Carga inicial inventario bodega' });
        }
        creados++;
      }
      qc.invalidateQueries({ queryKey: ['productos'] });
      qc.invalidateQueries({ queryKey: ['movimientos-inventario'] });
      toast({ title: 'Inventario cargado', description: `${creados} productos creados, ${omitidos} ya existían` });
    } catch (err) {
      toast({ title: 'Error al cargar el inventario', description: err?.message || String(err), variant: 'destructive' });
    }
    setCargandoBodega(false);
  }

  // Al escribir el nombre, sugiere el tipo de RFID si aún no se eligió uno
  function onNombreChange(nombre) {
    setForm(f => ({ ...f, nombre, tipo_rfid: f.tipo_rfid || detectarTipoRfid(nombre) }));
  }

  async function subirFoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubiendoFoto(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      set('foto', file_url);
    } catch (err) {
      toast({ title: 'Error al subir la foto', description: err?.message || String(err), variant: 'destructive' });
    }
    setSubiendoFoto(false);
    e.target.value = '';
  }

  const { data: productos = [], isLoading } = useQuery({
    queryKey: ['productos'],
    queryFn: () => Producto.list('-updated_date'),
  });

  const { data: movimientos = [] } = useQuery({
    queryKey: ['movimientos-inventario'],
    queryFn: () => MovimientoInventario.list('-created_date'),
  });

  const stockMap = useMemo(() => {
    const map = {};
    movimientos.filter(m => m.producto_id).forEach(m => {
      const delta = m.tipo === 'entrada' ? m.cantidad : m.tipo === 'salida' ? -m.cantidad : m.cantidad;
      map[m.producto_id] = (map[m.producto_id] || 0) + delta;
    });
    return map;
  }, [movimientos]);

  const guardar = useMutation({
    mutationFn: async () => {
      const datos = {
        nombre: form.nombre,
        sku: form.sku,
        categoria: form.categoria || undefined,
        tipo_rfid: form.tipo_rfid || undefined,
        foto: form.foto || undefined,
        descripcion: form.descripcion,
        superficie: form.superficie || undefined,
        temp_max: form.temp_max !== '' ? Number(form.temp_max) : undefined,
        rango_m: form.rango_m !== '' ? Number(form.rango_m) : undefined,
        entorno: form.entorno || undefined,
        aplicacion: form.aplicacion || undefined,
        precio_venta: form.precio_venta !== '' ? Number(form.precio_venta) : undefined,
        costo: form.costo !== '' ? Number(form.costo) : undefined,
        stock_minimo: form.stock_minimo !== '' ? Number(form.stock_minimo) : 0,
        unidad: form.unidad || 'unidad',
        activo: form.activo,
      };
      if (editando?.id) return Producto.update(editando.id, datos);
      return Producto.create(datos);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['productos'] });
      setModal(false);
      toast({ title: editando?.id ? 'Producto actualizado' : 'Producto creado' });
    },
    onError: (err) => toast({ title: 'Error al guardar', description: err?.message || String(err), variant: 'destructive' }),
  });

  const eliminar = useMutation({
    mutationFn: (id) => Producto.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['productos'] }),
    onError: (err) => toast({ title: 'Error al eliminar', description: err?.message || String(err), variant: 'destructive' }),
  });

  function abrirCrear() {
    setEditando(null);
    setForm(VACIO);
    setModal(true);
  }

  function abrirEditar(p) {
    setEditando(p);
    setForm({
      nombre: p.nombre || '', sku: p.sku || '', categoria: p.categoria || '', tipo_rfid: p.tipo_rfid || '', foto: p.foto || '',
      descripcion: p.descripcion || '',
      superficie: p.superficie || '', temp_max: p.temp_max ?? '', rango_m: p.rango_m ?? '', entorno: p.entorno || '', aplicacion: p.aplicacion || '',
      precio_venta: p.precio_venta ?? '', costo: p.costo ?? '', stock_minimo: p.stock_minimo ?? '',
      unidad: p.unidad || 'unidad', activo: p.activo !== false,
    });
    setModal(true);
  }

  const filtered = productos.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !q || p.nombre?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.descripcion?.toLowerCase().includes(q);
    const matchCat = filterCat === 'todas' || p.categoria === filterCat;
    return matchSearch && matchCat;
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Productos</h1>
          <p className="text-sm text-muted-foreground mt-1">Catálogo RFID: {productos.length} producto{productos.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          {productos.length < INVENTARIO_BODEGA.length && (
            <Button size="sm" variant="outline" className="h-9" onClick={cargarBodega} disabled={cargandoBodega}>
              <Download className="w-4 h-4 mr-1" /> {cargandoBodega ? 'Cargando...' : 'Cargar inventario de bodega'}
            </Button>
          )}
          <Button size="sm" className="h-9" onClick={abrirCrear}>
            <Plus className="w-4 h-4 mr-1" /> Nuevo producto
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por nombre, SKU..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las categorías</SelectItem>
            {CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Tags className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">{search || filterCat !== 'todas' ? 'Sin resultados' : 'No hay productos en el catálogo todavía'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map(p => {
            const stock = stockMap[p.id] || 0;
            const bajoMin = stock < (p.stock_minimo || 0);
            // Color de la etiqueta de unidades según el stock.
            const stockColor = stock <= 0
              ? 'bg-red-500 text-white'
              : bajoMin
                ? 'bg-amber-500 text-white'
                : 'bg-emerald-500 text-white';
            const margen = p.precio_venta && p.costo ? Math.round(((p.precio_venta - p.costo) / p.precio_venta) * 100) : null;
            return (
              <div key={p.id} className={`group bg-card border border-border/60 rounded-xl overflow-hidden hover:shadow-md transition-all ${p.activo === false ? 'opacity-60' : ''}`}>
                {/* Imagen grande */}
                <button onClick={() => abrirEditar(p)} className="relative w-full aspect-square bg-muted flex items-center justify-center overflow-hidden">
                  {p.foto
                    ? <img src={p.foto} alt={p.nombre} className="w-full h-full object-cover" />
                    : <ImageIcon className="w-12 h-12 text-muted-foreground/30" strokeWidth={1.5} />}
                  {p.tipo_rfid && (
                    <span className="absolute top-2 left-2 text-[10px] font-semibold bg-background/90 backdrop-blur border border-border rounded-full px-2 py-0.5 text-foreground">{p.tipo_rfid}</span>
                  )}
                  <span className={`absolute top-2 right-2 text-[11px] font-semibold rounded-full px-2 py-0.5 shadow-sm ${stockColor}`}>
                    {stock.toLocaleString('es-CO')} u
                  </span>
                </button>

                {/* Info */}
                <div className="p-3">
                  <div className="flex items-start justify-between gap-1">
                    <p className="font-medium text-sm leading-snug line-clamp-2 flex-1" title={p.nombre}>{p.nombre}</p>
                    <div className="flex opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button className="p-1 hover:bg-muted rounded text-muted-foreground" onClick={() => abrirEditar(p)}><Pencil className="w-3.5 h-3.5" /></button>
                      {isAdmin && (
                        <button className="p-1 hover:bg-destructive/10 hover:text-destructive rounded text-muted-foreground" onClick={() => { if (confirm(`¿Eliminar "${p.nombre}"?`)) eliminar.mutate(p.id); }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {p.sku || 'Sin SKU'}{p.activo === false ? ' · Inactivo' : ''}
                  </p>
                  <div className="flex items-center justify-between gap-2 mt-2">
                    {p.categoria
                      ? <Badge className={`text-[10px] border-transparent ${CAT_COLOR[p.categoria] || ''}`}>{CATEGORIAS.find(c => c.value === p.categoria)?.label || p.categoria}</Badge>
                      : <span />}
                    <span className="text-sm font-semibold">{fmtCOP(p.precio_venta)}</span>
                  </div>
                  {isAdmin && margen != null && (
                    <p className="text-[11px] text-muted-foreground mt-1">Costo {fmtCOP(p.costo)} · margen {margen}%</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal crear/editar */}
      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar producto' : 'Nuevo producto'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {/* Foto */}
            <div className="flex items-center gap-3">
              {form.foto
                ? <img src={form.foto} alt="" className="w-16 h-16 rounded-lg object-cover border border-border/40" />
                : <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center flex-shrink-0"><ImageIcon className="w-6 h-6 text-muted-foreground/40" /></div>}
              <div className="space-y-1.5">
                <Label>Foto del producto</Label>
                <div className="flex items-center gap-2">
                  <input ref={fotoRef} type="file" accept="image/*" className="hidden" onChange={subirFoto} />
                  <Button type="button" variant="outline" size="sm" onClick={() => fotoRef.current?.click()} disabled={subiendoFoto}>
                    <Upload className="w-3.5 h-3.5 mr-1" /> {subiendoFoto ? 'Subiendo...' : form.foto ? 'Cambiar' : 'Subir foto'}
                  </Button>
                  {form.foto && <Button type="button" variant="ghost" size="sm" onClick={() => set('foto', '')}><X className="w-3.5 h-3.5" /></Button>}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Nombre *</Label>
              <Input value={form.nombre} onChange={e => onNombreChange(e.target.value)} placeholder="Tag UHF adhesivo 902-928MHz" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>SKU</Label>
                <Input value={form.sku} onChange={e => set('sku', e.target.value)} placeholder="TAG-UHF-001" />
              </div>
              <div className="space-y-1.5">
                <Label>Categoría</Label>
                <Select value={form.categoria} onValueChange={v => set('categoria', v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>{CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tipo RFID</Label>
                <Select value={form.tipo_rfid} onValueChange={v => set('tipo_rfid', v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{TIPOS_RFID.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Descripción</Label>
              <Textarea value={form.descripcion} onChange={e => set('descripcion', e.target.value)} rows={2} />
            </div>

            {/* Ficha técnica RFID: la usa Nova para recomendar el tag adecuado */}
            <div className="rounded-lg border border-border/60 p-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground">Ficha técnica (para recomendación de Nova)</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Superficie</Label>
                  <Select value={form.superficie} onValueChange={v => set('superficie', v)}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Metal">Metal</SelectItem>
                      <SelectItem value="No metal">No metal</SelectItem>
                      <SelectItem value="Ambos">Ambos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Temperatura máx (°C)</Label>
                  <Input type="number" value={form.temp_max} onChange={e => set('temp_max', e.target.value)} placeholder="300" />
                </div>
                <div className="space-y-1.5">
                  <Label>Rango de lectura (m)</Label>
                  <Input type="number" value={form.rango_m} onChange={e => set('rango_m', e.target.value)} placeholder="5" />
                </div>
                <div className="space-y-1.5">
                  <Label>Entorno</Label>
                  <Input value={form.entorno} onChange={e => set('entorno', e.target.value)} placeholder="Interior, exterior, industrial, húmedo..." />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Aplicación típica</Label>
                <Input value={form.aplicacion} onChange={e => set('aplicacion', e.target.value)} placeholder="Activos, herramientas, textil, vehículos, inventario..." />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Precio de venta (COP)</Label>
                <Input type="number" value={form.precio_venta} onChange={e => set('precio_venta', e.target.value)} placeholder="2500" />
              </div>
              <div className="space-y-1.5">
                <Label>Costo (COP)</Label>
                <Input type="number" value={form.costo} onChange={e => set('costo', e.target.value)} placeholder="1200" />
              </div>
            </div>
            {/* Compramos en USD: convertir el costo a COP con la TRM del día */}
            <div className="bg-muted/40 rounded-lg px-3 py-2">
              <ConversorUSD label="Costo en USD → COP" onAplicarCOP={(cop) => set('costo', cop)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Stock mínimo</Label>
                <Input type="number" value={form.stock_minimo} onChange={e => set('stock_minimo', e.target.value)} placeholder="100" />
              </div>
              <div className="space-y-1.5">
                <Label>Unidad</Label>
                <Input value={form.unidad} onChange={e => set('unidad', e.target.value)} placeholder="unidad, rollo, caja..." />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.activo} onChange={e => set('activo', e.target.checked)} />
              Activo (aparece en cotizaciones)
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(false)}>Cancelar</Button>
            <Button onClick={() => guardar.mutate()} disabled={!form.nombre || guardar.isPending}>
              {guardar.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
