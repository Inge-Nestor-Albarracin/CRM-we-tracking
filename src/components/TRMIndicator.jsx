import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useCurrencyRates } from '@/hooks/useCurrencyRates';

/**
 * Indicador de TRM (USD → COP) con botón para actualizar la tasa del día.
 * Compramos en USD, vendemos en COP.
 */
export default function TRMIndicator({ className = '' }) {
  const qc = useQueryClient();
  const { rates, source, isLoading } = useCurrencyRates();
  const [refrescando, setRefrescando] = useState(false);

  async function refrescar() {
    setRefrescando(true);
    await qc.invalidateQueries({ queryKey: ['currency-rates'] });
    setTimeout(() => setRefrescando(false), 900);
  }

  return (
    <div className={`inline-flex items-center gap-2 border border-border/60 rounded-lg px-3 py-1.5 bg-card ${className}`}>
      <span className="text-xs text-muted-foreground">TRM del día</span>
      <span className="text-sm font-semibold">${Math.round(rates.COP).toLocaleString('es-CO')}</span>
      <span className="text-[11px] text-muted-foreground">COP / USD</span>
      <button
        onClick={refrescar}
        disabled={refrescando || isLoading}
        className="text-muted-foreground hover:text-foreground ml-0.5"
        title={`Actualizar TRM${source ? ` (${source})` : ''}`}
      >
        <RefreshCw className={`w-3.5 h-3.5 ${refrescando || isLoading ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
}
