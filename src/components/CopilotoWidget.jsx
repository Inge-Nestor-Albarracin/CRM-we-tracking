import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { Sparkles, Send, CheckCircle2, AlertCircle, Bot, User, Trash2, X, Mic, Volume2, VolumeX } from 'lucide-react';

const SUGERENCIAS = [
  '¿Cuánto tenemos en el pipeline y en qué etapas?',
  '¿Qué tareas están vencidas o vencen esta semana?',
  '¿Qué productos están bajo el stock mínimo?',
  '¿Qué cotizaciones están enviadas sin cerrar?',
];

export default function CopilotoWidget() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState([]); // { role, content, acciones? }
  const [input, setInput] = useState('');
  const [cargando, setCargando] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [cargado, setCargado] = useState(false);
  const [porConfirmar, setPorConfirmar] = useState([]);
  const [grabando, setGrabando] = useState(false);
  const [transcribiendo, setTranscribiendo] = useState(false);
  const [vozActiva, setVozActiva] = useState(false);
  const scrollRef = useRef(null);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const audioRef = useRef(null);

  // Reuniones con prospecto nuevo por confirmar (NOVA lo avisa proactivamente al abrir).
  useEffect(() => {
    if (!abierto) return;
    base44.entities.ReunionNota.filter({ sugerencia_estado: 'pendiente' })
      .then(rs => setPorConfirmar((rs || []).filter(r => !r.descartada)))
      .catch(() => {});
  }, [abierto]);

  // Cargar usuario + historial la primera vez que se abre (perezoso).
  useEffect(() => {
    if (!abierto || cargado) return;
    setCargado(true);
    (async () => {
      try {
        const me = await base44.auth.me();
        const email = me?.email || '';
        setUserEmail(email);
        if (email) {
          const previos = await base44.entities.NovaMensaje.filter({ usuario_email: email });
          const ordenados = (previos || [])
            .sort((a, b) => String(a.fecha || a.created_date || '').localeCompare(String(b.fecha || b.created_date || '')))
            .slice(-100)
            .map(m => ({ role: m.rol === 'assistant' ? 'assistant' : 'user', content: m.contenido, acciones: [] }));
          if (ordenados.length) setMensajes(ordenados);
        }
      } catch { /* sin historial previo */ }
    })();
  }, [abierto, cargado]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [mensajes, cargando, abierto]);

  async function limpiar() {
    if (!window.confirm('¿Borrar el historial de esta conversación con Nova?')) return;
    setMensajes([]);
    if (userEmail) {
      try {
        const previos = await base44.entities.NovaMensaje.filter({ usuario_email: userEmail });
        for (const m of previos || []) { try { await base44.entities.NovaMensaje.delete(m.id); } catch { /* */ } }
      } catch { /* */ }
    }
  }

  async function enviar(texto) {
    const msg = (texto ?? input).trim();
    if (!msg || cargando) return;
    const historial = mensajes.map(m => ({ role: m.role, content: m.content }));
    setMensajes(prev => [...prev, { role: 'user', content: msg }]);
    setInput('');
    setCargando(true);
    try {
      const res = await base44.functions.invoke('copilotoEmpresa', { mensaje: msg, historial });
      const data = res?.data ?? res;
      const respuesta = data?.respuesta || 'No pude generar una respuesta.';
      setMensajes(prev => [...prev, { role: 'assistant', content: respuesta, acciones: data?.acciones_ejecutadas || [] }]);
      if (vozActiva) hablar(respuesta);
      if (userEmail) {
        const ahora = new Date().toISOString();
        base44.entities.NovaMensaje.create({ usuario_email: userEmail, rol: 'user', contenido: msg, fecha: ahora }).catch(() => {});
        base44.entities.NovaMensaje.create({ usuario_email: userEmail, rol: 'assistant', contenido: respuesta, fecha: ahora }).catch(() => {});
      }
    } catch (err) {
      toast({ title: 'Error del copiloto', description: err?.message || String(err), variant: 'destructive' });
      setMensajes(prev => [...prev, { role: 'assistant', content: 'Ocurrió un error al procesar tu solicitud. Intenta de nuevo.', acciones: [] }]);
    }
    setCargando(false);
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); }
  }

  // Convierte un Blob a base64 (sin el prefijo data:).
  function blobABase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(String(r.result || '').split(',')[1] || '');
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  // Dictado por voz: graba con el micrófono y transcribe con ElevenLabs (Scribe) → envía.
  async function toggleVoz() {
    if (grabando) { try { mediaRef.current?.stop(); } catch { /* ignore */ } return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast({ title: 'Micrófono no disponible', description: 'Tu navegador no permite grabar audio.', variant: 'destructive' });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data?.size) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch { /* */ }
        setGrabando(false);
        const blob = new Blob(chunksRef.current, { type: mime || 'audio/webm' });
        if (!blob.size) return;
        setTranscribiendo(true);
        try {
          const b64 = await blobABase64(blob);
          const res = await base44.functions.invoke('elevenLabsSTT', { audio_base64: b64, mime: blob.type });
          const data = res?.data ?? res;
          const texto = (data?.texto || '').trim();
          if (texto) enviar(texto);
          else toast({ title: 'No se entendió el audio', description: 'Intenta de nuevo.', variant: 'destructive' });
        } catch (err) {
          toast({ title: 'Error al transcribir', description: err?.message || String(err), variant: 'destructive' });
        }
        setTranscribiendo(false);
      };
      mediaRef.current = mr;
      mr.start();
      setGrabando(true);
    } catch {
      toast({ title: 'No pude acceder al micrófono', description: 'Revisa los permisos del navegador.', variant: 'destructive' });
    }
  }

  // Reproduce la respuesta de Nova con la voz de ElevenLabs (cuando la voz está activa).
  async function hablar(texto) {
    try {
      const res = await base44.functions.invoke('elevenLabsTTS', { texto });
      const data = res?.data ?? res;
      if (!data?.audio_base64) return;
      try { audioRef.current?.pause(); } catch { /* */ }
      const audio = new Audio(`data:${data.mime || 'audio/mpeg'};base64,${data.audio_base64}`);
      audioRef.current = audio;
      audio.play().catch(() => {});
    } catch { /* silencioso */ }
  }

  return (
    <>
      {/* Botón lanzador (junto a las notificaciones) */}
      <button
        onClick={() => setAbierto(o => !o)}
        title="Nova · Copiloto IA"
        className={`relative flex items-center justify-center w-9 h-9 rounded-lg transition-colors ${abierto ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-foreground'}`}
      >
        <Sparkles className="w-[18px] h-[18px]" />
      </button>

      {abierto && (
        <>
          {/* Click-away */}
          <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)} />

          {/* Panel flotante tipo chatbot */}
          <div className="fixed z-50 right-3 top-14 bottom-3 w-[calc(100vw-1.5rem)] sm:w-[400px] sm:bottom-4 sm:h-[620px] sm:max-h-[calc(100vh-4.5rem)] flex flex-col bg-card text-foreground border border-border/60 rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/60 bg-card">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-wt-cian to-wt-azul flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4 text-wt-marino" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground leading-tight">Nova</p>
                <p className="text-[11px] text-muted-foreground leading-tight">Copiloto interno · datos reales del CRM</p>
              </div>
              <button onClick={() => setVozActiva(v => !v)} title={vozActiva ? 'Silenciar a Nova' : 'Que Nova hable las respuestas'} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                {vozActiva ? <Volume2 className="w-4 h-4 text-primary" /> : <VolumeX className="w-4 h-4" />}
              </button>
              {mensajes.length > 0 && (
                <button onClick={limpiar} title="Nueva conversación" className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button onClick={() => setAbierto(false)} title="Cerrar" className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mensajes */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3.5 py-4 space-y-4">
              {porConfirmar.length > 0 && (
                <button
                  onClick={() => { setAbierto(false); navigate('/crm/reuniones'); }}
                  className="w-full flex items-start gap-2.5 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5 text-left hover:bg-primary/10 transition-colors"
                >
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-foreground">
                      {porConfirmar.length} reunión{porConfirmar.length !== 1 ? 'es' : ''} con prospectos nuevos
                    </p>
                    <p className="text-[12px] text-muted-foreground">Toca para revisar y crear la empresa, el contacto y la oportunidad.</p>
                  </div>
                </button>
              )}

              {mensajes.length === 0 && !cargando && (
                <div className="text-center py-6">
                  <Bot className="w-9 h-9 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground mb-4">¿En qué te ayudo?</p>
                  <div className="flex flex-col gap-2">
                    {SUGERENCIAS.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => enviar(s)}
                        className="text-left text-[13px] px-3 py-2 rounded-xl border border-border/60 bg-card hover:bg-muted transition-colors text-foreground"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {mensajes.map((m, i) => (
                <div key={i} className={`flex gap-2.5 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${m.role === 'user' ? 'bg-muted' : 'bg-primary/10'}`}>
                    {m.role === 'user' ? <User className="w-3.5 h-3.5 text-muted-foreground" /> : <Sparkles className="w-3.5 h-3.5 text-primary" />}
                  </div>
                  <div className={`min-w-0 max-w-[85%] ${m.role === 'user' ? 'text-right' : ''}`}>
                    <div className={`inline-block rounded-2xl px-3.5 py-2 text-[13px] ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted/60 text-foreground'}`}>
                      {m.role === 'user'
                        ? <span className="whitespace-pre-wrap">{m.content}</span>
                        : <div className="text-left leading-relaxed [&_p]:my-1.5 [&_ul]:my-1.5 [&_ul]:pl-4 [&_ul]:list-disc [&_ol]:my-1.5 [&_ol]:pl-4 [&_ol]:list-decimal [&_li]:my-0.5 [&_strong]:font-semibold [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded [&_code]:text-[12px] [&_a]:text-primary [&_a]:underline [&_img]:rounded-lg [&_img]:my-2 [&_img]:max-h-48 [&_table]:w-full [&_table]:my-2 [&_table]:text-[11px] [&_table]:border-collapse [&_th]:border [&_th]:border-border/60 [&_th]:px-1.5 [&_th]:py-0.5 [&_th]:bg-muted/50 [&_th]:text-left [&_td]:border [&_td]:border-border/60 [&_td]:px-1.5 [&_td]:py-0.5 overflow-x-auto"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" /> }}>{m.content}</ReactMarkdown></div>}
                    </div>
                    {(m.acciones || []).length > 0 && (
                      <div className="flex flex-col gap-1 mt-1.5">
                        {m.acciones.map((a, j) => (
                          <div key={j} className={`inline-flex items-center gap-1.5 text-[11px] ${a.ok ? 'text-green-600 dark:text-green-500' : 'text-destructive'}`}>
                            {a.ok ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                            {a.detalle}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {cargando && (
                <div className="flex gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
                  </div>
                  <div className="inline-flex items-center gap-1 rounded-2xl px-3.5 py-2.5 bg-muted/60">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="border-t border-border/60 p-3">
              <div className="flex items-end gap-2">
                <Textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  rows={1}
                  placeholder={grabando ? 'Escuchando…' : 'Escribe o dicta tu pregunta...'}
                  className="resize-none min-h-[40px] max-h-32 text-[13px]"
                />
                <Button size="icon" variant={grabando ? 'destructive' : 'outline'} className="h-10 w-10 flex-shrink-0" onClick={toggleVoz} disabled={cargando || transcribiendo} title={grabando ? 'Detener dictado' : 'Dictar por voz'}>
                  {transcribiendo
                    ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    : <Mic className={`w-4 h-4 ${grabando ? 'animate-pulse' : ''}`} />}
                </Button>
                <Button size="icon" className="h-10 w-10 flex-shrink-0" disabled={!input.trim() || cargando} onClick={() => enviar()}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
