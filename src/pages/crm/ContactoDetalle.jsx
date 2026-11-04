import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Contacto, HistorialLead, MensajeConversacion, Conversacion,
  Tarea, Nota, EmailEnviado, PlantillaEmail, Oportunidad, ReunionNota,
} from '@/api/base44Client';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ArrowLeft, MessageCircle, Clock, Building2,
  TrendingUp, Send, AlertCircle, NotebookPen,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import SelectorEmpresa, { Favicon } from '@/components/crm/SelectorEmpresa';
import OportunidadForm from '@/components/crm/OportunidadForm';
import { ETAPAS_OPORTUNIDAD } from '@/components/crm/OportunidadKanban';
import { Empresa } from '@/api/base44Client';
import { construirFeed } from '@/lib/feed';
import { registrarActividad } from '@/lib/actividad';
import RecordLayout from '@/components/crm/detalle/RecordLayout';
import CampoEditable from '@/components/crm/detalle/CampoEditable';
import PanelAsociado from '@/components/crm/detalle/PanelAsociado';
import FeedItem from '@/components/crm/detalle/FeedItem';
import DocumentosPanel from '@/components/crm/detalle/DocumentosPanel';
import { TABS_LIST_CLS, TABS_TRIGGER_CLS } from '@/components/crm/detalle/tabStyles';
import { useOpciones } from '@/hooks/useOpciones';
import { useUsuariosMap } from '@/hooks/useUsuariosMap';

// Une listas por id (para no duplicar cuando un item viene por contacto_id Y por empresa_id).
const dedupById = (arr) => { const m = new Map(); for (const x of arr) m.set(x.id, x); return [...m.values()]; };

const TEMP_CONFIG = {
  Frio: { label: 'Frío', color: 'bg-blue-500/10 text-blue-600', dot: 'bg-blue-500' },
  Tibio: { label: 'Tibio', color: 'bg-amber-500/10 text-amber-600', dot: 'bg-amber-500' },
  Caliente: { label: 'Caliente', color: 'bg-orange-500/10 text-orange-600', dot: 'bg-orange-500' },
  Urgente: { label: 'Urgente', color: 'bg-red-500/10 text-red-600', dot: 'bg-red-500' },
};

const ETAPAS_LEAD = ['Lead', 'Calificado', 'Propuesta', 'Cierre', 'Cliente', 'Descalificado'];
const CAMPO_CONTACTO_LABEL = { nombre: 'Nombre', telefono: 'Teléfono', email: 'Email', cargo: 'Cargo', sector: 'Sector', ciudad: 'Ciudad', tipo_necesidad: 'Tipo de necesidad', volumen_aproximado: 'Volumen', presupuesto: 'Presupuesto', broker_asignado: 'Comercial asignado' };
// Opciones {value,label} desde una lista configurable, incluyendo el valor actual del registro.
const mkOpc = (lista, actual) => [...new Set([...(lista || []), actual].filter(Boolean))].map(v => ({ value: v, label: String(v).replace(/_/g, ' ') }));
const ETAPA_OPC = ETAPAS_LEAD.map(e => ({ value: e, label: e }));

function formatCOP(val) {
  if (!val) return '—';
  return '$' + Number(val).toLocaleString('es-CO');
}

function inicialesDe(nombre = '') {
  const p = nombre.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '·';
}
function colorAvatar(str = '') {
  const cols = ['bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-600', 'bg-indigo-500'];
  let h = 0; for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return cols[Math.abs(h) % cols.length];
}

