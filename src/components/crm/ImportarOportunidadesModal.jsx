import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Oportunidad, Empresa } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ArrowRight, AlertTriangle, Building2 } from 'lucide-react';
import { parsearCSV, normalizarTexto } from '@/lib/csv';
import { ZonaArchivo, TablaMapeo, ResumenResultado, esColumnaId, pareceIdNumerico, autoMapearCampos, parsearFecha, armarNotasConExtras } from './ImportarComun';
import { ETAPAS_CERRADAS_OP } from './OportunidadKanban';

// Encabezados EXACTOS del export de negocios de HubSpot (español e inglés)
const CAMPOS = [
  { key: 'nombre', label: 'Nombre del negocio', aliases: ['nombre del negocio', 'deal name', 'negocio', 'nombre'] },
  { key: 'etapa', label: 'Etapa del negocio', aliases: ['etapa del negocio', 'deal stage', 'etapa'] },
  { key: 'valor', label: 'Valor', aliases: ['valor', 'amount', 'importe', 'monto'] },
  { key: 'fecha_cierre', label: 'Fecha de cierre', aliases: ['fecha de cierre', 'close date'] },
  { key: 'responsable', label: 'Propietario del negocio', aliases: ['propietario del negocio', 'deal owner', 'propietario', 'owner'] },
  { key: 'empresa', label: 'Empresa asociada', aliases: ['empresa asociada', 'associated company', 'nombre de la empresa asociada', 'empresa', 'company'] },
  { key: 'descripcion', label: 'Descripción', aliases: ['descripcion', 'description', 'notas', 'notes'] },
];

// Mapea la etapa del negocio de HubSpot a las etapas del pipeline
function mapearEtapaNegocio(valor) {
  const v = normalizarTexto(valor);
  if (!v) return 'Visita_Inicial';
  if (v.includes('visita inicial')) return 'Visita_Inicial';
  if (v.includes('creacion de cotizacion') || v.includes('crear cotizacion')) return 'Creacion_Cotizacion';
  if (v.includes('cotizacion enviada')) return 'Cotizacion_Enviada';
  if (v.includes('post cotizacion')) return 'Visita_Post_Cotizacion';
  if (v.includes('convencido') || v.includes('responsable de decisiones')) return 'Decisor_Convencido';
  if (v.includes('perdido') || v.includes('closed lost') || v.includes('lost')) return 'Cierre_Perdido';
  if (v.includes('ganado') || v.includes('closed won') || v.includes('won')) return 'Cierre_Ganado';
  return 'Visita_Inicial';
}

/**
 * Importación masiva de negocios (Oportunidades) desde el CSV de HubSpot.
 * Vincula la empresa por la columna asociada o buscando el nombre de una
 * empresa existente dentro del nombre del negocio ("Cotización de Geoevents").
 */
