import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ConocimientoRAG } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Calculator, Database, AlertTriangle } from 'lucide-react';

// Tope de inyeccion del RAG en webhookWhatsApp (MAX_RAG_CHARS).
// Si se cambia alla, cambiar aca para que el semaforo siga diciendo la verdad.
const TOPE_RAG_CHARS = 24000;

// Precio de Claude Sonnet por millon de tokens de entrada (USD).
const USD_POR_MTOK_ENTRADA = 3;

const ETAPAS = ['calentamiento', 'descubrimiento', 'calificacion', 'propuesta', 'cierre'];

// Estimacion de tokens. No es el tokenizador real de Anthropic (ese vive en el servidor),
// pero para espanol la relacion ronda 3.6 caracteres por token. Se cruza con un conteo por
// palabras (~1.35 tokens por palabra) y se toma el mayor, que es el escenario conservador.
function estimarTokens(texto) {
  const t = String(texto || '');
  if (!t.trim()) return 0;
  const porChars = t.length / 3.6;
  const palabras = t.trim().split(/\s+/).length;
  const porPalabras = palabras * 1.35;
  return Math.round(Math.max(porChars, porPalabras));
}

const fmt = (n) => Number(n || 0).toLocaleString('es-CO');

function Stat({ label, value, sub, tono = 'normal' }) {
  const color = tono === 'alerta' ? 'text-red-600' : tono === 'ok' ? 'text-emerald-600' : 'text-gray-900';
  return (
    <div className="rounded-lg border bg-white p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function TokenCalculator() {
  const [texto, setTexto] = useState('');

  const { data: chunks = [] } = useQuery({
    queryKey: ['rag_chunks_tokens'],
    queryFn: () => ConocimientoRAG.list(),
  });

  const stats = useMemo(() => {
    const chars = texto.length;
    const palabras = texto.trim() ? texto.trim().split(/\s+/).length : 0;
    const tokens = estimarTokens(texto);
    return { chars, palabras, tokens, costo: (tokens / 1_000_000) * USD_POR_MTOK_ENTRADA };
  }, [texto]);

  // Peso real del RAG: cuanto pesa lo que Emma carga en cada etapa.
  const rag = useMemo(() => {
    const activos = (chunks || []).filter((c) => c.activo);
    const pesoDe = (c) => `[${c.titulo}]\n${c.contenido}\n\n`.length;
    const aplicaA = (c, etapa) => {
      const es = String(c.etapas || 'todas').split(',').map((s) => s.trim());
      return es.includes('todas') || es.includes(etapa);
    };
    const porEtapa = ETAPAS.map((etapa) => {
      const dela = activos.filter((c) => aplicaA(c, etapa));
      const chars = dela.reduce((a, c) => a + pesoDe(c), 0);
      return { etapa, chunks: dela.length, chars, tokens: estimarTokens('x'.repeat(chars)) };
    });
    const pesados = [...activos]
      .map((c) => ({ titulo: c.titulo, etapas: c.etapas || 'todas', prioridad: c.prioridad, chars: pesoDe(c) }))
      .sort((a, b) => b.chars - a.chars)
      .slice(0, 10);
    const siempre = activos.filter((c) => String(c.etapas || 'todas').split(',').map((s) => s.trim()).includes('todas'));
    return {
      total: activos.length,
      charsTodas: siempre.reduce((a, c) => a + pesoDe(c), 0),
      chunksTodas: siempre.length,
      porEtapa,
      pesados,
    };
  }, [chunks]);

  const etapaMasPesada = rag.porEtapa.reduce((max, e) => (e.chars > (max?.chars || 0) ? e : max), null);
  const seDesborda = etapaMasPesada && etapaMasPesada.chars > TOPE_RAG_CHARS;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Calculator className="w-6 h-6 text-violet-600" />
        <h1 className="text-[28px] font-bold tracking-tight text-foreground">Calculadora de tokens</h1>
      </div>
      <p className="text-sm text-muted-foreground -mt-4">
        Pega cualquier texto y mira cuánto pesa. Abajo, el peso real del conocimiento de Emma contra el tope que cabe en cada mensaje.
      </p>

      {/* Calculadora libre */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Calculator className="w-4 h-4" /> Texto libre
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={8}
            placeholder="Pega aquí una frase, un chunk del RAG o un prompt completo..."
            className="text-sm font-mono"
          />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Caracteres" value={fmt(stats.chars)} />
            <Stat label="Palabras" value={fmt(stats.palabras)} />
            <Stat label="Tokens (aprox.)" value={fmt(stats.tokens)} />
            <Stat label="Costo de entrada" value={`$${stats.costo.toFixed(5)}`} sub="USD por mensaje, Sonnet" />
          </div>
          <p className="text-[11px] text-gray-400">
            La estimación usa la relación típica del español (unos 3,6 caracteres por token) contrastada con el conteo por
            palabras, y se queda con el número más alto. El tokenizador exacto vive del lado de Anthropic, así que tómalo
            como una cota superior, no como una cifra al dedillo.
          </p>
        </CardContent>
      </Card>

      {/* Peso del RAG de Emma */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="w-4 h-4" /> Peso del conocimiento de Emma
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Stat label="Chunks activos" value={fmt(rag.total)} />
            <Stat
              label="Siempre presentes"
              value={`${fmt(rag.chunksTodas)} chunks`}
              sub={`${fmt(rag.charsTodas)} caracteres en toda conversación`}
            />
            <Stat
              label="Tope por mensaje"
              value={fmt(TOPE_RAG_CHARS)}
              sub="caracteres que caben en el RAG"
            />
          </div>

          {seDesborda && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-red-700">
                La etapa <strong>{etapaMasPesada.etapa}</strong> pesa {fmt(etapaMasPesada.chars)} caracteres y no cabe en el
                tope de {fmt(TOPE_RAG_CHARS)}. Los chunks de menor prioridad se están quedando por fuera: hay que recortar
                contenido o subir el tope en el código.
              </p>
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">Lo que carga Emma en cada etapa</p>
            <div className="space-y-2">
              {rag.porEtapa.map((e) => {
                const pct = Math.min(100, Math.round((e.chars / TOPE_RAG_CHARS) * 100));
                const apretado = pct >= 85;
                return (
                  <div key={e.etapa}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="capitalize text-gray-700">{e.etapa}</span>
                      <span className="text-gray-500 tabular-nums">
                        {e.chunks} chunks · {fmt(e.chars)} car. · ~{fmt(e.tokens)} tokens · {pct}%
                      </span>
                    </div>
                    <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${apretado ? 'bg-red-500' : 'bg-emerald-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">Los 10 chunks más pesados</p>
            <div className="border rounded-lg divide-y">
              {rag.pesados.map((c) => (
                <div key={c.titulo} className="flex items-center justify-between gap-3 p-2">
                  <div className="min-w-0">
                    <p className="text-xs text-gray-800 truncate">{c.titulo}</p>
                    <p className="text-[10px] text-gray-400">{c.etapas} · prioridad {c.prioridad}</p>
                  </div>
                  <Badge variant="secondary" className="tabular-nums flex-shrink-0">
                    {fmt(c.chars)} car.
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
