import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, Phone, Mail, DollarSign, MapPin, MessageSquare, Bot, Building2, Download, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { exportarCSV } from '@/lib/csv';
import ImportarContactosModal from '@/components/crm/ImportarContactosModal';
import SelectorEmpresa, { Favicon } from '@/components/crm/SelectorEmpresa';
import { useOpciones } from '@/hooks/useOpciones';

const TEMP_CONFIG = {
  Frio: { label: 'Frío', dot: 'bg-blue-500', cls: 'bg-blue-500/10 text-blue-600' },
  Tibio: { label: 'Tibio', dot: 'bg-amber-500', cls: 'bg-amber-500/10 text-amber-600' },
  Caliente: { label: 'Caliente', dot: 'bg-orange-500', cls: 'bg-orange-500/10 text-orange-600' },
  Urgente: { label: 'Urgente', dot: 'bg-red-500', cls: 'bg-red-500/10 text-red-600 font-semibold' },
};

const Contacto = base44.entities.Contacto;

const ETAPA_COLORS = {
  Lead: 'bg-gray-100 text-gray-700',
  Calificado: 'bg-blue-100 text-blue-700',
  Propuesta: 'bg-amber-100 text-amber-700',
  Cierre: 'bg-purple-100 text-purple-700',
  Cliente: 'bg-green-100 text-green-700',
  Descalificado: 'bg-red-100 text-red-700',
};


