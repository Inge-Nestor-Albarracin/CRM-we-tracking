import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { MessagesSquare, Sparkles } from 'lucide-react';

function fechaCorta(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Color estable por usuario (mismo nombre -> mismo color, distinto entre usuarios)
function colorDe(nombre) {
  const s = String(nombre || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return `hsl(${h} 62% 48%)`;
}

export default function GrupoTelegram() {
  const { data: mensajes = [], isLoading } = useQuery({
    queryKey: ['grupo-telegram'],
    queryFn: () => base44.entities.MensajeGrupoTelegram.list('-fecha'),
    refetchInterval: 15000,
  });

  // Newest-first de la API → orden cronológico (viejo → nuevo) para leerlo como chat
  const cronologico = useMemo(() => [...mensajes].reverse(), [mensajes]);
  const grupos = useMemo(
    () => Array.from(new Set(mensajes.map(m => m.chat_titulo).filter(Boolean))),
    [mensajes]
  );

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <MessagesSquare className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Actividad del grupo</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Lo que se habla en el grupo de Telegram (lo que Nova registra y recuerda).
            {grupos.length > 0 && <> · <span className="font-medium text-foreground">{grupos.join(', ')}</span></>}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando...</div>
      ) : cronologico.length === 0 ? (
        <div className="text-center py-14 text-muted-foreground border border-border/40 rounded-xl bg-card">
          <MessagesSquare className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm mb-1">Aún no hay mensajes registrados del grupo</p>
          <p className="text-xs max-w-md mx-auto">
            Para que Nova capture toda la conversación, el bot debe estar en el grupo con el
            <strong> modo privacidad OFF</strong> (BotFather → /setprivacy → Disable → sacar y volver a meter el bot).
            Si la privacidad está ON, solo registra los mensajes donde lo mencionan.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {cronologico.map((m) => {
            const esNova = (m.remitente || '').toLowerCase() === 'nova';
            const color = esNova ? null : colorDe(m.remitente);
            return (
              <div key={m.id} className={`flex ${esNova ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${esNova ? 'bg-primary/10 border border-primary/20' : 'bg-card border border-border/50'}`}
                  style={color ? { borderLeftColor: color, borderLeftWidth: '3px' } : undefined}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {esNova && <Sparkles className="w-3 h-3 text-primary" />}
                    <span className={`text-[11px] font-semibold ${esNova ? 'text-primary' : ''}`} style={color ? { color } : undefined}>
                      {m.remitente || 'Alguien'}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{fechaCorta(m.fecha || m.created_date)}</span>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap break-words">{m.texto}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
