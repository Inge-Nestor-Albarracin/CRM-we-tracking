import React from 'react';
import { Package, AlertTriangle, Warehouse, DollarSign } from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';

export default function StockSummary({ productos, stockMap }) {
  const { isAdmin } = useUserRole();
  const activos = productos.filter(p => p.activo !== false);
  const totalStock = activos.reduce((s, p) => s + Math.max(0, stockMap[p.id] || 0), 0);
  const bajoMinimo = activos.filter(p => (stockMap[p.id] || 0) < (p.stock_minimo || 0)).length;
  const sinStock = activos.filter(p => (stockMap[p.id] || 0) <= 0).length;
  const valorInventario = activos.reduce((s, p) => s + Math.max(0, stockMap[p.id] || 0) * (p.costo || 0), 0);

  return (
    <div className={`grid grid-cols-2 ${isAdmin ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-3`}>
      <div className="bg-card rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Warehouse className="w-4 h-4 text-primary" />
          <p className="text-xs text-muted-foreground">Unidades en stock</p>
        </div>
        <p className="text-2xl font-semibold tracking-tight text-foreground">{totalStock.toLocaleString('es-CO')}</p>
      </div>
      <div className="bg-card rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <p className="text-xs text-muted-foreground">Bajo mínimo</p>
        </div>
        <p className={`text-2xl font-semibold tracking-tight ${bajoMinimo > 0 ? 'text-amber-600' : 'text-foreground'}`}>{bajoMinimo}</p>
      </div>
      <div className="bg-card rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Package className="w-4 h-4 text-destructive" />
          <p className="text-xs text-muted-foreground">Sin stock</p>
        </div>
        <p className="text-2xl font-semibold tracking-tight text-foreground">{sinStock}</p>
      </div>
      {isAdmin && (
        <div className="bg-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-green-500" />
            <p className="text-xs text-muted-foreground">Valor a costo</p>
          </div>
          <p className="text-2xl font-semibold tracking-tight text-foreground">${Math.round(valorInventario).toLocaleString('es-CO')}</p>
        </div>
      )}
    </div>
  );
}
