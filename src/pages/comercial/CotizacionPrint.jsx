import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Cotizacion, Empresa, Contacto, base44 } from '@/api/base44Client';
import { formatMoneda, WETRACKING, textosDeCotizacion, titulosDeCotizacion, resumenCotizacion } from '@/lib/wetracking';
import WeLogo from '@/components/brand/WeLogo';

const CIUDAD = 'Bogotá D.C.';
const INTRO = 'De acuerdo con su solicitud y atendiendo sus requerimientos en WETRACKING hacemos entrega de nuestra oferta comercial sobre el tema en referencia.';

// Colores del Manual de marca (pág. 15). En el PDF van con estilos en línea, que son los que
// mejor respeta la impresión del navegador.
const MARINO = '#0B194F';
const AZUL = '#1184E6';
const TURQUESA = '#00A5D7';
const CIAN = '#00FFD7';
const TEXTO = '#1d2440';
const SUAVE = '#5b6478';
const LINEA = '#e3e8f0';
const FONDO = '#f4f7fb';
const AHORRO = '#047a6a'; // verde azulado oscuro: legible sobre blanco (el cian puro no lo es)

// Secciones 2, 3 y 4 (validez, contrato, metodología). Cada cotización guarda su propio texto
// y el formulario lo deja editar o borrar por completo; las de antes del cambio imprimen el
// predeterminado de siempre (ver textosDeCotizacion). Una sección vacía no se imprime y las
// que siguen se renumeran. Cada salto de línea del texto es un párrafo.
function seccionesTexto(cot) {
  const { validez, contrato, metodologia } = textosDeCotizacion(cot);
  const titulos = titulosDeCotizacion(cot);
  return [
    { clave: 'validez', titulo: titulos.validez, texto: validez },
    { clave: 'contrato', titulo: titulos.contrato, texto: contrato },
    { clave: 'metodologia', titulo: titulos.metodologia, texto: metodologia },
  ]
    .map(s => ({ ...s, parrafos: String(s.texto || '').split(/\r?\n/).map(t => t.trim()).filter(Boolean) }))
    .filter(s => s.parrafos.length > 0);
}

const sinPunto = (t) => String(t || '').replace(/\.\s*$/, '');

function TituloSeccion({ n, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '26px 0 10px', breakAfter: 'avoid' }}>
      <span style={{ minWidth: 26, height: 26, borderRadius: 999, background: `linear-gradient(135deg, ${CIAN}, ${TURQUESA})`, color: MARINO, fontWeight: 800, fontSize: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>
      <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: MARINO, letterSpacing: '.04em', textTransform: 'uppercase' }}>{children}</p>
      <span style={{ flex: 1, height: 1, background: LINEA }} />
    </div>
  );
}

function FilaTotal({ label, valor, color, negrita }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '6px 14px', fontSize: 12.5, color: color || TEXTO, fontWeight: negrita ? 700 : 400 }}>
      <span>{label}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{valor}</span>
    </div>
  );
}

