import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X, GripVertical } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useListasOpciones, LISTAS_META, OPCIONES_DEFAULT } from '@/hooks/useOpciones';

function ListaEditor({ meta, registro }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const inicial = (registro?.valores?.length ? registro.valores : OPCIONES_DEFAULT[meta.clave]) || [];
  const [valores, setValores] = useState(inicial);
  const [nuevo, setNuevo] = useState('');

  useEffect(() => {
    setValores((registro?.valores?.length ? registro.valores : OPCIONES_DEFAULT[meta.clave]) || []);
  }, [registro, meta.clave]);

  const guardar = useMutation({
    mutationFn: (nuevosValores) => {
      const datos = { clave: meta.clave, valores: nuevosValores };
      return registro?.id ? base44.entities.ListaOpciones.update(registro.id, datos) : base44.entities.ListaOpciones.create(datos);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['listas-opciones'] });
      toast({ title: `${meta.label} guardado` });
    },
    onError: (err) => toast({ title: 'Error al guardar', description: err?.message || String(err), variant: 'destructive' }),
  });

  function agregar() {
    const v = nuevo.trim();
    if (!v || valores.some(x => x.toLowerCase() === v.toLowerCase())) { setNuevo(''); return; }
    const nuevos = [...valores, v];
    setValores(nuevos);
    setNuevo('');
    guardar.mutate(nuevos);
  }

  function quitar(i) {
    const nuevos = valores.filter((_, idx) => idx !== i);
    setValores(nuevos);
    guardar.mutate(nuevos);
  }

  function editar(i, texto) {
    setValores(valores.map((v, idx) => idx === i ? texto : v));
  }

  return (
    <div className="bg-card border border-border/60 rounded-xl p-4">
      <div className="mb-3">
        <p className="font-medium text-sm">{meta.label}</p>
        <p className="text-xs text-muted-foreground">{meta.descripcion}</p>
      </div>

      <div className="space-y-1.5">
        {valores.map((v, i) => (
          <div key={i} className="flex items-center gap-2">
            <GripVertical className="w-3.5 h-3.5 text-muted-foreground/30 flex-shrink-0" />
            <Input
              value={v}
              onChange={e => editar(i, e.target.value)}
              onBlur={() => { if (v.trim()) guardar.mutate(valores.map(x => x.trim()).filter(Boolean)); }}
              className="h-8 text-sm"
            />
            <button onClick={() => quitar(i)} className="p-1.5 text-muted-foreground hover:text-destructive flex-shrink-0" title="Eliminar">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {valores.length === 0 && <p className="text-xs text-muted-foreground py-1">Sin valores todavía.</p>}
      </div>

      <div className="flex gap-2 mt-3">
        <Input
          value={nuevo}
          onChange={e => setNuevo(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && agregar()}
          placeholder={`Agregar a ${meta.label.toLowerCase()}...`}
          className="h-8 text-sm"
        />
        <Button size="sm" variant="outline" className="h-8" onClick={agregar} disabled={!nuevo.trim()}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Agregar
        </Button>
      </div>
    </div>
  );
}

export default function ListasTab() {
  const { data: registros = [], isLoading } = useListasOpciones();

  if (isLoading) {
    return <div className="flex items-center justify-center h-32"><div className="w-5 h-5 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Personaliza las listas que se usan para clasificar empresas y contactos. Los cambios se guardan automáticamente y aparecen en todos los formularios.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {LISTAS_META.map(meta => (
          <ListaEditor key={meta.clave} meta={meta} registro={registros.find(r => r.clave === meta.clave)} />
        ))}
      </div>
    </div>
  );
}