export default function ContactoDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [modalPerdido, setModalPerdido] = useState(false);
  const [motivoPerdida, setMotivoPerdida] = useState('');
  const [nuevaNota, setNuevaNota] = useState('');
  const [nuevaTarea, setNuevaTarea] = useState({ titulo: '', fecha_limite: '' });
  const [mensajeRapido, setMensajeRapido] = useState('');
  const [opFormOpen, setOpFormOpen] = useState(false);
  const [opEditando, setOpEditando] = useState(null);

  const listaSectores = useOpciones('sectores');
  const listaNecesidad = useOpciones('tipos_necesidad');
  const listaCiudades = useOpciones('ciudades');
  const listaComerciales = useOpciones('comerciales');

  // ── Datos ──
  const { data: contacto, isLoading } = useQuery({ queryKey: ['contacto', id], queryFn: () => Contacto.get(id) });
  const { data: historial = [] } = useQuery({ queryKey: ['historial_lead', id], queryFn: () => HistorialLead.filter({ contacto_id: id }, '-fecha'), enabled: !!id });
  const { data: actividades = [] } = useQuery({ queryKey: ['actividades_contacto', id], queryFn: () => base44.entities.Actividad.filter({ contacto_id: id }, '-fecha'), enabled: !!id });
  const { data: conversacion } = useQuery({ queryKey: ['conversacion_contacto', id], queryFn: () => Conversacion.filter({ contacto_id: id }, '-fecha_ultimo_mensaje'), select: (data) => data[0], enabled: !!id });
  const { data: mensajesChat = [] } = useQuery({ queryKey: ['mensajes_chat_contacto', conversacion?.id], queryFn: () => MensajeConversacion.filter({ conversacion_id: conversacion.id }, 'fecha'), enabled: !!conversacion?.id });
  const { data: tareas = [] } = useQuery({ queryKey: ['tareas_contacto', id], queryFn: () => Tarea.filter({ contacto_id: id }, '-fecha_limite'), enabled: !!id });
  const { data: notas = [] } = useQuery({ queryKey: ['notas_contacto', id], queryFn: () => Nota.filter({ contacto_id: id }, '-fecha_nota'), enabled: !!id });
  const { data: emails = [] } = useQuery({ queryKey: ['emails-contacto', id], queryFn: () => EmailEnviado.filter({ contacto_id: id }, '-fecha_envio'), enabled: !!id });
  const { data: oportunidades = [] } = useQuery({ queryKey: ['oportunidades'], queryFn: () => Oportunidad.list('-updated_date') });
  const { data: reuniones = [] } = useQuery({ queryKey: ['reuniones'], queryFn: () => ReunionNota.list('-fecha_reunion') });
  const { data: empresaVinculada } = useQuery({ queryKey: ['empresa', contacto?.empresa_id], queryFn: () => Empresa.get(contacto.empresa_id), enabled: !!contacto?.empresa_id });

  // Actividad a NIVEL EMPRESA (y de sus otros contactos): todo lo de la empresa sale también acá.
  const empId = contacto?.empresa_id;
  const { data: notasEmpresa = [] } = useQuery({ queryKey: ['notas_empresa', empId], queryFn: () => Nota.filter({ empresa_id: empId }, '-fecha_nota'), enabled: !!empId });
  const { data: tareasEmpresa = [] } = useQuery({ queryKey: ['tareas_empresa', empId], queryFn: () => Tarea.filter({ empresa_id: empId }, '-fecha_limite'), enabled: !!empId });
  const { data: actividadesEmpresa = [] } = useQuery({ queryKey: ['actividades_empresa', empId], queryFn: () => base44.entities.Actividad.filter({ empresa_id: empId }, '-fecha'), enabled: !!empId });

  const opsContacto = useMemo(() => oportunidades.filter(o => o.contacto_id === id), [oportunidades, id]);
  const reunionesContacto = useMemo(() => reuniones.filter(r => (r.contactos_ids || []).includes(id)), [reuniones, id]);
  const usuarios = useUsuariosMap();
  const feed = useMemo(
    () => construirFeed({
      notas: dedupById([...notas, ...notasEmpresa]),
      tareas: dedupById([...tareas, ...tareasEmpresa]),
      emails, historial,
      actividades: dedupById([...actividades, ...actividadesEmpresa]),
      usuarios,
    }),
    [notas, notasEmpresa, tareas, tareasEmpresa, emails, historial, actividades, actividadesEmpresa, usuarios]
  );

  // ── Mutaciones ──
  const actualizarContacto = useMutation({
    mutationFn: (data) => Contacto.update(id, data),
    onSuccess: () => queryClient.invalidateQueries(['contacto', id]),
    onError: (err) => toast({ title: 'Error al guardar', description: err?.message || String(err), variant: 'destructive' }),
  });
  const setCampo = (campo) => async (valor) => {
    await actualizarContacto.mutateAsync({ [campo]: valor });
    registrarActividad({ contacto_id: id, empresa_id: contacto?.empresa_id || undefined, tipo: 'edicion', campo, valor_nuevo: valor, descripcion: `Actualizó ${CAMPO_CONTACTO_LABEL[campo] || campo}: ${valor || '—'}` })
      .then(() => queryClient.invalidateQueries({ queryKey: ['actividades_contacto', id] }));
  };

  const cambiarEtapa = useMutation({
    mutationFn: async (nuevaEtapa) => {
      await Contacto.update(id, { etapa_pipeline: nuevaEtapa, ultima_actividad: new Date().toISOString() });
      await HistorialLead.create({ contacto_id: id, tipo: 'Cambio_Etapa', descripcion: `Etapa cambiada a ${nuevaEtapa}`, fecha: new Date().toISOString(), etapa_anterior: contacto.etapa_pipeline, etapa_nueva: nuevaEtapa, usuario_email: 'agente', es_automatico: false }).catch(() => {});
    },
    onSuccess: () => { queryClient.invalidateQueries(['contacto', id]); queryClient.invalidateQueries(['historial_lead', id]); },
  });

  function onEtapaChange(nuevaEtapa) {
    if (nuevaEtapa === 'Descalificado') { setModalPerdido(true); return; }
    cambiarEtapa.mutate(nuevaEtapa);
  }

  const marcarPerdido = useMutation({
    mutationFn: async () => {
      await Contacto.update(id, { etapa_pipeline: 'Descalificado', motivo_perdida: motivoPerdida, ultima_actividad: new Date().toISOString() });
      await HistorialLead.create({ contacto_id: id, tipo: 'Cambio_Etapa', descripcion: `Lead descalificado. Motivo: ${motivoPerdida}`, fecha: new Date().toISOString(), etapa_anterior: contacto.etapa_pipeline, etapa_nueva: 'Descalificado', usuario_email: 'agente', es_automatico: false }).catch(() => {});
    },
    onSuccess: () => { setModalPerdido(false); setMotivoPerdida(''); queryClient.invalidateQueries(['contacto', id]); queryClient.invalidateQueries(['historial_lead', id]); toast({ title: 'Lead descalificado' }); },
  });

  const crearNota = useMutation({
    mutationFn: async () => {
      await Nota.create({ contacto_id: id, empresa_id: contacto?.empresa_id || undefined, texto: nuevaNota, fecha_nota: new Date().toISOString() });
      await HistorialLead.create({ contacto_id: id, tipo: 'Nota', descripcion: nuevaNota, fecha: new Date().toISOString(), usuario_email: 'agente', es_automatico: false }).catch(() => {});
    },
    onSuccess: () => { setNuevaNota(''); queryClient.invalidateQueries(['notas_contacto', id]); queryClient.invalidateQueries(['historial_lead', id]); },
  });

  const crearTarea = useMutation({
    mutationFn: async () => { await Tarea.create({ titulo: nuevaTarea.titulo, fecha_limite: nuevaTarea.fecha_limite, contacto_id: id, empresa_id: contacto?.empresa_id || undefined }); },
    onSuccess: () => { setNuevaTarea({ titulo: '', fecha_limite: '' }); queryClient.invalidateQueries(['tareas_contacto', id]); toast({ title: 'Tarea creada' }); },
    onError: (err) => toast({ title: 'Error al crear tarea', description: err?.message || String(err), variant: 'destructive' }),
  });

  const enviarWA = useMutation({
    mutationFn: async () => {
      await base44.functions.sendWhatsAppMessage({ contacto_id: id, variables: { mensaje: mensajeRapido } });
      await HistorialLead.create({ contacto_id: id, tipo: 'Mensaje_WhatsApp', descripcion: 'WhatsApp enviado: ' + mensajeRapido, fecha: new Date().toISOString(), usuario_email: 'agente', es_automatico: false }).catch(() => {});
    },
    onSuccess: () => { setMensajeRapido(''); queryClient.invalidateQueries(['historial_lead', id]); toast({ title: 'Mensaje enviado' }); },
    onError: () => toast({ title: 'Error al enviar', variant: 'destructive' }),
  });

  const clasificarIA = useMutation({
    mutationFn: () => base44.functions.classifyLead({ contacto_id: id }),
    onSuccess: (res) => { queryClient.invalidateQueries(['contacto', id]); queryClient.invalidateQueries(['historial_lead', id]); toast({ title: `Clasificado: ${res.temperatura} (${res.score}/100)` }); },
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" /></div>;
  }
  if (!contacto) {
    return (
      <div className="p-8 text-center text-gray-500">
        <AlertCircle className="w-12 h-12 mx-auto mb-2 opacity-30" />
        <p>Contacto no encontrado</p>
        <Button variant="link" onClick={() => navigate('/crm/contactos')}>Volver</Button>
      </div>
    );
  }

  const temp = TEMP_CONFIG[contacto.temperatura] || TEMP_CONFIG.Frio;
  // Opciones del "Comercial asignado": el equipo + el valor actual (por si viene uno viejo).
  const sectorOpc = mkOpc(listaSectores, contacto.sector);
  const necesidadOpc = mkOpc(listaNecesidad, contacto.tipo_necesidad);
  const ciudadOpc = mkOpc(listaCiudades, contacto.ciudad);
  const comercialOpc = mkOpc(listaComerciales, contacto.broker_asignado);

  // ── Header ──
  const header = (
    <div className="flex items-center gap-3">
      <Button variant="ghost" size="icon" onClick={() => navigate('/crm/contactos')}><ArrowLeft className="w-4 h-4" /></Button>
      {empresaVinculada ? (
        <Favicon empresa={empresaVinculada} className="w-12 h-12 rounded-2xl border border-border/40 p-1.5 shadow-sm flex-shrink-0" />
      ) : (
        <div className={`w-12 h-12 rounded-2xl ${colorAvatar(contacto.nombre)} flex items-center justify-center flex-shrink-0 text-white font-semibold text-lg shadow-sm`}>
          {inicialesDe(contacto.nombre)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl font-semibold text-foreground truncate">{contacto.nombre}</h1>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium border border-border text-muted-foreground flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${temp.dot}`} />{temp.label}
          </span>
          {contacto.ia_calificado && <span className="text-xs border border-border text-muted-foreground px-2 py-0.5 rounded-full">IA</span>}
        </div>
        <p className="text-sm text-muted-foreground truncate">
          {[contacto.cargo, empresaVinculada?.nombre || contacto.empresa].filter(Boolean).join(' · ') || 'Sin empresa'}
        </p>
      </div>
      <div className="flex gap-2 flex-wrap flex-shrink-0">
        {contacto.telefono && (
          <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => window.open(`https://wa.me/57${contacto.telefono?.replace(/\D/g, '')}`, '_blank')}>
            <MessageCircle className="w-3 h-3" /> WhatsApp
          </Button>
        )}
        <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => clasificarIA.mutate()} disabled={clasificarIA.isPending}>
          Clasificar IA
        </Button>
        {contacto.etapa_pipeline !== 'Descalificado' && (
          <Button size="sm" variant="outline" className="gap-1 text-xs text-red-600 hover:text-red-600 border-red-200 hover:bg-red-50" onClick={() => setModalPerdido(true)}>
            Descalificar
          </Button>
        )}
      </div>
    </div>
  );

  // ── Columna izquierda ──
  const left = (
    <>
      <div className="bg-card border border-border/60 rounded-2xl p-5 shadow-sm">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Datos del contacto</p>
        <div className="divide-y divide-border/40">
          <CampoEditable label="Nombre" value={contacto.nombre} onSave={setCampo('nombre')} />
          <CampoEditable label="Teléfono" value={contacto.telefono} onSave={setCampo('telefono')} />
          <CampoEditable label="Email" value={contacto.email} onSave={setCampo('email')} tipo="email" />
          <CampoEditable label="Cargo" value={contacto.cargo} onSave={setCampo('cargo')} />
          <CampoEditable label="Sector" value={contacto.sector} onSave={setCampo('sector')} tipo="select" opciones={sectorOpc} />
          <CampoEditable label="Ciudad" value={contacto.ciudad} onSave={setCampo('ciudad')} tipo="select" opciones={ciudadOpc} />
          <CampoEditable label="Tipo de necesidad" value={contacto.tipo_necesidad} onSave={setCampo('tipo_necesidad')} tipo="select" opciones={necesidadOpc} />
          <CampoEditable label="Volumen aproximado" value={contacto.volumen_aproximado} onSave={setCampo('volumen_aproximado')} />
          <CampoEditable label="Presupuesto" value={contacto.presupuesto} onSave={(v) => setCampo('presupuesto')(Number(v) || null)} tipo="number" formato={formatCOP} />
          <CampoEditable label="Comercial asignado" value={contacto.broker_asignado} onSave={setCampo('broker_asignado')} tipo="select" opciones={comercialOpc} />
        </div>
      </div>

      {/* Etapa del lead */}
      <div className="bg-card border border-border/60 rounded-2xl p-5 shadow-sm">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Etapa del lead</p>
        <Select value={contacto.etapa_pipeline || 'Lead'} onValueChange={onEtapaChange}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>{ETAPA_OPC.map(e => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {/* Empresa vinculada */}
      <div className="bg-card border border-border/60 rounded-2xl p-5 shadow-sm space-y-2">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Empresa</p>
        <SelectorEmpresa value={contacto.empresa_id || ''} sugerencia={contacto.empresa || ''} onChange={(empresaId) => actualizarContacto.mutate({ empresa_id: empresaId || '' })} />
        {contacto.empresa_id ? (
          <Button variant="link" size="sm" className="h-6 px-0 text-xs" onClick={() => navigate(`/crm/empresas/${contacto.empresa_id}`)}>Ver perfil de la empresa →</Button>
        ) : contacto.empresa ? (
          <p className="text-xs text-muted-foreground">Tracy registró "{contacto.empresa}" — búscala arriba para vincularla.</p>
        ) : null}
      </div>
    </>
  );

  // ── Columna central ──
  const center = (
    <Tabs defaultValue="actividad">
      <TabsList className={TABS_LIST_CLS}>
        <TabsTrigger className={TABS_TRIGGER_CLS} value="actividad">Actividad</TabsTrigger>
        <TabsTrigger className={TABS_TRIGGER_CLS} value="notas">Notas ({notas.length})</TabsTrigger>
        <TabsTrigger className={TABS_TRIGGER_CLS} value="emails">Emails ({emails.length})</TabsTrigger>
        <TabsTrigger className={TABS_TRIGGER_CLS} value="tareas">Tareas ({tareas.length})</TabsTrigger>
        <TabsTrigger className={TABS_TRIGGER_CLS} value="chat">
          Chat{conversacion?.mensajes_sin_leer > 0 && <span className="ml-1 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 inline-flex items-center justify-center">{conversacion.mensajes_sin_leer}</span>}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="actividad" className="space-y-2 mt-3">
        {/* Compositor rápido de nota */}
        <div className="bg-card border border-border/60 rounded-2xl p-4 space-y-2">
          <Textarea placeholder="Escribe una nota sobre este contacto..." value={nuevaNota} onChange={e => setNuevaNota(e.target.value)} rows={2} className="resize-none" />
          <div className="flex justify-end">
            <Button size="sm" disabled={!nuevaNota.trim() || crearNota.isPending} onClick={() => crearNota.mutate()}>Guardar nota</Button>
          </div>
        </div>
        {feed.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-sm">Sin actividad todavía</p>
            <p className="text-xs mt-1">Las notas, tareas, emails y cambios de etapa aparecerán aquí.</p>
          </div>
        ) : feed.map(item => <FeedItem key={item.id} item={item} />)}
      </TabsContent>

      <TabsContent value="notas" className="space-y-3 mt-3">
        <div className="bg-card border border-border/60 rounded-2xl p-4 space-y-2">
          <Textarea placeholder="Añadir nota..." value={nuevaNota} onChange={e => setNuevaNota(e.target.value)} rows={3} />
          <Button size="sm" disabled={!nuevaNota.trim() || crearNota.isPending} onClick={() => crearNota.mutate()}>Guardar nota</Button>
        </div>
        {notas.map(n => (
          <div key={n.id} className="bg-card border border-border/40 rounded-2xl p-3.5">
            <p className="text-sm whitespace-pre-wrap">{n.texto}</p>
            <p className="text-xs text-gray-400 mt-1">{new Date(n.fecha_nota || n.created_date).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
          </div>
        ))}
      </TabsContent>

      <TabsContent value="emails" className="mt-3">
        <EmailTab contactoId={id} contacto={contacto} emails={emails} />
      </TabsContent>

      <TabsContent value="tareas" className="space-y-3 mt-3">
        <div className="bg-card border border-border/60 rounded-2xl p-4 flex gap-2 items-end flex-wrap">
          <div className="flex-1 min-w-40 space-y-1">
            <Label className="text-xs text-gray-500">Nueva tarea</Label>
            <Input value={nuevaTarea.titulo} onChange={e => setNuevaTarea(t => ({ ...t, titulo: e.target.value }))} placeholder="Ej: Llamar para agendar demo" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-gray-500">Fecha límite</Label>
            <Input type="date" value={nuevaTarea.fecha_limite} onChange={e => setNuevaTarea(t => ({ ...t, fecha_limite: e.target.value }))} />
          </div>
          <Button size="sm" disabled={!nuevaTarea.titulo || !nuevaTarea.fecha_limite || crearTarea.isPending} onClick={() => crearTarea.mutate()}>Crear</Button>
        </div>
        {tareas.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Sin tareas asignadas</p>}
        {tareas.map(t => (
          <div key={t.id} className="bg-card border border-border/40 rounded-2xl p-3.5 flex items-center justify-between">
            <div>
              <p className={`text-sm font-medium ${t.completada ? 'line-through text-muted-foreground' : ''}`}>{t.titulo}</p>
              <p className="text-xs text-gray-500">Vence: {t.fecha_limite ? new Date(t.fecha_limite + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}{t.asignado_a && <> · {t.asignado_a.split('@')[0]}</>}</p>
            </div>
            <Badge variant={t.completada ? 'default' : 'secondary'}>{t.completada ? 'Completada' : t.prioridad || 'Pendiente'}</Badge>
          </div>
        ))}
      </TabsContent>

      <TabsContent value="chat" className="mt-3">
        <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
          <ScrollArea className="h-80 p-4">
            {mensajesChat.length === 0 && <div className="text-center text-gray-400 py-8 text-sm">No hay mensajes en la conversación aún</div>}
            <div className="space-y-3">
              {mensajesChat.map(msg => {
                const esSaliente = msg.direccion === 'Saliente';
                return (
                  <div key={msg.id} className={`flex ${esSaliente ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-xs px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${esSaliente ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted text-foreground rounded-bl-sm'}`}>
                      {msg.contenido}
                      <div className={`text-xs mt-1 flex items-center gap-1 ${esSaliente ? 'text-primary-foreground/70 justify-end' : 'text-muted-foreground'}`}>
                        <Clock className="w-2.5 h-2.5" />
                        {new Date(msg.fecha).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        {esSaliente && msg.enviado_por_ia && <span>(IA)</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
          <div className="border-t p-3 flex gap-2">
            <Input placeholder="Enviar WhatsApp rápido..." value={mensajeRapido} onChange={e => setMensajeRapido(e.target.value)} onKeyDown={e => e.key === 'Enter' && enviarWA.mutate()} className="flex-1" />
            <Button onClick={() => enviarWA.mutate()} disabled={!mensajeRapido.trim() || enviarWA.isPending} size="icon"><Send className="w-4 h-4" /></Button>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );

  // ── Columna derecha ──
  const right = (
    <>
      <PanelAsociado titulo="Empresa" count={contacto.empresa_id ? 1 : 0} icono={<Building2 className="w-4 h-4" />}
        vacio={!contacto.empresa_id ? <p className="text-xs text-muted-foreground py-2">Sin empresa vinculada — vincúlala en el panel izquierdo</p> : null}>
        {empresaVinculada && (
          <Link to={`/crm/empresas/${empresaVinculada.id}`} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-muted/40 transition-colors">
            <Favicon empresa={empresaVinculada} className="w-9 h-9 border border-border/40" />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{empresaVinculada.nombre}</p>
              <p className="text-xs text-muted-foreground truncate">{empresaVinculada.dominio_web || empresaVinculada.sector?.replace(/_/g, ' ')}</p>
            </div>
          </Link>
        )}
      </PanelAsociado>

      <PanelAsociado titulo="Negocios" count={opsContacto.length} icono={<TrendingUp className="w-4 h-4" />} onAgregar={() => { setOpEditando(null); setOpFormOpen(true); }} agregarLabel="Nuevo"
        vacio={opsContacto.length === 0 ? <p className="text-xs text-muted-foreground py-2">Sin oportunidades</p> : null}>
        {opsContacto.map(o => (
          <button key={o.id} onClick={() => { setOpEditando(o); setOpFormOpen(true); }} className="w-full text-left p-2 rounded-lg hover:bg-muted/40 transition-colors">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium truncate">{o.nombre}</p>
              {o.valor_estimado > 0 && <span className="text-xs font-semibold flex-shrink-0">${Math.round(o.valor_estimado).toLocaleString('es-CO')}</span>}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">{ETAPAS_OPORTUNIDAD.find(e => e.key === o.etapa)?.label || o.etapa}</p>
          </button>
        ))}
      </PanelAsociado>

      <PanelAsociado titulo="Reuniones" count={reunionesContacto.length} icono={<NotebookPen className="w-4 h-4" />}
        vacio={reunionesContacto.length === 0 ? <p className="text-xs text-muted-foreground py-2">Sin reuniones</p> : null}>
        {reunionesContacto.map(r => (
          <Link key={r.id} to={`/crm/reuniones/${r.id}`} className="block p-2 rounded-lg hover:bg-muted/40 transition-colors">
            <p className="text-sm font-medium truncate">{r.titulo}</p>
            <p className="text-[11px] text-muted-foreground">{r.fecha_reunion && new Date(r.fecha_reunion + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}</p>
          </Link>
        ))}
      </PanelAsociado>

      <DocumentosPanel contactoId={id} onCambio={(accion) => registrarActividad({ contacto_id: id, empresa_id: contacto?.empresa_id || undefined, tipo: 'documento', descripcion: accion === 'delete' ? 'Eliminó un documento' : 'Subió un documento' }).then(() => queryClient.invalidateQueries({ queryKey: ['actividades_contacto', id] }))} />
    </>
  );

  return (
    <>
      <RecordLayout header={header} left={left} center={center} right={right} />

      <OportunidadForm open={opFormOpen} onOpenChange={setOpFormOpen} oportunidad={opEditando} empresaFija={contacto.empresa_id || ''} />

      {/* Modal Descalificar */}
      <Dialog open={modalPerdido} onOpenChange={setModalPerdido}>
        <DialogContent>
          <DialogHeader><DialogTitle className="text-red-600">¿Por qué se descalifica este lead?</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Select value={motivoPerdida} onValueChange={setMotivoPerdida}>
              <SelectTrigger><SelectValue placeholder="Selecciona el motivo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Precio fuera de presupuesto">Precio fuera de presupuesto</SelectItem>
                <SelectItem value="No es el momento">No es el momento</SelectItem>
                <SelectItem value="Se fue con la competencia">Se fue con la competencia</SelectItem>
                <SelectItem value="No responde">No responde</SelectItem>
                <SelectItem value="No califica (fuera de perfil)">No califica (fuera de perfil)</SelectItem>
                <SelectItem value="Información de contacto incorrecta">Información de contacto incorrecta</SelectItem>
                <SelectItem value="Otro">Otro</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setModalPerdido(false)}>Cancelar</Button>
              <Button variant="destructive" disabled={!motivoPerdida || marcarPerdido.isPending} onClick={() => marcarPerdido.mutate()}>Confirmar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Tab de Email ─────────────────────────────────────────────────────────────
const ESTADO_EMAIL_COLOR = {
  Enviado: 'bg-gray-100 text-gray-600',
  Abierto: 'bg-green-100 text-green-700',
  Respondido: 'bg-blue-100 text-blue-700',
  Rebotado: 'bg-red-100 text-red-600',
};

function EmailTab({ contactoId, contacto, emails = [] }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [modalEnvio, setModalEnvio] = useState(false);
  const [plantillaId, setPlantillaId] = useState('');
  const [asunto, setAsunto] = useState('');
  const [enviando, setEnviando] = useState(false);

  const { data: plantillas = [] } = useQuery({ queryKey: ['plantillas-email'], queryFn: () => PlantillaEmail.list() });

  function onPlantillaChange(pid) {
    setPlantillaId(pid);
    const p = plantillas.find(p => p.id === pid);
    if (p) setAsunto(p.asunto);
  }

  async function enviarEmail() {
    if (!contacto?.email) { toast({ title: 'Este contacto no tiene email registrado', variant: 'destructive' }); return; }
    const plantilla = plantillas.find(p => p.id === plantillaId);
    if (!plantilla) return;
    setEnviando(true);
    try {
      await base44.functions.invoke('sendEmail', { modo: 'individual', contacto_ids: [contactoId], asunto, plantilla_id: plantilla.id });
      toast({ title: 'Email enviado' });
      qc.invalidateQueries({ queryKey: ['emails-contacto', contactoId] });
      setModalEnvio(false);
    } catch (err) {
      toast({ title: 'Error al enviar', description: String(err), variant: 'destructive' });
    }
    setEnviando(false);
  }

  async function marcarRespondido(email) {
    await EmailEnviado.update(email.id, { estado: 'Respondido', fecha_respuesta: new Date().toISOString() });
    qc.invalidateQueries({ queryKey: ['emails-contacto', contactoId] });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{emails.length} email(s) enviados</p>
        <Button size="sm" onClick={() => { setPlantillaId(''); setAsunto(''); setModalEnvio(true); }}>
          <Send className="w-3.5 h-3.5 mr-1.5" /> Enviar email
        </Button>
      </div>

      {emails.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No se han enviado emails a este contacto</p>
      ) : emails.map(e => (
        <div key={e.id} className="flex items-center justify-between bg-card border border-border/40 rounded-xl px-3 py-2 text-sm">
          <div className="min-w-0 flex-1">
            <p className="font-medium truncate">{e.asunto}</p>
            <p className="text-xs text-muted-foreground">{e.fecha_envio ? new Date(e.fecha_envio).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_EMAIL_COLOR[e.estado] || ''}`}>{e.estado}</span>
            {e.estado === 'Abierto' && <Button size="sm" variant="outline" className="text-xs h-6 px-2" onClick={() => marcarRespondido(e)}>Respondido</Button>}
          </div>
        </div>
      ))}

      <Dialog open={modalEnvio} onOpenChange={(open) => !open && setModalEnvio(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Enviar email a {contacto?.nombre}</DialogTitle></DialogHeader>
          {!contacto?.email && <p className="text-sm text-destructive">Este contacto no tiene email registrado.</p>}
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>Plantilla</Label>
              <Select value={plantillaId} onValueChange={onPlantillaChange}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>{plantillas.filter(p => p.activo !== false).map(p => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {plantillaId && (
              <div className="space-y-1.5">
                <Label>Asunto</Label>
                <Input value={asunto} onChange={e => setAsunto(e.target.value)} />
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setModalEnvio(false)}>Cancelar</Button>
            <Button onClick={enviarEmail} disabled={!plantillaId || !asunto || enviando || !contacto?.email}>{enviando ? 'Enviando...' : 'Enviar'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
