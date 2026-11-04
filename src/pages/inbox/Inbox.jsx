import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Nota } from '@/api/base44Client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Bot, MessageCircle, Search, CheckCheck, Phone, Home, Building2, MapPin, DollarSign, CheckCircle2, XCircle, ChevronLeft, Database } from 'lucide-react';

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)   return 'ahora';
  if (m < 60)  return `${m}m`;
  if (m < 1440) return `${Math.floor(m/60)}h`;
  return `${Math.floor(m/1440)}d`;
}

function horaDe(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
}

function parsarNota(nota) {
  try {
    const estado = JSON.parse(nota.texto || '{}');
    return {
      historial:      estado.historial      || [],
      datos:          estado.datos          || {},
      calificado:     estado.calificado     || false,
      descalificado:  estado.descalificado  || false,
      motivo_desc:    estado.motivo_desc    || '',
      broker:         estado.broker         || '',
      rag_debug:      estado.rag_debug       || null,
    };
  } catch {
    return { historial: [], datos: {}, calificado: false, descalificado: false, motivo_desc: '', broker: '', rag_debug: null };
  }
}

function stripEmojis(text) {
  if (!text) return '';
  return text.replace(/[\u{1F000}-\u{1F9FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F1E0}-\u{1F1FF}\u{2B00}-\u{2BFF}\u{2700}-\u{27BF}]/gu, '').replace(/\s+/g, ' ').trim();
}

function estadoBadge(conv) {
  if (conv.descalificado) return <Badge className="bg-red-500/10 text-red-600 border-red-500/20 text-xs inline-flex items-center gap-1 whitespace-nowrap w-fit"><XCircle className="w-3 h-3 flex-shrink-0" />Descalificado</Badge>;
  if (conv.calificado)    return <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-xs inline-flex items-center gap-1 whitespace-nowrap w-fit"><CheckCircle2 className="w-3 h-3 flex-shrink-0" />Calificado</Badge>;
  return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20 text-xs inline-flex items-center gap-1 whitespace-nowrap w-fit"><Bot className="w-3 h-3 flex-shrink-0" />IA activa</Badge>;
}

