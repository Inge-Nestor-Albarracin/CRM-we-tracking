// Función de seguimiento automático — ejecutar como cron cada hora
// Detecta leads sin actividad y envía WhatsApp automático según la situación

export default async function autoFollowUp(_: {}, context: any) {
  const env = context.env;
  const waToken = env?.WHATSAPP_API_TOKEN;
  const waPhoneId = env?.WHATSAPP_PHONE_NUMBER_ID;

  if (!waToken || !waPhoneId) {
    return { status: 'error', mensaje: 'WhatsApp no configurado (WHATSAPP_API_TOKEN / WHATSAPP_PHONE_NUMBER_ID)' };
  }

  const ahora = new Date();
  const resultados: any[] = [];

  // ── Helper: enviar WhatsApp ──
  async function enviarWA(telefono: string, texto: string, contacto_id: string, trigger: string) {
    let tel = telefono.replace(/\D/g, '');
    if (!tel.startsWith('57')) tel = '57' + tel;

    const res = await fetch(`https://graph.facebook.com/v19.0/${waPhoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${waToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: tel,
        type: 'text',
        text: { body: texto },
      }),
    });

    const ok = res.ok;

    // Registrar mensaje enviado
    await context.entities.MensajeEnviado.create({
      contacto_id,
      contacto_telefono: tel,
      canal: 'WhatsApp',
      contenido_final: texto,
      fecha_envio: ahora.toISOString(),
      estado: ok ? 'Enviado' : 'Error',
      trigger,
      es_automatico: true,
    });

    // Registrar en historial
    await context.entities.HistorialLead.create({
      contacto_id,
      tipo: 'Auto_Mensaje',
      descripcion: `Follow-up automático: ${trigger}`,
      fecha: ahora.toISOString(),
      usuario_email: 'ia@sistema',
      es_automatico: true,
    });

    // Actualizar ultima_actividad
    await context.entities.Contacto.update({
      where: { id: contacto_id },
      data: { ultima_actividad: ahora.toISOString() },
    });

    return ok;
  }

  // Obtener templates activos
  const templates = await context.entities.MensajeTemplate.findMany({ where: { activo: true, auto_envio: true } });
  const templateMap: Record<string, string> = {};
  for (const t of templates) {
    templateMap[t.trigger] = t.contenido;
  }

  function renderTemplate(template: string, vars: Record<string, string>) {
    return template.replace(/\{\{(\w+)\}\}/g, (_: string, key: string) => vars[key] || '');
  }

  // ── 1. Leads sin actividad >24h en etapa Lead ──
  const hace24h = new Date(ahora.getTime() - 24 * 60 * 60 * 1000);
  const hace48h = new Date(ahora.getTime() - 48 * 60 * 60 * 1000);

  const leadsInactivos = await context.entities.Contacto.findMany({
    where: {
      etapa_pipeline: 'Lead',
      $or: [
        { ultima_actividad: { $lt: hace24h.toISOString() } },
        { ultima_actividad: null },
      ],
    },
    take: 50,
  });

  for (const lead of leadsInactivos) {
    if (!lead.telefono || !lead.whatsapp_opt_in) continue;

    const diasSin = lead.ultima_actividad
      ? Math.floor((ahora.getTime() - new Date(lead.ultima_actividad).getTime()) / (1000 * 60 * 60 * 24))
      : 99;

    let trigger = '';
    let textoDefault = '';

    if (diasSin >= 2) {
      trigger = 'seguimiento_2dias';
      textoDefault = `¡Hola ${lead.nombre}! 👋 Te escribo nuevamente de ${env?.INMOBILIARIA_NOMBRE || 'nuestra inmobiliaria'}. ¿Sigues buscando inmueble? Tenemos nuevas opciones disponibles. 🏠`;
    } else {
      trigger = 'seguimiento_1dia';
      textoDefault = `¡Hola ${lead.nombre}! Soy ${env?.AGENTE_NOMBRE || 'Valentina'} 😊 ¿Pudiste revisar la información que te compartimos? Estamos disponibles para resolver tus preguntas.`;
    }

    const vars = { nombre: lead.nombre, agente: env?.AGENTE_NOMBRE || 'Valentina' };
    const texto = templateMap[trigger] ? renderTemplate(templateMap[trigger], vars) : textoDefault;

    const ok = await enviarWA(lead.telefono, texto, lead.id, trigger);
    resultados.push({ lead_id: lead.id, trigger, ok });
  }

  // ── 2. Recordatorio de visitas próximas (en las siguientes 24h) ──
  const manana = new Date(ahora.getTime() + 24 * 60 * 60 * 1000);

  const visitasProximas = await context.entities.Visita.findMany({
    where: {
      estado: 'Programada',
      fecha_hora: { $gte: ahora.toISOString(), $lte: manana.toISOString() },
    },
    take: 30,
  });

  for (const visita of visitasProximas) {
    const lead = await context.entities.Contacto.findOne({ id: visita.contacto_id });
    if (!lead?.telefono || !lead.whatsapp_opt_in) continue;

    const propiedad = visita.propiedad_id
      ? await context.entities.Propiedad.findOne({ id: visita.propiedad_id })
      : null;

    const fechaVisita = new Date(visita.fecha_hora).toLocaleString('es-CO', {
      weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    });

    const vars = {
      nombre: lead.nombre,
      propiedad: propiedad?.tipo || 'propiedad',
      barrio: propiedad?.barrio || '',
      fecha: fechaVisita,
      agente: visita.agente_email?.split('@')[0] || 'tu asesor',
    };

    const textoDefault = `¡Hola ${vars.nombre}! 🏠 Te recordamos que mañana tienes una visita agendada:\n\n📍 ${vars.propiedad} en ${vars.barrio}\n📅 ${fechaVisita}\n\n¿Confirmas la visita? Responde SÍ o NO.`;
    const texto = templateMap['visita_recordatorio']
      ? renderTemplate(templateMap['visita_recordatorio'], vars)
      : textoDefault;

    const ok = await enviarWA(lead.telefono, texto, lead.id, 'visita_recordatorio');
    resultados.push({ lead_id: lead.id, trigger: 'visita_recordatorio', ok });
  }

  // ── 3. Follow-up post-visita (visitas realizadas hace <6h sin seguimiento) ──
  const hace6h = new Date(ahora.getTime() - 6 * 60 * 60 * 1000);

  const visitasRecientes = await context.entities.Visita.findMany({
    where: {
      estado: 'Realizada',
      fecha_hora: { $gte: hace6h.toISOString(), $lte: ahora.toISOString() },
    },
    take: 20,
  });

  for (const visita of visitasRecientes) {
    const lead = await context.entities.Contacto.findOne({ id: visita.contacto_id });
    if (!lead?.telefono || !lead.whatsapp_opt_in) continue;

    // Verificar que no se haya enviado un seguimiento post-visita ya
    const yaEnviado = await context.entities.MensajeEnviado.findOne({
      contacto_id: lead.id,
      trigger: 'seguimiento_post_visita',
      fecha_envio: { $gte: hace6h.toISOString() },
    });
    if (yaEnviado) continue;

    const propiedad = visita.propiedad_id
      ? await context.entities.Propiedad.findOne({ id: visita.propiedad_id })
      : null;

    const vars = {
      nombre: lead.nombre,
      propiedad: propiedad?.tipo || 'inmueble',
      barrio: propiedad?.barrio || '',
      agente: visita.agente_email?.split('@')[0] || 'nosotros',
    };

    const calificacion = visita.calificacion_interes;
    let textoDefault = '';

    if (['Muy_interesado', 'Interesado'].includes(calificacion)) {
      textoDefault = `¡Hola ${vars.nombre}! Espero que la visita al ${vars.propiedad} en ${vars.barrio} te haya gustado 😊 ¿Tienes alguna pregunta o quieres proceder? ¡Estamos para ayudarte!`;
    } else {
      textoDefault = `¡Hola ${vars.nombre}! Gracias por visitarnos hoy. ¿Podemos ayudarte a encontrar algo más adecuado? Cuéntanos qué aspectos son más importantes para ti. 🏠`;
    }

    const texto = templateMap['seguimiento_post_visita']
      ? renderTemplate(templateMap['seguimiento_post_visita'], vars)
      : textoDefault;

    const ok = await enviarWA(lead.telefono, texto, lead.id, 'seguimiento_post_visita');
    resultados.push({ lead_id: lead.id, trigger: 'seguimiento_post_visita', ok });
  }

  return {
    status: 'ok',
    ejecutado_en: ahora.toISOString(),
    total_enviados: resultados.filter((r) => r.ok).length,
    total_errores: resultados.filter((r) => !r.ok).length,
    detalle: resultados,
  };
}