function formatCOP(n) {
  if (!n) return null;
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(0)}M`;
  return `$${(n / 1_000).toFixed(0)}K`;
}

function NuevoContactoDialog({ onCreated }) {
  const [open, setOpen] = useState(false);
  const SECTORES = useOpciones('sectores');
  const CIUDADES = useOpciones('ciudades');
  const COMERCIALES_LIST = useOpciones('comerciales');
  const VACIO_CONTACTO = {
    nombre: '', apellido: '', telefono: '', email: '',
    empresa_id: '', empresa_nombre: '', cargo: '', sector: '', ciudad: '',
    presupuesto: '', broker_asignado: '', notas: '',
  };
  const [form, setForm] = useState(VACIO_CONTACTO);
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleCreate = async () => {
    if (!form.nombre) { toast.error('El nombre es obligatorio'); return; }
    setLoading(true);
    try {
      await Contacto.create({
        nombre: `${form.nombre} ${form.apellido}`.trim(),
        telefono: form.telefono || undefined,
        email: form.email || undefined,
        empresa_id: form.empresa_id || undefined,
        empresa: form.empresa_nombre || undefined,
        cargo: form.cargo || undefined,
        sector: form.sector || undefined,
        ciudad: form.ciudad || undefined,
        presupuesto: form.presupuesto ? Number(form.presupuesto) : undefined,
        broker_asignado: form.broker_asignado || undefined,
        notas: form.notas || undefined,
        etapa_pipeline: 'Lead',
        canal_adquisicion: 'Manual',
        fecha_primer_contacto: new Date().toISOString().split('T')[0],
      });
      toast.success('Contacto creado');
      setOpen(false);
      setForm(VACIO_CONTACTO);
      onCreated();
    } catch (err) {
      toast.error(err?.message || 'Error al crear contacto');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="w-4 h-4 mr-1" />Nuevo contacto</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nuevo contacto</DialogTitle></DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Nombre *</Label><Input value={form.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Carlos" /></div>
            <div><Label>Apellido</Label><Input value={form.apellido} onChange={e => set('apellido', e.target.value)} placeholder="Ramírez" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Teléfono / WhatsApp</Label><Input value={form.telefono} onChange={e => set('telefono', e.target.value)} placeholder="+57 300..." /></div>
            <div><Label>Email</Label><Input value={form.email} onChange={e => set('email', e.target.value)} placeholder="carlos@empresa.com" /></div>
          </div>
          <div>
            <Label>Empresa (se vincula con su logo)</Label>
            <SelectorEmpresa
              value={form.empresa_id}
              onChange={(id, emp) => setForm(p => ({ ...p, empresa_id: id, empresa_nombre: emp?.nombre || '' }))}
              placeholder="Buscar o crear empresa..."
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Cargo</Label><Input value={form.cargo} onChange={e => set('cargo', e.target.value)} placeholder="Gerente de Operaciones" /></div>
            <div><Label>Sector</Label>
              <Select value={form.sector} onValueChange={v => set('sector', v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {SECTORES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Ciudad</Label>
              <Select value={form.ciudad} onValueChange={v => set('ciudad', v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>{CIUDADES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Presupuesto (COP)</Label><Input type="number" value={form.presupuesto} onChange={e => set('presupuesto', e.target.value)} placeholder="45000000" /></div>
          </div>
          <div>
            <Label>Comercial asignado</Label>
            <Select value={form.broker_asignado} onValueChange={v => set('broker_asignado', v)}>
              <SelectTrigger><SelectValue placeholder="Seleccionar comercial..." /></SelectTrigger>
              <SelectContent>
                {COMERCIALES_LIST.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Notas</Label><Input value={form.notas} onChange={e => set('notas', e.target.value)} /></div>
          <Button className="w-full" onClick={handleCreate} disabled={loading || !form.nombre}>{loading ? 'Creando...' : 'Crear contacto'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Contactos() {
  const qc = useQueryClient();
  const SECTORES = useOpciones('sectores');
  const [search, setSearch] = useState('');
  const [filterEtapa, setFilterEtapa] = useState('todos');
  const [filterSector, setFilterSector] = useState('todos');
  const [importarOpen, setImportarOpen] = useState(false);

  const { data: contactos = [], isLoading } = useQuery({
    queryKey: ['contactos'],
    queryFn: () => Contacto.list(),
  });

  const { data: empresas = [] } = useQuery({
    queryKey: ['empresas'],
    queryFn: () => base44.entities.Empresa.list(),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['contactos'] });

  const filtered = contactos.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q || c.nombre?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.telefono?.includes(q) || c.empresa?.toLowerCase().includes(q) || c.ciudad?.toLowerCase().includes(q);
    const matchEtapa = filterEtapa === 'todos' || c.etapa_pipeline === filterEtapa;
    const matchSector = filterSector === 'todos' || c.sector === filterSector;
    return matchSearch && matchEtapa && matchSector;
  });

  // Export masivo con join de empresa (estilo HubSpot: el contacto sale con
  // las columnas de su empresa asociada)
  function exportarContactos() {
    const empresasById = Object.fromEntries(empresas.map(e => [e.id, e]));
    const columnas = [
      'Nombre', 'Teléfono', 'Email', 'Cargo', 'Etapa', 'Sector', 'Ciudad',
      'Empresa', 'Dominio empresa', 'Sector empresa', 'Ciudad empresa', 'Estado empresa',
      'Tipo de necesidad', 'Volumen aproximado', 'Presupuesto', 'Canal de adquisición',
      'Ejecutivo asignado', 'Fecha primer contacto', 'Última actividad', 'Notas',
    ];
    const filas = filtered.map(c => {
      const emp = c.empresa_id ? empresasById[c.empresa_id] : null;
      return {
        'Nombre': c.nombre,
        'Teléfono': c.telefono,
        'Email': c.email,
        'Cargo': c.cargo,
        'Etapa': c.etapa_pipeline,
        'Sector': c.sector,
        'Ciudad': c.ciudad,
        'Empresa': emp?.nombre || c.empresa || '',
        'Dominio empresa': emp?.dominio_web || '',
        'Sector empresa': emp?.sector?.replace(/_/g, ' ') || '',
        'Ciudad empresa': emp?.ciudad || '',
        'Estado empresa': emp?.estado?.replace(/_/g, ' ') || '',
        'Tipo de necesidad': c.tipo_necesidad,
        'Volumen aproximado': c.volumen_aproximado,
        'Presupuesto': c.presupuesto,
        'Canal de adquisición': c.canal_adquisicion,
        'Ejecutivo asignado': c.broker_asignado,
        'Fecha primer contacto': c.fecha_primer_contacto,
        'Última actividad': c.ultima_actividad ? new Date(c.ultima_actividad).toLocaleString('es-CO') : '',
        'Notas': c.notas,
      };
    });
    exportarCSV('contactos-wetracking', columnas, filas);
    toast.success(`${filas.length} contacto${filas.length !== 1 ? 's' : ''} exportado${filas.length !== 1 ? 's' : ''}`);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight">Contactos</h1>
          <p className="text-muted-foreground text-[15px]">{contactos.length} contactos registrados</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportarOpen(true)}>
            <Upload className="w-4 h-4 mr-1" /> Importar CSV
          </Button>
          <Button variant="outline" onClick={exportarContactos} disabled={filtered.length === 0}>
            <Download className="w-4 h-4 mr-1" /> Exportar CSV ({filtered.length})
          </Button>
          <NuevoContactoDialog onCreated={refresh} />
        </div>
      </div>

      <ImportarContactosModal open={importarOpen} onOpenChange={setImportarOpen} />

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por nombre, email, teléfono..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterSector} onValueChange={setFilterSector}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Sector" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los sectores</SelectItem>
            {SECTORES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterEtapa} onValueChange={setFilterEtapa}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Etapa" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas las etapas</SelectItem>
            {['Lead','Calificado','Propuesta','Cierre','Cliente','Descalificado'].map(e =>
              <SelectItem key={e} value={e}>{e}</SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando contactos...</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => {
            const emp = c.empresa_id ? empresas.find(e => e.id === c.empresa_id) : null;
            return (
            <Card key={c.id} className="hover:shadow-sm transition-all duration-300 rounded-2xl border-border/60">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  {emp ? (
                    <Favicon empresa={emp} className="w-10 h-10 rounded-full border border-border/40 p-1 flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-primary font-semibold text-sm">{c.nombre?.charAt(0)?.toUpperCase()}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link to={`/crm/contactos/${c.id}`} className="font-medium hover:underline">{c.nombre}</Link>
                      {(emp || c.empresa) && (
                        emp ? (
                          <Link
                            to={`/crm/empresas/${emp.id}`}
                            className="flex items-center gap-1.5 text-[11px] bg-muted/60 hover:bg-muted px-2 py-0.5 rounded-full font-medium transition-colors"
                            onClick={e => e.stopPropagation()}
                          >
                            <Favicon empresa={emp} className="w-3.5 h-3.5" />
                            {emp.nombre}
                          </Link>
                        ) : (
                          <span className="flex items-center gap-1.5 text-[11px] bg-muted/60 px-2 py-0.5 rounded-full text-muted-foreground">
                            <Building2 className="w-3 h-3" />
                            {c.empresa}
                          </span>
                        )
                      )}
                      <Badge className={`text-[10px] ${ETAPA_COLORS[c.etapa_pipeline] || ''}`}>{c.etapa_pipeline?.replace(/_/g, ' ')}</Badge>
                      {c.sector && <Badge variant="outline" className="text-[10px]">{c.sector}</Badge>}
                      {c.temperatura && TEMP_CONFIG[c.temperatura] && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1 ${TEMP_CONFIG[c.temperatura].cls}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${TEMP_CONFIG[c.temperatura].dot}`} />
                          {TEMP_CONFIG[c.temperatura].label}
                        </span>
                      )}
                      {c.ia_calificado && (
                        <span className="text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                          <Bot className="w-2.5 h-2.5" />IA
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 flex-wrap">
                      {c.telefono && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="w-3 h-3" />{c.telefono}</span>}
                      {c.email && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="w-3 h-3" />{c.email}</span>}
                      {c.cargo && <span className="text-xs text-muted-foreground">{c.cargo}</span>}
                      {c.ciudad && <span className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="w-3 h-3" />{c.ciudad}</span>}
                      {c.presupuesto && <span className="flex items-center gap-1 text-xs text-muted-foreground"><DollarSign className="w-3 h-3" />{formatCOP(c.presupuesto)}</span>}
                      {c.broker_asignado && <span className="text-xs text-muted-foreground">→ {c.broker_asignado.split('@')[0]}</span>}
                    </div>
                    {/* Score bar */}
                    {c.score_lead > 0 && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="w-20 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${c.score_lead >= 70 ? 'bg-green-500' : c.score_lead >= 40 ? 'bg-yellow-400' : 'bg-gray-300'}`}
                            style={{ width: `${c.score_lead}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground">{c.score_lead}/100</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    {c.telefono && (
                      <a href={`https://wa.me/${c.telefono.replace(/\D/g,'')}`} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm" className="h-7 text-xs">
                          <MessageSquare className="w-3 h-3 mr-1" />WhatsApp
                        </Button>
                      </a>
                    )}
                    <Link to={`/crm/contactos/${c.id}`}>
                      <Button variant="outline" size="sm" className="h-7 text-xs">Ver</Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">No se encontraron contactos</div>
          )}
        </div>
      )}
    </div>
  );
}