export default function Inbox() {
  const [selectedTel, setSelectedTel] = useState(null);
  const [busqueda, setBusqueda] = useState('');

  const { data: notas = [], isLoading } = useQuery({
    queryKey: ['notas_inbox'],
    queryFn: () => Nota.list('-fecha_nota'),
    refetchInterval: 15000,
  });

  const conversaciones = notas
    .filter(n => n.cliente_id && n.texto)
    .map(n => {
      const parsed = parsarNota(n);
      const lastMsg = parsed.historial[parsed.historial.length - 1];
      return {
        tel:          n.cliente_id,
        notaId:       n.id,
        fecha:        n.fecha_nota,
        nombre:           parsed.datos.nombre || null,
        empresa:          parsed.datos.empresa || '',
        cargo:            parsed.datos.cargo || '',
        sector:           parsed.datos.sector || '',
        tipo_necesidad:   parsed.datos.tipo_necesidad || '',
        volumen_aproximado: parsed.datos.volumen_aproximado || '',
        ciudad:           parsed.datos.ciudad || '',
        presupuesto:      parsed.datos.presupuesto || null,
        broker:           parsed.broker || '',
        calificado:   parsed.calificado,
        descalificado: parsed.descalificado,
        motivo_desc:  parsed.motivo_desc,
        historial:    parsed.historial,
        rag_debug:    parsed.rag_debug,
        lastMsg:      lastMsg?.content || '',
        lastRole:     lastMsg?.role    || '',
      };
    })
    .filter(c =>
      !busqueda ||
      c.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
      c.tel.includes(busqueda)
    );

  const seleccionada = conversaciones.find(c => c.tel === selectedTel);

  return (
    <div className="flex h-[calc(100vh-112px)] md:h-[calc(100vh-64px)] bg-background -mx-4 md:mx-0 -my-4 md:my-0">

      {/* ── Panel izquierdo ── */}
      <div className={`w-full md:w-80 border-r border-border bg-card flex flex-col flex-shrink-0 ${selectedTel ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-3 md:p-4 border-b border-border space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <MessageCircle className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground text-[15px] leading-tight">Bandeja WhatsApp</h2>
              <p className="text-[11px] text-muted-foreground">Emma · Agente IA</p>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9 h-9 text-sm rounded-lg bg-muted/60 border-border"
              placeholder="Buscar por nombre o teléfono..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
            />
          </div>
          <div className="flex gap-2 text-xs text-muted-foreground">
            <span className="bg-green-500/10 text-green-600 px-2.5 py-1 rounded-full flex items-center gap-1 font-medium">
              <CheckCircle2 className="w-3 h-3" />{conversaciones.filter(c => c.calificado).length} calificados
            </span>
            <span className="bg-primary/10 text-primary px-2.5 py-1 rounded-full flex items-center gap-1 font-medium">
              <Bot className="w-3 h-3" />{conversaciones.filter(c => !c.calificado && !c.descalificado).length} activos
            </span>
          </div>
        </div>

        <ScrollArea className="flex-1">
          {isLoading && (
            <div className="p-8 text-center text-muted-foreground text-sm">Cargando...</div>
          )}
          {!isLoading && conversaciones.length === 0 && (
            <div className="p-8 text-center text-muted-foreground text-sm">
              <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-20" />
              <p>Sin conversaciones todavía.</p>
              <p className="mt-1 text-xs">Escríbele al 301 desde WhatsApp.</p>
            </div>
          )}
          {conversaciones.map(conv => (
            <button
              key={conv.tel}
              onClick={() => setSelectedTel(conv.tel)}
              className={`w-full text-left px-3 md:px-4 py-3 border-b border-border transition-colors ${selectedTel === conv.tel ? 'bg-primary/8' : 'hover:bg-muted/50'}`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0 ${conv.calificado ? 'bg-green-500' : conv.descalificado ? 'bg-red-400' : 'bg-primary'}`}>
                  {(conv.nombre || conv.tel).charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[14px] text-foreground truncate">
                      {conv.nombre || `+${conv.tel}`}
                    </span>
                    <span className="text-xs text-muted-foreground ml-1 flex-shrink-0">{timeAgo(conv.fecha)}</span>
                  </div>
                  <p className="text-[13px] text-muted-foreground truncate mt-0.5 flex items-center gap-1">
                    {conv.lastRole === 'assistant' && <Bot className="w-3 h-3 flex-shrink-0" />}{stripEmojis(conv.lastMsg) || 'Sin mensajes'}
                  </p>
                  <div className="mt-1.5">{estadoBadge(conv)}</div>
                </div>
              </div>
            </button>
          ))}
        </ScrollArea>
      </div>

      {/* ── Panel derecho: chat ── */}
      {!seleccionada ? (
        <div className="hidden md:flex flex-1 items-center justify-center text-muted-foreground bg-muted/30">
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto mb-3">
              <MessageCircle className="w-8 h-8 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium">Selecciona una conversación</p>
          </div>
        </div>
      ) : (
        <div className={`flex-1 flex flex-col ${selectedTel ? 'flex' : 'hidden md:flex'}`}>

          {/* Header */}
          <div className="bg-card border-b border-border px-3 md:px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => setSelectedTel(null)}
              className="md:hidden p-1 -ml-1 rounded-lg hover:bg-muted text-foreground"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-semibold text-primary">
              {(seleccionada.nombre || seleccionada.tel).charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground text-[15px] truncate">{seleccionada.nombre || `+${seleccionada.tel}`}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <Phone className="w-3 h-3" /> +{seleccionada.tel}
                {seleccionada.calificado && <span className="hidden sm:inline">· Ejecutivo: {seleccionada.broker}</span>}
              </p>
            </div>
            <div className="flex-shrink-0 hidden sm:block">{estadoBadge(seleccionada)}</div>
          </div>

          {/* Datos del lead */}
          {(seleccionada.empresa || seleccionada.sector || seleccionada.ciudad || seleccionada.presupuesto) && (
            <div className="bg-card border-b border-border px-3 md:px-4 py-2.5 flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
              {seleccionada.empresa && (
                <span className="flex items-center gap-1">
                  <Building2 className="w-3 h-3 text-primary" />
                  {seleccionada.empresa}{seleccionada.cargo && ` (${seleccionada.cargo})`}
                </span>
              )}
              {seleccionada.sector && (
                <span className="flex items-center gap-1">
                  <Home className="w-3 h-3 text-violet-500" />
                  {seleccionada.sector}{seleccionada.tipo_necesidad && ` · ${seleccionada.tipo_necesidad}`}
                </span>
              )}
              {seleccionada.ciudad && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-red-500" />
                  {seleccionada.ciudad}
                </span>
              )}
              {seleccionada.presupuesto && (
                <span className="flex items-center gap-1">
                  <DollarSign className="w-3 h-3 text-green-600" />
                  ${Number(seleccionada.presupuesto).toLocaleString('es-CO')}
                </span>
              )}
              {seleccionada.calificado && (
                <span className="flex items-center gap-1 text-green-700 font-medium">
                  <CheckCircle2 className="w-3 h-3" /> Ejecutivo: {seleccionada.broker}
                </span>
              )}
              {seleccionada.descalificado && (
                <span className="text-red-600 font-medium">Motivo: {seleccionada.motivo_desc}</span>
              )}
            </div>
          )}

          {/* Debug RAG en tiempo real: qué conocimiento usó Emma en el último mensaje */}
          <details className="bg-violet-50/60 dark:bg-violet-950/20 border-b border-border px-3 md:px-4 py-2 text-xs">
            <summary className="cursor-pointer flex items-center gap-1.5 text-violet-700 dark:text-violet-300 font-medium select-none flex-wrap">
              <Database className="w-3.5 h-3.5" /> RAG que usó Emma
              {seleccionada.rag_debug
                ? <span className="text-muted-foreground font-normal">· {(seleccionada.rag_debug.usados || []).length} chunks · {seleccionada.rag_debug.chars} chars · etapa "{seleccionada.rag_debug.etapa}"</span>
                : <span className="text-muted-foreground font-normal">· aún sin datos</span>}
            </summary>
            <div className="mt-2 pl-5 space-y-1">
              {!seleccionada.rag_debug ? (
                <p className="text-muted-foreground">Mándale un mensaje a Emma para ver qué conocimiento usó en su respuesta.</p>
              ) : (seleccionada.rag_debug.usados || []).length === 0 ? (
                <p className="text-amber-600">No inyectó ningún chunk (revisa etapas/prioridades del RAG).</p>
              ) : (
                <>
                  {(seleccionada.rag_debug.usados || []).map((c, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300 flex-shrink-0">{c.categoria || '—'}</span>
                      <span className="text-foreground truncate">{c.titulo}</span>
                      <span className="text-muted-foreground/60 ml-auto flex-shrink-0">p{c.prioridad}</span>
                    </div>
                  ))}
                  <p className="text-muted-foreground/70 pt-1">De {seleccionada.rag_debug.filtrados} chunks que aplican a esta etapa (de {seleccionada.rag_debug.total_activos} activos totales). Se inyecta por prioridad hasta llenar el tope.</p>
                </>
              )}
            </div>
          </details>

          {/* Mensajes */}
          <ScrollArea className="flex-1 bg-muted/30">
            <div className="p-3 md:p-4 space-y-2 max-w-3xl mx-auto">
              {seleccionada.historial.length === 0 && (
                <p className="text-center text-xs text-muted-foreground py-8">Sin mensajes en el historial</p>
              )}
              {seleccionada.historial.flatMap((msg, i) => {
                const esIA = msg.role === 'assistant';
                // Cada mensaje puede traer varios "globos" separados por doble salto:
                // así se ve si Emma partió los mensajes o mandó un párrafo gigante.
                const partes = String(msg.content || '').split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
                if (partes.length === 0) partes.push('');
                return partes.map((parte, j) => {
                  const ultima = j === partes.length - 1;
                  return (
                    <div key={`${i}-${j}`} className={`flex ${esIA ? 'justify-end' : 'justify-start'} ${ultima ? '' : 'mb-0.5'}`}>
                      {!esIA && (
                        <div className={`w-7 h-7 rounded-full bg-muted-foreground/30 items-center justify-center text-white text-xs font-bold mr-2 mt-1 flex-shrink-0 ${ultima ? 'flex' : 'invisible'}`}>
                          {(seleccionada.nombre || '?').charAt(0)}
                        </div>
                      )}
                      <div
                        className={`max-w-[75%] lg:max-w-md xl:max-w-lg px-3 py-2 rounded-2xl text-sm shadow-sm relative ${
                          esIA
                            ? 'bg-primary text-primary-foreground rounded-tr-sm'
                            : 'bg-card text-card-foreground rounded-tl-sm border border-border'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words leading-relaxed">{stripEmojis(parte)}</p>
                        {ultima && (
                          <div className={`flex items-center gap-1 mt-1 ${esIA ? 'justify-end' : 'justify-start'}`}>
                            {esIA && <Bot className="w-3 h-3 text-primary-foreground/70" />}
                            {esIA && <CheckCheck className="w-3 h-3 text-primary-foreground/70" />}
                            <span className={`text-[10px] ${esIA ? 'text-primary-foreground/70' : 'text-muted-foreground/70'}`}>{esIA ? 'Emma' : (seleccionada.nombre || 'Cliente')}</span>
                            {msg.ts && <span className={`text-[10px] ${esIA ? 'text-primary-foreground/60' : 'text-muted-foreground/60'}`}>· {horaDe(msg.ts)}</span>}
                          </div>
                        )}
                      </div>
                      {esIA && (
                        <div className={`w-7 h-7 rounded-full bg-primary items-center justify-center text-white ml-2 mt-1 flex-shrink-0 ${ultima ? 'flex' : 'invisible'}`}>
                          <Bot className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                  );
                });
              })}
            </div>
          </ScrollArea>

          {/* Footer */}
          <div className="bg-card border-t border-border px-3 md:px-4 py-2.5 text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5">
            <Bot className="w-3.5 h-3.5 text-primary" /> Emma responde automáticamente — solo lectura
          </div>
        </div>
      )}
    </div>
  );
}