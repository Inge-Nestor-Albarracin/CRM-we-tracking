import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X } from 'lucide-react';
import { camposDe, campoMeta, operadoresDe, OPERADORES_SIN_VALOR } from '@/lib/segmentos';
import { useOpciones } from '@/hooks/useOpciones';

/**
 * Constructor visual de criterios de segmento.
 * Props: tipo ('contacto'|'empresa'), filtros, setFiltros, logica, setLogica
 */
export default function ConstructorSegmento({ tipo = 'contacto', filtros, setFiltros, logica, setLogica }) {
  const campos = camposDe(tipo);
  // Listas configurables (Configuración → Listas) para los campos dinámicos
  const sectores = useOpciones('sectores');
  const tiposNecesidad = useOpciones('tipos_necesidad');
  const opcionesDinamicas = { sectores, tipos_necesidad: tiposNecesidad };
  const opcionesDe = (meta) => meta?.opciones || (meta?.listaClave ? opcionesDinamicas[meta.listaClave] : null) || [];

  function setCriterio(i, patch) {
    setFiltros(filtros.map((f, idx) => idx === i ? { ...f, ...patch } : f));
  }
  function cambiarCampo(i, campo) {
    const ops = operadoresDe(tipo, campo);
    setCriterio(i, { campo, operador: ops[0]?.v || 'es', valor: '' });
  }
  function agregar() {
    setFiltros([...filtros, { campo: campos[0].key, operador: 'es', valor: '' }]);
  }
  function quitar(i) {
    setFiltros(filtros.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-2">
      {filtros.length > 1 && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Deben cumplir</span>
          <div className="inline-flex rounded-md border overflow-hidden">
            <button type="button" onClick={() => setLogica('AND')} className={`px-2.5 py-1 ${logica === 'AND' ? 'bg-foreground text-background' : 'hover:bg-muted'}`}>todos</button>
            <button type="button" onClick={() => setLogica('OR')} className={`px-2.5 py-1 ${logica === 'OR' ? 'bg-foreground text-background' : 'hover:bg-muted'}`}>cualquiera</button>
          </div>
          <span className="text-muted-foreground">de los criterios</span>
        </div>
      )}

      {filtros.length === 0 && (
        <p className="text-sm text-muted-foreground py-2">Sin criterios — incluye a todos.</p>
      )}

      {filtros.map((f, i) => {
        const meta = campoMeta(tipo, f.campo);
        const ops = operadoresDe(tipo, f.campo);
        const sinValor = OPERADORES_SIN_VALOR.includes(f.operador);
        return (
          <div key={i} className="flex items-center gap-2 flex-wrap bg-muted/30 rounded-lg p-2">
            {i > 0 && <span className="text-[11px] font-medium text-muted-foreground w-8">{logica === 'OR' ? 'o' : 'y'}</span>}
            <select
              value={f.campo}
              onChange={e => cambiarCampo(i, e.target.value)}
              className="h-8 px-2 text-xs rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-primary flex-1 min-w-32"
            >
              {campos.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <select
              value={f.operador}
              onChange={e => setCriterio(i, { operador: e.target.value })}
              className="h-8 px-2 text-xs rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {ops.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
            {!sinValor && (
              meta?.tipo === 'select' ? (
                <select
                  value={f.valor}
                  onChange={e => setCriterio(i, { valor: e.target.value })}
                  className="h-8 px-2 text-xs rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-primary flex-1 min-w-28"
                >
                  <option value="">Seleccionar...</option>
                  {opcionesDe(meta).map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <Input
                  type={meta?.tipo === 'number' ? 'number' : meta?.tipo === 'date' ? 'date' : 'text'}
                  value={f.valor}
                  onChange={e => setCriterio(i, { valor: e.target.value })}
                  placeholder="Valor"
                  className="h-8 text-xs flex-1 min-w-28"
                />
              )
            )}
            <button type="button" onClick={() => quitar(i)} className="p-1 text-muted-foreground hover:text-destructive flex-shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}

      <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={agregar}>
        <Plus className="w-3.5 h-3.5 mr-1" /> Agregar criterio
      </Button>
    </div>
  );
}
