import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Empresa } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ArrowRight, AlertTriangle } from 'lucide-react';
import { parsearCSV, normalizarTexto } from '@/lib/csv';
import { ZonaArchivo, TablaMapeo, ResumenResultado, dominioDeEmail, limpiarDominio, esColumnaId, pareceIdNumerico, autoMapearCampos, armarNotasConExtras, parsearFecha } from './ImportarComun';

// Encabezados EXACTOS que exporta HubSpot para empresas (español e inglés)
const CAMPOS = [
  { key: 'nombre', label: 'Nombre', aliases: ['nombre de la empresa', 'company name', 'nombre', 'name', 'empresa', 'company', 'razon social'] },
  { key: 'dominio_web', label: 'Dominio web (logo)', aliases: ['nombre de dominio de la empresa', 'company domain name', 'url del sitio web', 'website url', 'sitio web', 'website', 'dominio', 'web'] },
  { key: 'sector', label: 'Sector', aliases: ['sector', 'industria', 'industry'] },
  { key: 'ciudad', label: 'Ciudad', aliases: ['ciudad', 'city'] },
  { key: 'pais', label: 'País', aliases: ['pais/region', 'country/region', 'pais', 'country'] },
  { key: 'direccion', label: 'Dirección', aliases: ['direccion', 'street address', 'address', 'calle'] },
  { key: 'telefono', label: 'Teléfono', aliases: ['numero de telefono', 'phone number', 'telefono', 'phone'] },
  { key: 'email', label: 'Email', aliases: ['correo electronico', 'correo', 'email'] },
  { key: 'propietario', label: 'Propietario', aliases: ['propietario del registro de empresa', 'company owner', 'propietario de la empresa', 'propietario', 'owner'] },
  { key: 'fecha_creacion', label: 'Fecha de creación', aliases: ['fecha de creacion', 'create date', 'created date'] },
  { key: 'ultima_actividad', label: 'Última actividad', aliases: ['ultima actividad', 'last activity date', 'fecha de la ultima actividad'] },
  { key: 'notas', label: 'Notas', aliases: ['descripcion', 'description', 'notas', 'notes', 'acerca de'] },
];

// El sector de Empresa es enum: mapear valores libres a los del CRM
const SECTORES_ENUM = ['Academia', 'Bodegas', 'Industria_Petrolera', 'Manufactura', 'Clubes', 'Locativos', 'Otro'];
function mapearSector(valor) {
  if (!valor) return undefined;
  const v = normalizarTexto(valor);
  const match = SECTORES_ENUM.find(s => normalizarTexto(s.replace(/_/g, ' ')) === v || v.includes(normalizarTexto(s.replace(/_/g, ' '))));
  return match || 'Otro';
}


/**
 * Importación masiva de empresas desde CSV. Dedup por nombre normalizado.
 * Si no viene columna de dominio, se deriva del email para que salga el logo.
 */
export default function ImportarEmpresasModal({ open, onOpenChange }) {
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

    // La empresa se identifica por dominio + nombre: si coincide cualquiera
    // de los dos con una existente, es la misma empresa (se omite)
    const existentes = await Empresa.list();
    const nombres = new Set(existentes.map(e => normalizarTexto(e.nombre)).filter(Boolean));
    const dominios = new Set(existentes.map(e => limpiarDominio(e.dominio_web)).filter(Boolean));

    const origen = {};
    for (const [h, campo] of Object.entries(mapa)) if (campo) origen[campo] = h;

    // Columnas sin campo propio que se guardan en notas (para traer todo)
    const columnasExtras = extrasANotas
      ? encabezados.filter(h => !mapa[h] && !esColumnaId(normalizarTexto(h)))
      : [];

    let creadas = 0, duplicadas = 0;
    const errores = [];

    for (let i = 0; i < filas.length; i++) {
      const fila = filas[i];
      const val = (campo) => origen[campo] ? fila[origen[campo]] : '';

      try {
        const nombre = val('nombre');
        if (!nombre) { errores.push(`Fila ${i + 2}: sin nombre`); continue; }
        if (pareceIdNumerico(nombre)) { errores.push(`Fila ${i + 2}: "${nombre}" parece un ID de HubSpot, no un nombre — revisa el mapeo`); continue; }

        // Dominio para identificar y para el logo: columna > email corporativo
        const email = val('email');
        const dominio = limpiarDominio(val('dominio_web')) || dominioDeEmail(email);

        const clave = normalizarTexto(nombre);
        if (nombres.has(clave) || (dominio && dominios.has(dominio))) { duplicadas++; continue; }

        await Empresa.create({
          nombre,
          dominio_web: dominio || undefined,
          sector: mapearSector(val('sector')),
          ciudad: val('ciudad') || undefined,
          pais: val('pais') || 'Colombia',
          direccion: val('direccion') || undefined,
          telefono: val('telefono') || undefined,
          email: email || undefined,
          propietario: val('propietario') || undefined,
          fecha_creacion: parsearFecha(val('fecha_creacion')),
          ultima_actividad: parsearFecha(val('ultima_actividad')),
          notas: armarNotasConExtras(val('notas'), fila, columnasExtras),
          estado: 'Prospecto',
        });
        nombres.add(clave);
        if (dominio) dominios.add(dominio);
        creadas++;
      } catch (err) {
        errores.push(`Fila ${i + 2}: ${String(err?.message || err).slice(0, 120)}`);
      }
      setProgreso(i + 1);
    }

    qc.invalidateQueries({ queryKey: ['empresas'] });
    setResultado({ creadas, duplicadas, errores });
    setImportando(false);
    setPaso(3);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!importando) { onOpenChange(o); if (!o) reset(); } }}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar empresas {paso === 2 ? '— Mapeo de columnas' : paso === 3 ? '— Resultado' : ''}</DialogTitle>
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

            <label className="flex items-start gap-2 text-sm cursor-pointer bg-muted/30 rounded-xl p-3">
              <input type="checkbox" checked={extrasANotas} onChange={e => setExtrasANotas(e.target.checked)} className="mt-0.5" />
              <span>
                <span className="font-medium">Traer TODO lo del CSV</span>
                <span className="text-xs text-muted-foreground block">
                  Las columnas ignoradas se guardan en las notas de la empresa como "Columna: valor" —
                  no se pierde ningún dato de HubSpot. Las columnas de ID se excluyen.
                </span>
              </span>
            </label>

            {!tieneNombre && (
              <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                Mapea al menos la columna del Nombre para poder importar.
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              El dominio hace que salga el logo de la empresa — si no viene en el CSV se deriva del email corporativo.
              Las duplicadas se detectan por dominio o nombre y se omiten. El sector se mapea a las categorías del CRM.
            </p>
          </div>
        )}

        {paso === 3 && resultado && (
          <ResumenResultado
            metricas={[
              { label: 'Empresas creadas', valor: resultado.creadas, cls: 'bg-green-500/10', valorCls: 'text-green-600' },
              { label: 'Duplicadas omitidas', valor: resultado.duplicadas, cls: 'bg-muted' },
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
