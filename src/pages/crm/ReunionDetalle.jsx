import { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ReunionNota, Empresa, Contacto, Tarea, base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import {
  ArrowLeft, NotebookPen, Sparkles, RefreshCw, ExternalLink, AlertCircle,
  CheckCircle2, Circle, FileText, Building2, Users, Copy, ClipboardCheck, FileDown, Radar, UserPlus,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { APP_URL } from '@/lib/wetracking';
import remarkGfm from 'remark-gfm';
import SelectorEmpresa from '@/components/crm/SelectorEmpresa';

const TIPO_LABEL = {
  Comite_Comercial: 'Comité Comercial',
  Reunion_Cliente: 'Reunión con cliente',
  Otro: 'Otro',
};

export default function ReunionDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [contenidoCompleto, setContenidoCompleto] = useState(null);
  const [cargandoContenido, setCargandoContenido] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [investigando, setInvestigando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  async function investigarTags() {
    setInvestigando(true);
    try {
      const res = await base44.functions.invoke('investigarTags', { reunion_nota_id: id });
      const d = res?.data || res || {};
      if (d.research_tags_md) {
        qc.invalidateQueries({ queryKey: ['reunion', id] });
        toast({ title: 'Research de tags listo', description: 'Investigado con Gemini 2.5 Pro' });
      } else {
        toast({ title: 'No se pudo investigar', description: d.message || 'Sin resultado', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: 'Error en el research', description: err?.message || String(err), variant: 'destructive' });
    }
    setInvestigando(false);
  }

  async function copiarActa(texto) {
    try {
      await navigator.clipboard.writeText(texto || '');
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast({ title: 'No se pudo copiar', variant: 'destructive' });
    }
  }

  const { data: nota, isLoading } = useQuery({
    queryKey: ['reunion', id],
    queryFn: () => ReunionNota.get(id),
    refetchInterval: (query) => query.state.data?.estado_procesamiento === 'Procesando' ? 4000 : false,
  });

  const { data: empresas = [] } = useQuery({ queryKey: ['empresas'], queryFn: () => Empresa.list() });
  const { data: contactos = [] } = useQuery({ queryKey: ['contactos'], queryFn: () => Contacto.list() });

  const { data: tareasVinculadas = [] } = useQuery({
    queryKey: ['tareas_reunion', id],
    queryFn: () => Tarea.filter({ reunion_nota_id: id }, '-fecha_limite'),
    enabled: !!id,
  });

  const empresasById = useMemo(() => Object.fromEntries(empresas.map(e => [e.id, e])), [empresas]);
  const contactosById = useMemo(() => Object.fromEntries(contactos.map(c => [c.id, c])), [contactos]);
  const tareasById = useMemo(() => Object.fromEntries(tareasVinculadas.map(t => [t.id, t])), [tareasVinculadas]);

  // Prospecto(s) nuevo(s) sugerido(s) por la IA (empresas/contactos que no están en el CRM).
  // Soporta multi-empresa (sugerencia.empresas[]) y el formato viejo de una sola.
  const sugerencia = useMemo(() => {
    if (nota?.sugerencia_estado !== 'pendiente') return null;
    let s; try { s = JSON.parse(nota.sugerencia_json || '{}'); } catch { return null; }
    const empresas = (Array.isArray(s.empresas) && s.empresas.length)
      ? s.empresas
      : (s.empresa_nombre ? [{ empresa_nombre: s.empresa_nombre, dominio: s.dominio, contactos: s.contactos }] : []);
    return empresas.length ? { empresas } : null;
  }, [nota?.sugerencia_estado, nota?.sugerencia_json]);

  const actualizarNota = useMutation({
    mutationFn: (data) => ReunionNota.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reunion', id] }),
    onError: (err) => toast({ title: 'Error al guardar', description: err?.message || String(err), variant: 'destructive' }),
  });

  const toggleTarea = useMutation({
    mutationFn: (t) => Tarea.update(t.id, { completada: !t.completada }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tareas_reunion', id] }),
  });

  async function reprocesar() {
    setProcesando(true);
    try {
      const res = await base44.functions.invoke('procesarReunion', { reunion_nota_id: id });
      const d = res?.data || res || {};
      const motor = d.fuente_ia === 'base44' ? 'créditos Base44' : d.fuente_ia === 'anthropic' ? 'API Anthropic (Opus 4.8)' : 'IA';
      toast({
        title: 'Nota reprocesada',
        description: `Procesada con ${motor}. ${d.acta_generada ? 'Acta generada.' : 'Sin acta.'} ${d.tareas_creadas ?? 0} tareas.`,
      });
    } catch (err) {
      toast({ title: 'Error al procesar', description: err?.message || String(err), variant: 'destructive' });
    }
    qc.invalidateQueries({ queryKey: ['reunion', id] });
    qc.invalidateQueries({ queryKey: ['tareas_reunion', id] });
    setProcesando(false);
  }

  async function confirmarProspecto() {
    setConfirmando(true);
    try {
      const res = await base44.functions.invoke('confirmarProspectoReunion', { reunion_nota_id: id });
      const d = res?.data || res || {};
      if (d.ok) {
        toast({ title: 'Prospecto creado y vinculado', description: 'Empresa, contacto y oportunidad creados. La reunión y sus tareas quedaron enlazadas.' });
        qc.invalidateQueries({ queryKey: ['reunion', id] });
        qc.invalidateQueries({ queryKey: ['tareas_reunion', id] });
        qc.invalidateQueries({ queryKey: ['empresas'] });
        qc.invalidateQueries({ queryKey: ['contactos'] });
        qc.invalidateQueries({ queryKey: ['reuniones_por_confirmar'] });
      } else {
        toast({ title: 'No se pudo crear el prospecto', description: d.message || 'Error', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: 'Error al crear el prospecto', description: err?.message || String(err), variant: 'destructive' });
    }
    setConfirmando(false);
  }

  async function verContenido() {
    if (contenidoCompleto !== null) { setContenidoCompleto(null); return; }
    setCargandoContenido(true);
    try {
      const res = await base44.functions.invoke('getReunionContenido', { id });
      setContenidoCompleto(res?.texto || res?.data?.texto || 'Sin contenido');
    } catch (err) {
      toast({ title: 'No se pudo cargar el contenido', description: err?.message || String(err), variant: 'destructive' });
    }
    setCargandoContenido(false);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!nota) {
    return (
      <div className="p-8 text-center text-gray-500">
        <AlertCircle className="w-12 h-12 mx-auto mb-2 opacity-30" />
        <p>Nota de reunión no encontrada</p>
        <Button variant="link" onClick={() => navigate('/crm/reuniones')}>Volver</Button>
      </div>
    );
  }

  const empresa = empresasById[nota.empresa_id];

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/crm/reuniones')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-foreground">{nota.titulo}</h1>
            {nota.tipo && <Badge variant="outline" className="text-[11px]">{TIPO_LABEL[nota.tipo] || nota.tipo}</Badge>}
            <Badge className={`text-[11px] border-transparent ${
              nota.estado_procesamiento === 'Procesado' ? 'bg-green-100 text-green-700' :
              nota.estado_procesamiento === 'Error' ? 'bg-red-100 text-red-600' :
              nota.estado_procesamiento === 'Procesando' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
            }`}>{nota.estado_procesamiento}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {nota.fecha_reunion && new Date(nota.fecha_reunion + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {nota.origen === 'Google_Drive' && ' · Sincronizada de Drive'}
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {nota.doc_url && (
            <a href={nota.doc_url} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" className="gap-1 text-xs">
                <ExternalLink className="w-3 h-3" /> Ver doc
              </Button>
            </a>
          )}
          <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={reprocesar} disabled={procesando || nota.estado_procesamiento === 'Procesando'}>
            <RefreshCw className={`w-3 h-3 ${procesando ? 'animate-spin' : ''}`} />
            {procesando ? 'Procesando...' : 'Reprocesar IA'}
          </Button>
          <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={investigarTags} disabled={investigando}>
            <Radar className={`w-3 h-3 ${investigando ? 'animate-pulse' : ''}`} />
            {investigando ? 'Investigando...' : 'Investigar tags (Gemini)'}
          </Button>
        </div>
      </div>

      {nota.estado_procesamiento === 'Error' && nota.error_procesamiento && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-700 dark:text-red-400">
          <strong>Error de procesamiento:</strong> {nota.error_procesamiento}
        </div>
      )}

      {/* Prospecto nuevo detectado: NOVA pide confirmación antes de crear en el CRM */}
      {sugerencia && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              {sugerencia.empresas.length > 1 ? `${sugerencia.empresas.length} prospectos nuevos detectados` : 'Prospecto nuevo detectado'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Por los correos de los asistentes se {sugerencia.empresas.length > 1 ? 'detectaron estas empresas que no están' : 'detectó esta empresa que no está'} en el CRM. ¿Creo {sugerencia.empresas.length > 1 ? 'las empresas, sus contactos' : 'la empresa, el contacto'} y una oportunidad por empresa, y enlazo la reunión y sus tareas?
            </p>
            <div className="space-y-2.5">
              {sugerencia.empresas.map((emp, i) => (
                <div key={i} className="rounded-xl border border-border/60 bg-card/60 p-3 space-y-1.5">
                  <div className="flex items-center gap-2 text-sm flex-wrap">
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium">{emp.empresa_nombre}</span>
                    {emp.dominio && <Badge variant="outline" className="text-[10px]">{emp.dominio}</Badge>}
                    <Badge className="text-[10px] border-transparent bg-primary/15 text-primary">Empresa nueva</Badge>
                  </div>
                  {(emp.contactos || []).map((c, j) => (
                    <div key={j} className="flex items-center gap-2 pl-6 text-sm">
                      <Users className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>{c.nombre}</span>
                      {c.email && <span className="text-xs text-muted-foreground">· {c.email}</span>}
                    </div>
                  ))}
                  <div className="flex items-center gap-2 pl-6 text-xs text-muted-foreground">
                    <Sparkles className="w-3.5 h-3.5" /> + Oportunidad en el pipeline (Visita inicial)
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" onClick={confirmarProspecto} disabled={confirmando}>
                <UserPlus className={`w-4 h-4 mr-1.5 ${confirmando ? 'animate-pulse' : ''}`} />
                {confirmando ? 'Creando...' : 'Crear todo y vincular'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => actualizarNota.mutate({ sugerencia_estado: 'ignorada' })} disabled={confirmando}>
                Ignorar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resumen IA */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-500" /> Resumen ejecutivo
          </CardTitle>
        </CardHeader>
        <CardContent>
          {nota.resumen
            ? <p className="text-sm whitespace-pre-wrap">{nota.resumen}</p>
            : <p className="text-sm text-muted-foreground">Aún no procesado. {nota.estado_procesamiento === 'Procesando' ? 'La IA está trabajando...' : 'Usa "Reprocesar IA".'}</p>}
        </CardContent>
      </Card>

      {/* Acta formal de la reunión */}
      {nota.acta_md && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" /> Acta de la reunión
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => window.open(`${APP_URL}/crm/reuniones/${id}/acta?print=1`, '_blank')}>
                  <FileDown className="w-3.5 h-3.5" /> Descargar PDF
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => copiarActa(nota.acta_md)}>
                  {copiado ? <><ClipboardCheck className="w-3.5 h-3.5" /> Copiada</> : <><Copy className="w-3.5 h-3.5" /> Copiar</>}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-sm leading-relaxed [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-1 [&_h2]:mb-2 [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_p]:my-1.5 [&_ol]:my-1.5 [&_ol]:pl-5 [&_ol]:list-decimal [&_ul]:my-1.5 [&_ul]:pl-5 [&_ul]:list-disc [&_li]:my-0.5 [&_strong]:font-semibold [&_table]:w-full [&_table]:my-2 [&_table]:text-xs [&_table]:border-collapse [&_th]:border [&_th]:border-border/60 [&_th]:px-2 [&_th]:py-1 [&_th]:bg-muted/50 [&_th]:text-left [&_td]:border [&_td]:border-border/60 [&_td]:px-2 [&_td]:py-1 overflow-x-auto">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{nota.acta_md}</ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Research de tags (Gemini 2.5 Pro) */}
      {nota.research_tags_md && (
        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Radar className="w-4 h-4 text-primary" /> Research de tags recomendados
                <span className="text-[10px] font-normal text-muted-foreground bg-muted rounded-full px-2 py-0.5">Gemini 2.5 Pro</span>
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => copiarActa(nota.research_tags_md)}>
                  <Copy className="w-3.5 h-3.5" /> Copiar
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={investigarTags} disabled={investigando}>
                  <RefreshCw className={`w-3.5 h-3.5 ${investigando ? 'animate-spin' : ''}`} /> Rehacer
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-sm leading-relaxed [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-1 [&_h2]:mb-2 [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_p]:my-1.5 [&_ol]:my-1.5 [&_ol]:pl-5 [&_ol]:list-decimal [&_ul]:my-1.5 [&_ul]:pl-5 [&_ul]:list-disc [&_li]:my-0.5 [&_strong]:font-semibold [&_a]:text-primary [&_a]:underline [&_table]:w-full [&_table]:my-2 [&_table]:text-xs [&_table]:border-collapse [&_th]:border [&_th]:border-border/60 [&_th]:px-2 [&_th]:py-1 [&_th]:bg-muted/50 [&_th]:text-left [&_td]:border [&_td]:border-border/60 [&_td]:px-2 [&_td]:py-1 overflow-x-auto">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{nota.research_tags_md}</ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Decisiones */}
      {(nota.decisiones || []).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Decisiones tomadas</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {nota.decisiones.map((d, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                  {d}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Action items */}
      {(nota.action_items || []).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Action items ({nota.action_items.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {nota.action_items.map((item, i) => {
              const tarea = item.tarea_id ? tareasById[item.tarea_id] : null;
              return (
                <div key={i} className="flex items-start gap-3 p-2.5 border rounded-lg">
                  <button
                    className="flex-shrink-0 mt-0.5"
                    disabled={!tarea}
                    onClick={() => tarea && toggleTarea.mutate(tarea)}
                  >
                    {tarea?.completada
                      ? <CheckCircle2 className="w-4.5 h-4.5 text-green-500" />
                      : <Circle className={`w-4.5 h-4.5 ${tarea ? 'text-muted-foreground/40 hover:text-primary' : 'text-muted-foreground/20'}`} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${tarea?.completada ? 'line-through text-muted-foreground' : 'font-medium'}`}>{item.descripcion}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                      {item.responsable && <span>→ {item.responsable}</span>}
                      {item.fecha_limite && <span>Vence: {item.fecha_limite}</span>}
                      {item.tarea_id
                        ? <Link to="/crm/tareas" className="text-primary hover:underline">Ver en Tareas</Link>
                        : <span className="text-amber-600">Sin tarea creada</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Vínculos CRM */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-4 h-4" /> Empresa vinculada
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <SelectorEmpresa
              value={nota.empresa_id || ''}
              onChange={(empresaId) => actualizarNota.mutate({ empresa_id: empresaId || '' })}
            />
            {empresa && (
              <Button variant="link" size="sm" className="h-6 px-0 text-xs" onClick={() => navigate(`/crm/empresas/${nota.empresa_id}`)}>
                Ver perfil de {empresa.nombre} →
              </Button>
            )}
            {(nota.empresas_detectadas || []).length > 0 && (
              <div>
                <Label className="text-xs text-muted-foreground">Detectadas sin match en el CRM:</Label>
                <div className="flex gap-1 flex-wrap mt-1">
                  {nota.empresas_detectadas.map((n, i) => (
                    <Badge key={i} variant="outline" className="text-[10px]">{n}</Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4" /> Contactos mencionados
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {(nota.contactos_ids || []).length === 0 && (nota.contactos_detectados || []).length === 0 && (
              <p className="text-xs text-muted-foreground">Ninguno detectado</p>
            )}
            {(nota.contactos_ids || []).map(cid => {
              const c = contactosById[cid];
              if (!c) return null;
              return (
                <Link key={cid} to={`/crm/contactos/${cid}`} className="flex items-center gap-2 text-sm hover:underline">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-[10px] font-semibold flex items-center justify-center">
                    {c.nombre?.charAt(0)?.toUpperCase()}
                  </span>
                  {c.nombre}{c.empresa ? ` — ${c.empresa}` : ''}
                </Link>
              );
            })}
            {(nota.contactos_detectados || []).length > 0 && (
              <div className="flex gap-1 flex-wrap pt-1">
                {nota.contactos_detectados.map((n, i) => (
                  <Badge key={i} variant="outline" className="text-[10px]">{n} (sin match)</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Contenido completo */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4" /> Notas originales
            </CardTitle>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={verContenido} disabled={cargandoContenido}>
              {cargandoContenido ? 'Cargando...' : contenidoCompleto !== null ? 'Ocultar' : 'Ver contenido completo'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <pre className="text-xs whitespace-pre-wrap font-mono bg-muted/40 rounded-lg p-3 max-h-96 overflow-y-auto">
            {contenidoCompleto !== null ? contenidoCompleto : (nota.extracto || 'Sin extracto')}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
