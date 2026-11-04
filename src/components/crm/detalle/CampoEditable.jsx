import { useState, useRef, useEffect } from 'react';
import { Pencil, Check, X } from 'lucide-react';

/**
 * Campo con edición inline estilo HubSpot: muestra label + valor con un lápiz
 * en hover; al hacer clic se vuelve input/select; guarda en Enter/blur, cancela
 * en Escape.
 * Props:
 *   label, value, onSave(nuevoValor)
 *   tipo: 'text' | 'number' | 'email' | 'select'
 *   opciones: [{ value, label }]  (para select)
 *   formato(v): función para mostrar el valor (ej. formatCOP)
 *   icono, placeholder
 */
export default function CampoEditable({ label, value, onSave, tipo = 'text', opciones = [], formato, icono, placeholder }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(value ?? '');
  const [guardando, setGuardando] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { if (!editando) setValor(value ?? ''); }, [value, editando]);
  useEffect(() => { if (editando && inputRef.current) inputRef.current.focus(); }, [editando]);

  async function guardar() {
    if (String(valor) === String(value ?? '')) { setEditando(false); return; }
    setGuardando(true);
    try {
      await onSave(valor);
      setEditando(false);
    } finally {
      setGuardando(false);
    }
  }

  function onKey(e) {
    if (e.key === 'Enter' && tipo !== 'textarea') { e.preventDefault(); guardar(); }
    if (e.key === 'Escape') { setValor(value ?? ''); setEditando(false); }
  }

  const mostrado = value != null && value !== ''
    ? (formato ? formato(value) : (tipo === 'select' ? (opciones.find(o => o.value === value)?.label || value) : value))
    : '—';

  if (editando) {
    return (
      <div className="py-2.5">
        <div className="text-[11px] font-medium text-muted-foreground/80 uppercase tracking-wide flex items-center gap-1 mb-1">{icono}{label}</div>
        <div className="flex items-center gap-1">
          {tipo === 'select' ? (
            <select
              ref={inputRef}
              value={valor}
              onChange={e => setValor(e.target.value)}
              onKeyDown={onKey}
              className="flex-1 h-8 px-2 text-sm rounded-md border border-primary bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">—</option>
              {opciones.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : (
            <input
              ref={inputRef}
              type={tipo === 'number' ? 'number' : tipo === 'email' ? 'email' : 'text'}
              value={valor}
              onChange={e => setValor(e.target.value)}
              onKeyDown={onKey}
              placeholder={placeholder}
              className="flex-1 h-8 px-2 text-sm rounded-md border border-primary bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          )}
          <button onClick={guardar} disabled={guardando} className="p-1.5 rounded-md hover:bg-green-500/10 text-green-600" title="Guardar">
            <Check className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => { setValor(value ?? ''); setEditando(false); }} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground" title="Cancelar">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditando(true)}
      className="w-full text-left py-2.5 group rounded-lg hover:bg-muted/40 px-2 -mx-2 transition-colors"
    >
      <div className="text-[11px] font-medium text-muted-foreground/80 uppercase tracking-wide flex items-center gap-1 mb-1">{icono}{label}</div>
      <div className="flex items-center gap-1.5">
        <span className={`text-sm flex-1 min-w-0 truncate ${mostrado === '—' ? 'text-muted-foreground/40' : 'text-foreground font-medium'}`}>{mostrado}</span>
        <Pencil className="w-3 h-3 text-muted-foreground/0 group-hover:text-muted-foreground/60 transition-colors flex-shrink-0" />
      </div>
    </button>
  );
}
