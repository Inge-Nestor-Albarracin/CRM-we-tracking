import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ReunionNota, Empresa, Tarea, base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Plus, NotebookPen, Sparkles, RefreshCw, CloudDownload, ExternalLink, Mail, Trash2, Search, ChevronDown, MoreHorizontal, Video, HardDrive, Copy } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useUserRole } from '@/hooks/useUserRole';
import ReunionNuevaModal from '@/components/reuniones/ReunionNuevaModal';

// Por ahora una reunión es de WeTracking si el título dice "Comité"/"Comite" o "WeTracking".
// (Más adelante se cambiará al filtro por integrantes del equipo.)
function esWeTracking(titulo) {
  const t = (titulo || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return t.includes('comite') || t.includes('wetracking');
}

// Fecha de corte: las reuniones de junio 2026 hacia atrás quedan fuera (no se ven ni se procesan).
const FECHA_CORTE_REUNIONES = '2026-07-01';

// Reuniones EXCLUIDAS por título: nunca se muestran ni se procesan y la sync no las vuelve a crear.
// Aplica a "Comité Comercial", "LINK trabajo remoto", "Gastii" y "AAXA".
// OJO: "Comité W.T." SÍ se conserva -> esas son las del comité de WeTracking.
function esExcluida(titulo) {
  const t = (titulo || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return /comite\s*comercial/.test(t) || /trabajo\s*remoto/.test(t) || /gasti+/.test(t) || t.includes('aaxa');
}

// ¿La reunión debe quedar fuera? -> título excluido O fecha de junio 2026 hacia atrás.
function fueraReunion(r) {
  const f = (r?.fecha_reunion || '').slice(0, 10);
  return esExcluida(r?.titulo) || (!!f && f < FECHA_CORTE_REUNIONES);
}

// Identidad de una reunión (fecha|título normalizado): dos notas con la misma clave son la
// MISMA reunión (llegó por varias cuentas del equipo). Se usa para deduplicar.
function normalizarTitulo(titulo) {
  return (titulo || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/notas?\s+de\s+gemini/g, ' ')
    .replace(/^\s*notas?\s*:?\s*/i, '')
    .replace(/gmt\s*[+-]?\s*\d{1,2}:?\d{2}/g, ' ')
    .replace(/\d{4}[/.-]\d{1,2}[/.-]\d{1,2}/g, ' ')
    .replace(/\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/g, ' ')
    .replace(/\d{1,2}:\d{2}(:\d{2})?/g, ' ')
    .replace(/\d{1,2}\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[a-z]*\.?\s+\d{2,4}/g, ' ')
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function claveReunion(r) {
  return `${(r?.fecha_reunion || '').slice(0, 10)}|${normalizarTitulo(r?.titulo)}`;
}
// Puntaje para elegir la MEJOR nota de un grupo duplicado (se conserva esa, se borran las demás).
function puntajeReunion(r) {
  let p = 0;
  if (r.estado_procesamiento === 'Procesado') p += 1000;
  if (r.doc_id) p += 100;                       // el doc completo (notas + transcripción) manda
  p += (r.action_items?.length || 0) * 10;
  p += Math.min((r.acta_md?.length || 0) / 100, 50);
  return p;
}

const TIPO_STYLE = {
  Comite_Comercial: 'bg-violet-100 text-violet-700',
  Reunion_Cliente: 'bg-blue-100 text-blue-700',
  Otro: 'bg-gray-100 text-gray-600',
};

const TIPO_LABEL = {
  Comite_Comercial: 'Comité Comercial',
  Reunion_Cliente: 'Reunión con cliente',
  Otro: 'Otro',
};

const ESTADO_STYLE = {
  Pendiente: 'bg-gray-100 text-gray-600',
  Procesando: 'bg-amber-100 text-amber-700',
  Procesado: 'bg-green-100 text-green-700',
  Error: 'bg-red-100 text-red-600',
};

export default function Reuniones() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin } = useUserRole();

  const [modalOpen, setModalOpen] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todas');
  const [soloWeTracking, setSoloWeTracking] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [sincronizandoGmail, setSincronizandoGmail] = useState(false);
  const [sincronizandoTeams, setSincronizandoTeams] = useState(false);
  const [sincronizandoOneDrive, setSincronizandoOneDrive] = useState(false);
  const [limpiando, setLimpiando] = useState(false);
  const [procesandoId, setProcesandoId] = useState(null);
  const [reprocesando, setReprocesando] = useState(false);
  const [progreso, setProgreso] = useState({ hechas: 0, total: 0 });
  const [limpiandoTareas, setLimpiandoTareas] = useState(false);
  const [borrandoId, setBorrandoId] = useState(null);
  const [eliminandoTodas, setEliminandoTodas] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  const [deduplicando, setDeduplicando] = useState(false);

  const { data: reuniones = [], isLoading } = useQuery({
    queryKey: ['reuniones'],
    queryFn: () => ReunionNota.list('-fecha_reunion', 500),
    refetchInterval: (query) =>
      (query.state.data || []).some(r => r.estado_procesamiento === 'Procesando') ? 5000 : false,
  });

  // Notas que están ocultas por borrado suave (descartada=true). Sirve para mostrar el botón de restaurar.
  // Las EXCLUIDAS no entran (no se ofrecen para restaurar: son las que no queremos nunca).
  const descartadas = useMemo(() => reuniones.filter(r => r.descartada && !fueraReunion(r)), [reuniones]);

  async function restaurarEliminadas() {
    if (descartadas.length === 0) { toast({ title: 'No hay notas eliminadas para restaurar' }); return; }
    if (!window.confirm(`Se restaurarán ${descartadas.length} nota(s) eliminada(s) a la lista. ¿Continuar?`)) return;
    setRestaurando(true);
    let n = 0;
    for (const r of descartadas) {
      try { await ReunionNota.update(r.id, { descartada: false }); n++; } catch { /* ignore */ }
    }
    qc.invalidateQueries({ queryKey: ['reuniones'] });
    toast({ title: `${n} nota(s) restaurada(s)` });
    setRestaurando(false);
  }

  const { data: empresas = [] } = useQuery({
    queryKey: ['empresas'],
    queryFn: () => Empresa.list(),
  });

  const empresasById = useMemo(() => Object.fromEntries(empresas.map(e => [e.id, e])), [empresas]);

  // Limpieza automática (una sola vez): elimina las reuniones EXCLUIDAS que ya existan.
  // Las de Drive/Gmail se borran en suave (descartada) para que la sync no las recree;
  // las manuales se borran de verdad. Solo un Admin puede borrar.
  const limpiezaExcluidasRef = useRef(false);
  useEffect(() => {
    if (!isAdmin || limpiezaExcluidasRef.current) return;
    const porExcluir = reuniones.filter(r => !r.descartada && fueraReunion(r));
    if (porExcluir.length === 0) return;
    limpiezaExcluidasRef.current = true;
    (async () => {
      let n = 0;
      for (const r of porExcluir) {
        try {
          const tareas = await Tarea.filter({ reunion_nota_id: r.id }).catch(() => []);
          for (const t of tareas) { try { await Tarea.delete(t.id); } catch { /* ignore */ } }
          if (r.doc_id || r.gmail_message_id) await ReunionNota.update(r.id, { descartada: true });
          else await ReunionNota.delete(r.id);
          n++;
        } catch (e) { console.error('No se pudo excluir', r.id, e); }
      }
      const ids = new Set(porExcluir.map(x => x.id));
      qc.setQueryData(['reuniones'], (old = []) => old.filter(x => !ids.has(x.id)));
      qc.invalidateQueries({ queryKey: ['tareas-global'] });
      if (n > 0) toast({ title: `${n} reunión(es) eliminadas`, description: 'Excluidas (Comité Comercial, AAXA, trabajo remoto, Gastii) y las de junio 2026 hacia atrás.' });
    })();
  }, [reuniones, isAdmin]);

  async function procesarNota(reunionId) {
    setProcesandoId(reunionId);
    try {
      await base44.functions.invoke('procesarReunion', { reunion_nota_id: reunionId });
      toast({ title: 'Nota procesada' });
    } catch (err) {
      toast({ title: 'Error al procesar', description: err?.message || String(err), variant: 'destructive' });
    }
    qc.invalidateQueries({ queryKey: ['reuniones'] });
    qc.invalidateQueries({ queryKey: ['tareas-global'] });
    setProcesandoId(null);
  }

  // Reprocesa TODAS las reuniones visibles (una por una para no saturar la IA).
  // Regenera acta_md + action items/tareas con el modelo y el prompt actuales.
  async function reprocesarTodas() {
    const lista = visibles;
    if (lista.length === 0) { toast({ title: 'No hay reuniones para reprocesar' }); return; }
    if (!window.confirm(`Se reprocesarán ${lista.length} reunión(es) con IA (regenera el acta y las tareas de cada una). Puede tardar varios minutos; NO cierres esta pestaña. ¿Continuar?`)) return;
    setReprocesando(true);
    setProgreso({ hechas: 0, total: lista.length });
    let ok = 0, err = 0;
    for (let i = 0; i < lista.length; i++) {
      try {
        await base44.functions.invoke('procesarReunion', { reunion_nota_id: lista[i].id });
        ok++;
      } catch (e) {
        err++;
        console.error('Error reprocesando', lista[i].id, e);
      }
      setProgreso({ hechas: i + 1, total: lista.length });
      qc.invalidateQueries({ queryKey: ['reuniones'] });
    }
    qc.invalidateQueries({ queryKey: ['tareas-global'] });
    toast({ title: 'Reproceso completo', description: `${ok} procesada(s)${err ? ` · ${err} con error` : ''}` });
    setReprocesando(false);
  }

  // Borra TODAS las tareas generadas por reuniones (deja intactas las manuales).
  // Sirve para limpiar el desastre antes de procesar solo unas pocas reuniones.
  async function limpiarTareasDeReuniones() {
    const todas = await Tarea.list().catch(() => []);
    const deReuniones = todas.filter(t => t.reunion_nota_id);
    if (deReuniones.length === 0) { toast({ title: 'No hay tareas de reuniones para borrar' }); return; }
    if (!window.confirm(`Se borrarán ${deReuniones.length} tarea(s) generadas por reuniones. Las tareas creadas a mano NO se tocan. Sirve para dejar limpio y luego procesar solo las reuniones que quieras. ¿Continuar?`)) return;
    setLimpiandoTareas(true);
    let n = 0;
    for (const t of deReuniones) {
      try { await Tarea.delete(t.id); n++; } catch { /* ignore */ }
    }
    qc.invalidateQueries({ queryKey: ['tareas-global'] });
    toast({ title: `${n} tarea(s) de reuniones borradas`, description: 'Ahora procesa solo las reuniones que quieras.' });
    setLimpiandoTareas(false);
  }

  // Elimina una reunión y sus tareas vinculadas.
  async function borrarReunion(r, e) {
    if (e) e.stopPropagation();
    if (!window.confirm(`Se eliminará la reunión "${r.titulo}" y sus tareas. Esta acción no se puede deshacer. ¿Continuar?`)) return;
    setBorrandoId(r.id);
    try {
      const tareas = await Tarea.filter({ reunion_nota_id: r.id }).catch(() => []);
      for (const t of tareas) { try { await Tarea.delete(t.id); } catch { /* ignore */ } }
      // Si vino de Drive/Gmail, borrado SUAVE (descartada) para que la sync NO la vuelva a crear.
      // Si es manual (sin doc_id/gmail), borrado normal.
      if (r.doc_id || r.gmail_message_id) await ReunionNota.update(r.id, { descartada: true });
      else await ReunionNota.delete(r.id);
      // Actualización OPTIMISTA: quitarla del cache local de una (sin esperar al refetch,
      // que por consistencia eventual de Base44 a veces trae el dato viejo).
      qc.setQueryData(['reuniones'], (old = []) => old.filter(x => x.id !== r.id));
      toast({ title: 'Reunión eliminada' });
    } catch (err) {
      toast({ title: 'No se pudo eliminar', description: err?.message || String(err), variant: 'destructive' });
    }
    // NO invalidamos ['reuniones'] aquí: el update optimista ya la quitó, y un refetch
    // inmediato podría traer el dato viejo (consistencia eventual) y hacerla reaparecer.
    qc.invalidateQueries({ queryKey: ['tareas-global'] });
    setBorrandoId(null);
  }

  // Elimina TODAS las reuniones visibles (respeta el filtro actual). Sincronizadas -> soft-delete.
  async function eliminarTodas() {
    const lista = visibles;
    if (lista.length === 0) { toast({ title: 'No hay reuniones para eliminar' }); return; }
    if (!window.confirm(`Se eliminarán las ${lista.length} reunión(es) que estás viendo y sus tareas. Las que vienen de Drive/Gmail no volverán a aparecer. Esta acción no se puede deshacer. ¿Continuar?`)) return;
    setEliminandoTodas(true);
    let n = 0;
    for (const r of lista) {
      try {
        const tareas = await Tarea.filter({ reunion_nota_id: r.id }).catch(() => []);
        for (const t of tareas) { try { await Tarea.delete(t.id); } catch { /* ignore */ } }
        if (r.doc_id || r.gmail_message_id) await ReunionNota.update(r.id, { descartada: true });
        else await ReunionNota.delete(r.id);
        n++;
      } catch (e) { console.error('No se pudo eliminar', r.id, e); }
    }
    const ids = new Set(lista.map(x => x.id));
    qc.setQueryData(['reuniones'], (old = []) => old.filter(x => !ids.has(x.id)));
    qc.invalidateQueries({ queryKey: ['tareas-global'] });
    toast({ title: `${n} reunión(es) eliminada(s)` });
    setEliminandoTodas(false);
  }

  // Deduplica: deja SOLO una nota por reunión (borra las duplicadas y sus tareas).
  // Sirve para limpiar los comités que se importaron 5 veces (una por participante del equipo).
  async function deduplicarReuniones() {
    if (duplicadas.length === 0) { toast({ title: 'No hay reuniones duplicadas' }); return; }
    if (!window.confirm(`Se encontraron ${duplicadas.length} nota(s) duplicada(s): la misma reunión llegó por varias cuentas del equipo. Se dejará UNA sola por reunión (la más completa) y se borrarán las otras con sus tareas. ¿Continuar?`)) return;
    setDeduplicando(true);
    let n = 0;
    for (const r of duplicadas) {
      try {
        const tareas = await Tarea.filter({ reunion_nota_id: r.id }).catch(() => []);
        for (const t of tareas) { try { await Tarea.delete(t.id); } catch { /* ignore */ } }
        if (r.doc_id || r.gmail_message_id) await ReunionNota.update(r.id, { descartada: true });
        else await ReunionNota.delete(r.id);
        n++;
      } catch (e) { console.error('No se pudo deduplicar', r.id, e); }
    }
    const ids = new Set(duplicadas.map(x => x.id));
    qc.setQueryData(['reuniones'], (old = []) => old.filter(x => !ids.has(x.id)));
    qc.invalidateQueries({ queryKey: ['tareas-global'] });
    toast({ title: `${n} duplicada(s) eliminada(s)`, description: 'Quedó una sola nota por reunión.' });
    setDeduplicando(false);
  }

  // Encadena procesarNotaReunion por cada nota recién creada (evita timeouts fn->fn)
  async function procesarCreadas(creadas) {
    for (const id of creadas) {
      try {
        await base44.functions.invoke('procesarReunion', { reunion_nota_id: id });
      } catch (err) {
        console.error('Error procesando', id, err);
      }
      qc.invalidateQueries({ queryKey: ['reuniones'] });
    }
    qc.invalidateQueries({ queryKey: ['tareas-global'] });
  }

  // personal=true -> lee el Gmail DE QUIEN ESTÁ LOGUEADO (cada quien sus reuniones);
  // vive en gmailKarenBandeja porque es la función del conector de Gmail por usuario.
  // personal=false -> cuenta central compartida.
  async function sincronizarGmail(personal = false) {
    setSincronizandoGmail(true);
    try {
      const res = personal
        ? await base44.functions.invoke('gmailKarenBandeja', { sincronizar_notas: true })
        : await base44.functions.invoke('syncMeetingNotesGmail', {});
      const data = res?.data ?? res;
      if (data?.connected === false) {
        toast({
          title: personal ? 'Tu Gmail no está conectado' : 'Gmail no conectado',
          description: data?.message || 'Conecta tu cuenta en Configuración → Integraciones.',
          variant: 'destructive',
        });
        setSincronizandoGmail(false);
        return;
      }
      const creadas = data?.creadas || [];
      const omitidas = data?.omitidas ?? 0;
      // El backend devuelve modo: "personal:<correo>" -> sirve para SABER qué buzón leyó
      // (la conexión por usuario puede apuntar a una cuenta distinta a la del login).
      const cuenta = String(data?.modo || '').split(':')[1] || '';
      const deQuien = cuenta ? ` · ${cuenta}` : '';
      qc.invalidateQueries({ queryKey: ['reuniones'] });
      if (creadas.length === 0) {
        toast({ title: 'Sin notas nuevas en Gmail', description: `${omitidas} ya sincronizadas${deQuien}` });
      } else {
        toast({ title: `${creadas.length} nota(s) nuevas de Gmail`, description: `Procesando con IA...${deQuien}` });
        await procesarCreadas(creadas);
        toast({ title: 'Sincronización de Gmail completa' });
      }
    } catch (err) {
      toast({
        title: 'Error al sincronizar Gmail',
        description: err?.message || 'Verifica que tu Gmail esté conectado en Configuración → Integraciones',
        variant: 'destructive',
      });
    }
    setSincronizandoGmail(false);
  }

  async function sincronizarTeams() {
    setSincronizandoTeams(true);
    try {
      const res = await base44.functions.invoke('syncMeetingNotesTeams', {});
      const data = res?.data ?? res;
      if (data?.connected === false) {
        toast({
          title: 'Teams no conectado',
          description: data?.message || 'Conecta tu cuenta en Configuración → Integraciones.',
          variant: 'destructive',
        });
        setSincronizandoTeams(false);
        return;
      }
      const creadas = data?.creadas || [];
      const omitidas = data?.omitidas ?? 0;
      qc.invalidateQueries({ queryKey: ['reuniones'] });
      if (creadas.length === 0) {
        toast({ title: 'Sin notas nuevas en Teams', description: `${omitidas} ya sincronizadas` });
      } else {
        toast({ title: `${creadas.length} nota(s) nuevas de Teams`, description: 'Procesando con IA...' });
        await procesarCreadas(creadas);
        toast({ title: 'Sincronización de Teams completa' });
      }
    } catch (err) {
      toast({
        title: 'Error al sincronizar Teams',
        description: err?.message || 'Verifica que tu Teams esté conectado en Configuración → Integraciones',
        variant: 'destructive',
      });
    }
    setSincronizandoTeams(false);
  }

  async function sincronizarOneDrive() {
    setSincronizandoOneDrive(true);
    try {
      const res = await base44.functions.invoke('syncMeetingNotesOneDrive', {});
      const data = res?.data ?? res;
      if (data?.connected === false) {
        toast({
          title: 'OneDrive no conectado',
          description: data?.message || 'Conecta tu cuenta en Configuración → Integraciones.',
          variant: 'destructive',
        });
        setSincronizandoOneDrive(false);
        return;
      }
      const creadas = data?.creadas || [];
      const omitidas = data?.omitidas ?? 0;
      qc.invalidateQueries({ queryKey: ['reuniones'] });
      if (creadas.length === 0) {
        toast({ title: 'Sin notas nuevas en OneDrive', description: `${omitidas} ya sincronizadas` });
      } else {
        toast({ title: `${creadas.length} nota(s) nuevas de OneDrive`, description: 'Procesando con IA...' });
        await procesarCreadas(creadas);
        toast({ title: 'Sincronización de OneDrive completa' });
      }
    } catch (err) {
      toast({
        title: 'Error al sincronizar OneDrive',
        description: err?.message || 'Verifica que tu OneDrive esté conectado en Configuración → Integraciones',
        variant: 'destructive',
      });
    }
    setSincronizandoOneDrive(false);
  }

  async function sincronizarDrive() {
    setSincronizando(true);
    try {
      const res = await base44.functions.invoke('syncMeetingNotesDrive', {});
      const data = res?.data ?? res;
      const creadas = data?.creadas || [];
      const omitidas = data?.omitidas ?? 0;
      qc.invalidateQueries({ queryKey: ['reuniones'] });
      if (creadas.length === 0) {
        toast({ title: 'Sin notas nuevas en Drive', description: `${omitidas} ya sincronizadas` });
      } else {
        toast({ title: `${creadas.length} nota(s) nuevas de Drive`, description: 'Procesando con IA...' });
        await procesarCreadas(creadas);
        toast({ title: 'Sincronización completa' });
      }
    } catch (err) {
      toast({
        title: 'Error al sincronizar Drive',
        description: err?.message || 'Verifica que el conector de Google Drive esté configurado en Base44',
        variant: 'destructive',
      });
    }
    setSincronizando(false);
  }

  // Barrido: elimina las notas que NO son de WeTracking (y sus tareas vinculadas)
  const noWeTracking = useMemo(() => reuniones.filter(r => !r.descartada && !fueraReunion(r) && !esWeTracking(r.titulo)), [reuniones]);

  // Reuniones con un prospecto nuevo detectado esperando confirmación.
  const porConfirmar = useMemo(() => reuniones.filter(r => !r.descartada && !fueraReunion(r) && r.sugerencia_estado === 'pendiente'), [reuniones]);

  // Notas DUPLICADAS: la misma reunión llegó por varias cuentas del equipo (mismo día + título).
  // Se agrupan por identidad y se marca como duplicada todo menos la nota más completa de cada grupo.
  const duplicadas = useMemo(() => {
    const grupos = new Map();
    for (const r of reuniones) {
      if (r.descartada || fueraReunion(r) || !normalizarTitulo(r.titulo)) continue;
      const k = claveReunion(r);
      const arr = grupos.get(k) || [];
      arr.push(r); grupos.set(k, arr);
    }
    const extra = [];
    for (const arr of grupos.values()) {
      if (arr.length < 2) continue;
      arr.sort((a, b) => puntajeReunion(b) - puntajeReunion(a));
      extra.push(...arr.slice(1)); // se conserva la mejor (índice 0); el resto son duplicadas
    }
    return extra;
  }, [reuniones]);

  async function limpiarNoWeTracking() {
    if (noWeTracking.length === 0) { toast({ title: 'No hay reuniones para limpiar' }); return; }
    if (!window.confirm(`Se eliminarán ${noWeTracking.length} reunión(es) que NO son de WeTracking (y sus tareas). Esta acción no se puede deshacer. ¿Continuar?`)) return;
    setLimpiando(true);
    let borradas = 0;
    for (const r of noWeTracking) {
      try {
        const tareas = await Tarea.filter({ reunion_nota_id: r.id }).catch(() => []);
        for (const t of tareas) { try { await Tarea.delete(t.id); } catch { /* ignore */ } }
        if (r.doc_id || r.gmail_message_id) await ReunionNota.update(r.id, { descartada: true });
        else await ReunionNota.delete(r.id);
        borradas++;
      } catch (err) {
        console.error('No se pudo borrar la reunión', r.id, err);
      }
    }
    // Optimista: quitar del cache las que intentamos borrar (evita reaparición por consistencia eventual).
    const idsBorradas = new Set(noWeTracking.map(n => n.id));
    qc.setQueryData(['reuniones'], (old = []) => old.filter(x => !idsBorradas.has(x.id)));
    qc.invalidateQueries({ queryKey: ['tareas-global'] });
    toast({ title: `${borradas} reunión(es) eliminada(s)`, description: 'Quedaron solo las de WeTracking' });
    setLimpiando(false);
  }

  const q = busqueda.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const visibles = reuniones.filter(r => {
    if (r.descartada) return false; // borradas (soft-delete): ocultas y no se re-crean en la sync
    if (fueraReunion(r)) return false; // excluidas por título (Comité Comercial/AAXA/…) o de junio 2026 hacia atrás
    if (filtroTipo !== 'todas' && r.tipo !== filtroTipo) return false;
    if (soloWeTracking && !esWeTracking(r.titulo)) return false;
    if (q) {
      const heno = [r.titulo, r.resumen, r.extracto, empresasById[r.empresa_id]?.nombre]
        .filter(Boolean).join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (!heno.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-5">
      {/* Encabezado + acciones principales */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Reuniones</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Notas de reuniones y Comités de WeTracking procesadas con IA
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Sincronizar (Drive / Gmail) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9" disabled={sincronizando || sincronizandoGmail || sincronizandoTeams || sincronizandoOneDrive}>
                <CloudDownload className={`w-4 h-4 mr-1.5 ${(sincronizando || sincronizandoGmail || sincronizandoTeams || sincronizandoOneDrive) ? 'animate-pulse' : ''}`} />
                {(sincronizando || sincronizandoGmail || sincronizandoTeams || sincronizandoOneDrive) ? 'Sincronizando...' : 'Sincronizar'}
                <ChevronDown className="w-3.5 h-3.5 ml-1 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={sincronizarDrive} disabled={sincronizando}>
                <CloudDownload className="w-4 h-4 mr-2" /> Desde Google Drive
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => sincronizarGmail(true)} disabled={sincronizandoGmail}>
                <Mail className="w-4 h-4 mr-2" /> Desde MI correo
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => sincronizarGmail(false)} disabled={sincronizandoGmail}>
                <Mail className="w-4 h-4 mr-2" /> Desde Gmail (cuenta central)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={sincronizarTeams} disabled={sincronizandoTeams}>
                <Video className="w-4 h-4 mr-2" /> Desde Microsoft Teams
              </DropdownMenuItem>
              <DropdownMenuItem onClick={sincronizarOneDrive} disabled={sincronizandoOneDrive}>
                <HardDrive className="w-4 h-4 mr-2" /> Desde OneDrive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Más acciones (reprocesar / limpiezas / restaurar) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 px-2.5" title="Más acciones">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Acciones</DropdownMenuLabel>
              {visibles.length > 0 && (
                <DropdownMenuItem onClick={reprocesarTodas} disabled={reprocesando}>
                  <Sparkles className="w-4 h-4 mr-2" />
                  {reprocesando ? `Reprocesando ${progreso.hechas}/${progreso.total}...` : `Reprocesar todas (${visibles.length})`}
                </DropdownMenuItem>
              )}
              {duplicadas.length > 0 && (
                <DropdownMenuItem onClick={deduplicarReuniones} disabled={deduplicando}>
                  <Copy className="w-4 h-4 mr-2" /> Deduplicar {duplicadas.length} repetida(s)
                </DropdownMenuItem>
              )}
              {descartadas.length > 0 && (
                <DropdownMenuItem onClick={restaurarEliminadas} disabled={restaurando} className="text-amber-600 focus:text-amber-700">
                  <RefreshCw className="w-4 h-4 mr-2" /> Restaurar {descartadas.length} eliminada(s)
                </DropdownMenuItem>
              )}
              {isAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={limpiarTareasDeReuniones} disabled={limpiandoTareas}>
                    <Trash2 className="w-4 h-4 mr-2" /> Limpiar tareas de reuniones
                  </DropdownMenuItem>
                  {noWeTracking.length > 0 && (
                    <DropdownMenuItem onClick={limpiarNoWeTracking} disabled={limpiando} className="text-destructive focus:text-destructive">
                      <Trash2 className="w-4 h-4 mr-2" /> Limpiar {noWeTracking.length} que no son de WeTracking
                    </DropdownMenuItem>
                  )}
                  {visibles.length > 0 && (
                    <DropdownMenuItem onClick={eliminarTodas} disabled={eliminandoTodas} className="text-destructive focus:text-destructive">
                      <Trash2 className="w-4 h-4 mr-2" /> Eliminar todas ({visibles.length})
                    </DropdownMenuItem>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button size="sm" className="h-9" onClick={() => setModalOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Nueva nota
          </Button>
        </div>
      </div>

      {/* Barra de filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por título, empresa o contenido…"
            className="pl-9 h-9"
          />
        </div>
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todos los tipos</SelectItem>
            <SelectItem value="Comite_Comercial">Comité Comercial</SelectItem>
            <SelectItem value="Reunion_Cliente">Reunión con cliente</SelectItem>
            <SelectItem value="Otro">Otro</SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant={soloWeTracking ? 'default' : 'outline'}
          className="h-9"
          onClick={() => setSoloWeTracking(v => !v)}
          title="Mostrar solo reuniones cuyo título diga Comité o WeTracking"
        >
          {soloWeTracking ? 'Solo WeTracking' : 'Todas'}
        </Button>
        <span className="text-xs text-muted-foreground whitespace-nowrap ml-auto">
          {visibles.length} reunión{visibles.length !== 1 ? 'es' : ''}
        </span>
      </div>

      {/* Estado de operaciones largas en curso */}
      {(reprocesando || eliminandoTodas || limpiando || limpiandoTareas || restaurando || deduplicando) && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          {reprocesando ? `Reprocesando ${progreso.hechas}/${progreso.total}…`
            : eliminandoTodas ? 'Eliminando reuniones…'
            : limpiando ? 'Limpiando reuniones…'
            : limpiandoTareas ? 'Limpiando tareas…'
            : deduplicando ? 'Deduplicando reuniones…'
            : 'Restaurando…'}
        </div>
      )}

      {porConfirmar.length > 0 && (
        <button
          onClick={() => navigate(`/crm/reuniones/${porConfirmar[0].id}`)}
          className="w-full flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm text-left hover:bg-primary/10 transition-colors"
        >
          <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="flex-1">
            <span className="font-medium">{porConfirmar.length} reunión{porConfirmar.length !== 1 ? 'es' : ''}</span> con prospectos nuevos por confirmar (crear empresa, contacto y oportunidad).
          </span>
          <ChevronDown className="w-4 h-4 -rotate-90 text-muted-foreground flex-shrink-0" />
        </button>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando...</div>
      ) : visibles.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <NotebookPen className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm mb-1">No hay notas de reuniones todavía</p>
          <p className="text-xs">Pega las notas de tu próxima reunión o sincroniza desde Google Drive, Gmail o Teams</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibles.map(r => {
            const empresa = empresasById[r.empresa_id];
            const tareas = (r.action_items || []).length;
            return (
              <div
                key={r.id}
                className="bg-card border border-border/40 rounded-xl p-4 hover:shadow-sm transition-all cursor-pointer"
                onClick={() => navigate(`/crm/reuniones/${r.id}`)}
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <NotebookPen className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{r.titulo}</span>
                      {r.sugerencia_estado === 'pendiente' && (
                        <Badge className="text-[10px] border-transparent bg-primary/15 text-primary">
                          <Sparkles className="w-2.5 h-2.5 mr-0.5" /> Prospecto nuevo
                        </Badge>
                      )}
                      {r.tipo && (
                        <Badge className={`text-[10px] border-transparent ${TIPO_STYLE[r.tipo] || ''}`}>
                          {TIPO_LABEL[r.tipo] || r.tipo}
                        </Badge>
                      )}
                      <Badge className={`text-[10px] border-transparent ${ESTADO_STYLE[r.estado_procesamiento] || ''}`}>
                        {r.estado_procesamiento === 'Procesado' && <Sparkles className="w-2.5 h-2.5 mr-0.5" />}
                        {r.estado_procesamiento}
                      </Badge>
                      {r.origen === 'Google_Drive' && (
                        <Badge variant="outline" className="text-[10px]">Drive</Badge>
                      )}
                      {r.origen === 'Gmail' && (
                        <Badge variant="outline" className="text-[10px]">Gmail</Badge>
                      )}
                      {r.origen === 'Microsoft_Teams' && (
                        <Badge variant="outline" className="text-[10px]">Teams</Badge>
                      )}
                      {r.origen === 'OneDrive' && (
                        <Badge variant="outline" className="text-[10px]">OneDrive</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {r.resumen || r.extracto || 'Sin contenido procesado'}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                      {r.fecha_reunion && (
                        <span>{new Date(r.fecha_reunion + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      )}
                      {empresa && <span className="text-primary font-medium">{empresa.nombre}</span>}
                      {tareas > 0 && <span>{tareas} action item{tareas !== 1 ? 's' : ''}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    {(r.estado_procesamiento === 'Pendiente' || r.estado_procesamiento === 'Error') && (
                      <Button
                        variant="outline" size="sm" className="h-8 text-xs"
                        disabled={procesandoId === r.id}
                        onClick={() => procesarNota(r.id)}
                      >
                        <RefreshCw className={`w-3.5 h-3.5 mr-1 ${procesandoId === r.id ? 'animate-spin' : ''}`} />
                        {procesandoId === r.id ? 'Procesando...' : 'Procesar'}
                      </Button>
                    )}
                    {r.doc_url && (
                      <a href={r.doc_url} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="sm" className="h-8 text-xs" title="Abrir doc en Drive">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Button>
                      </a>
                    )}
                    {isAdmin && (
                    <Button
                      variant="ghost" size="sm"
                      className="h-8 text-xs text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10"
                      title="Eliminar reunión"
                      disabled={borrandoId === r.id}
                      onClick={(e) => borrarReunion(r, e)}
                    >
                      <Trash2 className={`w-3.5 h-3.5 ${borrandoId === r.id ? 'animate-pulse' : ''}`} />
                    </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ReunionNuevaModal open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  );
}