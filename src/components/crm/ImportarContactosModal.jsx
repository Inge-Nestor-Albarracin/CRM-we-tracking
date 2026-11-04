import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Contacto, Empresa } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ArrowRight, AlertTriangle, Building2 } from 'lucide-react';
import { parsearCSV, normalizarTexto } from '@/lib/csv';
import { ZonaArchivo, TablaMapeo, ResumenResultado, dominioDeEmail, limpiarDominio, esColumnaId, pareceIdNumerico, autoMapearCampos, parsearFecha, armarNotasConExtras } from './ImportarComun';

// Campos destino del Contacto con los encabezados EXACTOS que exporta HubSpot
// (español e inglés) más variantes comunes de Excel/Sheets
const CAMPOS = [
  { key: 'nombre', label: 'Nombre', aliases: ['nombre', 'first name', 'nombre de pila', 'primer nombre', 'nombre completo', 'full name', 'contact name', 'name'] },
  { key: 'apellido', label: 'Apellido (se une al nombre)', aliases: ['apellidos', 'apellido', 'apellido(s)', 'last name'] },
  { key: 'telefono', label: 'Teléfono', aliases: ['numero de telefono', 'phone number', 'numero de telefono movil', 'mobile phone number', 'telefono movil', 'telefono', 'celular', 'movil', 'whatsapp', 'phone'] },
  { key: 'email', label: 'Email', aliases: ['correo electronico', 'email address', 'correo', 'email', 'e-mail'] },
  { key: 'empresa', label: 'Empresa (se vincula/crea)', aliases: ['empresa asociada', 'primary associated company', 'nombre de la empresa asociada', 'associated company', 'nombre de la empresa', 'company name', 'empresa', 'compania', 'company'] },
  { key: 'dominio_empresa', label: 'Dominio de la empresa', aliases: ['nombre de dominio de la empresa', 'company domain name', 'url del sitio web', 'website url', 'sitio web', 'website', 'dominio', 'web'] },
  { key: 'cargo', label: 'Cargo', aliases: ['cargo', 'job title', 'titulo del puesto', 'puesto'] },
  { key: 'sector', label: 'Sector', aliases: ['sector', 'industria', 'industry'] },
  { key: 'ciudad', label: 'Ciudad', aliases: ['ciudad', 'city'] },
  { key: 'etapa_pipeline', label: 'Etapa', aliases: ['etapa del ciclo de vida', 'lifecycle stage', 'estado del lead', 'lead status', 'etapa del pipeline', 'etapa'] },
  { key: 'broker_asignado', label: 'Ejecutivo asignado', aliases: ['propietario del contacto', 'contact owner', 'propietario', 'owner', 'ejecutivo asignado'] },
  { key: 'fecha_primer_contacto', label: 'Fecha de creación', aliases: ['fecha de creacion', 'create date', 'fecha de creacion del objeto', 'created date', 'fecha de primer contacto'] },
  { key: 'ultima_actividad', label: 'Última actividad', aliases: ['ultima actividad', 'last activity date', 'fecha de la ultima actividad'] },
  { key: 'presupuesto', label: 'Presupuesto', aliases: ['presupuesto', 'budget'] },
  { key: 'notas', label: 'Notas', aliases: ['notas', 'notes', 'comentarios', 'message'] },
];

const ETAPAS_VALIDAS = ['Lead', 'Calificado', 'Propuesta', 'Cierre', 'Cliente', 'Descalificado'];

// Mapea la etapa del ciclo de vida de HubSpot a las etapas del CRM
function mapearEtapa(valor) {
  const v = normalizarTexto(valor);
  if (!v) return 'Lead';
  const exacta = ETAPAS_VALIDAS.find(e => normalizarTexto(e) === v);
  if (exacta) return exacta;
  if (v.includes('customer') || v.includes('cliente')) return 'Cliente';
  if (v.includes('qualified') || v.includes('calificado')) return 'Calificado';
  if (v.includes('opportunity') || v.includes('oportunidad')) return 'Propuesta';
  if (v.includes('unqualified') || v.includes('descalificado') || v.includes('perdido')) return 'Descalificado';
  return 'Lead';
}