export default function CotizacionPrint() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: cot, isLoading } = useQuery({ queryKey: ['cotizacion', id], queryFn: () => Cotizacion.get(id) });
  const { data: empresa } = useQuery({ queryKey: ['empresa', cot?.empresa_id], queryFn: () => Empresa.get(cot.empresa_id), enabled: !!cot?.empresa_id });
  const { data: contacto } = useQuery({ queryKey: ['contacto', cot?.contacto_id], queryFn: () => Contacto.get(cot.contacto_id), enabled: !!cot?.contacto_id });
  const { data: perfiles = [] } = useQuery({ queryKey: ['perfiles-usuario'], queryFn: () => base44.entities.PerfilUsuario.list() });
  const [meEmail, setMeEmail] = useState('');
  useEffect(() => { base44.auth.me().then(u => setMeEmail(u?.email || '')).catch(() => {}); }, []);

  useEffect(() => {
    if (!cot) return;
    const tipoTxt = cot.tipo === 'software' ? 'Software' : 'Hardware';
    const emp = (empresa?.nombre || '').replace(/[^\w\sáéíóúñ.-]/gi, '').trim();
    const prev = document.title;
    document.title = `Cotizacion ${tipoTxt}${emp ? ` ${emp}` : ''}`;
    return () => { document.title = prev; };
  }, [cot, empresa]);

  if (isLoading || !cot) return <div style={{ padding: 40, fontFamily: 'var(--font-sans)', color: SUAVE }}>Cargando cotización...</div>;

  const esSoftware = cot.tipo === 'software';
  const fmtFecha = (f) => f ? new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
  const M = (n) => formatMoneda(n, cot.moneda);
  const r = resumenCotizacion(cot);
  const pct = (p) => `${Number(p.toFixed(2)).toLocaleString('es-CO')}%`;
  // El % global solo se muestra si todas las líneas tienen el mismo descuento (si no, sería un promedio engañoso).
  const pctsLinea = [...new Set(r.lineas.filter(l => l.descuento_pct > 0).map(l => l.descuento_pct))];
  const pctUnico = pctsLinea.length === 1 && r.lineas.every(l => l.descuento_pct === pctsLinea[0]) ? pctsLinea[0] : null;

  // Firma: perfil del firmante de la cotización. Se intenta por firmado_por, luego
  // created_by, y por último el usuario que está viendo/descargando (que suele ser el creador).
  const candidatos = [cot.firmado_por, cot.created_by, meEmail].filter(Boolean).map(s => String(s).toLowerCase());
  const perfil = perfiles.find(p => p.email && candidatos.includes(p.email.toLowerCase()));
  const firmaNombre = perfil?.nombre || WETRACKING.remitente_nombre || 'WeTracking';
  const firmaCargo = perfil?.cargo || WETRACKING.remitente_cargo || '';
  const firmaUrl = perfil?.firma_url || WETRACKING.firma_url || '';

  const th = { padding: '9px 10px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#fff', background: MARINO, textAlign: 'right', whiteSpace: 'nowrap' };
  const td = { padding: '9px 10px', fontSize: 12, verticalAlign: 'top', borderBottom: `1px solid ${LINEA}`, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
  const parr = { fontSize: 12.5, color: TEXTO, margin: '0 0 8px', lineHeight: 1.55, textAlign: 'justify' };
  const etiqueta = { margin: '0 0 3px', fontSize: 9.5, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: TURQUESA };
  const tarjeta = { flex: 1, background: FONDO, borderRadius: 12, padding: '12px 16px', fontSize: 12.5, color: TEXTO };

  return (
    <div style={{ fontFamily: 'var(--font-sans)', color: TEXTO, maxWidth: 816, margin: '0 auto', background: '#fff', position: 'relative', overflow: 'hidden' }}>
      <style>{`
        @media print { .no-print { display: none !important; } html, body { margin: 0; background: #fff !important; } }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        /* La 1.ª página va a sangre (la franja de color toca el borde); las siguientes llevan margen. */
        @page { size: letter; margin: 14mm 0 14mm; }
        @page :first { margin-top: 0; }
        .cot-fila { break-inside: avoid; }
      `}</style>

      <div className="no-print" style={{ position: 'fixed', bottom: 20, right: 20, display: 'flex', gap: 8, zIndex: 10 }}>
        <button onClick={() => window.print()} style={{ background: MARINO, color: '#fff', border: 'none', borderRadius: 999, padding: '10px 20px', fontSize: 14, cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit' }}>Imprimir / PDF</button>
        <button onClick={() => navigate('/comercial/cotizaciones')} style={{ background: '#fff', color: MARINO, border: `1px solid ${LINEA}`, borderRadius: 999, padding: '10px 20px', fontSize: 14, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>Volver</button>
      </div>

      {/* Franja superior con el degradé de marca y las "píldoras" diagonales del manual */}
      <div style={{ height: 6, background: `linear-gradient(90deg, ${CIAN}, ${TURQUESA} 45%, ${AZUL})` }} />
      <span aria-hidden="true" style={{ position: 'absolute', top: -30, right: -46, width: 150, height: 30, borderRadius: 999, background: CIAN, opacity: 0.85, transform: 'rotate(-45deg)' }} />
      <span aria-hidden="true" style={{ position: 'absolute', top: 18, right: -14, width: 90, height: 30, borderRadius: 999, background: AZUL, opacity: 0.9, transform: 'rotate(-45deg)' }} />

      <div style={{ padding: '30px 48px 40px' }}>
        {/* Encabezado */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 26, paddingRight: 64 }}>
          <div style={{ color: MARINO }}>
            <WeLogo className="h-9 w-auto" title="WeTracking" />
            <p style={{ margin: '2px 0 0 2px', fontSize: 10, letterSpacing: '.22em', color: SUAVE }}>Soluciones Integrales</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ ...etiqueta, margin: 0 }}>Cotización</p>
            <p style={{ margin: '2px 0 6px', fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 500, color: MARINO, lineHeight: 1 }}>{esSoftware ? 'Software' : 'Hardware'}</p>
            <span style={{ display: 'inline-block', background: MARINO, color: '#fff', borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 700, letterSpacing: '.03em' }}>{cot.numero}</span>
          </div>
        </div>

        {/* Cliente y datos de la cotización */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 22 }}>
          <div style={{ ...tarjeta, flex: 1.4 }}>
            <p style={etiqueta}>Cliente</p>
            <p style={{ margin: '0 0 2px', fontWeight: 700, fontSize: 14, color: MARINO }}>{empresa?.nombre || '—'}</p>
            <p style={{ margin: 0 }}><span style={{ color: SUAVE }}>Atn.</span> {contacto?.nombre || '—'}{contacto?.cargo ? <span style={{ color: SUAVE }}> · {contacto.cargo}</span> : null}</p>
          </div>
          <div style={tarjeta}>
            {/* Sin "válida hasta": la vigencia la explica la sección de validez (en días hábiles). */}
            <p style={etiqueta}>Fecha</p>
            <p style={{ margin: '0 0 8px', fontWeight: 600 }}>{CIUDAD}, {fmtFecha(cot.fecha_emision)}</p>
            <p style={etiqueta}>Asunto</p>
            <p style={{ margin: 0, fontWeight: 600 }}>Oferta comercial</p>
          </div>
        </div>

        <p style={{ fontSize: 12.5, margin: '0 0 8px' }}>Estimados señores:</p>
        <p style={parr}>{INTRO}</p>

        {/* 1. Oferta técnica y comercial */}
        <TituloSeccion n={1}>Oferta técnica y comercial</TituloSeccion>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, marginBottom: 14 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left', borderTopLeftRadius: 10, width: 24 }}>#</th>
              <th style={{ ...th, textAlign: 'left', whiteSpace: 'normal' }}>Descripción</th>
              <th style={{ ...th, textAlign: 'center', width: 56 }}>Cant.</th>
              <th style={{ ...th, width: 104 }}>Valor unitario</th>
              {r.hayDescuento && <th style={{ ...th, textAlign: 'center', width: 56 }}>Dcto.</th>}
              <th style={{ ...th, borderTopRightRadius: 10, width: 112 }}>Valor total</th>
            </tr>
          </thead>
          <tbody>
            {r.lineas.map((l, i) => (
              <tr key={i} className="cot-fila" style={{ background: i % 2 ? FONDO : '#fff' }}>
                <td style={{ ...td, textAlign: 'left', color: SUAVE }}>{i + 1}</td>
                <td style={{ ...td, textAlign: 'left', whiteSpace: 'normal' }}>
                  <strong style={{ color: MARINO }}>{l.producto_nombre}</strong>
                  {l.descripcion && <div style={{ color: SUAVE, fontSize: 11.5, marginTop: 2, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{l.descripcion}</div>}
                </td>
                <td style={{ ...td, textAlign: 'center' }}>{l.cantidad.toLocaleString('es-CO')}</td>
                <td style={td}>{M(l.precio_unitario)}</td>
                {r.hayDescuento && (
                  <td style={{ ...td, textAlign: 'center' }}>
                    {l.descuento_pct > 0
                      ? <span style={{ display: 'inline-block', background: '#dcfaf4', color: AHORRO, borderRadius: 999, padding: '1px 8px', fontWeight: 700, fontSize: 11 }}>−{pct(l.descuento_pct)}</span>
                      : <span style={{ color: '#b3bac8' }}>—</span>}
                  </td>
                )}
                <td style={td}>
                  {l.ahorro > 0 && <div style={{ color: '#9aa3b5', fontSize: 10.5, textDecoration: 'line-through' }}>{M(l.bruto)}</div>}
                  <strong style={{ color: MARINO }}>{M(l.neto)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totales (y, si hay descuento, el recuadro de ahorro a la izquierda) */}
        <div className="cot-fila" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20 }}>
          <div style={{ flex: 1 }}>
            {r.hayDescuento && (
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', border: `1.5px dashed ${TURQUESA}`, background: '#effcfa', borderRadius: 12, padding: '12px 14px', maxWidth: 330 }}>
                <span style={{ width: 34, height: 34, borderRadius: 999, background: `linear-gradient(135deg, ${CIAN}, ${TURQUESA})`, color: MARINO, fontWeight: 800, fontSize: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>%</span>
                <div style={{ fontSize: 12, lineHeight: 1.45 }}>
                  <p style={{ margin: 0, fontWeight: 700, color: AHORRO }}>Descuento aplicado{pctUnico ? ` del ${pct(pctUnico)}` : ''}</p>
                  <p style={{ margin: 0, color: TEXTO }}>Ahorro de <strong>{M(r.descuento)}</strong> sobre el valor de lista{pctUnico ? '' : ` (${pct(r.descuentoPct)} en total)`}.</p>
                </div>
              </div>
            )}
          </div>
          <div style={{ width: 300, border: `1px solid ${LINEA}`, borderRadius: 12, overflow: 'hidden', paddingTop: 6 }}>
            <FilaTotal label={r.hayDescuento ? 'Subtotal (valor de lista)' : 'Subtotal'} valor={M(r.hayDescuento ? r.bruto : r.base)} />
            {r.hayDescuento && <FilaTotal label={`Descuento${pctUnico ? ` (${pct(pctUnico)})` : ''}`} valor={`−${M(r.descuento)}`} color={AHORRO} negrita />}
            {r.hayDescuento && <FilaTotal label="Subtotal con descuento" valor={M(r.base)} negrita />}
            {r.iva > 0 && <FilaTotal label={`IVA ${r.ivaPct}%`} valor={M(r.iva)} />}
            {r.envio > 0 && <FilaTotal label="Envío" valor={M(r.envio)} />}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, padding: '11px 14px', background: MARINO, color: '#fff' }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.08em' }}>TOTAL{cot.moneda ? ` ${cot.moneda}` : ''}</span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{M(r.total)}</span>
            </div>
          </div>
        </div>

        {/* 2, 3 y 4: validez, contrato y metodología, con el texto propio de la cotización.
            Se numeran de corrido a partir del 2: si una sección va vacía, no sale y la
            siguiente toma su número. */}
        {seccionesTexto(cot).map((s, i) => (
          <React.Fragment key={s.clave}>
            <TituloSeccion n={i + 2}>{sinPunto(s.titulo)}</TituloSeccion>
            {s.parrafos.map((t, j) => <p key={j} style={parr}>{t}</p>)}
          </React.Fragment>
        ))}

        {/* Notas extra opcionales de la cotización */}
        {cot.notas && <p style={{ ...parr, marginTop: 12, padding: '10px 14px', background: FONDO, borderRadius: 10, whiteSpace: 'pre-wrap' }}>{cot.notas}</p>}

        {/* Firma del remitente (por usuario) */}
        <div className="cot-fila" style={{ marginTop: 40, fontSize: 12.5 }}>
          <p style={{ margin: '0 0 6px' }}>Cordialmente,</p>
          {firmaUrl && <img src={firmaUrl} alt="Firma" style={{ height: 60, width: 'auto', objectFit: 'contain', display: 'block', margin: '4px 0' }} />}
          <div style={{ marginTop: firmaUrl ? 0 : 40, borderLeft: `3px solid ${CIAN}`, paddingLeft: 10 }}>
            <p style={{ margin: 0, fontWeight: 700, textTransform: 'uppercase', color: MARINO }}>{firmaNombre}</p>
            {firmaCargo && <p style={{ margin: '1px 0 0', color: SUAVE }}>{firmaCargo}</p>}
            <p style={{ margin: '1px 0 0', fontWeight: 700, color: AZUL }}>WE TRACKING</p>
          </div>
        </div>

        {/* Pie */}
        <div className="cot-fila" style={{ marginTop: 34, paddingTop: 12, borderTop: `1px solid ${LINEA}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10.5, color: SUAVE }}>
          <span>WeTracking · Soluciones Integrales</span>
          <span style={{ color: AZUL, fontWeight: 600 }}>{WETRACKING.web}</span>
        </div>
      </div>
    </div>
  );
}
