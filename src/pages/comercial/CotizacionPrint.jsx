import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Cotizacion, Empresa, Contacto, base44 } from '@/api/base44Client';
import { formatMoneda, WETRACKING, textosDeCotizacion, titulosDeCotizacion } from '@/lib/wetracking';

const CIUDAD = 'Bogotá D.C.';
const INTRO = 'De acuerdo con su solicitud y atendiendo sus requerimientos en WETRACKING hacemos entrega de nuestra oferta comercial sobre el tema en referencia.';

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

  if (isLoading || !cot) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Cargando cotización...</div>;

  const esSoftware = cot.tipo === 'software';
  const fmtFecha = (f) => f ? new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
  const M = (n) => formatMoneda(n, cot.moneda);

  // Firma: perfil del firmante de la cotización. Se intenta por firmado_por, luego
  // created_by, y por último el usuario que está viendo/descargando (que suele ser el creador).
  const candidatos = [cot.firmado_por, cot.created_by, meEmail].filter(Boolean).map(s => String(s).toLowerCase());
  const perfil = perfiles.find(p => p.email && candidatos.includes(p.email.toLowerCase()));
  const firmaNombre = perfil?.nombre || WETRACKING.remitente_nombre || 'WeTracking';
  const firmaCargo = perfil?.cargo || WETRACKING.remitente_cargo || '';
  const firmaUrl = perfil?.firma_url || WETRACKING.firma_url || '';

  const bd = '1px solid #444';
  const th = { border: bd, padding: '7px 10px', fontSize: 11, fontWeight: 700, textAlign: 'center', background: '#f0f0f0' };
  const td = { border: bd, padding: '8px 10px', fontSize: 12, verticalAlign: 'top' };
  const secTitle = { fontSize: 13, fontWeight: 700, margin: '22px 0 6px', color: '#111' };
  const parr = { fontSize: 12.5, color: '#222', margin: '0 0 8px', lineHeight: 1.5, textAlign: 'justify' };

  return (
    <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: '#111', maxWidth: 820, margin: '0 auto', padding: '40px 48px 56px', background: '#fff' }}>
      <style>{`
        @media print { .no-print { display: none !important; } body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        @page { size: letter; margin: 0; }
      `}</style>

      <div className="no-print" style={{ position: 'fixed', top: 16, right: 16, display: 'flex', gap: 8, zIndex: 10 }}>
        <button onClick={() => window.print()} style={{ background: '#0b1f3a', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 14, cursor: 'pointer', fontWeight: 600 }}>Imprimir / PDF</button>
        <button onClick={() => navigate('/comercial/cotizaciones')} style={{ background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, padding: '10px 18px', fontSize: 14, cursor: 'pointer' }}>Volver</button>
      </div>

      {/* Encabezado: logo + título centrado */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 22 }}>
        {WETRACKING.logo && <img src={WETRACKING.logo} alt="WeTracking" style={{ height: 46, width: 'auto', objectFit: 'contain' }} />}
        <div style={{ flex: 1, textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '.02em' }}>COTIZACIÓN {esSoftware ? 'SOFTWARE' : 'HARDWARE'}</p>
        </div>
        <div style={{ width: 46 }} />
      </div>

      <p style={{ fontSize: 12.5, fontWeight: 700, margin: '0 0 16px' }}>{CIUDAD}, {fmtFecha(cot.fecha_emision)}</p>

      {/* Destinatario + COT No */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, fontSize: 12.5 }}>
        <div>
          <p style={{ margin: '0 0 2px' }}><strong style={{ display: 'inline-block', width: 42 }}>Sres.</strong> {empresa?.nombre || '—'}</p>
          <p style={{ margin: 0 }}><strong style={{ display: 'inline-block', width: 42 }}>Atn.</strong> {contacto?.nombre || '—'}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: 0 }}><strong>COT. No:</strong> <span style={{ borderBottom: '2px solid #111', fontWeight: 700, paddingBottom: 1 }}>{cot.numero}</span></p>
        </div>
      </div>

      <p style={{ fontSize: 12.5, margin: '0 0 14px' }}><strong>Asunto:</strong> Oferta Comercial.</p>
      <p style={{ fontSize: 12.5, margin: '0 0 10px' }}>Estimados Señores:</p>
      <p style={parr}>{INTRO}</p>

      {/* 1. Oferta técnica y comercial */}
      <p style={secTitle}>1. OFERTA TÉCNICA Y COMERCIAL.</p>
      <p style={{ textAlign: 'center', fontWeight: 700, fontSize: 12, margin: '0 0 6px' }}>DESCRIPCIÓN DE LA OFERTA</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 4 }}>
        <thead>
          <tr>
            <th style={th}>DESCRIPCIÓN</th>
            <th style={{ ...th, width: 70 }}>CANTIDAD</th>
            <th style={{ ...th, width: 110 }}>VALOR UNITARIO</th>
            <th style={{ ...th, width: 110 }}>VALOR TOTAL</th>
          </tr>
        </thead>
        <tbody>
          {(cot.items || []).map((it, i) => (
            <tr key={i}>
              <td style={td}>
                <strong>{it.producto_nombre}</strong>{it.descripcion ? `: ${it.descripcion}` : ''}
              </td>
              <td style={{ ...td, textAlign: 'center' }}>{it.cantidad}</td>
              <td style={{ ...td, textAlign: 'right' }}>{M(it.precio_unitario)}</td>
              <td style={{ ...td, textAlign: 'right' }}>{M(it.total_linea)}</td>
            </tr>
          ))}
          <tr>
            <td style={{ ...td, textAlign: 'right', fontWeight: 700, background: '#f7f7f7' }} colSpan={3}>SUBTOTAL</td>
            <td style={{ ...td, textAlign: 'right' }}>{M(cot.subtotal)}</td>
          </tr>
          {Number(cot.iva_valor) > 0 && (
            <tr>
              <td style={{ ...td, textAlign: 'right', fontWeight: 700, background: '#f7f7f7' }} colSpan={3}>IVA {cot.iva_pct}%</td>
              <td style={{ ...td, textAlign: 'right' }}>{M(cot.iva_valor)}</td>
            </tr>
          )}
          {Number(cot.costo_envio) > 0 && (
            <tr>
              <td style={{ ...td, textAlign: 'right', fontWeight: 700, background: '#f7f7f7' }} colSpan={3}>ENVÍO</td>
              <td style={{ ...td, textAlign: 'right' }}>{M(cot.costo_envio)}</td>
            </tr>
          )}
          <tr>
            <td style={{ ...td, textAlign: 'right', fontWeight: 700, background: '#e9edf2' }} colSpan={3}>TOTAL</td>
            <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{M(cot.total)}</td>
          </tr>
        </tbody>
      </table>

      {/* 2, 3 y 4: validez, contrato y metodología, con el texto propio de la cotización.
          Se numeran de corrido a partir del 2: si una sección va vacía, no sale y la
          siguiente toma su número. */}
      {seccionesTexto(cot).map((s, i) => (
        <React.Fragment key={s.clave}>
          <p style={secTitle}>{i + 2}. {s.titulo}</p>
          {s.parrafos.map((t, j) => <p key={j} style={parr}>{t}</p>)}
        </React.Fragment>
      ))}

      {/* Notas extra opcionales de la cotización */}
      {cot.notas && <p style={{ ...parr, marginTop: 10, whiteSpace: 'pre-wrap' }}>{cot.notas}</p>}

      {/* Firma del remitente (por usuario) */}
      <div style={{ marginTop: 44, fontSize: 12.5 }}>
        <p style={{ margin: '0 0 6px' }}>Cordialmente:</p>
        {firmaUrl && <img src={firmaUrl} alt="Firma" style={{ height: 60, width: 'auto', objectFit: 'contain', display: 'block', margin: '4px 0' }} />}
        <div style={{ marginTop: firmaUrl ? 0 : 40 }}>
          <p style={{ margin: 0, fontWeight: 700, textTransform: 'uppercase' }}>{firmaNombre}</p>
          {firmaCargo && <p style={{ margin: '1px 0 0' }}>{firmaCargo}</p>}
          <p style={{ margin: '1px 0 0', fontWeight: 700 }}>WE TRACKING</p>
        </div>
      </div>
    </div>
  );
}