export default function ImportarOportunidadesModal({ open, onOpenChange }) {
  const qc = useQueryClient();

  const [paso, setPaso] = useState(1);
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [encabezados, setEncabezados] = useState([]);
  const [filas, setFilas] = useState([]);
  const [mapa, setMapa] = useState({});
  const [extrasANotas, setExtrasANotas] = useState(true);
  const [progreso, setProgreso] = useState(0);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState(null);

  function reset() {
    setPaso(1); setNombreArchivo(''); setEncabezados([]); setFilas([]);
    setMapa({}); setProgreso(0); setImportando(false); setResultado(null);
    setExtrasANotas(true);
  }

  function onTexto(texto, nombre) {
    const { encabezados: enc, filas: fls } = parsearCSV(texto);
    if (enc.length === 0 || fls.length === 0) {
      alert('El archivo no tiene datos. Verifica que sea un CSV con encabezados.');
      return;
    }
    setNombreArchivo(nombre);
    setEncabezados(enc);
    setFilas(fls);
    setMapa(autoMapearCampos(enc, CAMPOS));
    setPaso(2);
  }

  const camposMapeados = new Set(Object.values(mapa).filter(Boolean));
  const tieneNombre = camposMapeados.has('nombre');

  async function importar() {
    setImportando(true);
    setProgreso(0);

    const [existentes, empresas] = await Promise.all([
      Oportunidad.list(),
      Empresa.list(),
    ]);
    const nombresExistentes = new Set(existentes.map(o => normalizarTexto(o.nombre)).filter(Boolean));

    // Para vincular por mención: empresas ordenadas por nombre más largo primero
    // (así "Club Buenaventura" gana sobre "Club" si existieran ambas)
    const empresasOrdenadas = empresas
      .map(e => ({ ...e, nombreNorm: normalizarTexto(e.nombre) }))
      .filter(e => e.nombreNorm.length >= 4)
      .sort((a, b) => b.nombreNorm.length - a.nombreNorm.length);

    function vincularEmpresa(nombreNegocio, empresaCsv) {
      // 1) Columna de empresa asociada del CSV
      if (empresaCsv && !pareceIdNumerico(empresaCsv)) {
        const clave = normalizarTexto(empresaCsv);
        const exacta = empresas.find(e => normalizarTexto(e.nombre) === clave);
        if (exacta) return exacta.id;
      }
      // 2) El nombre de una empresa existente aparece dentro del nombre del negocio
      const negocioNorm = normalizarTexto(nombreNegocio);
      const mencionada = empresasOrdenadas.find(e => negocioNorm.includes(e.nombreNorm));
      return mencionada?.id;
    }

    const origen = {};
    for (const [h, campo] of Object.entries(mapa)) if (campo) origen[campo] = h;

    const columnasExtras = extrasANotas
      ? encabezados.filter(h => !mapa[h] && !esColumnaId(normalizarTexto(h)))
      : [];

    let creadas = 0, vinculadas = 0, duplicadas = 0;
    const errores = [];

    for (let i = 0; i < filas.length; i++) {
      const fila = filas[i];
      const val = (campo) => origen[campo] ? fila[origen[campo]] : '';

      try {
        const nombre = val('nombre');
        if (!nombre) { errores.push(`Fila ${i + 2}: sin nombre`); continue; }
        if (pareceIdNumerico(nombre)) { errores.push(`Fila ${i + 2}: "${nombre}" parece un ID — revisa el mapeo`); continue; }

        const clave = normalizarTexto(nombre);
        if (nombresExistentes.has(clave)) { duplicadas++; continue; }

        const etapa = mapearEtapaNegocio(val('etapa'));
        const cerrada = ETAPAS_CERRADAS_OP.includes(etapa);
        const fechaCierre = parsearFecha(val('fecha_cierre'));

        const valorCrudo = String(val('valor') || '').replace(/[^\d.]/g, '');
        const valor = valorCrudo ? Math.round(parseFloat(valorCrudo)) : 0;

        const empresaId = vincularEmpresa(nombre, val('empresa'));
        if (empresaId) vinculadas++;

        await Oportunidad.create({
          nombre,
          empresa_id: empresaId || undefined,
          etapa,
          valor_estimado: valor > 0 ? valor : undefined,
          moneda: 'COP',
          responsable: val('responsable') || undefined,
          fecha_cierre_estimada: !cerrada ? fechaCierre : undefined,
          fecha_cierre_real: cerrada ? fechaCierre : undefined,
          origen: 'Importacion',
          descripcion: armarNotasConExtras(val('descripcion'), fila, columnasExtras),
        });

        nombresExistentes.add(clave);
        creadas++;
      } catch (err) {
        errores.push(`Fila ${i + 2}: ${String(err?.message || err).slice(0, 120)}`);
      }
      setProgreso(i + 1);
    }

    qc.invalidateQueries({ queryKey: ['oportunidades'] });
    setResultado({ creadas, vinculadas, duplicadas, errores });
    setImportando(false);
    setPaso(3);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!importando) { onOpenChange(o); if (!o) reset(); } }}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar negocios {paso === 2 ? '— Mapeo de columnas' : paso === 3 ? '— Resultado' : ''}</DialogTitle>
        </DialogHeader>

        {paso === 1 && <ZonaArchivo onTexto={onTexto} />}

        {paso === 2 && (
          <div className="space-y-4 py-1">
            <TablaMapeo
              nombreArchivo={nombreArchivo}
              encabezados={encabezados}
              filas={filas}
              mapa={mapa}
              setMapa={setMapa}
              campos={CAMPOS}
            />

            <div className="flex items-start gap-2 text-sm bg-muted/30 rounded-xl p-3">
              <Building2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span className="text-xs text-muted-foreground">
                <strong className="text-foreground">Vinculación con empresas:</strong> cada negocio se conecta a su empresa
                si viene la columna de empresa asociada, o si el nombre de una empresa existente aparece dentro del
                nombre del negocio (ej: "Cotización de <strong>Geoevents</strong>"). Las etapas de HubSpot
                (Visita Inicial, Creación de Cotización, Cotización Enviada, Visita Post Cotización,
                Responsable de decisiones convencido, Cierre) se mapean directo al pipeline.
              </span>
            </div>

            <label className="flex items-start gap-2 text-sm cursor-pointer bg-muted/30 rounded-xl p-3">
              <input type="checkbox" checked={extrasANotas} onChange={e => setExtrasANotas(e.target.checked)} className="mt-0.5" />
              <span>
                <span className="font-medium">Traer TODO lo del CSV</span>
                <span className="text-xs text-muted-foreground block">
                  Las columnas ignoradas se guardan en la descripción del negocio como "Columna: valor".
                </span>
              </span>
            </label>

            {!tieneNombre && (
              <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                Mapea al menos la columna del Nombre del negocio para poder importar.
              </div>
            )}
          </div>
        )}

        {paso === 3 && resultado && (
          <ResumenResultado
            metricas={[
              { label: 'Negocios creados', valor: resultado.creadas, cls: 'bg-green-500/10', valorCls: 'text-green-600' },
              { label: 'Vinculados a empresa', valor: resultado.vinculadas, cls: 'bg-blue-500/10', valorCls: 'text-blue-600' },
              { label: 'Duplicados omitidos', valor: resultado.duplicadas, cls: 'bg-muted' },
            ]}
            errores={resultado.errores}
          />
        )}

        <DialogFooter>
          {paso === 2 && (
            <>
              <Button variant="outline" onClick={reset} disabled={importando}>Otro archivo</Button>
              <Button onClick={importar} disabled={!tieneNombre || importando}>
                {importando
                  ? `Importando ${progreso}/${filas.length}...`
                  : <>Importar {filas.length} filas <ArrowRight className="w-3.5 h-3.5 ml-1" /></>}
              </Button>
            </>
          )}
          {paso === 3 && (
            <Button onClick={() => { onOpenChange(false); reset(); }}>Listo</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
