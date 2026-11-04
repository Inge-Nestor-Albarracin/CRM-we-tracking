import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Cotizacion, Producto, Contacto, Oportunidad, base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Trash2 } from 'lucide-react';
import SelectorEmpresa from '@/components/crm/SelectorEmpresa';
import ConversorUSD from '@/components/ConversorUSD';
import { calcularTotales, formatMoneda, APP_URL, textosPorDefecto, textosDeCotizacion, titulosDeCotizacion, TITULOS_SECCIONES } from '@/lib/wetracking';
import { enviarCotizacionGmail } from '@/lib/gmailAutoSend';

const ITEM_VACIO = { producto_id: '', producto_nombre: '', descripcion: '', cantidad: 1, precio_unitario: '', descuento_pct: 0 };
// Servicio adicional opcional en cotizaciones de software (ej. de una empresa aliada).
const EXTRA_VACIO = { producto_nombre: '', descripcion: '', cantidad: 1, precio_unitario: '' };

// Texto predeterminado de una cotización de SOFTWARE. El software va EXENTO de IVA (0%).
// Hay dos módulos: "inventarios" (tracking de activos/tags) y "samm" (plataforma de
// mantenimiento y activos). El texto es solo un PUNTO DE PARTIDA: el usuario lo puede
// editar o borrar por completo en el formulario.
function textoInventarios({ activos, usuarios, periodicidad }) {
  const per = periodicidad === 'anual' ? 'anual' : 'mensual';
  const activosTxt = activos ? `${activos} activos` : 'los activos';
  const usuariosTxt = usuarios ? `${usuarios} usuarios` : 'los usuarios';
  return `Costo de software fee ${per} con capacidad de almacenamiento para ${activosTxt} y ${usuariosTxt}, incluyendo el desarrollo de entradas y salidas con medición de tiempo por activo. Adicionalmente cuenta con 5 horas de soporte ${per} y capacitación.`;
}
function textoSamm({ activos, usuarios, gigas, solicitudes, periodicidad }) {
  const per = periodicidad === 'anual' ? 'anual' : 'mensual';
  const usuariosTxt = usuarios ? `${usuarios} usuarios` : 'los usuarios';
  const activosTxt = activos ? `${activos} activos` : 'los activos';
  const gigasTxt = gigas ? ` y ${gigas} Gigas de almacenamiento` : '';
  const solTxt = solicitudes ? `${solicitudes} solicitudes` : 'las solicitudes acordadas';
  return `Licenciamiento del software para ${usuariosTxt}, almacenamiento de ${activosTxt}${gigasTxt}, bajo modalidad de pago ${per}. Incluye acceso a la academia virtual de WeTracking con capacitaciones y material de apoyo, acceso a la versión SAMM Web y App (SAMM 2.0), y soporte técnico con una cantidad de ${solTxt} al mes.`;
}
// Elige el texto por defecto según el módulo de software.
function textoPorModulo(modulo, params) {
  return modulo === 'samm' ? textoSamm(params) : textoInventarios(params);
}
// Nombre de la línea de producto (lo que ve el cliente en el PDF) según el módulo.
function nombreSoftware(modulo, periodicidad) {
  const per = periodicidad === 'anual' ? 'anual' : 'mensual';
  return `${modulo === 'samm' ? 'Plataforma SAMM' : 'Software WeTracking'} (fee ${per})`;
}

function hoyISO() {
  return new Date().toISOString().split('T')[0];
}

function sumarDias(fechaISO, dias) {
  const d = new Date(fechaISO + 'T12:00:00');
  d.setDate(d.getDate() + Number(dias || 0));
  return d.toISOString().split('T')[0];
}

// Crea/actualiza un Documento (categoría Cotización) que enlaza a la cotización, para que
// aparezca en los Documentos de la empresa y del contacto y se pueda abrir/descargar desde ahí.
async function sincronizarDocumentoCotizacion(cot) {
  if (!cot?.id || !cot?.empresa_id) return;
  const url = `${APP_URL}/comercial/cotizaciones/${cot.id}/print`;
  const payload = {
    nombre: `Cotización ${cot.tipo === 'software' ? 'Software' : 'Hardware'} ${cot.numero || ''}`.trim(),
    categoria: 'Cotizacion',
    descripcion: `${cot.tipo === 'software' ? 'Software' : 'Hardware'} · ${formatMoneda(cot.total, cot.moneda)}`,
    tipo_mime: 'link/cotizacion',
    contenido: url,
    empresa_id: cot.empresa_id,
    contacto_id: cot.contacto_id || undefined,
  };
  try {
    const existentes = (await base44.entities.Documento.filter({ empresa_id: cot.empresa_id }).catch(() => []))
      .filter(d => (d.contenido || '').includes(`/cotizaciones/${cot.id}/`));
    if (existentes[0]) await base44.entities.Documento.update(existentes[0].id, payload);
    else await base44.entities.Documento.create(payload);
  } catch { /* no bloquea el guardado de la cotización */ }
}

