import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Producto, MovimientoInventario, Empresa } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Plus, AlertTriangle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import StockSummary from '@/components/inventario/StockSummary';
import StockTable from '@/components/inventario/StockTable';
import MovimientoForm from '@/components/inventario/MovimientoForm';
import MovimientosHistory from '@/components/inventario/MovimientosHistory';
import TRMIndicator from '@/components/TRMIndicator';

export default function Inventario() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);

  const { data: productos = [] } = useQuery({
    queryKey: ['productos'],
    queryFn: () => Producto.list(),
  });

  const { data: movimientos = [] } = useQuery({
    queryKey: ['movimientos-inventario'],
    queryFn: () => MovimientoInventario.list('-created_date'),
  });

  const { data: empresas = [] } = useQuery({
    queryKey: ['empresas'],
    queryFn: () => Empresa.list(),
  });

  const stockMap = useMemo(() => {
    const map = {};
    movimientos.filter(m => m.producto_id).forEach(m => {
      const delta = m.tipo === 'entrada' ? m.cantidad : m.tipo === 'salida' ? -m.cantidad : m.cantidad;
      map[m.producto_id] = (map[m.producto_id] || 0) + delta;
    });
    return map;
  }, [movimientos]);

  const productosActivos = useMemo(() => productos.filter(p => p.activo !== false), [productos]);
  const bajoMinimo = useMemo(
    () => productosActivos.filter(p => (stockMap[p.id] || 0) < (p.stock_minimo || 0)),
    [productosActivos, stockMap]
  );

  const crearMovimiento = useMutation({
    mutationFn: (data) => MovimientoInventario.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['movimientos-inventario'] });
      setShowForm(false);
      toast({ title: 'Movimiento registrado' });
    },
    onError: (err) => toast({ title: 'Error al registrar', description: err?.message || String(err), variant: 'destructive' }),
  });

  const movimientosProducto = useMemo(() => movimientos.filter(m => m.producto_id), [movimientos]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Inventario</h1>
          <p className="text-sm text-muted-foreground mt-1">Control de stock del catálogo RFID · compramos en USD</p>
        </div>
        <div className="flex items-center gap-2">
          <TRMIndicator />
          <Button size="sm" className="h-9" onClick={() => setShowForm(v => !v)}>
            <Plus className="w-4 h-4 mr-1" /> {showForm ? 'Cerrar' : 'Registrar movimiento'}
          </Button>
        </div>
      </div>

      {bajoMinimo.length > 0 && (
        <div className="flex items-start gap-3 p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-700 dark:text-amber-400 text-[14px]">
              {bajoMinimo.length} producto{bajoMinimo.length !== 1 ? 's' : ''} bajo el stock mínimo
            </p>
            <p className="text-[12px] text-amber-600 dark:text-amber-500">
              {bajoMinimo.slice(0, 4).map(p => `${p.nombre} (${stockMap[p.id] || 0}/${p.stock_minimo})`).join(' · ')}
              {bajoMinimo.length > 4 && ` · +${bajoMinimo.length - 4} más`}
            </p>
          </div>
        </div>
      )}

      <StockSummary productos={productos} stockMap={stockMap} />

      {showForm && (
        <MovimientoForm
          productos={productosActivos}
          empresas={empresas}
          onSave={(data) => crearMovimiento.mutate(data)}
          onCancel={() => setShowForm(false)}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <StockTable productos={productosActivos} stockMap={stockMap} />
        </div>
        <MovimientosHistory movimientos={movimientosProducto} productos={productos} empresas={empresas} />
      </div>
    </div>
  );
}
