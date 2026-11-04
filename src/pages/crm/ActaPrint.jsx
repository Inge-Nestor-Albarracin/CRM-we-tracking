import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ReunionNota } from '@/api/base44Client';
import { WETRACKING } from '@/lib/wetracking';

// Página standalone para imprimir / guardar como PDF el acta formal de una reunión,
// con el formato profesional de WeTracking. Ruta: /crm/reuniones/:id/acta
export default function ActaPrint() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: nota, isLoading } = useQuery({
    queryKey: ['reunion', id],
    queryFn: () => ReunionNota.get(id),
  });

  const autoPrint = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('print') === '1';

  // Nombre de archivo del PDF (el navegador usa document.title como nombre por defecto).
  useEffect(() => {
    if (!nota) return;
    const limpio = (nota.titulo || 'reunion').replace(/[^\w\sáéíóúñ-]/gi, '').trim().slice(0, 80);
    const prev = document.title;
    document.title = `Acta - ${limpio}`;
    return () => { document.title = prev; };
  }, [nota]);

  // Descarga automática: al abrir con ?print=1 se lanza solo el diálogo Guardar como PDF,
  // esperando a que carguen las imágenes (logo) para que salgan en el documento.
  useEffect(() => {
    if (!nota || !autoPrint || !nota.acta_md) return;
    let done = false;
    const lanzar = () => { if (done) return; done = true; window.print(); };
    const pendientes = Array.from(document.images).filter((im) => !im.complete);
    if (pendientes.length === 0) {
      const t = setTimeout(lanzar, 400);
      return () => clearTimeout(t);
    }
    let restantes = pendientes.length;
    const onDone = () => { restantes -= 1; if (restantes <= 0) setTimeout(lanzar, 250); };
    pendientes.forEach((im) => { im.addEventListener('load', onDone); im.addEventListener('error', onDone); });
    const fallback = setTimeout(lanzar, 2500);
    return () => {
      clearTimeout(fallback);
      pendientes.forEach((im) => { im.removeEventListener('load', onDone); im.removeEventListener('error', onDone); });
    };
  }, [nota, autoPrint]);

  if (isLoading || !nota) {
    return <div style={{ padding: 40, fontFamily: 'Georgia, serif' }}>Cargando acta...</div>;
  }

  const fmtFecha = (f) => f
    ? new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';

  const sinActa = !nota.acta_md || !nota.acta_md.trim();
  const NAVY = '#0b2a4a';

  return (
    <div style={{ fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif", color: '#1f2937', maxWidth: 850, margin: '0 auto', padding: '40px 48px 64px', background: '#fff' }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        /* margin 0 -> el navegador NO imprime su encabezado/pie (URL, fecha, nº de página).
           Los márgenes reales los da el padding del contenedor. */
        @page { size: letter; margin: 0; }
        .acta-body { font-size: 13px; line-height: 1.65; color: #374151; }
        .acta-body h1 { display: none; }
        .acta-body h2 { display: none; }
        .acta-body > p:first-of-type { margin-top: 0; }
        .acta-body h3 {
          font-size: 13px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
          color: ${NAVY}; margin: 26px 0 10px; padding-bottom: 6px;
          border-bottom: 2px solid ${NAVY};
        }
        .acta-body p { margin: 8px 0; text-align: justify; }
        .acta-body ul, .acta-body ol { margin: 8px 0 8px 20px; }
        .acta-body li { margin: 4px 0; }
        .acta-body table { width: 100%; border-collapse: collapse; margin: 10px 0 18px; font-size: 12px; }
        .acta-body thead th {
          background: ${NAVY}; color: #fff; text-align: left; padding: 9px 12px;
          font-size: 10.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase;
        }
        .acta-body tbody td { border-bottom: 1px solid #e5e7eb; padding: 9px 12px; vertical-align: top; }
        .acta-body tbody tr:nth-child(even) td { background: #f7f9fb; }
        .acta-body strong { color: ${NAVY}; font-weight: 600; }
      `}</style>

      {/* Botones flotantes */}
      <div className="no-print" style={{ position: 'fixed', top: 16, right: 16, display: 'flex', gap: 8, zIndex: 10 }}>
        <button
          onClick={() => window.print()}
          style={{ background: NAVY, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 14, cursor: 'pointer', fontWeight: 600 }}
        >
          Descargar PDF / Imprimir
        </button>
        <button
          onClick={() => navigate(`/crm/reuniones/${id}`)}
          style={{ background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, padding: '10px 18px', fontSize: 14, cursor: 'pointer' }}
        >
          Volver
        </button>
      </div>

      {/* Membrete con logo */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `3px solid ${NAVY}`, paddingBottom: 18, marginBottom: 30 }}>
        {WETRACKING.logo && (
          <img src={WETRACKING.logo} alt="WeTracking" style={{ height: 60, width: 'auto', objectFit: 'contain' }} />
        )}
        <div style={{ textAlign: 'right', maxWidth: '62%' }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: NAVY, letterSpacing: '.04em' }}>ACTA DE LA REUNIÓN</div>
          {nota.titulo && (
            <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginTop: 4 }}>{nota.titulo}</div>
          )}
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>{fmtFecha(nota.fecha_reunion)}</div>
        </div>
      </div>

      {/* Cuerpo del acta (Markdown -> formato WeTracking) */}
      {sinActa ? (
        <div style={{ padding: '40px 0', color: '#6b7280' }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>Aún no hay acta generada para esta reunión.</p>
          <p>Ve a la reunión y usa <strong>“Reprocesar IA”</strong> para generar el acta, luego vuelve a abrir este PDF.</p>
        </div>
      ) : (
        <div className="acta-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{nota.acta_md}</ReactMarkdown>
        </div>
      )}

    </div>
  );
}