async function generarNumero() {
  const lista = await Cotizacion.list();
  const year = new Date().getFullYear();
  const re = new RegExp(`^COT-${year}-(\\d+)$`);
  const seqs = lista.map(c => c.numero?.match(re)).filter(Boolean).map(m => parseInt(m[1], 10));
  const next = (seqs.length ? Math.max(...seqs) : 0) + 1;
  return `COT-${year}-${String(next).padStart(3, '0')}`;
}

// ─── Piezas de la interfaz del formulario ────────────────────────────────────────────────
// El formulario se lee como cinco bloques numerados, cada uno con un color propio muy suave,
// para saber de un vistazo en qué parte se está: 1 cliente, 2 fechas y moneda, 3 lo que se
// cotiza (toma el color del tipo: celeste hardware, violeta software, los mismos de las
// etiquetas del listado), 4 términos comerciales y 5 textos del PDF.
const TONOS = {
  indigo: { card: 'border-indigo-200/70 bg-indigo-50/50', num: 'bg-indigo-500/15 text-indigo-700' },
  emerald: { card: 'border-emerald-200/70 bg-emerald-50/50', num: 'bg-emerald-500/15 text-emerald-700' },
  sky: { card: 'border-sky-200/70 bg-sky-50/50', num: 'bg-sky-500/15 text-sky-700' },
  violet: { card: 'border-violet-200/70 bg-violet-50/50', num: 'bg-violet-500/15 text-violet-700' },
  amber: { card: 'border-amber-200/70 bg-amber-50/50', num: 'bg-amber-500/15 text-amber-700' },
  stone: { card: 'border-stone-200/80 bg-stone-50/70', num: 'bg-stone-500/15 text-stone-700' },
};
function Seccion({ numero, titulo, ayuda, tono = 'stone', accion, children }) {
  const t = TONOS[tono] || TONOS.stone;
  return (
    <section className={`rounded-xl border p-4 space-y-3 ${t.card}`}>
      <div className="flex items-center gap-2 min-h-7">
        <span className={`h-5 w-5 rounded-full text-[11px] font-bold flex items-center justify-center flex-shrink-0 ${t.num}`}>{numero}</span>
        <h3 className="text-sm font-semibold leading-none">{titulo}</h3>
        {ayuda && <span className="text-[11px] text-muted-foreground hidden sm:inline">· {ayuda}</span>}
        {accion && <div className="ml-auto flex-shrink-0">{accion}</div>}
      </div>
      {children}
    </section>
  );
}
// Selector de opciones (Hardware/Software, Inventarios/SAMM). La activa toma el color de lo
// que representa, sin gritar.
const ACENTO = {
  sky: 'bg-white text-sky-700 shadow-sm ring-1 ring-sky-200',
  violet: 'bg-white text-violet-700 shadow-sm ring-1 ring-violet-200',
  stone: 'bg-white text-foreground shadow-sm ring-1 ring-stone-200',
};
function Segmentado({ value, opciones, onChange }) {
  return (
    <div className="flex gap-1 bg-muted/50 rounded-xl p-1 w-fit">
      {opciones.map(o => (
        <button
          key={o.k}
          type="button"
          onClick={() => onChange(o.k)}
          className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${value === o.k ? (ACENTO[o.tono] || ACENTO.stone) : 'text-muted-foreground hover:text-foreground'}`}
        >
          {o.l}{o.sub && <span className={`ml-1.5 text-[11px] font-normal ${value === o.k ? 'opacity-80' : 'opacity-60'}`}>{o.sub}</span>}
        </button>
      ))}
    </div>
  );
}
// Botón chiquito para quitar una fila (ítem o servicio).
function BotonQuitar({ onClick, title = 'Quitar', disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="p-1.5 rounded-md text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground/60 flex-shrink-0"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  );
}

/**
 * Modal crear/editar Cotización con line items.
 * Props: open, onOpenChange, cotizacion (null = crear), empresaFija, onSaved(cotizacion)
 */
export default function CotizacionForm({ open, onOpenChange, cotizacion = null, empresaFija = '', onSaved }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [tipo, setTipo] = useState('hardware');
  const [form, setForm] = useState({
    empresa_id: '', oportunidad_id: '', contacto_id: '', moneda: 'COP',
    fecha_emision: hoyISO(), validez_dias: 15, iva_pct: 19,
    condiciones_pago: '50% anticipo, 50% contra entrega', tiempo_entrega: '', notas: '', costo_envio: '',
    sw_modulo: 'inventarios', sw_activos: '', sw_usuarios: '', sw_gigas: '', sw_solicitudes: '',
    sw_periodicidad: 'mensual', sw_precio: '', sw_descripcion: '',
    texto_validez: '', texto_contrato: '', texto_metodologia: '',
    titulo_validez: TITULOS_SECCIONES.validez, titulo_contrato: TITULOS_SECCIONES.contrato, titulo_metodologia: TITULOS_SECCIONES.metodologia,
  });
  const [items, setItems] = useState([{ ...ITEM_VACIO }]);
  const [swExtras, setSwExtras] = useState([]);
  // ¿El usuario tocó/reemplazó el texto de software? Si sí, dejamos de regenerarlo solo.
  const [swDescEdited, setSwDescEdited] = useState(false);
  // Lo mismo para los textos de las secciones 2, 3 y 4 del PDF (validez, contrato,
  // metodología): mientras no se editen, se regeneran solos con el tipo, la periodicidad y
  // la validez; en cuanto se tocan, el texto escrito manda ("Restablecer" vuelve al default).
  const TEXTOS_SIN_EDITAR = { validez: false, contrato: false, metodologia: false };
  const [textosEditados, setTextosEditados] = useState(TEXTOS_SIN_EDITAR);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const esSoftware = tipo === 'software';

  useEffect(() => {
    if (open) {
      if (cotizacion) {
        setTipo(cotizacion.tipo === 'software' ? 'software' : 'hardware');
        setForm({
          empresa_id: cotizacion.empresa_id || '',
          oportunidad_id: cotizacion.oportunidad_id || '',
          contacto_id: cotizacion.contacto_id || '',
          moneda: cotizacion.moneda || 'COP',
          fecha_emision: cotizacion.fecha_emision || hoyISO(),
          validez_dias: cotizacion.validez_dias ?? 15,
          iva_pct: cotizacion.iva_pct ?? 19,
          condiciones_pago: cotizacion.condiciones_pago || '',
          tiempo_entrega: cotizacion.tiempo_entrega || '',
          notas: cotizacion.notas || '',
          costo_envio: cotizacion.costo_envio ?? '',
          sw_modulo: cotizacion.sw_modulo === 'samm' ? 'samm' : 'inventarios',
          sw_activos: cotizacion.sw_activos ?? '',
          sw_usuarios: cotizacion.sw_usuarios ?? '',
          sw_gigas: cotizacion.sw_gigas ?? '',
          sw_solicitudes: cotizacion.sw_solicitudes ?? '',
          sw_periodicidad: cotizacion.sw_periodicidad || 'mensual',
          sw_precio: cotizacion.tipo === 'software' ? (cotizacion.items?.[0]?.precio_unitario ?? cotizacion.total ?? '') : '',
          sw_descripcion: cotizacion.tipo === 'software' ? (cotizacion.items?.[0]?.descripcion || '') : '',
          // Secciones 2, 3 y 4: se arranca de lo que esta cotización imprime HOY (lo guardado
          // si tiene textos propios, o el predeterminado de siempre si es de antes del cambio).
          texto_validez: textosDeCotizacion(cotizacion).validez,
          texto_contrato: textosDeCotizacion(cotizacion).contrato,
          texto_metodologia: textosDeCotizacion(cotizacion).metodologia,
          titulo_validez: titulosDeCotizacion(cotizacion).validez,
          titulo_contrato: titulosDeCotizacion(cotizacion).contrato,
          titulo_metodologia: titulosDeCotizacion(cotizacion).metodologia,
        });
        // Al editar, el texto guardado manda: no lo regeneramos encima.
        setSwDescEdited(cotizacion.tipo === 'software');
        setTextosEditados({ validez: true, contrato: true, metodologia: true });
        setItems(cotizacion.items?.length ? cotizacion.items.map(it => ({ ...it })) : [{ ...ITEM_VACIO }]);
        // En software, los ítems después del 1º (WeTracking) son servicios adicionales.
        setSwExtras(cotizacion.tipo === 'software'
          ? (cotizacion.items || []).slice(1).map(it => ({ producto_nombre: it.producto_nombre || '', descripcion: it.descripcion || '', cantidad: it.cantidad || 1, precio_unitario: it.precio_unitario ?? '' }))
          : []);
      } else {
        setTipo('hardware');
        setForm(f => ({ ...f, empresa_id: empresaFija || '', oportunidad_id: '', contacto_id: '', fecha_emision: hoyISO(), validez_dias: 15, iva_pct: 19, notas: '', costo_envio: '', sw_modulo: 'inventarios', sw_activos: '', sw_usuarios: '', sw_gigas: '', sw_solicitudes: '', sw_periodicidad: 'mensual', sw_precio: '', sw_descripcion: '', texto_validez: '', texto_contrato: '', texto_metodologia: '', titulo_validez: TITULOS_SECCIONES.validez, titulo_contrato: TITULOS_SECCIONES.contrato, titulo_metodologia: TITULOS_SECCIONES.metodologia }));
        setSwDescEdited(false);
        setTextosEditados({ ...TEXTOS_SIN_EDITAR });
        setItems([{ ...ITEM_VACIO }]);
        setSwExtras([]);
      }
    }
  }, [open, cotizacion, empresaFija]);

  const { data: productos = [] } = useQuery({
    queryKey: ['productos'],
    queryFn: () => Producto.list(),
    enabled: open,
  });

  const { data: contactos = [] } = useQuery({
    queryKey: ['contactos'],
    queryFn: () => Contacto.list(),
    enabled: open,
  });

  const { data: oportunidades = [] } = useQuery({
    queryKey: ['oportunidades'],
    queryFn: () => Oportunidad.list(),
    enabled: open,
  });

  const productosActivos = productos.filter(p => p.activo !== false);
  const contactosEmpresa = form.empresa_id ? contactos.filter(c => c.empresa_id === form.empresa_id) : contactos;
  const opsEmpresa = form.empresa_id ? oportunidades.filter(o => o.empresa_id === form.empresa_id) : [];

  // Ítem único autogenerado para cotizaciones de software (IVA 0%). El texto viene del
  // campo editable form.sw_descripcion (que arranca con el texto por defecto del módulo).
  const itemSoftware = useMemo(() => ({
    producto_nombre: nombreSoftware(form.sw_modulo, form.sw_periodicidad),
    descripcion: form.sw_descripcion,
    cantidad: 1,
    precio_unitario: Number(form.sw_precio) || 0,
    descuento_pct: 0,
  }), [form.sw_modulo, form.sw_periodicidad, form.sw_descripcion, form.sw_precio]);

  // Regenera el texto por defecto al cambiar los datos clave, MIENTRAS no lo hayas editado.
  useEffect(() => {
    if (!esSoftware || swDescEdited) return;
    setForm(f => ({ ...f, sw_descripcion: textoPorModulo(f.sw_modulo, { activos: f.sw_activos, usuarios: f.sw_usuarios, gigas: f.sw_gigas, solicitudes: f.sw_solicitudes, periodicidad: f.sw_periodicidad }) }));
  }, [esSoftware, swDescEdited, form.sw_modulo, form.sw_activos, form.sw_usuarios, form.sw_gigas, form.sw_solicitudes, form.sw_periodicidad]);

  // Vuelve el texto al predeterminado del módulo (por si borraste y te arrepentiste).
  const restablecerTexto = () => {
    setForm(f => ({ ...f, sw_descripcion: textoPorModulo(f.sw_modulo, { activos: f.sw_activos, usuarios: f.sw_usuarios, gigas: f.sw_gigas, solicitudes: f.sw_solicitudes, periodicidad: f.sw_periodicidad }) }));
    setSwDescEdited(false);
  };
  // Cambiar de módulo (Inventarios/SAMM). NO tocamos swDescEdited: si el texto sigue en
  // automático (swDescEdited=false) el efecto de arriba lo regenera al default del nuevo
  // módulo; si lo editaste a mano, se CONSERVA (usa "Restablecer texto" para volver al default).
  // Clic en el módulo ya activo = no-op (evita pisar tu texto).
  const cambiarModulo = (m) => { if (m !== form.sw_modulo) set('sw_modulo', m); };

  // Secciones 2, 3 y 4 del PDF. Mientras una no se haya editado, se regenera sola cuando
  // cambia lo que la determina (tipo, periodicidad del software, días de validez).
  useEffect(() => {
    const def = textosPorDefecto({ tipo, sw_periodicidad: form.sw_periodicidad, validez_dias: form.validez_dias });
    setForm(f => ({
      ...f,
      ...(textosEditados.validez ? {} : { texto_validez: def.validez }),
      ...(textosEditados.contrato ? {} : { texto_contrato: def.contrato }),
      ...(textosEditados.metodologia ? {} : { texto_metodologia: def.metodologia }),
    }));
  }, [tipo, form.sw_periodicidad, form.validez_dias, textosEditados]);
  const editarTexto = (clave, campo, valor) => {
    set(campo, valor);
    setTextosEditados(t => t[clave] ? t : { ...t, [clave]: true });
  };
  // "Restablecer" devuelve la sección entera al predeterminado: el título y el texto.
  const restablecerSeccion = (clave, campo, campoTitulo) => {
    const def = textosPorDefecto({ tipo, sw_periodicidad: form.sw_periodicidad, validez_dias: form.validez_dias });
    setForm(f => ({ ...f, [campo]: def[clave], [campoTitulo]: TITULOS_SECCIONES[clave] }));
    setTextosEditados(t => ({ ...t, [clave]: false }));
  };
  // El número de cada sección lo pone la impresión de corrido (2., 3., 4.), así que aquí se
  // muestra solo como referencia: el título es lo que se edita.
  const SECCIONES_PDF = [
    { clave: 'validez', campo: 'texto_validez', campoTitulo: 'titulo_validez', numero: 2, filas: 3 },
    { clave: 'contrato', campo: 'texto_contrato', campoTitulo: 'titulo_contrato', numero: 3, filas: 2 },
    { clave: 'metodologia', campo: 'texto_metodologia', campoTitulo: 'titulo_metodologia', numero: 4, filas: 4 },
  ];

  // Servicios adicionales válidos (con nombre y precio) para sumarlos a la cotización de software.
  const extrasItems = useMemo(() => swExtras
    .filter(s => (s.producto_nombre || '').trim() && Number(s.precio_unitario) > 0)
    .map(s => ({ producto_nombre: s.producto_nombre.trim(), descripcion: s.descripcion || '', cantidad: Number(s.cantidad) || 1, precio_unitario: Number(s.precio_unitario) || 0, descuento_pct: 0 })),
    [swExtras],
  );

  const totales = useMemo(
    () => esSoftware ? calcularTotales([itemSoftware, ...extrasItems], 0) : calcularTotales(items, form.iva_pct),
    [esSoftware, itemSoftware, extrasItems, items, form.iva_pct],
  );

  function setItem(idx, patch) {
    setItems(arr => arr.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }
  function addExtra() { setSwExtras(a => [...a, { ...EXTRA_VACIO }]); }
  function setExtra(idx, patch) { setSwExtras(a => a.map((s, i) => i === idx ? { ...s, ...patch } : s)); }
  function removeExtra(idx) { setSwExtras(a => a.filter((_, i) => i !== idx)); }

  function onProductoChange(idx, productoId) {
    const p = productos.find(x => x.id === productoId);
    setItem(idx, {
      producto_id: productoId,
      producto_nombre: p?.nombre || '',
      descripcion: p?.descripcion || '',
      precio_unitario: p?.precio_venta ?? '',
    });
  }

  const guardar = useMutation({
    mutationFn: async () => {
      let itemsValidos;
      if (esSoftware) {
        if (!(Number(form.sw_precio) > 0)) throw new Error('Ingresa el precio del software');
        itemsValidos = totales.items; // ítem único autogenerado
      } else {
        itemsValidos = totales.items.filter(it => it.producto_nombre && it.cantidad > 0);
        if (itemsValidos.length === 0) throw new Error('Agrega al menos un ítem con producto y cantidad');
      }
      const datos = {
        tipo,
        empresa_id: form.empresa_id,
        oportunidad_id: form.oportunidad_id || undefined,
        contacto_id: form.contacto_id || undefined,
        moneda: form.moneda,
        fecha_emision: form.fecha_emision,
        validez_dias: Number(form.validez_dias) || 15,
        fecha_vencimiento: sumarDias(form.fecha_emision, form.validez_dias),
        items: itemsValidos,
        subtotal: totales.subtotal,
        descuento_total: totales.descuento_total,
        iva_pct: esSoftware ? 0 : (Number(form.iva_pct) || 0),
        iva_valor: totales.iva_valor,
        costo_envio: Number(form.costo_envio) || 0,
        total: totales.total + (Number(form.costo_envio) || 0),
        condiciones_pago: form.condiciones_pago,
        tiempo_entrega: form.tiempo_entrega,
        notas: form.notas,
        sw_modulo: esSoftware ? form.sw_modulo : undefined,
        sw_activos: esSoftware ? (Number(form.sw_activos) || 0) : undefined,
        sw_usuarios: esSoftware ? (Number(form.sw_usuarios) || 0) : undefined,
        sw_gigas: (esSoftware && form.sw_modulo === 'samm') ? (Number(form.sw_gigas) || 0) : undefined,
        sw_solicitudes: (esSoftware && form.sw_modulo === 'samm') ? (Number(form.sw_solicitudes) || 0) : undefined,
        sw_periodicidad: esSoftware ? form.sw_periodicidad : undefined,
        // Textos de las secciones 2, 3 y 4. Se guardan siempre (vacío = no se imprime) y
        // textos_propios marca que esta cotización ya no usa los predeterminados quemados.
        texto_validez: String(form.texto_validez || ''),
        texto_contrato: String(form.texto_contrato || ''),
        texto_metodologia: String(form.texto_metodologia || ''),
        titulo_validez: String(form.titulo_validez || '').trim(),
        titulo_contrato: String(form.titulo_contrato || '').trim(),
        titulo_metodologia: String(form.titulo_metodologia || '').trim(),
        textos_propios: true,
      };
      const me = await base44.auth.me().catch(() => null);
      const miEmail = me?.email || '';
      if (cotizacion?.id) {
        return Cotizacion.update(cotizacion.id, { ...datos, numero: cotizacion.numero, estado: cotizacion.estado, firmado_por: cotizacion.firmado_por || miEmail });
      }
      const numero = await generarNumero();
      return Cotizacion.create({ ...datos, numero, estado: 'Borrador', firmado_por: miEmail });
    },
    onSuccess: async (res) => {
      qc.invalidateQueries({ queryKey: ['cotizaciones'] });
      // Vincular la cotización a los Documentos de la empresa y del contacto.
      await sincronizarDocumentoCotizacion(res);
      qc.invalidateQueries({ queryKey: ['documentos-empresa', res?.empresa_id] });
      if (res?.contacto_id) qc.invalidateQueries({ queryKey: ['documentos-contacto', res.contacto_id] });
      toast({ title: cotizacion?.id ? 'Cotización actualizada' : `Cotización ${res?.numero || ''} creada`, description: 'Guardada en Documentos de la empresa' });
      onOpenChange(false);
      onSaved?.(res);
      // Auto-envío por Gmail solo al crear (no al editar).
      if (!cotizacion?.id && res?.id) {
        enviarCotizacionGmail(res).then(r => {
          if (r?.ok) toast({ title: 'Cotización enviada por Gmail', description: `A ${r.to}` });
          else if (r?.error === 'sin-email') toast({ title: 'Sin email para enviar la cotización', description: 'La empresa/contacto no tiene correo', variant: 'destructive' });
          else toast({ title: 'No se pudo enviar por Gmail', description: r?.error || '', variant: 'destructive' });
        }).catch(() => {});
      }
    },
    onError: (err) => toast({ title: 'Error al guardar', description: err?.message || String(err), variant: 'destructive' }),
  });

  const total = totales.total + (Number(form.costo_envio) || 0);
  const tonoTipo = esSoftware ? 'violet' : 'sky';
  const cambiarTipo = (k) => {
    if (k === tipo) return;
    setTipo(k);
    // Al pasar a hardware, descarta la línea auto de software (sin producto_id)
    // para que no se filtre a un guardado de hardware; al pasar a software, limpia extras.
    if (k === 'hardware') setItems(prev => { const hw = prev.filter(it => it.producto_id); return hw.length ? hw : [{ ...ITEM_VACIO }]; });
    else setSwExtras([]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] p-0 gap-0 flex flex-col overflow-hidden">
        {/* Cabecera fija: el título y el tipo, que es lo primero que se decide y lo que colorea el resto. */}
        <DialogHeader className="px-6 pt-5 pb-3 border-b space-y-2 text-left">
          <DialogTitle>{cotizacion?.id ? `Editar ${cotizacion.numero}` : 'Nueva cotización'}</DialogTitle>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-muted-foreground">Tipo</span>
            <Segmentado
              value={tipo}
              onChange={cambiarTipo}
              opciones={[
                { k: 'hardware', l: 'Hardware', sub: 'IVA 19%', tono: 'sky' },
                { k: 'software', l: 'Software', sub: 'exento', tono: 'violet' },
              ]}
            />
          </div>
        </DialogHeader>

        {/* Cuerpo con scroll: cinco bloques numerados, cada uno con su color. */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          <Seccion numero={1} titulo="Cliente" ayuda="para quién es" tono="indigo">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Empresa *</Label>
                <SelectorEmpresa value={form.empresa_id} onChange={(id) => setForm(f => ({ ...f, empresa_id: id, contacto_id: '', oportunidad_id: '' }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Contacto destinatario</Label>
                <Select value={form.contacto_id} onValueChange={v => set('contacto_id', v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>
                    {contactosEmpresa.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.nombre}{c.email ? ` (${c.email})` : ' — sin email'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {opsEmpresa.length > 0 && (
              <div className="space-y-1.5">
                <Label>Oportunidad vinculada</Label>
                <Select value={form.oportunidad_id} onValueChange={v => set('oportunidad_id', v)}>
                  <SelectTrigger><SelectValue placeholder="Opcional..." /></SelectTrigger>
                  <SelectContent>
                    {opsEmpresa.map(o => <SelectItem key={o.id} value={o.id}>{o.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </Seccion>

          <Seccion numero={2} titulo="Fechas, moneda e IVA" ayuda="las condiciones básicas" tono="emerald">
            <div className="grid grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label>Fecha emisión</Label>
                <Input type="date" value={form.fecha_emision} onChange={e => set('fecha_emision', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Validez (días)</Label>
                <Input type="number" value={form.validez_dias} onChange={e => set('validez_dias', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Moneda</Label>
                <Select value={form.moneda} onValueChange={v => set('moneda', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="COP">COP</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>IVA %</Label>
                {esSoftware ? (
                  <Input value="0 (exento)" disabled className="text-muted-foreground" />
                ) : (
                  <Input type="number" value={form.iva_pct} onChange={e => set('iva_pct', e.target.value)} />
                )}
              </div>
            </div>
          </Seccion>

          <Seccion
            numero={3}
            titulo={esSoftware ? 'El software' : 'Los ítems'}
            ayuda={esSoftware ? 'qué se licencia y por cuánto' : 'qué se vende y a qué precio'}
            tono={tonoTipo}
            accion={esSoftware ? (
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs bg-white" onClick={addExtra}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Agregar servicio
              </Button>
            ) : (
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs bg-white" onClick={() => setItems(arr => [...arr, { ...ITEM_VACIO }])}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Agregar ítem
              </Button>
            )}
          >
            {esSoftware ? (
              <div className="space-y-3">
                {/* Subtipo de software: Inventarios o SAMM. */}
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-muted-foreground">Tipo de software</span>
                  <Segmentado
                    value={form.sw_modulo}
                    onChange={cambiarModulo}
                    opciones={[{ k: 'inventarios', l: 'Inventarios', tono: 'violet' }, { k: 'samm', l: 'SAMM', tono: 'violet' }]}
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Cantidad de activos</Label>
                    <Input type="number" value={form.sw_activos} onChange={e => set('sw_activos', e.target.value)} placeholder="Ej: 1100" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Cantidad de usuarios</Label>
                    <Input type="number" value={form.sw_usuarios} onChange={e => set('sw_usuarios', e.target.value)} placeholder="Ej: 5" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Periodicidad</Label>
                    <Select value={form.sw_periodicidad} onValueChange={v => set('sw_periodicidad', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mensual">Mensual</SelectItem>
                        <SelectItem value="anual">Anual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {/* Campos exclusivos de SAMM */}
                {form.sw_modulo === 'samm' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Gigas de almacenamiento</Label>
                      <Input type="number" value={form.sw_gigas} onChange={e => set('sw_gigas', e.target.value)} placeholder="Ej: 200" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Solicitudes de soporte / mes</Label>
                      <Input type="number" value={form.sw_solicitudes} onChange={e => set('sw_solicitudes', e.target.value)} placeholder="Ej: 40" />
                    </div>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Precio {form.sw_periodicidad === 'anual' ? 'anual' : 'mensual'} ({form.moneda}) *</Label>
                  <Input type="number" value={form.sw_precio} onChange={e => set('sw_precio', e.target.value)} placeholder="Ej: 2000000" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Texto que aparecerá en la cotización</Label>
                    <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px] text-primary" onClick={restablecerTexto}>
                      Restablecer
                    </Button>
                  </div>
                  <Textarea
                    value={form.sw_descripcion}
                    onChange={e => { set('sw_descripcion', e.target.value); setSwDescEdited(true); }}
                    rows={5}
                    placeholder="Describe el software... (puedes borrar todo y pegar tu propio texto)"
                    className="text-sm leading-relaxed"
                  />
                  <p className="text-[11px] text-muted-foreground/70">Puedes editarlo o borrarlo por completo. Se actualiza solo con los datos de arriba hasta que lo modifiques a mano.</p>
                </div>

                {/* Servicios adicionales opcionales (líneas aparte, p. ej. de una empresa aliada) */}
                <div className="space-y-2 pt-1">
                  <Label className="text-xs text-muted-foreground">Servicios adicionales (opcional, p. ej. de una empresa aliada)</Label>
                  {swExtras.length === 0 ? (
                    <p className="text-xs text-muted-foreground/70">Sin servicios adicionales: la cotización solo llevará el software de WeTracking. Se agregan con el botón de arriba.</p>
                  ) : swExtras.map((s, idx) => (
                    <div key={idx} className="border rounded-lg p-2.5 space-y-2 bg-white">
                      <div className="flex items-center gap-2">
                        <Input value={s.producto_nombre} onChange={e => setExtra(idx, { producto_nombre: e.target.value })} placeholder="Nombre del servicio (ej. Consultoría RFID, Aliado X)" className="flex-1" />
                        <Input type="number" value={s.precio_unitario} onChange={e => setExtra(idx, { precio_unitario: e.target.value })} placeholder="Precio" className="w-32" />
                        <BotonQuitar onClick={() => removeExtra(idx)} title="Quitar servicio" />
                      </div>
                      <Textarea value={s.descripcion} onChange={e => setExtra(idx, { descripcion: e.target.value })} rows={2} placeholder="Descripción del servicio (opcional)" className="text-sm" />
                    </div>
                  ))}
                  {swExtras.length > 0 && (
                    <p className="text-[11px] text-muted-foreground/70">Cada servicio va como una línea aparte en la cotización (exento de IVA, igual que el software).</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="border rounded-lg overflow-hidden bg-white">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr className="text-xs text-muted-foreground">
                        <th className="text-left px-3 py-2 font-medium w-[36%]">Producto</th>
                        <th className="text-right px-2 py-2 font-medium w-[10%]">Cant.</th>
                        <th className="text-right px-2 py-2 font-medium w-[18%]">Precio unit.</th>
                        <th className="text-right px-2 py-2 font-medium w-[10%]">Dcto %</th>
                        <th className="text-right px-3 py-2 font-medium w-[18%]">Total</th>
                        <th className="w-[8%]" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {items.map((it, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2">
                            <Select value={it.producto_id} onValueChange={v => onProductoChange(idx, v)}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Producto..." /></SelectTrigger>
                              <SelectContent>
                                {productosActivos.map(p => (
                                  <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-2 py-2">
                            <Input type="number" className="h-8 text-xs text-right" value={it.cantidad} onChange={e => setItem(idx, { cantidad: e.target.value })} />
                          </td>
                          <td className="px-2 py-2">
                            <Input type="number" className="h-8 text-xs text-right" value={it.precio_unitario} onChange={e => setItem(idx, { precio_unitario: e.target.value })} />
                          </td>
                          <td className="px-2 py-2">
                            <Input type="number" className="h-8 text-xs text-right" value={it.descuento_pct} onChange={e => setItem(idx, { descuento_pct: e.target.value })} />
                          </td>
                          <td className="px-3 py-2 text-right text-xs font-medium">
                            {formatMoneda(totales.items[idx]?.total_linea || 0, form.moneda)}
                          </td>
                          <td className="px-1 py-2 text-center">
                            <BotonQuitar
                              title="Quitar ítem"
                              disabled={items.length <= 1}
                              onClick={() => setItems(arr => arr.length > 1 ? arr.filter((_, i) => i !== idx) : arr)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Referencia rápida: compramos en USD, cotizamos en COP */}
                <div className="bg-white border rounded-lg px-3 py-1.5 w-fit">
                  <ConversorUSD label="Costo USD → COP" />
                </div>
              </div>
            )}

            {/* Totales del bloque, a la derecha; el total grande vive en el pie. */}
            <div className="flex justify-end pt-1">
              <div className="w-64 space-y-1 text-sm bg-white border rounded-lg px-3 py-2">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span><span>{formatMoneda(totales.subtotal, form.moneda)}</span>
                </div>
                {totales.descuento_total > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Descuento</span><span>−{formatMoneda(totales.descuento_total, form.moneda)}</span>
                  </div>
                )}
                <div className="flex justify-between text-muted-foreground">
                  <span>IVA {esSoftware ? 0 : form.iva_pct}%</span><span>{formatMoneda(totales.iva_valor, form.moneda)}</span>
                </div>
                {Number(form.costo_envio) > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Envío</span><span>{formatMoneda(Number(form.costo_envio), form.moneda)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold border-t pt-1">
                  <span>Total</span><span>{formatMoneda(total, form.moneda)}</span>
                </div>
              </div>
            </div>
          </Seccion>

          <Seccion numero={4} titulo="Términos comerciales" ayuda="cómo se paga y se entrega" tono="amber">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Condiciones de pago</Label>
                <Input value={form.condiciones_pago} onChange={e => set('condiciones_pago', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Tiempo de entrega</Label>
                <Input value={form.tiempo_entrega} onChange={e => set('tiempo_entrega', e.target.value)} placeholder="Ej: 3 semanas tras orden de compra" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Costo de envío ({form.moneda}), opcional</Label>
              <Input type="number" value={form.costo_envio} onChange={e => set('costo_envio', e.target.value)} placeholder="0, p. ej. envío de tags a otra parte de la ciudad" />
            </div>
          </Seccion>

          {/* Secciones 2, 3 y 4 del PDF: título y texto 100% editables por cotización, como la
              descripción del software. Arrancan con el predeterminado del tipo y los textos se
              regeneran solos hasta que se tocan. Texto vacío = la sección no se imprime y las
              siguientes se renumeran. */}
          <Seccion numero={5} titulo="Textos del PDF" ayuda="lo que lee el cliente, palabra por palabra" tono="stone">
            <p className="text-[11px] text-muted-foreground/70 -mt-1">Título y texto de cada sección se pueden editar o borrar por completo. Los textos se actualizan solos con el tipo, la periodicidad y la validez hasta que los modifiques a mano. Si dejas un texto vacío, esa sección no sale en el PDF y la siguiente toma su número. Cada salto de línea es un párrafo.</p>
            {SECCIONES_PDF.map(s => (
              <div key={s.clave} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-5 text-right flex-shrink-0">{s.numero}.</span>
                  <Input
                    value={form[s.campoTitulo]}
                    onChange={e => set(s.campoTitulo, e.target.value)}
                    placeholder={TITULOS_SECCIONES[s.clave]}
                    className="h-8 text-xs font-semibold flex-1"
                  />
                  <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px] text-primary flex-shrink-0" onClick={() => restablecerSeccion(s.clave, s.campo, s.campoTitulo)}>
                    Restablecer
                  </Button>
                </div>
                <Textarea
                  value={form[s.campo]}
                  onChange={e => editarTexto(s.clave, s.campo, e.target.value)}
                  rows={s.filas}
                  placeholder="Vacío: esta sección no se imprime. Escribe aquí el texto que quieras que salga."
                  className="text-sm leading-relaxed"
                />
              </div>
            ))}
            <div className="space-y-1.5 pt-1">
              <Label>Notas / comentario extra</Label>
              <Textarea value={form.notas} onChange={e => set('notas', e.target.value)} rows={2} placeholder="Alcance, exclusiones, garantía, comentario extra..." />
              <p className="text-[11px] text-muted-foreground/70">Sale al final del PDF, después de las secciones.</p>
            </div>
          </Seccion>
        </div>

        {/* Pie fijo: el total siempre a la vista y las dos acciones. */}
        <div className="px-6 py-3 border-t bg-background flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] text-muted-foreground">Total {esSoftware ? '(exento de IVA)' : `(IVA ${Number(form.iva_pct) || 0}% incluido)`}</p>
            <p className="text-lg font-semibold leading-tight">{formatMoneda(total, form.moneda)}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={() => guardar.mutate()} disabled={!form.empresa_id || (esSoftware && !(Number(form.sw_precio) > 0)) || guardar.isPending}>
              {guardar.isPending ? 'Guardando...' : (cotizacion?.id ? 'Guardar cambios' : 'Crear cotización')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
