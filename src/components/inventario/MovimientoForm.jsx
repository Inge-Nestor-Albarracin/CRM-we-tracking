import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function MovimientoForm({ productos, empresas, onSave, onCancel }) {
  const [data, setData] = useState({ producto_id: '', tipo: 'entrada', cantidad: '', motivo: '', empresa_id: '' });

  const handleSubmit = () => {
    if (!data.producto_id || !data.cantidad) return;
    const payload = { ...data, cantidad: parseInt(data.cantidad, 10) };
    if (!payload.motivo) delete payload.motivo;
    if (!payload.empresa_id || payload.tipo !== 'salida') delete payload.empresa_id;
    onSave(payload);
  };

  return (
    <div className="bg-card rounded-xl p-5">
      <h2 className="text-sm font-semibold text-foreground mb-4">Registrar Movimiento</h2>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Producto</label>
          <Select value={data.producto_id} onValueChange={(val) => setData({ ...data, producto_id: val })}>
            <SelectTrigger className="mt-1 rounded-lg"><SelectValue placeholder="Seleccionar producto" /></SelectTrigger>
            <SelectContent>
              {productos.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.nombre}{p.sku ? ` (${p.sku})` : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Tipo</label>
            <Select value={data.tipo} onValueChange={(val) => setData({ ...data, tipo: val })}>
              <SelectTrigger className="mt-1 rounded-lg"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="entrada">Entrada</SelectItem>
                <SelectItem value="salida">Salida</SelectItem>
                <SelectItem value="ajuste">Ajuste</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Cantidad</label>
            <Input
              type="number"
              value={data.cantidad}
              onChange={(e) => setData({ ...data, cantidad: e.target.value })}
              placeholder={data.tipo === 'ajuste' ? '± cantidad' : '0'}
              className="mt-1 rounded-lg"
            />
          </div>
        </div>
        {data.tipo === 'salida' && (
          <div>
            <label className="text-xs font-medium text-muted-foreground">Empresa (opcional)</label>
            <Select value={data.empresa_id} onValueChange={(val) => setData({ ...data, empresa_id: val })}>
              <SelectTrigger className="mt-1 rounded-lg"><SelectValue placeholder="Sin empresa" /></SelectTrigger>
              <SelectContent>
                {empresas.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <label className="text-xs font-medium text-muted-foreground">Motivo (opcional)</label>
          <Input value={data.motivo} onChange={(e) => setData({ ...data, motivo: e.target.value })} placeholder="Compra, venta, instalación, devolución..." className="mt-1 rounded-lg" />
        </div>
        <div className="flex gap-2 pt-1">
          <Button onClick={handleSubmit} className="flex-1 rounded-lg">Registrar</Button>
          <Button onClick={onCancel} variant="outline" className="flex-1 rounded-lg">Cancelar</Button>
        </div>
      </div>
    </div>
  );
}
