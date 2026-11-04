import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { MessageSquare, Search, Sparkles, ArrowLeft } from 'lucide-react';
import { useUsuariosMap } from '@/hooks/useUsuariosMap';

function fmtFecha(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function timeAgo(iso) {
  if (!iso) return '';
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}
function colorDe(s) {
  let h = 0; const t = String(s || '');
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) % 360;
  return `hsl(${h} 60% 45%)`;
}
function nombreDe(key, usuarios) {
  if (!key || key === '(desconocido)') return 'Desconocido';
  if (key.startsWith('tg:')) return `Telegram ${key.slice(3)}`;
  return usuarios[String(key).toLowerCase()] || key;
}
function iniciales(nombre) {
  const p = String(nombre || '?').trim().split(/\s+/);
  return (((p[0] || '')[0] || '') + ((p[1] || '')[0] || '')).toUpperCase() || '?';
}

export default function ChatsInternos() {
  const usuarios = useUsuariosMap();
  const { data: mensajes = [], isLoading } = useQuery({
    queryKey: ['nova-mensajes'],
    queryFn: () => base44.entities.NovaMensaje.list('-fecha', 3000),
    refetchInterval: 15000,
  });
  const [sel, setSel] = useState(null);
  const [q, setQ] = useState('');

  const personas = useMemo(() => {
    const map = new Map();
    for (const m of mensajes) {
      const key = m.usuario_email || '(desconocido)';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(m);
    }
    const arr = [...map.entries()].map(([key, msgs]) => {
      const orden = [...msgs].sort((a, b) => new Date(a.fecha || a.created_date) - new Date(b.fecha || b.created_date));
      const ultimo = orden[orden.length - 1];
      return {
        key, nombre: nombreDe(key, usuarios), msgs: orden, count: orden.length,
        ultimoTexto: ultimo?.contenido || '', ultimaFecha: ultimo?.fecha || ultimo?.created_date || null,
      };
    });
    arr.sort((a, b) => new Date(b.ultimaFecha || 0) - new Date(a.ultimaFecha || 0));
    return arr;
  }, [mensajes, usuarios]);

  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return personas;
    return personas.filter(p => p.nombre.toLowerCase().includes(t) || p.key.toLowerCase().includes(t));
  }, [personas, q]);

  const actual = personas.find(p => p.key === sel) || null;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <MessageSquare className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Chats internos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Las conversaciones de cada persona con Nova (web y Telegram). {personas.length > 0 && <span className="font-medium text-foreground">{personas.length} persona{personas.length !== 1 ? 's' : ''}</span>}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando...</div>
      ) : personas.length === 0 ? (
        <div className="text-center py-14 text-muted-foreground border border-border/40 rounded-xl bg-card">
          <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm mb-1">Todavía no hay chats internos registrados</p>
          <p className="text-xs max-w-md mx-auto">Apenas alguien le escriba a Nova (en el widget web o por Telegram), su conversación aparecerá aquí, agrupada por persona.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] gap-4 h-[calc(100vh-220px)] min-h-[420px]">
          {/* Lista de personas */}
          <div className={`bg-card border border-border/60 rounded-xl flex flex-col overflow-hidden ${actual ? 'hidden md:flex' : 'flex'}`}>
            <div className="p-2.5 border-b border-border/40">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar persona…"
                  className="w-full pl-8 pr-2 h-9 text-sm rounded-lg bg-background border border-border/60 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filtradas.map(p => {
                const activo = p.key === sel;
                return (
                  <button key={p.key} onClick={() => setSel(p.key)}
                    className={`w-full text-left px-3 py-2.5 flex items-center gap-3 border-b border-border/20 transition-colors ${activo ? 'bg-primary/10' : 'hover:bg-muted/50'}`}>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: colorDe(p.nombre) }}>
                      {iniciales(p.nombre)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-foreground truncate">{p.nombre}</p>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">{timeAgo(p.ultimaFecha)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{p.ultimoTexto}</p>
                    </div>
                  </button>
                );
              })}
              {filtradas.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">Sin resultados</p>}
            </div>
          </div>

          {/* Conversación */}
          <div className={`bg-card border border-border/60 rounded-xl flex flex-col overflow-hidden ${actual ? 'flex' : 'hidden md:flex'}`}>
            {!actual ? (
              <div className="flex-1 flex items-center justify-center text-center text-muted-foreground px-6">
                <div>
                  <MessageSquare className="w-9 h-9 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Elige una persona para ver su chat con Nova</p>
                </div>
              </div>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-border/40 flex items-center gap-3">
                  <button onClick={() => setSel(null)} className="md:hidden p-1 -ml-1 text-muted-foreground hover:text-foreground"><ArrowLeft className="w-5 h-5" /></button>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: colorDe(actual.nombre) }}>
                    {iniciales(actual.nombre)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{actual.nombre}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{actual.key.startsWith('tg:') ? 'Telegram' : actual.key} · {actual.count} mensaje{actual.count !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                  {actual.msgs.map(m => {
                    const esNova = m.rol === 'assistant';
                    return (
                      <div key={m.id} className={`flex ${esNova ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[82%] rounded-2xl px-3.5 py-2 ${esNova ? 'bg-primary/10 border border-primary/20' : 'bg-muted/60 border border-border/50'}`}>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            {esNova && <Sparkles className="w-3 h-3 text-primary" />}
                            <span className={`text-[11px] font-semibold ${esNova ? 'text-primary' : 'text-foreground'}`}>{esNova ? 'Nova' : actual.nombre}</span>
                            <span className="text-[10px] text-muted-foreground">{fmtFecha(m.fecha || m.created_date)}</span>
                          </div>
                          <p className="text-sm text-foreground whitespace-pre-wrap break-words">{m.contenido}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