function soloDigitos(t) {
  return (t || '').replace(/\D/g, '');
}

/**
 * Importación masiva de contactos desde CSV (estilo HubSpot):
 * archivo → mapeo → importación con vinculación/creación de empresas
 * (con dominio derivado del email del contacto para que salga el logo).
 */
export default function ImportarContactosModal({ open, onOpenChange }) {
  const qc = useQueryClient();

  const [paso, setPaso] = useState(1);
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [encabezados, setEncabezados] = useState([]);
  const [filas, setFilas] = useState([]);
  const [mapa, setMapa] = useState({});
  const [crearEmpresas, setCrearEmpresas] = useState(true);
  const [extrasANotas, setExtrasANotas] = useState(true);
  const [progreso, setProgreso] = useState(0);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState(null);

  function reset() {
    setPaso(1); setNombreArchivo(''); setEncabezados([]); setFilas([]);
    setMapa({}); setProgreso(0); setImportando(false); setResultado(null);
    setCrearEmpresas(true); setExtrasANotas(true);
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

    // Datos existentes para dedup y vinculación
    const [contactosExistentes, empresasExistentes] = await Promise.all([
      Contacto.list(),
      Empresa.list(),
    ]);
    const emails = new Set(contactosExistentes.map(c => normalizarTexto(c.email)).filter(Boolean));
    const telefonos = new Set(contactosExistentes.map(c => soloDigitos(c.telefono)).filter(t => t.length >= 7));
    // La empresa se identifica por dominio + nombre
    const empresasPorNombre = {};
    const empresasPorDominio = {};
    for (const e of empresasExistentes) {
      empresasPorNombre[normalizarTexto(e.nombre)] = e;
      const d = limpiarDominio(e.dominio_web);
      if (d) empresasPorDominio[d] = e;
    }

    // Invertir el mapa: campo destino -> encabezado CSV
    const origen = {};
    for (const [h, campo] of Object.entries(mapa)) if (campo) origen[campo] = h;

    // Columnas sin campo propio que se guardan en notas (para traer todo)
    const columnasExtras = extrasANotas
      ? encabezados.filter(h => !mapa[h] && !esColumnaId(normalizarTexto(h)))
      : [];

    let creados = 0, empresasCreadas = 0, duplicados = 0;
    const errores = [];

    for (let i = 0; i < filas.length; i++) {
      const fila = filas[i];
      const val = (campo) => origen[campo] ? fila[origen[campo]] : '';

      try {
        let nombre = val('nombre');
        const apellido = val('apellido');
        if (apellido) nombre = `${nombre} ${apellido}`.trim();
        if (!nombre) { errores.push(`Fila ${i + 2}: sin nombre`); continue; }

        const email = val('email');
        const telefono = val('telefono');

        // Dedup por email o teléfono
        const emailN = normalizarTexto(email);
        const telN = soloDigitos(telefono);
        if ((emailN && emails.has(emailN)) || (telN.length >= 7 && telefonos.has(telN))) {
          duplicados++;
          continue;
        }

        // Empresa: se identifica por dominio + nombre (el dominio manda:
        // si otro contacto de bodegasnorte.com ya creó la empresa, se vincula
        // a esa aunque el nombre venga escrito distinto en el CSV).
        // Un nombre puramente numérico es un Record ID de HubSpot, no una empresa.
        const nombreEmpresa = pareceIdNumerico(val('empresa')) ? '' : val('empresa');
        let empresaId;
        if (nombreEmpresa && crearEmpresas) {
          const dominio = limpiarDominio(val('dominio_empresa')) || dominioDeEmail(email);
          const clave = normalizarTexto(nombreEmpresa);
          let emp = (dominio && empresasPorDominio[dominio]) || empresasPorNombre[clave];
          if (!emp) {
            emp = await Empresa.create({
              nombre: nombreEmpresa,
              estado: 'Prospecto',
              dominio_web: dominio || undefined,
            });
            empresasCreadas++;
          } else {
            // Reparar empresas existentes: completar dominio faltante y
            // reemplazar nombres que quedaron como ID numérico
            const patch = {};
            if (dominio && !emp.dominio_web) patch.dominio_web = dominio;
            if (pareceIdNumerico(emp.nombre)) patch.nombre = nombreEmpresa;
            if (Object.keys(patch).length) {
              await Empresa.update(emp.id, patch);
              Object.assign(emp, patch);
            }
          }
          empresasPorNombre[clave] = emp;
          if (dominio) empresasPorDominio[dominio] = emp;
          empresaId = emp.id;
        }

        const etapa = mapearEtapa(val('etapa_pipeline'));

        const presupuestoCsv = val('presupuesto');
        const presupuesto = presupuestoCsv ? Number(soloDigitos(presupuestoCsv)) || undefined : undefined;

        await Contacto.create({
          nombre,
          telefono: telefono || undefined,
          email: email || undefined,
          empresa: nombreEmpresa || undefined,
          empresa_id: empresaId,
          cargo: val('cargo') || undefined,
          sector: val('sector') || undefined,
          ciudad: val('ciudad') || undefined,
          etapa_pipeline: etapa,
          broker_asignado: val('broker_asignado') || undefined,
          presupuesto,
          notas: armarNotasConExtras(val('notas'), fila, columnasExtras),
          canal_adquisicion: 'Importacion',
          fecha_primer_contacto: parsearFecha(val('fecha_primer_contacto')) || new Date().toISOString().split('T')[0],
          ultima_actividad: parsearFecha(val('ultima_actividad')),
        });

        if (emailN) emails.add(emailN);
        if (telN.length >= 7) telefonos.add(telN);
        creados++;
      } catch (err) {
        errores.push(`Fila ${i + 2}: ${String(err?.message || err).slice(0, 120)}`);
      }
      setProgreso(i + 1);
    }

    qc.invalidateQueries({ queryKey: ['contactos'] });
    qc.invalidateQueries({ queryKey: ['empresas'] });
    setResultado({ creados, empresasCreadas, duplicados, errores });
    setImportando(false);
    setPaso(3);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!importando) { onOpenChange(o); if (!o) reset(); } }}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar contactos {paso === 2 ? '— Mapeo de columnas' : paso === 3 ? '— Resultado' : ''}</DialogTitle>
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
              <input type="checkbox" checked={crearEmpresas} onChange={e => setCrearEmpresas(e.target.checked)} className="mt-0.5" />
              <span>
                <span className="flex items-center gap-1 font-medium"><Building2 className="w-3.5 h-3.5" /> Vincular empresas automáticamente</span>
                <span className="text-xs text-muted-foreground">
                  Si la empresa existe se vincula; si no, se crea con el <strong>dominio del email corporativo</strong> del
                  contacto (o la columna de dominio si la mapeas) para que salga su logo — igual que HubSpot.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2 text-sm cursor-pointer bg-muted/30 rounded-xl p-3">
              <input type="checkbox" checked={extrasANotas} onChange={e => setExtrasANotas(e.target.checked)} className="mt-0.5" />
              <span>
                <span className="font-medium">Traer TODO lo del CSV</span>
                <span className="text-xs text-muted-foreground block">
                  Las columnas ignoradas (sin campo propio en el CRM) se guardan en las notas del contacto
                  como "Columna: valor" — no se pierde ningún dato de HubSpot. Las columnas de ID se excluyen.
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
              Los duplicados se detectan por email o teléfono y se omiten — nunca se sobreescriben datos existentes.
            </p>
          </div>
        )}

        {paso === 3 && resultado && (
          <ResumenResultado
            metricas={[
              { label: 'Contactos creados', valor: resultado.creados, cls: 'bg-green-500/10', valorCls: 'text-green-600' },
              { label: 'Empresas nuevas', valor: resultado.empresasCreadas, cls: 'bg-blue-500/10', valorCls: 'text-blue-600' },
              { label: 'Duplicados omitidos', valor: resultado.duplicados, cls: 'bg-muted' },
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
