// Clasificador de leads existentes — actualiza score, temperatura y prioridad
// Se puede llamar manualmente desde la UI o como parte de autoFollowUp

export default async function classifyLead(
  { contacto_id }: { contacto_id: string },
  context: any
) {
  const contacto = await context.entities.Contacto.findOne({ id: contacto_id });
  if (!contacto) throw new Error('Contacto no encontrado: ' + contacto_id);

  const ahora = new Date();
  let score = 10; // base

  // ── Puntos por etapa del pipeline ──
  const etapasScore: Record<string, number> = {
    Lead: 10,
    Visita_Agendada: 35,
    Oferta: 55,
    Negociacion: 70,
    Promesa: 85,
    Escritura: 95,
    Activo: 95,
    Perdido: 0,
  };
  score = etapasScore[contacto.etapa_pipeline] ?? 10;

  // ── Puntos por información del perfil ──
  if (contacto.presupuesto_max) score += 10;
  if (contacto.ciudad_interes) score += 5;
  if (contacto.habitaciones_min) score += 5;

  // ── Visitas realizadas y su calificación ──
  const visitas = await context.entities.Visita.findMany({
    where: { contacto_id },
  });
  const visitasRealizadas = visitas.filter((v: any) => v.estado === 'Realizada');
  if (visitasRealizadas.length > 0) {
    score += 15;
    const tieneInteresAlto = visitasRealizadas.some((v: any) =>
      ['Muy_interesado', 'Interesado'].includes(v.calificacion_interes)
    );
    if (tieneInteresAlto) score += 10;
  }

  // ── Penalizaciones por inactividad ──
  if (contacto.ultima_actividad) {
    const diasSinActividad = Math.floor(
      (ahora.getTime() - new Date(contacto.ultima_actividad).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diasSinActividad > 10) score -= 25;
    else if (diasSinActividad > 5) score -= 15;
    else if (diasSinActividad > 3) score -= 5;
  }

  // Limitar score a 0-100
  score = Math.max(0, Math.min(100, score));

  // ── Calcular temperatura ──
  let temperatura: 'Frio' | 'Tibio' | 'Caliente' | 'Urgente';
  if (score >= 80) temperatura = 'Urgente';
  else if (score >= 55) temperatura = 'Caliente';
  else if (score >= 30) temperatura = 'Tibio';
  else temperatura = 'Frio';

  // ── Calcular prioridad ──
  let prioridad: 'Alta' | 'Media' | 'Baja';
  if (score >= 65) prioridad = 'Alta';
  else if (score >= 35) prioridad = 'Media';
  else prioridad = 'Baja';

  // ── Actualizar contacto ──
  await context.entities.Contacto.update({
    where: { id: contacto_id },
    data: { score_lead: score, temperatura, prioridad, ia_calificado: true },
  });

  // ── Registrar en historial ──
  await context.entities.HistorialLead.create({
    contacto_id,
    tipo: 'Calificacion_IA',
    descripcion: `Recalificado: ${temperatura} (score ${score}/100) | Prioridad: ${prioridad}`,
    fecha: ahora.toISOString(),
    usuario_email: 'ia@sistema',
    es_automatico: true,
  });

  return { contacto_id, score, temperatura, prioridad };
}
