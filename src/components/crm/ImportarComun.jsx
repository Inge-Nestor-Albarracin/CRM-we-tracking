import { useState, useRef, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Upload, FileSpreadsheet, CheckCircle2, Search } from 'lucide-react';
import { normalizarTexto } from '@/lib/csv';

/** Zona de carga con drag & drop y click. Llama onTexto(contenido, nombreArchivo). */
export function ZonaArchivo({ onTexto }) {
  const fileRef = useRef(null);
  const [arrastrando, setArrastrando] = useState(false);

  function leer(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onTexto(String(ev.target?.result || ''), file.name);
    reader.readAsText(file, 'utf-8');
  }

  return (
    <div className="py-2">
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => { leer(e.target.files?.[0]); e.target.value = ''; }}
      />
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastrando(false); leer(e.dataTransfer.files?.[0]); }}
        className={`w-full border-2 border-dashed rounded-2xl py-14 flex flex-col items-center gap-3 cursor-pointer transition-colors ${
          arrastrando ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'
        }`}
      >
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Upload className="w-6 h-6 text-primary" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium">Arrastra tu CSV aquí o haz clic para buscarlo</p>
          <p className="text-xs text-muted-foreground mt-1">
            Compatible con exports de HubSpot, Excel y Google Sheets
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Tabla de mapeo pensada para CSVs grandes (HubSpot exporta 50+ columnas):
 * las columnas detectadas van arriba con check verde, las demás quedan
 * colapsadas detrás de "Ver columnas ignoradas" y hay buscador.
 */
