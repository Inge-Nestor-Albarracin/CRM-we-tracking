import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { Sparkles, Send, CheckCircle2, AlertCircle, Bot, User, Trash2 } from 'lucide-react';

const SUGERENCIAS = [
  '¿Cuánto tenemos en el pipeline y en qué etapas?',
  '¿Qué tareas están vencidas o vencen esta semana?',
  'Resúmeme las últimas reuniones de comité',
  '¿Qué productos están bajo el stock mínimo?',
  '¿Qué cotizaciones están enviadas sin cerrar?',
];

export default function Copiloto() {
  const { toast } = useToast();
  const [mensajes, setMensajes] = useState([]); // { role, content, acciones? }
  const [input, setInput] = useState('');
  const [cargando, setCargando] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const scrollRef = useRef(null);

  // Cargar el usuario y su historial guardado (chat persistido, como el Inbox de WhatsApp)
  useEffect(() => {
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
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [mensajes, cargando]);

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
      // Persistir el intercambio (chat guardado)
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

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-border/60">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Nova · Copiloto interno</h1>
          <p className="text-xs text-muted-foreground">Pregúntame sobre el pipeline, tareas, reuniones, inventario y cotizaciones. También puedo crear tareas y notas.</p>
        </div>
        {mensajes.length > 0 && (
          <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground flex-shrink-0" onClick={limpiar}>
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Nueva
          </Button>
        )}
      </div>

      {/* Mensajes */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-5 space-y-5">
        {mensajes.length === 0 && !cargando && (
          <div className="text-center py-8">
            <Bot className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground mb-4">Empieza con una pregunta sobre la empresa</p>
            <div className="flex flex-col gap-2 max-w-md mx-auto">
              {SUGERENCIAS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => enviar(s)}
                  className="text-left text-sm px-3.5 py-2.5 rounded-xl border border-border/60 bg-card hover:bg-muted transition-colors text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {mensajes.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${m.role === 'user' ? 'bg-muted' : 'bg-primary/10'}`}>
              {m.role === 'user' ? <User className="w-4 h-4 text-muted-foreground" /> : <Sparkles className="w-4 h-4 text-primary" />}
            </div>
            <div className={`min-w-0 max-w-[85%] ${m.role === 'user' ? 'text-right' : ''}`}>
              <div className={`inline-block rounded-2xl px-4 py-2.5 text-sm ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-card border border-border/60 text-foreground'}`}>
                {m.role === 'user'
                  ? <span className="whitespace-pre-wrap">{m.content}</span>
                  : <div className="text-left leading-relaxed [&_p]:my-1.5 [&_ul]:my-1.5 [&_ul]:pl-5 [&_ul]:list-disc [&_ol]:my-1.5 [&_ol]:pl-5 [&_ol]:list-decimal [&_li]:my-0.5 [&_strong]:font-semibold [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_h1]:mt-2 [&_h2]:mt-2 [&_h3]:mt-2 [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded [&_code]:text-[13px] [&_a]:underline [&_table]:w-full [&_table]:my-2 [&_table]:text-xs [&_table]:border-collapse [&_th]:border [&_th]:border-border/60 [&_th]:px-2 [&_th]:py-1 [&_th]:bg-muted/50 [&_th]:text-left [&_td]:border [&_td]:border-border/60 [&_td]:px-2 [&_td]:py-1 overflow-x-auto"><ReactMarkdown>{m.content}</ReactMarkdown></div>}
              </div>
              {(m.acciones || []).length > 0 && (
                <div className="flex flex-col gap-1 mt-1.5">
                  {m.acciones.map((a, j) => (
                    <div key={j} className={`inline-flex items-center gap-1.5 text-xs ${a.ok ? 'text-green-600 dark:text-green-500' : 'text-destructive'}`}>
                      {a.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                      {a.detalle}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {cargando && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4 text-primary animate-pulse" />
            </div>
            <div className="inline-flex items-center gap-1 rounded-2xl px-4 py-3 bg-card border border-border/60">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border/60 pt-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Escribe tu pregunta o pídeme crear una tarea..."
            className="resize-none min-h-[44px] max-h-40"
          />
          <Button size="icon" className="h-11 w-11 flex-shrink-0" disabled={!input.trim() || cargando} onClick={() => enviar()}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1.5 text-center">Nova usa los datos reales del CRM. Verifica las acciones importantes.</p>
      </div>
    </div>
  );
}