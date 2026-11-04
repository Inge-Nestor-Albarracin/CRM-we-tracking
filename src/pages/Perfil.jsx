import React, { useState, useEffect, useMemo, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';
import { gcalEventLink } from '@/lib/gcal';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import esLocale from '@fullcalendar/core/locales/es';
import {
  CalendarDays, ClipboardList, PenLine, Upload, Save, X, ChevronLeft, ChevronRight,
  CheckCircle2, Clock, AlertTriangle, CalendarPlus, CalendarCheck, Link2, Circle, Video,
  Mail, Send, RefreshCw, Reply, ArrowLeft, PenSquare, Loader2,
} from 'lucide-react';

// Extrae nombre y email de un header "From": '"Nombre" <correo@x.com>'
function parseFrom(str = '') {
  const m = String(str).match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>/);
  if (m) return { nombre: m[1].trim() || m[2].trim(), email: m[2].trim() };
  const e = String(str).trim();
  return { nombre: e, email: e };
}
function stripHtmlText(html = '') {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/(p|div|tr|li|h[1-6]|br)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const todayStr = () => new Date().toDateString();

function iniciales(nombre = '') {
  const p = nombre.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '·';
  return (p[0][0] + (p[1]?.[0] || '')).toUpperCase();
}
function colorDe(str = '') {
  const cols = ['bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500'];
  let h = 0; for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return cols[Math.abs(h) % cols.length];
}

export default function Perfil() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState('calendario');

  useEffect(() => { base44.auth.me().then(setUser).catch(() => {}); }, []);
  const email = (user?.email || '').toLowerCase();

  const { data: perfiles = [] } = useQuery({
    queryKey: ['perfiles-usuario'], queryFn: () => base44.entities.PerfilUsuario.list(), enabled: !!user,
  });
  const perfil = perfiles.find(p => p.email && email && p.email.toLowerCase() === email);

  const { data: tareas = [] } = useQuery({
    queryKey: ['tareas-global'], queryFn: () => base44.entities.Tarea.list(), staleTime: 60_000, enabled: !!user,
  });
  const { data: empresas = [] } = useQuery({ queryKey: ['empresas'], queryFn: () => base44.entities.Empresa.list() });
  const empresaMap = useMemo(() => Object.fromEntries(empresas.map(e => [e.id, e])), [empresas]);

  const nombre = perfil?.nombre || user?.full_name || (email ? email.split('@')[0] : '');

  // Tareas del usuario: por email asignado o por nombre de responsable.
  const misTareas = useMemo(() => {
    const nom = (nombre || '').toLowerCase();
    return tareas.filter(t => {
      const asig = (t.asignado_a || '').toLowerCase();
      const resp = (t.responsable || '').toLowerCase();
      return (email && asig === email) || (nom && resp === nom);
    });
  }, [tareas, email, nombre]);

  return (
    <div className={`space-y-5 ${tab === 'correo' || tab === 'calendario' ? 'max-w-none' : 'max-w-4xl'}`}>
      {/* Header de perfil */}
      <div className="flex items-center gap-4">
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white text-xl font-semibold flex-shrink-0 ${colorDe(nombre)}`}>
          {iniciales(nombre)}
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground truncate">{nombre || 'Mi perfil'}</h1>
          <p className="text-sm text-muted-foreground truncate">{perfil?.cargo || 'Sin cargo'}{email ? ` · ${user.email}` : ''}</p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto flex-shrink-0" onClick={() => navigate('/configuracion')}>
          <Link2 className="w-4 h-4 mr-1" /> Mis integraciones
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/40 rounded-xl p-1 w-fit">
        {[
          { k: 'calendario', l: 'Calendario', icon: CalendarDays },
          { k: 'correo', l: 'Correo', icon: Mail },
          { k: 'tareas', l: 'Tareas pendientes', icon: ClipboardList },
          { k: 'firma', l: 'Firma', icon: PenLine },
        ].map(o => (
          <button key={o.k} onClick={() => setTab(o.k)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === o.k ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            <o.icon className="w-4 h-4" /> {o.l}
          </button>
        ))}
      </div>

      {tab === 'calendario' && <CalendarioTab misTareas={misTareas} empresaMap={empresaMap} navigate={navigate} email={user?.email} toast={toast} />}
      {tab === 'correo' && <CorreoTab toast={toast} />}
      {tab === 'tareas' && <TareasTab misTareas={misTareas} empresaMap={empresaMap} navigate={navigate} qc={qc} toast={toast} />}
      {tab === 'firma' && <FirmaTab user={user} perfil={perfil} qc={qc} toast={toast} />}
    </div>
  );
}

/* ---------- Calendario personal (estilo Google Calendar) ---------- */
const pad2 = (n) => String(n).padStart(2, '0');
const claveDia = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// Color del evento según urgencia (como categorías de color en Google Calendar).
function estiloEvento(t, esPasado) {
  if (t.completada) return { chip: 'bg-muted text-muted-foreground/80 line-through', dot: 'bg-muted-foreground/40' };
  if (esPasado) return { chip: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300', dot: 'bg-rose-500' };
  return { chip: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300', dot: 'bg-blue-500' };
}
// Estilo para eventos traídos de Google Calendar (verde, para distinguirlos de las tareas).
const ESTILO_GCAL = { chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300', dot: 'bg-emerald-500' };

function CalendarioTab({ misTareas, empresaMap, navigate, email, toast }) {
  const now = new Date();
  const [vista, setVista] = useState('app'); // 'app' | 'google'
  const [modalEvento, setModalEvento] = useState(false);
  const [nuevoEv, setNuevoEv] = useState({ titulo: '', fecha: '', fecha_fin: '', hora: '', descripcion: '', invitados: '', conMeet: false });
  const [guardandoEv, setGuardandoEv] = useState(false);
  const { isConnected, loading, connect, disconnect, createEvent } = useGoogleCalendar();
  const reconectar = async () => { try { await disconnect(); } catch { /* */ } connect(); };

  const gcalSrc = email
    ? `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(email)}&ctz=America%2FBogota&mode=WEEK&wkst=1&showTitle=0&showPrint=0&showTabs=1&showCalendars=0`
    : '';

  // Eventos reales de Google Calendar (por API, una sola autorización — sin depender del login).
  const { data: gcal, refetch: refetchGcal } = useQuery({
    queryKey: ['gcal-eventos'],
    queryFn: async () => { const r = await base44.functions.invoke('listCalendarEvents', {}); return r?.data ?? r; },
    enabled: isConnected,
    staleTime: 60_000,
  });

  const hoyKey = claveDia(now);

  // Combina tareas del CRM + eventos de Google en el formato de FullCalendar.
  const eventos = useMemo(() => {
    const out = [];
    misTareas.forEach(t => {
      if (!t.fecha_limite) return;
      const dia = t.fecha_limite.slice(0, 10);
      const overdue = !t.completada && dia < hoyKey;
      const color = t.completada ? '#9ca3af' : overdue ? '#ef4444' : '#3b82f6';
      out.push({
        id: `t-${t.id}`,
        title: t.titulo,
        start: t.hora ? `${dia}T${t.hora}` : dia,
        allDay: !t.hora,
        backgroundColor: color, borderColor: color,
        extendedProps: { kind: 'tarea', ref: t },
      });
    });
    (gcal?.eventos || []).forEach(e => {
      out.push({
        id: `e-${e.id}`,
        title: e.titulo,
        start: e.allDay ? e.fecha : (e.hora ? `${e.fecha}T${e.hora}` : e.fecha),
        allDay: e.allDay,
        backgroundColor: '#10b981', borderColor: '#10b981',
        extendedProps: { kind: 'evento', ref: e },
      });
    });
    return out;
  }, [misTareas, gcal, hoyKey]);

  // Arrastrar-para-crear (select) o clic en un hueco → abre el modal con fecha/hora.
  const onSelect = (info) => {
    const start = info.start;
    const fecha = claveDia(start);
    let hora = '', fecha_fin = '';
    if (info.allDay) {
      const endIncl = new Date(info.end); endIncl.setDate(endIncl.getDate() - 1);
      const kf = claveDia(endIncl);
      if (kf > fecha) fecha_fin = kf;
    } else {
      hora = `${pad2(start.getHours())}:${pad2(start.getMinutes())}`;
    }
    setNuevoEv({ titulo: '', fecha, fecha_fin, hora, descripcion: '' });
    setModalEvento(true);
  };

  const onEventClick = (info) => {
    const { kind, ref } = info.event.extendedProps;
    if (kind === 'evento' && ref?.htmlLink) { info.jsEvent.preventDefault(); window.open(ref.htmlLink, '_blank'); }
    else if (kind === 'tarea' && ref?.empresa_id) navigate(`/crm/empresas/${ref.empresa_id}`);
  };

  const crearEvento = async () => {
    if (!nuevoEv.titulo || !nuevoEv.fecha) { toast?.({ title: 'Falta título o fecha', variant: 'destructive' }); return; }
    setGuardandoEv(true);
    const res = await createEvent({ titulo: nuevoEv.titulo, fecha_limite: nuevoEv.fecha, fecha_fin: nuevoEv.fecha_fin, hora: nuevoEv.hora, descripcion: nuevoEv.descripcion, invitados: nuevoEv.invitados, con_meet: nuevoEv.conMeet });
    setGuardandoEv(false);
    if (res) {
      toast?.({ title: res.meetLink ? 'Evento creado con Google Meet' : 'Evento creado en Google Calendar' });
      setModalEvento(false);
      setNuevoEv({ titulo: '', fecha: '', fecha_fin: '', hora: '', descripcion: '', invitados: '', conMeet: false });
      setTimeout(() => refetchGcal(), 900);
    }
    else toast?.({ title: 'No se pudo crear', description: 'Conecta tu Google Calendar primero (botón Conectar).', variant: 'destructive' });
  };

  return (
    <div className="space-y-3">
      {/* Barra: toggle vista + estado Google Calendar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 bg-muted/40 rounded-lg p-1 w-fit">
          {[{ k: 'app', l: 'Calendario' }, { k: 'google', l: 'Ver en Google (en vivo)' }].map(o => (
            <button key={o.k} onClick={() => setVista(o.k)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${vista === o.k ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              {o.l}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" className="h-8" onClick={() => { setNuevoEv({ titulo: '', fecha: claveDia(new Date()), fecha_fin: '', hora: '', descripcion: '', invitados: '', conMeet: false }); setModalEvento(true); }}>
            <CalendarPlus className="w-3.5 h-3.5 mr-1" /> Nuevo evento
          </Button>
          {!loading && (
            isConnected
              ? <>
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><CalendarCheck className="w-3.5 h-3.5" /> Sincronizado</span>
                  <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground" onClick={reconectar} title="Re-autorizar (necesario tras cambiar permisos)"><Link2 className="w-3.5 h-3.5 mr-1" /> Reconectar</Button>
                </>
              : <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground" onClick={connect}><Link2 className="w-3.5 h-3.5 mr-1" /> Conectar Google Calendar</Button>
          )}
        </div>
      </div>

      {vista === 'google' ? (
        <div className="bg-card rounded-2xl overflow-hidden border border-border/50 shadow-sm">
          {gcalSrc
            ? <iframe title="Google Calendar" src={gcalSrc} className="w-full h-[calc(100vh-15rem)] border-0" />
            : <div className="py-16 text-center text-sm text-muted-foreground">Cargando tu cuenta…</div>}
          <div className="px-4 py-2 border-t border-border/40 text-[11px] text-muted-foreground">
            Vista en vivo de Google Calendar de <span className="font-medium">{email}</span>.
          </div>
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border/50 shadow-sm p-3 wt-fc" style={{ height: 'calc(100vh - 13rem)' }}>
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            locale={esLocale}
            timeZone="America/Bogota"
            height="100%"
            headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek' }}
            buttonText={{ today: 'Hoy', month: 'Mes', week: 'Semana', day: 'Día', list: 'Agenda' }}
            selectable
            selectMirror
            select={onSelect}
            events={eventos}
            eventClick={onEventClick}
            nowIndicator
            dayMaxEvents={3}
            firstDay={1}
            slotMinTime="06:00:00"
            slotMaxTime="22:00:00"
            expandRows
          />
        </div>
      )}

      {/* Modal crear evento (se guarda directo en Google Calendar por API) */}
      {modalEvento && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4" onClick={() => !guardandoEv && setModalEvento(false)}>
          <div className="bg-card w-full sm:max-w-md sm:rounded-xl rounded-t-2xl border border-border/50 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
              <p className="text-sm font-semibold text-foreground">Nuevo evento</p>
              <button onClick={() => !guardandoEv && setModalEvento(false)} className="p-1 rounded hover:bg-muted text-muted-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-3">
              <Input placeholder="Título del evento" value={nuevoEv.titulo} onChange={e => setNuevoEv(v => ({ ...v, titulo: e.target.value }))} autoFocus />
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[11px] text-muted-foreground block mb-1">Inicio</label>
                  <Input type="date" value={nuevoEv.fecha} onChange={e => setNuevoEv(v => ({ ...v, fecha: e.target.value }))} />
                </div>
                <div className="flex-1">
                  <label className="text-[11px] text-muted-foreground block mb-1">Fin (opcional)</label>
                  <Input type="date" value={nuevoEv.fecha_fin} onChange={e => setNuevoEv(v => ({ ...v, fecha_fin: e.target.value }))} />
                </div>
                <div className="w-28">
                  <label className="text-[11px] text-muted-foreground block mb-1">Hora</label>
                  <Input type="time" value={nuevoEv.hora} onChange={e => setNuevoEv(v => ({ ...v, hora: e.target.value }))} disabled={!!nuevoEv.fecha_fin} />
                </div>
              </div>
              {!isConnected && <p className="text-[11px] text-amber-600 dark:text-amber-400">Aún no conectas tu Google Calendar. Conéctalo (botón "Conectar") para que el evento se guarde ahí.</p>}
              <textarea className="w-full min-h-[80px] rounded-lg border border-border bg-background p-3 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="Descripción (opcional)" value={nuevoEv.descripcion} onChange={e => setNuevoEv(v => ({ ...v, descripcion: e.target.value }))} />
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">Invitados (correos separados por coma)</label>
                <Input placeholder="ana@empresa.com, carlos@empresa.com" value={nuevoEv.invitados} onChange={e => setNuevoEv(v => ({ ...v, invitados: e.target.value }))} />
              </div>
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
                <input type="checkbox" checked={nuevoEv.conMeet} onChange={e => setNuevoEv(v => ({ ...v, conMeet: e.target.checked }))} className="w-4 h-4 rounded border-border accent-primary" />
                <Video className="w-4 h-4 text-muted-foreground" /> Agregar enlace de Google Meet
              </label>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-border/40">
              <Button variant="outline" size="sm" onClick={() => setModalEvento(false)} disabled={guardandoEv}>Cancelar</Button>
              <Button size="sm" onClick={crearEvento} disabled={guardandoEv}><CalendarPlus className="w-3.5 h-3.5 mr-1" /> {guardandoEv ? 'Creando...' : 'Crear en Google Calendar'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Correo (Gmail) ---------- */
function fmtFecha(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  const hoy = new Date();
  if (dt.toDateString() === hoy.toDateString()) return dt.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  return dt.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}

const GMAIL_KAREN_CONNECTOR_ID = '6a739cba0cfbf2c423f6d6f2';

function CorreoTab({ toast }) {
  const [selId, setSelId] = useState(null);
  const [componer, setComponer] = useState(false); // false | 'reply' | 'nuevo'
  const [form, setForm] = useState({ to: '', asunto: '', cuerpo: '', threadId: '', inReplyTo: '' });
  const [enviando, setEnviando] = useState(false);
  const [karenConnected, setKarenConnected] = useState(false);
  const [karenLoading, setKarenLoading] = useState(true);

  const inv = async (fn, args) => { const r = await base44.functions.invoke(fn, args); return r?.data ?? r; };

  const checkKaren = async () => {
    setKarenLoading(true);
    try {
      const r = await base44.functions.invoke('checkGmailKarenConnection', {});
      const d = r?.data ?? r;
      setKarenConnected(d?.connected || false);
    } catch { setKarenConnected(false); }
    setKarenLoading(false);
  };

  useEffect(() => { checkKaren(); }, []);

  const connectKaren = async () => {
    let url;
    try { url = await base44.connectors.connectAppUser(GMAIL_KAREN_CONNECTOR_ID); }
    catch (err) { toast({ title: 'No se pudo iniciar la conexión', description: String(err?.message || err), variant: 'destructive' }); return; }
    const popup = window.open(url, '_blank');
    if (!popup) { window.location.href = url; return; }
    const timer = setInterval(() => { if (popup.closed) { clearInterval(timer); checkKaren(); } }, 500);
    setTimeout(() => clearInterval(timer), 90000);
  };

  const { data: bandeja, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['gmail-karen-bandeja'],
    queryFn: () => inv('gmailKarenBandeja', { q: 'in:inbox', max: 20 }),
    enabled: karenConnected,
    staleTime: 30000,
  });
  const mensajes = bandeja?.mensajes || [];

  const { data: msg, isLoading: cargandoMsg } = useQuery({
    queryKey: ['gmail-karen-msg', selId],
    queryFn: () => inv('gmailKarenMensaje', { id: selId }),
    enabled: !!selId && karenConnected,
  });

  const abrirResponder = () => {
    if (!msg) return;
    const { email } = parseFrom(msg.from);
    const asunto = /^re:/i.test(msg.subject || '') ? msg.subject : `Re: ${msg.subject}`;
    setForm({ to: email, asunto, cuerpo: '', threadId: msg.threadId || '', inReplyTo: msg.messageId || '' });
    setComponer('reply');
  };
  const abrirNuevo = () => { setForm({ to: '', asunto: '', cuerpo: '', threadId: '', inReplyTo: '' }); setComponer('nuevo'); };

  const enviar = async () => {
    if (!form.to || !form.cuerpo) { toast({ title: 'Falta destinatario o mensaje', variant: 'destructive' }); return; }
    setEnviando(true);
    try {
      const r = await inv('gmailKarenEnviar', form);
      if (r?.ok) { toast({ title: 'Correo enviado' }); setComponer(false); }
      else toast({ title: 'Error al enviar', description: r?.error || '', variant: 'destructive' });
    } catch (e) { toast({ title: 'Error', description: String(e), variant: 'destructive' }); }
    setEnviando(false);
  };

  const cuerpoMsg = msg ? (String(msg.texto || '').trim() ? msg.texto : stripHtmlText(msg.html)) : '';

  return (
    <div className="bg-card rounded-xl border border-border/50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40">
        <div className="flex items-center gap-2">
          {selId && <button onClick={() => setSelId(null)} className="md:hidden p-1 rounded hover:bg-muted"><ArrowLeft className="w-4 h-4" /></button>}
          <Mail className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Correo</span>
        </div>
        <div className="flex items-center gap-1.5">
          {karenConnected && <Button size="sm" variant="ghost" className="h-8" onClick={() => refetch()} disabled={isFetching} title="Actualizar"><RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} /></Button>}
          {karenConnected && <Button size="sm" className="h-8" onClick={abrirNuevo}><PenSquare className="w-3.5 h-3.5 mr-1" /> Redactar</Button>}
          {karenLoading
            ? <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
            : karenConnected
              ? <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground" onClick={connectKaren} title="Reconectar"><Link2 className="w-3.5 h-3.5 mr-1" /> Reconectar</Button>
              : <Button size="sm" className="h-8" onClick={connectKaren}><Link2 className="w-3.5 h-3.5 mr-1" /> Conectar Gmail</Button>}
        </div>
      </div>

      {karenConnected && bandeja?.error && (
        <div className="px-4 py-3 text-xs text-amber-600 dark:text-amber-400">No pude leer el correo: {bandeja.error}. Verifica que Gmail esté conectado con permiso de lectura.</div>
      )}

      {!karenLoading && !karenConnected ? (
        <div className="p-10 text-center">
          <Mail className="w-8 h-8 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground mb-4">Conecta tu cuenta de Gmail para leer y enviar correos desde aquí.</p>
          <Button size="sm" onClick={connectKaren}><Link2 className="w-3.5 h-3.5 mr-1" /> Conectar Gmail</Button>
        </div>
      ) : (
      <div className="grid md:grid-cols-[360px_1fr] h-[calc(100vh-13rem)]">
        {/* Lista */}
        <div className={`border-r border-border/40 overflow-y-auto ${selId ? 'hidden md:block' : ''}`}>
          {isLoading ? <div className="p-6 text-center text-sm text-muted-foreground">Cargando...</div>
            : mensajes.length === 0 ? <div className="p-6 text-center text-sm text-muted-foreground">Bandeja vacía</div>
            : mensajes.map(m => {
              const { nombre } = parseFrom(m.from);
              return (
                <button key={m.id} onClick={() => setSelId(m.id)} className={`w-full text-left px-4 py-3 border-b border-border/20 hover:bg-muted/40 transition-colors ${selId === m.id ? 'bg-primary/8' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm truncate ${m.unread ? 'font-semibold text-foreground' : 'text-foreground/80'}`}>{nombre}</span>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">{fmtFecha(m.date)}</span>
                  </div>
                  <p className={`text-[13px] truncate ${m.unread ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>{m.subject}</p>
                  <p className="text-xs text-muted-foreground/70 truncate">{m.snippet}</p>
                </button>
              );
            })}
        </div>

        {/* Lector */}
        <div className={`overflow-y-auto ${selId ? '' : 'hidden md:flex md:items-center md:justify-center'}`}>
          {!selId ? <p className="text-sm text-muted-foreground py-16">Selecciona un correo</p>
            : cargandoMsg ? <div className="p-6 text-sm text-muted-foreground">Cargando...</div>
            : msg?.error ? <div className="p-6 text-sm text-amber-600">{msg.error}</div>
            : msg ? (
              <div className="p-5">
                <h3 className="text-base font-semibold text-foreground leading-snug">{msg.subject}</h3>
                <div className="flex items-center justify-between gap-2 mt-1.5 mb-3">
                  <p className="text-xs text-muted-foreground min-w-0 truncate"><span className="font-medium text-foreground/80">{parseFrom(msg.from).nombre}</span> · {parseFrom(msg.from).email}</p>
                  <p className="text-xs text-muted-foreground flex-shrink-0">{fmtFecha(msg.date)}</p>
                </div>
                <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed border-t border-border/40 pt-4">{cuerpoMsg}</div>
                <Button size="sm" className="mt-4" onClick={abrirResponder}><Reply className="w-3.5 h-3.5 mr-1" /> Responder</Button>
              </div>
            ) : null}
        </div>
      </div>
      )}

      {/* Composer */}
      {componer && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4" onClick={() => !enviando && setComponer(false)}>
          <div className="bg-card w-full sm:max-w-lg sm:rounded-xl rounded-t-2xl border border-border/50 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
              <p className="text-sm font-semibold text-foreground">{componer === 'reply' ? 'Responder' : 'Nuevo correo'}</p>
              <button onClick={() => !enviando && setComponer(false)} className="p-1 rounded hover:bg-muted text-muted-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-3">
              <Input placeholder="Para (correo)" value={form.to} onChange={e => setForm(f => ({ ...f, to: e.target.value }))} />
              <Input placeholder="Asunto" value={form.asunto} onChange={e => setForm(f => ({ ...f, asunto: e.target.value }))} />
              <textarea className="w-full min-h-[160px] rounded-lg border border-border bg-background p-3 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="Escribe tu mensaje..." value={form.cuerpo} onChange={e => setForm(f => ({ ...f, cuerpo: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-border/40">
              <Button variant="outline" size="sm" onClick={() => setComponer(false)} disabled={enviando}>Cancelar</Button>
              <Button size="sm" onClick={enviar} disabled={enviando}><Send className="w-3.5 h-3.5 mr-1" /> {enviando ? 'Enviando...' : 'Enviar'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Tareas pendientes ---------- */
function TareasTab({ misTareas, empresaMap, navigate, qc, toast }) {
  const [actualizando, setActualizando] = useState(null);

  const toggle = async (t) => {
    setActualizando(t.id);
    try {
      await base44.entities.Tarea.update(t.id, { completada: !t.completada });
      qc.invalidateQueries({ queryKey: ['tareas-global'] });
      toast?.({ title: t.completada ? 'Tarea reabierta' : 'Tarea completada' });
    } catch (e) {
      toast?.({ title: 'Error', description: String(e), variant: 'destructive' });
    }
    setActualizando(null);
  };

  const pendientes = misTareas.filter(t => !t.completada).sort((a, b) => (a.fecha_limite || '').localeCompare(b.fecha_limite || ''));
  const hechas = misTareas.filter(t => t.completada);

  const Fila = ({ t }) => {
    const hoy = todayStr();
    const vencida = !t.completada && t.fecha_limite && new Date(t.fecha_limite).toDateString() < hoy;
    return (
      <div className={`flex items-start gap-3 px-4 py-3 border-b border-border/20 ${t.completada ? 'opacity-60' : ''}`}>
        <button onClick={() => toggle(t)} disabled={actualizando === t.id} className="mt-0.5 flex-shrink-0">
          {t.completada
            ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            : <Circle className={`w-5 h-5 ${vencida ? 'text-rose-500' : 'text-muted-foreground'}`} />}
        </button>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium text-foreground ${t.completada ? 'line-through' : ''}`}>{t.titulo}</p>
          {t.descripcion && <p className="text-xs text-muted-foreground line-clamp-2">{t.descripcion}</p>}
          <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px] text-muted-foreground">
            {t.fecha_limite && (
              <span className={`inline-flex items-center gap-1 ${vencida ? 'text-rose-600 font-medium' : ''}`}>
                <Clock className="w-3 h-3" /> {new Date(t.fecha_limite).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}{t.hora ? ` ${t.hora}` : ''}
              </span>
            )}
            {t.prioridad === 'Alta' && <span className="text-rose-600 font-medium">· Alta</span>}
            {t.empresa_id && empresaMap[t.empresa_id] && (
              <button onClick={() => navigate(`/crm/empresas/${t.empresa_id}`)} className="hover:text-primary hover:underline truncate max-w-[160px]">
                · {empresaMap[t.empresa_id].nombre}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-card rounded-xl border border-border/50 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border/40 flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Pendientes ({pendientes.length})</span>
        </div>
        {pendientes.length === 0
          ? <div className="py-10 text-center text-sm text-muted-foreground">No tienes tareas pendientes</div>
          : pendientes.map(t => <Fila key={t.id} t={t} />)}
      </div>

      {hechas.length > 0 && (
        <div className="bg-card rounded-xl border border-border/50 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border/40 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span className="text-sm font-semibold text-foreground">Completadas ({hechas.length})</span>
          </div>
          {hechas.slice(0, 10).map(t => <Fila key={t.id} t={t} />)}
        </div>
      )}
    </div>
  );
}

/* ---------- Firma ---------- */
function FirmaTab({ user, perfil, qc, toast }) {
  const [form, setForm] = useState({ nombre: '', cargo: '', firma_url: '' });
  const [subiendo, setSubiendo] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (user) setForm({ nombre: perfil?.nombre || user.full_name || '', cargo: perfil?.cargo || '', firma_url: perfil?.firma_url || '' });
  }, [perfil, user]);

  async function subirFirma(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubiendo(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm(f => ({ ...f, firma_url: file_url }));
    } catch (err) {
      toast({ title: 'Error al subir la firma', description: err?.message || String(err), variant: 'destructive' });
    }
    setSubiendo(false);
    e.target.value = '';
  }

  async function guardar() {
    if (!user?.email) return;
    try {
      const datos = { email: user.email, nombre: form.nombre, cargo: form.cargo, firma_url: form.firma_url };
      if (perfil?.id) await base44.entities.PerfilUsuario.update(perfil.id, datos);
      else await base44.entities.PerfilUsuario.create({ ...datos, rol: 'Comercial' });
      qc.invalidateQueries({ queryKey: ['perfiles-usuario'] });
      toast({ title: 'Perfil guardado', description: 'Tu firma aparecerá en las cotizaciones que crees.' });
    } catch (err) {
      toast({ title: 'Error al guardar', description: err?.message || String(err), variant: 'destructive' });
    }
  }

  return (
    <div className="bg-card border border-border/50 rounded-xl p-5 space-y-4 max-w-lg">
      <p className="text-sm text-muted-foreground">Tu nombre, cargo y firma se ponen en las cotizaciones que tú creas.</p>
      <div className="space-y-1.5">
        <Label>Nombre completo</Label>
        <Input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Karen Rojas" />
      </div>
      <div className="space-y-1.5">
        <Label>Cargo</Label>
        <Input value={form.cargo} onChange={e => setForm(f => ({ ...f, cargo: e.target.value }))} placeholder="Gerente General" />
      </div>
      <div className="space-y-1.5">
        <Label>Firma (imagen)</Label>
        <p className="text-[11px] text-muted-foreground -mt-1">PNG con fondo transparente o blanco. Se muestra sobre "Cordialmente:".</p>
        <div className="flex items-center gap-3 mt-1">
          {form.firma_url
            ? <img src={form.firma_url} alt="Firma" className="h-16 w-auto object-contain border border-border/40 rounded-lg bg-white p-1" />
            : <div className="h-16 w-40 rounded-lg bg-muted flex items-center justify-center text-xs text-muted-foreground">Sin firma</div>}
          <div className="flex flex-col gap-1.5">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={subirFirma} />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={subiendo}>
              <Upload className="w-3.5 h-3.5 mr-1" /> {subiendo ? 'Subiendo...' : form.firma_url ? 'Cambiar' : 'Subir firma'}
            </Button>
            {form.firma_url && <Button type="button" variant="ghost" size="sm" onClick={() => setForm(f => ({ ...f, firma_url: '' }))}><X className="w-3.5 h-3.5 mr-1" /> Quitar</Button>}
          </div>
        </div>
      </div>
      <Button onClick={guardar}><Save className="w-4 h-4 mr-1" /> Guardar</Button>
    </div>
  );
}