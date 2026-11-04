import { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44, Empresa, Oportunidad, Contacto, Tarea, Nota, EmailEnviado, Cotizacion, ReunionNota } from '@/api/base44Client';
import { registrarActividad } from '@/lib/actividad';

// Etiquetas legibles de los campos de empresa (para la trazabilidad).
const CAMPO_EMP_LABEL = { nombre: 'Nombre', logo_url: 'Logo', dominio_web: 'Dominio web', telefono: 'Teléfono', email: 'Email', sector: 'Sector', estado: 'Estado', ciudad: 'Ciudad', pais: 'País', direccion: 'Dirección', propietario: 'Propietario', notas: 'Notas' };
import { formatMoneda, estadoEfectivo } from '@/lib/wetracking';
import { construirFeed } from '@/lib/feed';
import { useUsuariosMap } from '@/hooks/useUsuariosMap';
import CotizacionForm from '@/components/cotizaciones/CotizacionForm';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import {
  ArrowLeft, AlertCircle, TrendingUp, Users, FileText, NotebookPen,
} from 'lucide-react';
import OportunidadForm from '@/components/crm/OportunidadForm';
import LogoEmpresaEditable from '@/components/crm/LogoEmpresaEditable';
import { ETAPAS_OPORTUNIDAD, ETAPAS_CERRADAS_OP } from '@/components/crm/OportunidadKanban';
import RecordLayout from '@/components/crm/detalle/RecordLayout';
import CampoEditable from '@/components/crm/detalle/CampoEditable';
import { useOpciones } from '@/hooks/useOpciones';
import PanelAsociado from '@/components/crm/detalle/PanelAsociado';
import FeedItem from '@/components/crm/detalle/FeedItem';
import DocumentosPanel from '@/components/crm/detalle/DocumentosPanel';
import { TABS_LIST_CLS, TABS_TRIGGER_CLS } from '@/components/crm/detalle/tabStyles';

// Convierte una lista de valores (de las listas configurables) en opciones {value,label},
// incluyendo el valor actual del registro por si trae uno viejo que no está en la lista.
const mkOpc = (lista, actual) => [...new Set([...(lista || []), actual].filter(Boolean))].map(v => ({ value: v, label: String(v).replace(/_/g, ' ') }));

function formatValor(n, moneda = 'COP') {
  if (!n) return '—';
  const pref = moneda === 'USD' ? 'USD ' : '$';
  return pref + Math.round(n).toLocaleString('es-CO');
}

