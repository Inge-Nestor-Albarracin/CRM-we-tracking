import React from 'react';
import { useUserRole } from '@/hooks/useUserRole';
import { AlertTriangle } from 'lucide-react';

const CATEGORIA_LABEL = {
  Tags_RFID: 'Tags RFID',
  Lectores: 'Lectores',
  Antenas: 'Antenas',
  Impresoras: 'Impresoras',
  Software: 'Software',
  Servicios: 'Servicios',
  Otro: 'Otro',
};

export default function StockTable({ productos, stockMap }) {
  const { isAdmin } = useUserRole();

  return (
    <div className="bg-card rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border/40">
        <h2 className="text-sm font-semibold text-foreground">Stock por Producto</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="border-b border-border/40">
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Producto</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Categoría</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Stock</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Mínimo</th>
              {isAdmin && <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Valor a costo</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {productos.map((p) => {
              const stock = stockMap[p.id] || 0;
              const bajoMinimo = stock < (p.stock_minimo || 0);
              return (
                <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{p.nombre}</p>
                    {p.sku && <p className="text-xs text-muted-foreground">{p.sku}</p>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{CATEGORIA_LABEL[p.categoria] || p.categoria || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      stock <= 0 ? 'bg-destructive/10 text-destructive'
                        : bajoMinimo ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'
                        : 'bg-blue-500/10 text-blue-600'
                    }`}>
                      {bajoMinimo && <AlertTriangle className="w-3 h-3" />}
                      {stock.toLocaleString('es-CO')} {p.unidad && p.unidad !== 'unidad' ? p.unidad : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.stock_minimo || 0}</td>
                  {isAdmin && <td className="px-4 py-3 text-right font-medium text-foreground">${Math.round(Math.max(0, stock) * (p.costo || 0)).toLocaleString('es-CO')}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
