// Utilidades para el feed de actividad cronológico de las páginas de detalle.

export function timeAgo(isoStr) {
  if (!isoStr) return '';
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const dias = Math.floor(hrs / 24);
  if (dias < 30) return `hace ${dias}d`;
  return new Date(isoStr).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fechaTarea(t) {
  return t.created_date || (t.fecha_limite ? t.fecha_limite + 'T12:00:00' : null);
}

/**
 * Fusiona las distintas fuentes de actividad en una lista cronológica descendente.
 * Cada item: { id, tipo, titulo, subtitulo, fecha, meta }
 * tipo ∈ nota | email | tarea | cambio_etapa | whatsapp | reunion
 */
const ACT_TITULO = {
  edicion: 'Dato actualizado', negocio: 'Negocio', cotizacion: 'Cotización',
  documento: 'Documento', contacto: 'Contacto', etapa: 'Cambio de etapa',
  vinculo: 'Vínculo', nota: 'Nota', tarea: 'Tarea', email: 'Email', reunion: 'Reunión',
};

export function construirFeed({ notas = [], tareas = [], emails = [], historial = [], reuniones = [], actividades = [], usuarios = {} }) {
  const items = [];
  // Nombre bonito del autor a partir del correo (created_by de Base44). Cae al correo si no está en el mapa.
  const nombreDe = (email) => usuarios[String(email || '').toLowerCase()] || email || '';
  // Fecha + hora exacta para el "cuándo" de cada item.
  const fmtCuando = (f) => f ? new Date(f).toLocaleString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

  // Registro de trazabilidad (ediciones, negocios, cotizaciones, documentos, vínculos…).
  for (const a of actividades) {
    const cuando = a.fecha ? new Date(a.fecha).toLocaleString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    const quien = a.usuario_nombre || a.usuario_email || '';
    items.push({
      id: `act-${a.id}`, tipo: a.tipo === 'etapa' ? 'cambio_etapa' : (a.tipo || 'historial'),
      titulo: ACT_TITULO[a.tipo] || 'Actividad',
      subtitulo: a.descripcion,
      fecha: a.fecha || a.created_date,
      meta: [quien, cuando].filter(Boolean).join(' · '),
    });
  }

  for (const n of notas) {
    const cuando = n.fecha_nota || n.created_date;
    items.push({
      id: `nota-${n.id}`, tipo: 'nota',
      titulo: 'Nota', subtitulo: n.texto,
      fecha: cuando,
      meta: [nombreDe(n.created_by), fmtCuando(cuando)].filter(Boolean).join(' · '),
    });
  }

  for (const t of tareas) {
    const vence = t.fecha_limite ? `vence ${new Date(t.fecha_limite + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}` : '';
    items.push({
      id: `tarea-${t.id}`, tipo: 'tarea',
      titulo: t.completada ? 'Tarea completada' : 'Tarea',
      subtitulo: t.titulo,
      fecha: fechaTarea(t),
      meta: [nombreDe(t.created_by), fmtCuando(t.created_date), vence].filter(Boolean).join(' · '),
      completada: t.completada,
    });
  }

  for (const e of emails) {
    items.push({
      id: `email-${e.id}`, tipo: 'email',
      titulo: `Email ${e.estado?.toLowerCase() || 'enviado'}`,
      subtitulo: e.asunto,
      fecha: e.fecha_envio,
      meta: e.email_destino,
    });
  }

  for (const h of historial) {
    const tipo = h.tipo === 'Mensaje_WhatsApp' ? 'whatsapp' : h.tipo === 'Cambio_Etapa' ? 'cambio_etapa' : 'historial';
    items.push({
      id: `hist-${h.id}`, tipo,
      titulo: (h.tipo || 'Actividad').replace(/_/g, ' '),
      subtitulo: h.descripcion,
      fecha: h.fecha,
      meta: h.es_automatico ? 'IA automática' : (h.usuario_email || ''),
    });
  }

  for (const r of reuniones) {
    items.push({
      id: `reunion-${r.id}`, tipo: 'reunion',
      titulo: 'Reunión',
      subtitulo: r.titulo,
      fecha: r.fecha_reunion ? r.fecha_reunion + 'T12:00:00' : r.created_date,
      meta: (r.action_items || []).length ? `${r.action_items.length} action items` : '',
      link: `/crm/reuniones/${r.id}`,
    });
  }

  return items
    .filter(i => i.fecha)
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
}