function VincularContactoDialog({ open, onOpenChange, empresaId, contactosSinVincular, onVinculado }) {
  const { toast } = useToast();
  const [contactoId, setContactoId] = useState('');

  const vincular = useMutation({
    mutationFn: () => Contacto.update(contactoId, { empresa_id: empresaId }),
    onSuccess: () => {
      toast({ title: 'Contacto vinculado' });
      setContactoId('');
      onOpenChange(false);
      onVinculado();
    },
    onError: (err) => toast({ title: 'Error al vincular', description: err?.message || String(err), variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Vincular contacto existente</DialogTitle></DialogHeader>
        <div className="space-y-2 py-1">
          <Label>Contacto</Label>
          <Select value={contactoId} onValueChange={setContactoId}>
            <SelectTrigger><SelectValue placeholder="Seleccionar contacto..." /></SelectTrigger>
            <SelectContent>
              {contactosSinVincular.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nombre}{c.empresa ? ` — ${c.empresa}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {contactosSinVincular.length === 0 && (
            <p className="text-xs text-muted-foreground">Todos los contactos ya están vinculados a una empresa.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => vincular.mutate()} disabled={!contactoId || vincular.isPending}>
            {vincular.isPending ? 'Vinculando...' : 'Vincular'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function EmpresaDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [opFormOpen, setOpFormOpen] = useState(false);
  const [opEditando, setOpEditando] = useState(null);
  const [vincularOpen, setVincularOpen] = useState(false);
  const [cotFormOpen, setCotFormOpen] = useState(false);
  const [cotEditando, setCotEditando] = useState(null);
  const [nuevaNota, setNuevaNota] = useState('');
  const [nuevaTarea, setNuevaTarea] = useState({ titulo: '', fecha_limite: '' });

  const { data: empresa, isLoading } = useQuery({ queryKey: ['empresa', id], queryFn: () => Empresa.get(id) });
  const { data: oportunidades = [] } = useQuery({ queryKey: ['oportunidades'], queryFn: () => Oportunidad.list('-updated_date') });
  const { data: contactos = [] } = useQuery({ queryKey: ['contactos'], queryFn: () => Contacto.list() });
  const { data: tareasEmpresa = [] } = useQuery({ queryKey: ['tareas_empresa', id], queryFn: () => Tarea.filter({ empresa_id: id }, '-fecha_limite'), enabled: !!id });
  const { data: notasEmpresa = [] } = useQuery({ queryKey: ['notas_empresa', id], queryFn: () => Nota.filter({ empresa_id: id }, '-fecha_nota'), enabled: !!id });
  const { data: todosEmails = [] } = useQuery({ queryKey: ['emails_todos'], queryFn: () => EmailEnviado.list('-fecha_envio') });
  const { data: cotizacionesEmpresa = [] } = useQuery({ queryKey: ['cotizaciones_empresa', id], queryFn: () => Cotizacion.filter({ empresa_id: id }, '-fecha_emision'), enabled: !!id });
  const { data: reunionesEmpresa = [] } = useQuery({ queryKey: ['reuniones_empresa', id], queryFn: () => ReunionNota.filter({ empresa_id: id }, '-fecha_reunion'), enabled: !!id });
  const { data: actividades = [] } = useQuery({ queryKey: ['actividades_empresa', id], queryFn: () => base44.entities.Actividad.filter({ empresa_id: id }, '-fecha'), enabled: !!id });

  // Opciones de los desplegables (editables en Configuración → Listas).
  const listaSectores = useOpciones('sectores');
  const listaEstados = useOpciones('estados_empresa');
  const listaCiudades = useOpciones('ciudades');
  const listaPaises = useOpciones('paises');
  const listaComerciales = useOpciones('comerciales');

  const opsEmpresa = useMemo(() => oportunidades.filter(o => o.empresa_id === id), [oportunidades, id]);
  const contactosEmpresa = useMemo(() => contactos.filter(c => c.empresa_id === id), [contactos, id]);
  const contactosSinVincular = useMemo(() => contactos.filter(c => !c.empresa_id), [contactos]);
  const idsContactosEmpresa = useMemo(() => new Set(contactosEmpresa.map(c => c.id)), [contactosEmpresa]);
  const emailsEmpresa = useMemo(() => todosEmails.filter(e => idsContactosEmpresa.has(e.contacto_id)), [todosEmails, idsContactosEmpresa]);

  const usuarios = useUsuariosMap();
  const feed = useMemo(
    () => construirFeed({ notas: notasEmpresa, tareas: tareasEmpresa, emails: emailsEmpresa, reuniones: reunionesEmpresa, actividades, usuarios }),
    [notasEmpresa, tareasEmpresa, emailsEmpresa, reunionesEmpresa, actividades, usuarios]
  );

  // Helper: registra un movimiento en la trazabilidad y refresca el feed.
  const logActividad = (datos) => registrarActividad({ empresa_id: id, ...datos }).then(() => qc.invalidateQueries({ queryKey: ['actividades_empresa', id] }));

  const actualizar = useMutation({
    mutationFn: (data) => Empresa.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['empresa', id] }); qc.invalidateQueries({ queryKey: ['empresas'] }); },
    onError: (err) => toast({ title: 'Error al guardar', description: err?.message || String(err), variant: 'destructive' }),
  });
  const setCampo = (campo) => async (valor) => {
    await actualizar.mutateAsync({ [campo]: valor });
    logActividad({ tipo: 'edicion', campo, valor_nuevo: valor, descripcion: `Actualizó ${CAMPO_EMP_LABEL[campo] || campo}: ${valor || '—'}` });
  };

  const crearNota = useMutation({
    mutationFn: () => Nota.create({ empresa_id: id, texto: nuevaNota, fecha_nota: new Date().toISOString() }),
    onSuccess: () => { setNuevaNota(''); qc.invalidateQueries({ queryKey: ['notas_empresa', id] }); },
  });
  const crearTarea = useMutation({
    mutationFn: () => Tarea.create({ empresa_id: id, titulo: nuevaTarea.titulo, fecha_limite: nuevaTarea.fecha_limite }),
    onSuccess: () => { setNuevaTarea({ titulo: '', fecha_limite: '' }); qc.invalidateQueries({ queryKey: ['tareas_empresa', id] }); },
  });
  const toggleTarea = useMutation({
    mutationFn: (t) => Tarea.update(t.id, { completada: !t.completada }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tareas_empresa', id] }),
  });

  const valorAbierto = opsEmpresa
    .filter(o => !ETAPAS_CERRADAS_OP.includes(o.etapa) && (o.moneda || 'COP') === 'COP')
    .reduce((s, o) => s + (o.valor_estimado || 0), 0);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" /></div>;
  }
  if (!empresa) {
    return (
      <div className="p-8 text-center text-gray-500">
        <AlertCircle className="w-12 h-12 mx-auto mb-2 opacity-30" />
        <p>Empresa no encontrada</p>
        <Button variant="link" onClick={() => navigate('/crm/empresas')}>Volver</Button>
      </div>
    );
  }

  // ── Header ──
  const header = (
    <div className="flex items-center gap-3">
      <Button variant="ghost" size="icon" onClick={() => navigate('/crm/empresas')}><ArrowLeft className="w-4 h-4" /></Button>
      <LogoEmpresaEditable empresa={empresa} onCambio={setCampo('logo_url')} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl font-semibold text-foreground truncate">{empresa.nombre}</h1>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full border border-border text-muted-foreground">
            {empresa.estado?.replace(/_/g, ' ') || 'Prospecto'}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {[empresa.sector?.replace(/_/g, ' '), empresa.ciudad].filter(Boolean).join(' · ') || 'Sin sector'}
          {valorAbierto > 0 && <> · <span className="font-medium text-foreground">{formatValor(valorAbierto)} en pipeline</span></>}
        </p>
      </div>
    </div>
  );

  // ── Columna izquierda: datos editables inline ──
  const left = (
    <div className="bg-card border border-border/60 rounded-xl p-4">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Datos de la empresa</p>
      <div className="divide-y divide-border/40">
        <CampoEditable label="Nombre" value={empresa.nombre} onSave={setCampo('nombre')} placeholder="Razón social o nombre comercial" />
        <CampoEditable label="Dominio web" value={empresa.dominio_web} onSave={setCampo('dominio_web')} placeholder="empresa.com" />
        <CampoEditable label="Teléfono" value={empresa.telefono} onSave={setCampo('telefono')} />
        <CampoEditable label="Email" value={empresa.email} onSave={setCampo('email')} tipo="email" />
        <CampoEditable label="Sector" value={empresa.sector} onSave={setCampo('sector')} tipo="select" opciones={mkOpc(listaSectores, empresa.sector)} />
        <CampoEditable label="Estado" value={empresa.estado} onSave={setCampo('estado')} tipo="select" opciones={mkOpc(listaEstados, empresa.estado)} />
        <CampoEditable label="Ciudad" value={empresa.ciudad} onSave={setCampo('ciudad')} tipo="select" opciones={mkOpc(listaCiudades, empresa.ciudad)} />
        <CampoEditable label="País" value={empresa.pais} onSave={setCampo('pais')} tipo="select" opciones={mkOpc(listaPaises, empresa.pais)} />
        <CampoEditable label="Dirección" value={empresa.direccion} onSave={setCampo('direccion')} />
        <CampoEditable label="Propietario" value={empresa.propietario} onSave={setCampo('propietario')} tipo="select" opciones={mkOpc(listaComerciales, empresa.propietario)} />
        <CampoEditable label="Notas" value={empresa.notas} onSave={setCampo('notas')} />
      </div>
    </div>
  );

  // ── Columna central: feed + composers ──
  const center = (
    <Tabs defaultValue="actividad">
      <TabsList className={TABS_LIST_CLS}>
        <TabsTrigger className={TABS_TRIGGER_CLS} value="actividad">Actividad</TabsTrigger>
        <TabsTrigger className={TABS_TRIGGER_CLS} value="notas">Notas ({notasEmpresa.length})</TabsTrigger>
        <TabsTrigger className={TABS_TRIGGER_CLS} value="tareas">Tareas ({tareasEmpresa.length})</TabsTrigger>
        <TabsTrigger className={TABS_TRIGGER_CLS} value="emails">Emails ({emailsEmpresa.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="actividad" className="space-y-2 mt-3">
        {/* Compositor rápido de nota */}
        <div className="bg-card border border-border/60 rounded-xl p-3 space-y-2">
          <Textarea placeholder="Escribe una nota sobre esta empresa..." value={nuevaNota} onChange={e => setNuevaNota(e.target.value)} rows={2} className="resize-none" />
          <div className="flex justify-end">
            <Button size="sm" disabled={!nuevaNota.trim() || crearNota.isPending} onClick={() => crearNota.mutate()}>Guardar nota</Button>
          </div>
        </div>
        {feed.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-sm">Sin actividad todavía</p>
            <p className="text-xs mt-1">Las notas, tareas, emails y reuniones aparecerán aquí en orden cronológico.</p>
          </div>
        ) : feed.map(item => <FeedItem key={item.id} item={item} />)}
      </TabsContent>

      <TabsContent value="notas" className="space-y-3 mt-3">
        <div className="bg-card border border-border/60 rounded-xl p-3 space-y-2">
          <Textarea placeholder="Añadir nota sobre esta empresa..." value={nuevaNota} onChange={e => setNuevaNota(e.target.value)} rows={3} />
          <Button size="sm" disabled={!nuevaNota.trim() || crearNota.isPending} onClick={() => crearNota.mutate()}>Guardar nota</Button>
        </div>
        {notasEmpresa.map(n => (
          <div key={n.id} className="bg-card border border-border/40 rounded-xl p-3">
            <p className="text-sm whitespace-pre-wrap">{n.texto}</p>
            <p className="text-xs text-gray-400 mt-1">{new Date(n.fecha_nota || n.created_date).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
          </div>
        ))}
      </TabsContent>

      <TabsContent value="tareas" className="space-y-3 mt-3">
        <div className="bg-card border border-border/60 rounded-xl p-3 space-y-2">
          <Input value={nuevaTarea.titulo} onChange={e => setNuevaTarea(t => ({ ...t, titulo: e.target.value }))} placeholder="Título de la tarea" />
          <div className="flex gap-2">
            <Input type="date" value={nuevaTarea.fecha_limite} onChange={e => setNuevaTarea(t => ({ ...t, fecha_limite: e.target.value }))} className="flex-1" />
            <Button size="sm" disabled={!nuevaTarea.titulo || !nuevaTarea.fecha_limite || crearTarea.isPending} onClick={() => crearTarea.mutate()}>Crear</Button>
          </div>
        </div>
        {tareasEmpresa.map(t => (
          <div key={t.id} className="bg-card border border-border/40 rounded-xl p-3 flex items-center justify-between cursor-pointer" onClick={() => toggleTarea.mutate(t)}>
            <div>
              <p className={`text-sm font-medium ${t.completada ? 'line-through text-muted-foreground' : ''}`}>{t.titulo}</p>
              <p className="text-xs text-gray-500">
                {t.fecha_limite ? new Date(t.fecha_limite + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) : ''}
                {t.asignado_a && <> · {t.asignado_a.split('@')[0]}</>}
              </p>
            </div>
            <Badge variant={t.completada ? 'default' : 'secondary'}>{t.completada ? 'Hecha' : 'Pendiente'}</Badge>
          </div>
        ))}
        {tareasEmpresa.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Sin tareas para esta empresa</p>}
      </TabsContent>

      <TabsContent value="emails" className="space-y-2 mt-3">
        {emailsEmpresa.length === 0 && <p className="text-sm text-muted-foreground text-center py-10">Sin emails enviados a contactos de esta empresa</p>}
        {emailsEmpresa.map(e => (
          <div key={e.id} className="bg-card border border-border/40 rounded-xl p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{e.asunto}</p>
              <p className="text-xs text-gray-500">{e.nombre_destino || e.email_destino} · {e.fecha_envio ? new Date(e.fecha_envio).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</p>
            </div>
            <Badge variant="outline" className={`text-[10px] flex-shrink-0 ${e.estado === 'Abierto' ? 'bg-green-100 text-green-700' : e.estado === 'Respondido' ? 'bg-blue-100 text-blue-700' : e.estado === 'Rebotado' ? 'bg-red-100 text-red-600' : ''}`}>{e.estado}</Badge>
          </div>
        ))}
      </TabsContent>
    </Tabs>
  );

  // ── Columna derecha: objetos asociados ──
  const right = (
    <>
      <PanelAsociado titulo="Contactos" count={contactosEmpresa.length} icono={<Users className="w-4 h-4" />} onAgregar={() => setVincularOpen(true)} agregarLabel="Vincular"
        vacio={contactosEmpresa.length === 0 ? <p className="text-xs text-muted-foreground py-2">Sin contactos vinculados</p> : null}>
        {contactosEmpresa.map(c => (
          <Link key={c.id} to={`/crm/contactos/${c.id}`} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-muted/40 transition-colors">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="text-primary font-semibold text-xs">{c.nombre?.charAt(0)?.toUpperCase()}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{c.nombre}</p>
              {c.cargo && <p className="text-xs text-muted-foreground truncate">{c.cargo}</p>}
            </div>
            {c.etapa_pipeline && <Badge variant="outline" className="text-[9px] flex-shrink-0">{c.etapa_pipeline}</Badge>}
          </Link>
        ))}
      </PanelAsociado>

      <PanelAsociado titulo="Negocios" count={opsEmpresa.length} icono={<TrendingUp className="w-4 h-4" />} onAgregar={() => { setOpEditando(null); setOpFormOpen(true); }} agregarLabel="Nuevo"
        vacio={opsEmpresa.length === 0 ? <p className="text-xs text-muted-foreground py-2">Sin oportunidades</p> : null}>
        {opsEmpresa.map(o => (
          <button key={o.id} onClick={() => { setOpEditando(o); setOpFormOpen(true); }} className="w-full text-left p-2 rounded-lg hover:bg-muted/40 transition-colors">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium truncate">{o.nombre}</p>
              {o.valor_estimado > 0 && <span className="text-xs font-semibold flex-shrink-0">{formatValor(o.valor_estimado, o.moneda)}</span>}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">{ETAPAS_OPORTUNIDAD.find(e => e.key === o.etapa)?.label || o.etapa}</p>
          </button>
        ))}
      </PanelAsociado>

      <PanelAsociado titulo="Cotizaciones" count={cotizacionesEmpresa.length} icono={<FileText className="w-4 h-4" />} onAgregar={() => { setCotEditando(null); setCotFormOpen(true); }} agregarLabel="Nueva"
        vacio={cotizacionesEmpresa.length === 0 ? <p className="text-xs text-muted-foreground py-2">Sin cotizaciones</p> : null}>
        {cotizacionesEmpresa.map(cot => (
          <button key={cot.id} onClick={() => { setCotEditando(cot); setCotFormOpen(true); }} className="w-full text-left p-2 rounded-lg hover:bg-muted/40 transition-colors">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{cot.numero}</p>
              <span className="text-xs font-semibold">{formatMoneda(cot.total, cot.moneda)}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant="outline" className="text-[9px]">{estadoEfectivo(cot)}</Badge>
              <span className="text-[11px] text-muted-foreground">{(cot.items || []).length} ítems</span>
            </div>
          </button>
        ))}
      </PanelAsociado>

      <PanelAsociado titulo="Reuniones" count={reunionesEmpresa.length} icono={<NotebookPen className="w-4 h-4" />}
        vacio={reunionesEmpresa.length === 0 ? <p className="text-xs text-muted-foreground py-2">Sin reuniones vinculadas</p> : null}>
        {reunionesEmpresa.map(r => (
          <Link key={r.id} to={`/crm/reuniones/${r.id}`} className="block p-2 rounded-lg hover:bg-muted/40 transition-colors">
            <p className="text-sm font-medium truncate">{r.titulo}</p>
            <p className="text-[11px] text-muted-foreground">
              {r.fecha_reunion && new Date(r.fecha_reunion + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
              {(r.action_items || []).length > 0 && ` · ${r.action_items.length} tareas`}
            </p>
          </Link>
        ))}
      </PanelAsociado>

      <DocumentosPanel empresaId={id} onCambio={(accion) => logActividad({ tipo: 'documento', descripcion: accion === 'delete' ? 'Eliminó un documento' : 'Subió un documento' })} />
    </>
  );

  return (
    <>
      <RecordLayout header={header} left={left} center={center} right={right} />

      <OportunidadForm open={opFormOpen} onOpenChange={setOpFormOpen} oportunidad={opEditando} empresaFija={id} onSaved={() => { qc.invalidateQueries({ queryKey: ['oportunidades'] }); logActividad({ tipo: 'negocio', descripcion: opEditando ? 'Actualizó un negocio' : 'Creó un negocio' }); }} />
      <CotizacionForm open={cotFormOpen} onOpenChange={setCotFormOpen} cotizacion={cotEditando} empresaFija={id} onSaved={() => { qc.invalidateQueries({ queryKey: ['cotizaciones_empresa', id] }); logActividad({ tipo: 'cotizacion', descripcion: cotEditando ? 'Actualizó una cotización' : 'Agregó una cotización' }); }} />
      <VincularContactoDialog open={vincularOpen} onOpenChange={setVincularOpen} empresaId={id} contactosSinVincular={contactosSinVincular} onVinculado={() => { qc.invalidateQueries({ queryKey: ['contactos'] }); logActividad({ tipo: 'contacto', descripcion: 'Vinculó un contacto a la empresa' }); }} />
    </>
  );
}