export function TablaMapeo({ nombreArchivo, encabezados, filas, mapa, setMapa, campos }) {
  const [busqueda, setBusqueda] = useState('');
  const [mostrarIgnoradas, setMostrarIgnoradas] = useState(false);

  const camposUsados = new Set(Object.values(mapa).filter(Boolean));
  const mapeadas = encabezados.filter(h => mapa[h]);
  const ignoradas = encabezados.filter(h => !mapa[h]);

  const filtrar = (lista) => {
    if (!busqueda.trim()) return lista;
    const q = normalizarTexto(busqueda);
    return lista.filter(h => normalizarTexto(h).includes(q));
  };

  const ejemplos = useMemo(() => {
    const out = {};
    for (const h of encabezados) {
      out[h] = filas.slice(0, 20).map(f => f[h]).filter(v => v && v.trim()).slice(0, 2);
    }
    return out;
  }, [encabezados, filas]);

  const Fila = ({ h }) => (
    <div className="flex items-center gap-3 px-3 py-2 border-b last:border-0">
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${mapa[h] ? 'bg-green-500' : 'bg-muted-foreground/20'}`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{h}</p>
        <p className="text-[11px] text-muted-foreground truncate">
          {ejemplos[h]?.length ? ejemplos[h].join(' · ') : 'sin datos'}
        </p>
      </div>
      <select
        value={mapa[h] || ''}
        onChange={e => setMapa(m => ({ ...m, [h]: e.target.value }))}
        className={`w-52 h-8 px-2 text-xs rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-primary flex-shrink-0 ${
          mapa[h] ? 'border-green-500/40 font-medium' : 'border-border text-muted-foreground'
        }`}
      >
        <option value="">— Ignorar —</option>
        {campos.map(c => (
          <option key={c.key} value={c.key} disabled={camposUsados.has(c.key) && mapa[h] !== c.key}>
            {c.label}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <FileSpreadsheet className="w-4 h-4 text-green-600 flex-shrink-0" />
        <span className="font-medium truncate max-w-56">{nombreArchivo}</span>
        <Badge variant="secondary" className="text-xs">{filas.length} filas</Badge>
        <Badge className="text-xs bg-green-100 text-green-700 border-transparent">
          <CheckCircle2 className="w-3 h-3 mr-1" /> {mapeadas.length} columnas mapeadas
        </Badge>
        {ignoradas.length > 0 && (
          <Badge variant="outline" className="text-xs">{ignoradas.length} ignoradas</Badge>
        )}
      </div>

      {encabezados.length > 8 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar columna..."
            className="pl-8 h-8 text-xs"
          />
        </div>
      )}

      <div className="border rounded-xl overflow-hidden">
        <div className="px-3 py-1.5 bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Se importan ({filtrar(mapeadas).length})
        </div>
        <div className="max-h-56 overflow-y-auto">
          {filtrar(mapeadas).map(h => <Fila key={h} h={h} />)}
          {filtrar(mapeadas).length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              Ninguna columna mapeada — asigna campos abajo
            </p>
          )}
        </div>
      </div>

      {ignoradas.length > 0 && (
        <div className="border rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setMostrarIgnoradas(v => !v)}
            className="w-full px-3 py-2 bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide text-left hover:bg-muted/60 transition-colors"
          >
            {mostrarIgnoradas ? '▾' : '▸'} Columnas ignoradas ({ignoradas.length}) — clic para {mostrarIgnoradas ? 'ocultar' : 'revisar'}
          </button>
          {mostrarIgnoradas && (
            <div className="max-h-48 overflow-y-auto">
              {filtrar(ignoradas).map(h => <Fila key={h} h={h} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Resumen final de la importación con métricas y errores. */
export function ResumenResultado({ metricas, errores }) {
  return (
    <div className="space-y-3 py-2">
      <div className={`grid gap-3 text-center ${metricas.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {metricas.map(m => (
          <div key={m.label} className={`rounded-xl p-4 ${m.cls}`}>
            <p className={`text-2xl font-bold ${m.valorCls || ''}`}>{m.valor}</p>
            <p className="text-xs text-muted-foreground">{m.label}</p>
          </div>
        ))}
      </div>
      {errores.length > 0 && (
        <div className="border border-red-200 bg-red-50 rounded-lg p-3">
          <p className="text-xs font-medium text-red-700 mb-1">{errores.length} fila(s) con error:</p>
          <ul className="text-xs text-red-600 space-y-0.5 max-h-32 overflow-y-auto">
            {errores.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
            {errores.length > 10 && <li>… y {errores.length - 10} más</li>}
          </ul>
        </div>
      )}
      <div className="flex items-center gap-2 text-sm text-green-700">
        <CheckCircle2 className="w-4 h-4" /> Importación completa
      </div>
    </div>
  );
}

// Dominios de correo personales que NO identifican una empresa
const DOMINIOS_GENERICOS = new Set([
  'gmail.com', 'hotmail.com', 'hotmail.es', 'outlook.com', 'outlook.es',
  'yahoo.com', 'yahoo.es', 'icloud.com', 'live.com', 'msn.com', 'aol.com',
  'proton.me', 'protonmail.com', 'me.com', 'mail.com',
]);

/** Deriva el dominio corporativo de un email (estilo HubSpot). '' si es correo personal. */
export function dominioDeEmail(email) {
  const d = (String(email || '').split('@')[1] || '').toLowerCase().trim();
  if (!d || DOMINIOS_GENERICOS.has(d)) return '';
  return d;
}

/** Limpia un dominio/URL: quita protocolo, www y rutas. */
export function limpiarDominio(valor) {
  return String(valor || '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .trim();
}

/** True si el encabezado es una columna de IDs (Record ID de HubSpot, etc). Nunca se auto-mapea. */
export function esColumnaId(encabezadoNormalizado) {
  return /\bids?\b/.test(encabezadoNormalizado) || encabezadoNormalizado.includes('record id') || encabezadoNormalizado.includes('id de registro');
}

/**
 * Auto-mapeo en dos pases:
 * 1) coincidencia EXACTA del encabezado con un alias
 * 2) por inclusión, eligiendo el alias más largo entre TODOS los campos
 *    (así "Nombre de dominio de la empresa" gana para dominio y no para nombre)
 */
export function autoMapearCampos(encabezados, campos) {
  const mapa = {};
  const usados = new Set();

  for (const h of encabezados) {
    const hn = normalizarTexto(h);
    if (esColumnaId(hn)) { mapa[h] = ''; continue; }
    const campo = campos.find(c => !usados.has(c.key) && c.aliases.some(a => hn === a));
    if (campo) { mapa[h] = campo.key; usados.add(campo.key); }
  }

  for (const h of encabezados) {
    if (mapa[h] !== undefined) continue;
    const hn = normalizarTexto(h);
    let mejor = null, mejorLen = 0;
    for (const c of campos) {
      if (usados.has(c.key)) continue;
      for (const a of c.aliases) {
        if (hn.includes(a) && a.length > mejorLen) { mejor = c; mejorLen = a.length; }
      }
    }
    if (mejor) { mapa[h] = mejor.key; usados.add(mejor.key); }
    else mapa[h] = '';
  }
  return mapa;
}

/** Fecha de HubSpot ("2024-05-06 14:32" o ISO) a YYYY-MM-DD. */
export function parsearFecha(valor) {
  const v = String(valor || '').trim();
  if (!v) return undefined;
  const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d.toISOString().split('T')[0];
}

/**
 * Arma las notas del registro: las notas mapeadas + las columnas sin campo
 * propio como "Encabezado: valor" (para traerse TODO lo del CSV).
 */
export function armarNotasConExtras(notasBase, fila, columnasExtras) {
  const lineas = [];
  if (notasBase) lineas.push(notasBase);
  for (const h of columnasExtras) {
    const v = (fila[h] || '').trim();
    if (v) lineas.push(`${h}: ${v}`);
  }
  // Límite de tamaño de campo string en Base44
  return lineas.join('\n').slice(0, 3000) || undefined;
}

/** True si el valor parece un ID numérico de HubSpot en vez de un nombre real. */
export function pareceIdNumerico(valor) {
  return /^\d{6,}$/.test(String(valor || '').trim());
}
