import { useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';

/**
 * Tarjeta colapsable de objetos asociados para el panel derecho (estilo HubSpot).
 * Props: titulo, count, icono, onAgregar?, agregarLabel?, defaultAbierto=true, vacio, children
 */
export default function PanelAsociado({ titulo, count, icono, onAgregar, agregarLabel = 'Agregar', defaultAbierto = true, vacio, children }) {
  const [abierto, setAbierto] = useState(defaultAbierto);

  return (
    <div className="bg-card border border-border/60 rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          onClick={() => setAbierto(a => !a)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          <ChevronDown className={`w-4 h-4 text-muted-foreground/70 transition-transform ${abierto ? '' : '-rotate-90'}`} />
          {icono && <span className="text-muted-foreground/70 flex-shrink-0">{icono}</span>}
          <span className="text-sm font-semibold truncate">{titulo}</span>
          {count != null && <span className="text-[11px] font-medium text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 min-w-[20px] text-center">{count}</span>}
        </button>
        {onAgregar && (
          <button
            onClick={onAgregar}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-medium flex-shrink-0"
            title={agregarLabel}
          >
            <Plus className="w-3.5 h-3.5" /> {agregarLabel}
          </button>
        )}
      </div>
      {abierto && (
        <div className="px-4 pb-4 pt-0.5 space-y-2.5">
          {children}
          {vacio}
        </div>
      )}
    </div>
  );
}
