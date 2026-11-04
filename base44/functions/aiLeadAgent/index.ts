// Agente conversacional IA para calificación automática de leads inmobiliarios
// Recibe un mensaje de WhatsApp/Instagram/Facebook y responde de forma inteligente

export default async function aiLeadAgent(
  {
    mensaje,
    contacto_telefono,
    canal,
    conversacion_id,
    mensaje_id_externo,
  }: {
    mensaje: string;
    contacto_telefono: string;
    canal: 'WhatsApp' | 'Instagram' | 'Facebook' | 'Web';
    conversacion_id?: string;
    mensaje_id_externo?: string;
  },
  context: any
) {
  const env = context.env;
  const anthropicKey = env?.ANTHROPIC_API_KEY;
  const waToken = env?.WHATSAPP_API_TOKEN;
  const waPhoneId = env?.WHATSAPP_PHONE_NUMBER_ID;

  if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY no configurado.');

  const ahora = new Date().toISOString();

  // ── 1. Buscar o crear Contacto ──
  const telefonoLimpio = contacto_telefono.replace(/\D/g, '');
  let contacto = await context.entities.Contacto.findOne({ telefono: telefonoLimpio });
  if (!contacto) {
    contacto = await context.entities.Contacto.create({
      nombre: 'Lead ' + telefonoLimpio.slice(-4),
      telefono: telefonoLimpio,
      canal_adquisicion: canal === 'WhatsApp' ? 'Redes_sociales' : 'Redes_sociales',
      etapa_pipeline: 'Lead',
      pipeline_tipo: 'Venta',
      fecha_primer_contacto: ahora.split('T')[0],
      ultima_actividad: ahora,
      temperatura: 'Frio',
      score_lead: 10,
      en_conversacion: true,
    });
    // Registrar en historial
    await context.entities.HistorialLead.create({
      contacto_id: contacto.id,
      tipo: canal === 'WhatsApp' ? 'Mensaje_WhatsApp' : canal === 'Instagram' ? 'Mensaje_IG' : 'Mensaje_FB',
      descripcion: 'Primer contacto vía ' + canal,
      fecha: ahora,
      usuario_email: 'ia@sistema',
      es_automatico: true,
    });
  } else {
    await context.entities.Contacto.update({
      where: { id: contacto.id },
      data: { ultima_actividad: ahora, en_conversacion: true },
    });
  }

  // ── 2. Buscar o crear Conversacion ──
  let conversacion = conversacion_id
    ? await context.entities.Conversacion.findOne({ id: conversacion_id })
    : await context.entities.Conversacion.findOne({ contacto_id: contacto.id, canal, estado: { $ne: 'Cerrada' } });

  if (!conversacion) {
    conversacion = await context.entities.Conversacion.create({
      contacto_id: contacto.id,
      contacto_nombre: contacto.nombre,
      contacto_telefono: telefonoLimpio,
      canal,
      estado: 'IA_Activa',
      ia_activa: true,
      fecha_inicio: ahora,
      fecha_ultimo_mensaje: ahora,
      mensajes_sin_leer: 1,
    });
    await context.entities.Contacto.update({
      where: { id: contacto.id },
      data: { conversacion_activa_id: conversacion.id },
    });
  } else {
    if (!conversacion.ia_activa) {
      // Un agente humano tomó control — no responder
      await context.entities.MensajeConversacion.create({
        conversacion_id: conversacion.id,
        contacto_id: contacto.id,
        canal,
        direccion: 'Entrante',
        contenido: mensaje,
        tipo_contenido: 'Texto',
        fecha: ahora,
        enviado_por_ia: false,
        leido: false,
        mensaje_id_externo: mensaje_id_externo || '',
      });
      await context.entities.Conversacion.update({
        where: { id: conversacion.id },
        data: {
          fecha_ultimo_mensaje: ahora,
          mensajes_sin_leer: (conversacion.mensajes_sin_leer || 0) + 1,
        },
      });
      return { status: 'human_control', mensaje: 'Conversación bajo control de agente humano.' };
    }
    await context.entities.Conversacion.update({
      where: { id: conversacion.id },
      data: {
        fecha_ultimo_mensaje: ahora,
        mensajes_sin_leer: (conversacion.mensajes_sin_leer || 0) + 1,
      },
    });
  }

  // ── 3. Guardar mensaje entrante ──
  await context.entities.MensajeConversacion.create({
    conversacion_id: conversacion.id,
    contacto_id: contacto.id,
    canal,
    direccion: 'Entrante',
    contenido: mensaje,
    tipo_contenido: 'Texto',
    fecha: ahora,
    enviado_por_ia: false,
    leido: false,
    mensaje_id_externo: mensaje_id_externo || '',
  });

  // ── 4. Obtener historial de la conversación ──
  const historialMensajes = await context.entities.MensajeConversacion.findMany({
    where: { conversacion_id: conversacion.id },
    orderBy: { fecha: 'asc' },
    take: 15,
  });

  // ── 5. Obtener ConfigAgente ──
  const config = await context.entities.ConfigAgente.findOne({ clave: 'general' }) || {
    nombre_agente: 'Valentina',
    instrucciones_sistema: '',
    conocimiento_base: [],
    saludo_inicial: '¡Hola! Soy Valentina, ¿en qué puedo ayudarte?',
    horario_inicio: '08:00',
    horario_fin: '20:00',
    fuera_de_horario_mensaje: '¡Hola! Estamos fuera de horario. Te respondemos mañana a las 8am.',
    escalar_triggers: ['hablar con agente', 'queja', 'reclamo', 'urgente'],
    activo: true,
    nombre_inmobiliaria: 'nuestra inmobiliaria',
  };

  if (!config.activo) {
    return { status: 'inactive', mensaje: 'El agente IA está desactivado.' };
  }

  // ── 6. Verificar horario ──
  const horaActual = new Date().getHours() * 60 + new Date().getMinutes();
  const [hIni, mIni] = (config.horario_inicio || '08:00').split(':').map(Number);
  const [hFin, mFin] = (config.horario_fin || '20:00').split(':').map(Number);
  const minInicio = hIni * 60 + mIni;
  const minFin = hFin * 60 + mFin;

  if (horaActual < minInicio || horaActual > minFin) {
    const msgFuera = config.fuera_de_horario_mensaje;
    await _enviarRespuesta(msgFuera, telefonoLimpio, canal, conversacion.id, contacto.id, ahora, waToken, waPhoneId, context);
    return { status: 'out_of_hours', respuesta: msgFuera };
  }

  // ── 7. Verificar triggers de escalación ──
  const mensajeLower = mensaje.toLowerCase();
  const debeEscalar = (config.escalar_triggers || []).some((t: string) => mensajeLower.includes(t.toLowerCase()));

  // ── 8. Obtener propiedades disponibles ──
  const propiedades = await context.entities.Propiedad.findMany({
    where: { estado: 'Disponible' },
    take: 10,
  });

  const catalogoPropiedades = propiedades.map((p: any) =>
    `[${p.id}] ${p.tipo} en ${p.operacion} | ${p.barrio || ''}, ${p.ciudad} | ${p.habitaciones || '?'}hab ${p.banos || '?'}baños ${p.area_m2 || '?'}m² | Precio: ${p.precio_venta ? '$' + (p.precio_venta / 1_000_000).toFixed(0) + 'M' : ''} ${p.canon_arriendo ? '$' + (p.canon_arriendo / 1_000_000).toFixed(1) + 'M/mes' : ''}`
  ).join('\n');

  // ── 9. Construir mensajes de conversación para Claude ──
  const chatHistory = historialMensajes.map((m: any) => ({
    role: m.direccion === 'Entrante' ? 'user' : 'assistant',
    content: m.contenido,
  }));

  // Si el historial no termina en 'user', agregar el mensaje actual
  if (!chatHistory.length || chatHistory[chatHistory.length - 1].role !== 'user') {
    chatHistory.push({ role: 'user', content: mensaje });
  }

  // ── 10. System prompt ──
  const systemPrompt = `Eres ${config.nombre_agente}, asesora inmobiliaria de ${config.nombre_inmobiliaria || 'nuestra inmobiliaria'}. Atiendes prospectos por ${canal} con calidez y profesionalismo colombiano.

${config.instrucciones_sistema || ''}

CONOCIMIENTO BASE:
${(config.conocimiento_base || []).join('\n') || 'Sin información adicional configurada.'}

PROPIEDADES DISPONIBLES (úsalas al recomendar):
${catalogoPropiedades || 'No hay propiedades disponibles en este momento.'}

LEAD ACTUAL:
- Nombre: ${contacto.nombre}
- Tipo interés: ${contacto.tipo_interes || 'No definido'}
- Ciudad interés: ${contacto.ciudad_interes || 'No definida'}
- Presupuesto máx: ${contacto.presupuesto_max ? '$' + (contacto.presupuesto_max / 1_000_000).toFixed(0) + 'M COP' : 'No definido'}
- Habitaciones mín: ${contacto.habitaciones_min || 'No definido'}
- Etapa: ${contacto.etapa_pipeline}

FLUJO DE CALIFICACIÓN (sigue este orden si aún no tienes la info):
1. Saluda y pregunta si busca comprar o arrendar
2. Pregunta la ciudad de interés
3. Pregunta el presupuesto aproximado
4. Pregunta número de habitaciones
5. Con esa info, recomienda máximo 3 propiedades del catálogo
6. Propone visita presencial o virtual con fecha y hora concretas (en los próximos 3 días)

REGLAS:
- Habla en colombiano, de tú a tú, con calidez
- Nunca inventes propiedades, precios ni datos que no estén en el catálogo
- Máximo 3 propiedades por mensaje
- Si el cliente pide hablar con persona real, usa acción escalar_humano
- Responde SIEMPRE en JSON válido con este formato exacto:

{
  "respuesta_texto": "Tu mensaje aquí (puede incluir emojis y saltos de línea)",
  "acciones": [
    {"tipo": "actualizar_lead", "campos": {"tipo_interes": "Arriendo", "presupuesto_max": 2000000, "ciudad_interes": "Medellín", "habitaciones_min": 2}},
    {"tipo": "mostrar_propiedades", "ids": ["id1", "id2"]},
    {"tipo": "agendar_visita", "propiedad_id": "id_propiedad", "fecha_propuesta": "2026-06-25T10:00:00"},
    {"tipo": "escalar_humano", "razon": "El cliente solicita hablar con un asesor"},
    {"tipo": "marcar_calificado", "score": 75, "temperatura": "Caliente"}
  ]
}

Las acciones son opcionales. Solo incluye las que apliquen.`;

  // ── 11. Llamar a Claude ──
  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system: systemPrompt,
      messages: chatHistory,
    }),
  });

  if (!claudeRes.ok) {
    const err = await claudeRes.json();
    throw new Error('Error Claude API: ' + (err.error?.message || claudeRes.statusText));
  }

  const claudeData = await claudeRes.json();
  const rawText = claudeData.content?.[0]?.text || '{}';

  // Parsear JSON de Claude
  let respuestaIA: any = { respuesta_texto: '', acciones: [] };
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) respuestaIA = JSON.parse(jsonMatch[0]);
  } catch {
    respuestaIA.respuesta_texto = rawText;
  }

  const respuestaTexto: string = respuestaIA.respuesta_texto || 'Disculpa, tuve un problema técnico. ¿Puedes repetir tu mensaje?';
  const acciones: any[] = respuestaIA.acciones || [];

  // Si debe escalar, agregar acción
  if (debeEscalar && !acciones.find((a: any) => a.tipo === 'escalar_humano')) {
    acciones.push({ tipo: 'escalar_humano', razon: 'Trigger de escalación detectado en mensaje del lead' });
  }

  // ── 12. Ejecutar acciones ──
  const updateContacto: Record<string, any> = { ultima_actividad: ahora };

  for (const accion of acciones) {
    switch (accion.tipo) {
      case 'actualizar_lead':
        Object.assign(updateContacto, accion.campos || {});
        await context.entities.HistorialLead.create({
          contacto_id: contacto.id,
          tipo: 'Calificacion_IA',
          descripcion: 'IA actualizó perfil: ' + Object.keys(accion.campos || {}).join(', '),
          fecha: ahora,
          usuario_email: 'ia@sistema',
          es_automatico: true,
        });
        break;

      case 'agendar_visita':
        if (accion.propiedad_id && accion.fecha_propuesta) {
          await context.entities.Visita.create({
            propiedad_id: accion.propiedad_id,
            contacto_id: contacto.id,
            fecha_hora: accion.fecha_propuesta,
            agente_email: contacto.asignado_a || '',
            estado: 'Programada',
            tipo: 'Presencial',
          });
          updateContacto.etapa_pipeline = 'Visita_Agendada';
          await context.entities.HistorialLead.create({
            contacto_id: contacto.id,
            tipo: 'Visita',
            descripcion: 'Visita agendada automáticamente por IA para ' + accion.fecha_propuesta,
            fecha: ahora,
            etapa_anterior: contacto.etapa_pipeline,
            etapa_nueva: 'Visita_Agendada',
            usuario_email: 'ia@sistema',
            es_automatico: true,
          });
        }
        break;

      case 'escalar_humano':
        await context.entities.Conversacion.update({
          where: { id: conversacion.id },
          data: { estado: 'En_Espera_Humano', ia_activa: false },
        });
        updateContacto.en_conversacion = true;
        await context.entities.HistorialLead.create({
          contacto_id: contacto.id,
          tipo: 'Asignacion',
          descripcion: 'Escalado a agente humano: ' + (accion.razon || 'solicitud del lead'),
          fecha: ahora,
          usuario_email: 'ia@sistema',
          es_automatico: true,
        });
        break;

      case 'marcar_calificado':
        updateContacto.score_lead = accion.score || 50;
        updateContacto.temperatura = accion.temperatura || 'Tibio';
        updateContacto.ia_calificado = true;
        updateContacto.prioridad = accion.score >= 70 ? 'Alta' : accion.score >= 40 ? 'Media' : 'Baja';
        await context.entities.HistorialLead.create({
          contacto_id: contacto.id,
          tipo: 'Calificacion_IA',
          descripcion: `Lead calificado: ${accion.temperatura} (score ${accion.score})`,
          fecha: ahora,
          usuario_email: 'ia@sistema',
          es_automatico: true,
        });
        break;
    }
  }

  // Aplicar actualizaciones al contacto
  await context.entities.Contacto.update({ where: { id: contacto.id }, data: updateContacto });

  // ── 13. Enviar respuesta ──
  await _enviarRespuesta(respuestaTexto, telefonoLimpio, canal, conversacion.id, contacto.id, ahora, waToken, waPhoneId, context);

  return {
    status: 'ok',
    contacto_id: contacto.id,
    conversacion_id: conversacion.id,
    respuesta: respuestaTexto,
    acciones_ejecutadas: acciones.map((a: any) => a.tipo),
  };
}

// Helper: enviar mensaje de vuelta al lead y guardar en BD
async function _enviarRespuesta(
  texto: string,
  telefono: string,
  canal: string,
  conversacion_id: string,
  contacto_id: string,
  fecha: string,
  waToken: string | undefined,
  waPhoneId: string | undefined,
  context: any
) {
  if (canal === 'WhatsApp' && waToken && waPhoneId) {
    let tel = telefono.replace(/\D/g, '');
    if (!tel.startsWith('57')) tel = '57' + tel;

    await fetch(`https://graph.facebook.com/v19.0/${waPhoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${waToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: tel,
        type: 'text',
        text: { body: texto },
      }),
    });
  }

  await context.entities.MensajeConversacion.create({
    conversacion_id,
    contacto_id,
    canal,
    direccion: 'Saliente',
    contenido: texto,
    tipo_contenido: 'Texto',
    fecha,
    enviado_por_ia: true,
    leido: true,
  });
}
