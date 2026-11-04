import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useCurrencyRates } from '@/hooks/useCurrencyRates';

/**
 * Mini-conversor: escribes un monto en USD y lo convierte a COP con la TRM del día.
 * Props: onAplicarCOP(valorCOP) — opcional, agrega un botón "Usar" que devuelve el COP.
 */
export default function ConversorUSD({ onAplicarCOP, label = 'Convertir de USD' }) {
  const { rates } = useCurrencyRates();
  const [usd, setUsd] = useState('');
  const cop = usd ? Math.round(Number(usd) * rates.COP) : 0;

  return (
    <div className="flex items-end gap-2">
      <div className="space-y-1">
        <label className="text-[11px] text-muted-foreground">{label} (TRM ${Math.round(rates.COP).toLocaleString('es-CO')})</label>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">USD</span>
          <Input type="number" value={usd} onChange={e => setUsd(e.target.value)} placeholder="0" className="h-8 w-24 text-sm" />
          <span className="text-xs text-muted-foreground">=</span>
          <span className="text-sm font-medium min-w-20">${cop.toLocaleString('es-CO')} <span className="text-xs text-muted-foreground">COP</span></span>
        </div>
      </div>
      {onAplicarCOP && (
        <Button type="button" variant="outline" size="sm" className="h-8" disabled={!cop} onClick={() => { onAplicarCOP(cop); setUsd(''); }}>
          Usar
        </Button>
      )}
    </div>
  );
}
