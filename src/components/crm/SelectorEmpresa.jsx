import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Empresa } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Building2, Plus, Check, ChevronDown } from 'lucide-react';

/**
 * Logo de empresa a partir de su dominio web.
 * Intenta el logo real del sitio (logo.clearbit.com, el mismo servicio de
 * HubSpot) y si no existe cae al favicon de Google; sin dominio, icono genérico.
 */
function Favicon({ empresa, className = 'w-5 h-5' }) {
  const dominio = empresa?.dominio_web;
  const logo = empresa?.logo_url;
  const [fuente, setFuente] = useState(0);
  const [logoFallo, setLogoFallo] = useState(false);

  useEffect(() => { setFuente(0); setLogoFallo(false); }, [dominio, logo]);

  // Logo propio subido a mano: manda sobre el que se deduce del dominio.
  if (logo && !logoFallo) {
    return (
      <img
        src={logo}
        alt=""
        onError={() => setLogoFallo(true)}
        className={`${className} rounded object-contain bg-white flex-shrink-0`}
      />
    );
  }

  if (!dominio || fuente >= 2) {
    return (
      <div className={`${className} rounded bg-primary/10 flex items-center justify-center flex-shrink-0`}>
        <Building2 className="w-[60%] h-[60%] text-primary" />
      </div>
    );
  }

  const src = fuente === 0
    ? `https://logo.clearbit.com/${dominio}`
    : `https://www.google.com/s2/favicons?domain=${dominio}&sz=64`;

  return (
    <img
      src={src}
      alt=""
      onError={() => setFuente(f => f + 1)}
      className={`${className} rounded object-contain bg-white flex-shrink-0`}
    />
  );
}

/**
 * Combobox de Empresa con búsqueda y creación rápida.
 * Props: value (empresa_id), onChange(empresa_id, empresa), placeholder, sugerencia (nombre libre para pre-buscar)
 */
export default function SelectorEmpresa({ value, onChange, placeholder = 'Buscar empresa...', sugerencia = '' }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data: empresas = [] } = useQuery({
    queryKey: ['empresas'],
    queryFn: () => Empresa.list('-updated_date'),
  });

  const crearRapida = useMutation({
    mutationFn: (nombre) => Empresa.create({ nombre, estado: 'Prospecto' }),
    onSuccess: (nueva) => {
      qc.invalidateQueries({ queryKey: ['empresas'] });
      onChange(nueva.id, nueva);
      setOpen(false);
      setSearch('');
    },
  });

  const seleccionada = empresas.find(e => e.id === value);
  const q = (search || '').toLowerCase();
  const filtradas = q
    ? empresas.filter(e => e.nombre?.toLowerCase().includes(q) || e.dominio_web?.toLowerCase().includes(q))
    : empresas;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => { setOpen(o => !o); if (!open && sugerencia && !value) setSearch(sugerencia); }}
        className="w-full flex items-center gap-2 border rounded-md px-3 py-2 text-sm bg-background hover:bg-muted/40 transition-colors"
      >
        {seleccionada ? (
          <>
            <Favicon empresa={seleccionada} />
            <span className="flex-1 text-left truncate">{seleccionada.nombre}</span>
          </>
        ) : (
          <span className="flex-1 text-left text-muted-foreground">{placeholder}</span>
        )}
        <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-md p-2 space-y-1">
            <Input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Escribe para buscar..."
              className="h-8 text-sm"
            />
            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {value && (
                <button
                  type="button"
                  className="w-full text-left px-2 py-1.5 rounded text-xs text-muted-foreground hover:bg-muted"
                  onClick={() => { onChange('', null); setOpen(false); setSearch(''); }}
                >
                  Quitar vínculo
                </button>
              )}
              {filtradas.map(e => (
                <button
                  key={e.id}
                  type="button"
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-muted text-left"
                  onClick={() => { onChange(e.id, e); setOpen(false); setSearch(''); }}
                >
                  <Favicon empresa={e} />
                  <span className="flex-1 truncate">{e.nombre}</span>
                  {e.id === value && <Check className="w-3.5 h-3.5 text-primary" />}
                </button>
              ))}
              {filtradas.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">Sin resultados</p>
              )}
            </div>
            {search.trim() && !filtradas.some(e => e.nombre?.toLowerCase() === q) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full h-8 text-xs"
                disabled={crearRapida.isPending}
                onClick={() => crearRapida.mutate(search.trim())}
              >
                <Plus className="w-3 h-3 mr-1" />
                {crearRapida.isPending ? 'Creando...' : `Crear empresa "${search.trim()}"`}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export { Favicon };