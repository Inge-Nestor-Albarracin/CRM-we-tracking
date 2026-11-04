import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ReunionNota, Empresa } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Search, FileDown, ExternalLink } from 'lucide-react';
import { APP_URL } from '@/lib/wetracking';

const TIPO_LABEL = {
  Comite_Comercial: 'Comité Comercial',
  Reunion_Cliente: 'Reunión con cliente',
  Otro: 'Otro',
};

// Recopila automáticamente todas las actas generadas por IA (ReunionNota.acta_md),
// listas para ver o descargar en PDF (reusa la vista imprimible /crm/reuniones/:id/acta).
export default function ActasReunion() {
  const [busqueda, setBusqueda] = useState('');

  const { data: reuniones = [], isLoading } = useQuery({
    queryKey: ['reuniones'],
    queryFn: () => ReunionNota.list('-fecha_reunion', 500),
  });
  const { data: empresas = [] } = useQuery({ queryKey: ['empresas'], queryFn: () => Empresa.list() });
  const empresasById = useMemo(() => Object.fromEntries(empresas.map(e => [e.id, e])), [empresas]);

  const q = busqueda.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const actas = useMemo(() => reuniones.filter(r => {
    if (r.descartada) return false;
    if (!r.acta_md || !r.acta_md.trim()) return false;
    if (q) {
      const heno = [r.titulo, empresasById[r.empresa_id]?.nombre].filter(Boolean).join(' ')
        .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (!heno.includes(q)) return false;
    }
    return true;
  }), [reuniones, empresasById, q]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Actas de Reunión</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Todas las actas generadas con IA, listas para ver o descargar en PDF. Se agregan solas al procesar cada reunión.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por título o empresa…"
            className="pl-9 h-9"
          />
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {actas.length} acta{actas.length !== 1 ? 's' : ''}
        </span>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando...</div>
      ) : actas.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm mb-1">Aún no hay actas</p>
          <p className="text-xs">Procesa una reunión con IA y su acta aparecerá aquí automáticamente.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {actas.map(r => {
            const empresa = empresasById[r.empresa_id];
            return (
              <div key={r.id} className="bg-card border border-border/40 rounded-xl p-4 flex items-start gap-3 hover:shadow-sm transition-all">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <FileText className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link to={`/crm/reuniones/${r.id}`} className="font-medium text-sm hover:underline">{r.titulo}</Link>
                    {r.tipo && <Badge className="text-[10px] border-transparent bg-muted text-muted-foreground">{TIPO_LABEL[r.tipo] || r.tipo}</Badge>}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                    {r.fecha_reunion && <span>{new Date(r.fecha_reunion + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                    {empresa && <Link to={`/crm/empresas/${r.empresa_id}`} className="text-primary font-medium hover:underline">{empresa.nombre}</Link>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <a href={`${APP_URL}/crm/reuniones/${r.id}/acta`} target="_blank" rel="noopener noreferrer">
                    <Button variant="ghost" size="sm" className="h-8 text-xs"><ExternalLink className="w-3.5 h-3.5 mr-1" /> Ver</Button>
                  </a>
                  <a href={`${APP_URL}/crm/reuniones/${r.id}/acta?print=1`} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" className="h-8 text-xs"><FileDown className="w-3.5 h-3.5 mr-1" /> PDF</Button>
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
