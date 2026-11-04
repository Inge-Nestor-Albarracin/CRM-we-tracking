import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Empresa, Oportunidad, Contacto } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { Building2, Search, ExternalLink, Plus, Download, Upload, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import EmpresaForm from '@/components/crm/EmpresaForm';
import ImportarEmpresasModal from '@/components/crm/ImportarEmpresasModal';
import { Favicon } from '@/components/crm/SelectorEmpresa';
import { exportarCSV } from '@/lib/csv';
import { useToast } from '@/components/ui/use-toast';
import { useUserRole } from '@/hooks/useUserRole';

const ESTADO_STYLE = {
  Prospecto: 'bg-slate-100 text-slate-600',
  Cliente_Activo: 'bg-green-100 text-green-700',
  Cliente_Inactivo: 'bg-gray-100 text-gray-500',
};

import { ETAPAS_ABIERTAS_OP as ETAPAS_ABIERTAS } from '@/components/crm/OportunidadKanban';

function formatValor(n) {
  if (!n) return '—';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

export default function Empresas() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isAdmin } = useUserRole();
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [importarOpen, setImportarOpen] = useState(false);
  const [seleccion, setSeleccion] = useState(() => new Set());
  const [eliminando, setEliminando] = useState(false);

  const { data: empresas = [], isLoading } = useQuery({
    queryKey: ['empresas'],
    queryFn: () => Empresa.list('-updated_date'),
  });

  const { data: oportunidades = [] } = useQuery({
    queryKey: ['oportunidades'],
    queryFn: () => Oportunidad.list(),
  });

  const { data: contactos = [] } = useQuery({
    queryKey: ['contactos'],
    queryFn: () => Contacto.list(),
  });

  const statsPorEmpresa = useMemo(() => {
    const map = {};
    for (const o of oportunidades) {
      if (!o.empresa_id) continue;
      if (!map[o.empresa_id]) map[o.empresa_id] = { abiertas: 0, valorAbierto: 0 };
      if (ETAPAS_ABIERTAS.includes(o.etapa)) {
        map[o.empresa_id].abiertas++;
        if ((o.moneda || 'COP') === 'COP') map[o.empresa_id].valorAbierto += o.valor_estimado || 0;
      }
    }
    return map;
  }, [oportunidades]);

  const filtered = empresas.filter(e => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [e.nombre, e.sector, e.ciudad, e.dominio_web, e.email]
      .some(f => f?.toLowerCase().includes(q));
  });

  // Export masivo de empresas con métricas asociadas
  function exportarEmpresas() {
    const columnas = [
      'Nombre', 'Dominio web', 'Sector', 'Ciudad', 'País', 'Dirección',
      'Teléfono', 'Email', 'Estado', 'Propietario', 'Última actividad',
      'Contactos', 'Contactos asociados',
      'Oportunidades abiertas', 'Valor abierto (COP)', 'Notas',
    ];
    const filas = filtered.map(e => {
      const stats = statsPorEmpresa[e.id];
      const contactosEmpresa = contactos.filter(c => c.empresa_id === e.id);
      return {
        'Nombre': e.nombre,
        'Dominio web': e.dominio_web,
        'Sector': e.sector?.replace(/_/g, ' '),
        'Ciudad': e.ciudad,
        'País': e.pais,
        'Dirección': e.direccion,
        'Teléfono': e.telefono,
        'Email': e.email,
        'Estado': e.estado?.replace(/_/g, ' '),
        'Propietario': e.propietario,
        'Última actividad': e.ultima_actividad,
        'Contactos': contactosEmpresa.length,
        'Contactos asociados': contactosEmpresa.map(c => c.nombre).join(', '),
        'Oportunidades abiertas': stats?.abiertas || 0,
        'Valor abierto (COP)': stats?.valorAbierto || 0,
        'Notas': e.notas,
      };
    });
    exportarCSV('empresas-wetracking', columnas, filas);
    toast({ title: `${filas.length} empresa${filas.length !== 1 ? 's' : ''} exportada${filas.length !== 1 ? 's' : ''}` });
  }

  // Selección múltiple para limpieza masiva
  function toggleSeleccion(id) {
    setSeleccion(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }

  const todasSeleccionadas = filtered.length > 0 && filtered.every(e => seleccion.has(e.id));
  function toggleTodas() {
    setSeleccion(todasSeleccionadas ? new Set() : new Set(filtered.map(e => e.id)));
  }

  async function eliminarSeleccionadas() {
    if (!confirm(`¿Eliminar ${seleccion.size} empresa${seleccion.size !== 1 ? 's' : ''}? Los contactos vinculados NO se borran, solo pierden el vínculo.`)) return;
    setEliminando(true);
    let ok = 0;
    for (const id of seleccion) {
      try { await Empresa.delete(id); ok++; } catch { /* seguir con el resto */ }
    }
    qc.invalidateQueries({ queryKey: ['empresas'] });
    setSeleccion(new Set());
    setEliminando(false);
    toast({ title: `${ok} empresa${ok !== 1 ? 's' : ''} eliminada${ok !== 1 ? 's' : ''}` });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Empresas</h1>
          <p className="text-sm text-muted-foreground mt-1">{empresas.length} empresa{empresas.length !== 1 ? 's' : ''} en la base de datos</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && seleccion.size > 0 && (
            <Button size="sm" variant="destructive" className="h-9" onClick={eliminarSeleccionadas} disabled={eliminando}>
              <Trash2 className="w-4 h-4 mr-1" />
              {eliminando ? 'Eliminando...' : `Eliminar (${seleccion.size})`}
            </Button>
          )}
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar empresa..."
              className="pl-9 rounded-lg h-9"
            />
          </div>
          <Button size="sm" variant="outline" className="h-9" onClick={() => setImportarOpen(true)}>
            <Upload className="w-4 h-4 mr-1" /> Importar CSV
          </Button>
          <Button size="sm" variant="outline" className="h-9" onClick={exportarEmpresas} disabled={filtered.length === 0}>
            <Download className="w-4 h-4 mr-1" /> Exportar CSV ({filtered.length})
          </Button>
          <Button size="sm" className="h-9" onClick={() => setFormOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Nueva empresa
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-card rounded-xl overflow-hidden border border-border/40">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/40 bg-muted/30">
                  <th className="px-3 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={todasSeleccionadas}
                      onChange={toggleTodas}
                      className="cursor-pointer"
                      title="Seleccionar todas"
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Empresa</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sector</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ciudad</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Estado</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Oport. abiertas</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Valor abierto</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-16 text-sm text-muted-foreground">
                      {search ? 'Sin resultados para esa búsqueda' : 'No hay empresas registradas todavía'}
                    </td>
                  </tr>
                ) : (
                  filtered.map((e, i) => {
                    const stats = statsPorEmpresa[e.id];
                    return (
                      <tr
                        key={e.id}
                        className={`border-b border-border/20 hover:bg-muted/20 cursor-pointer transition-colors ${seleccion.has(e.id) ? 'bg-primary/5' : i % 2 !== 0 ? 'bg-muted/10' : ''}`}
                        onClick={() => navigate(`/crm/empresas/${e.id}`)}
                      >
                        <td className="px-3 py-3" onClick={ev => ev.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={seleccion.has(e.id)}
                            onChange={() => toggleSeleccion(e.id)}
                            className="cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Favicon empresa={e} className="w-8 h-8" />
                            <div>
                              <p className="text-sm font-medium text-foreground">{e.nombre}</p>
                              {e.dominio_web && <p className="text-xs text-muted-foreground">{e.dominio_web}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{e.sector?.replace(/_/g, ' ') || '—'}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {[e.ciudad, e.pais !== 'Colombia' ? e.pais : null].filter(Boolean).join(', ') || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium px-2 py-1 rounded-full ${ESTADO_STYLE[e.estado] || 'bg-muted text-muted-foreground'}`}>
                            {e.estado?.replace(/_/g, ' ') || 'Prospecto'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-foreground">{stats?.abiertas || 0}</td>
                        <td className="px-4 py-3 text-right text-sm font-medium text-foreground">{formatValor(stats?.valorAbierto)}</td>
                        <td className="px-4 py-3 text-right">
                          <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/40" />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <EmpresaForm open={formOpen} onOpenChange={setFormOpen} onSaved={(e) => navigate(`/crm/empresas/${e.id}`)} />
      <ImportarEmpresasModal open={importarOpen} onOpenChange={setImportarOpen} />
    </div>
  );
}
