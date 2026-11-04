// Envío de mensajes WhatsApp via Meta Business API
export default async function sendWhatsAppMessage(
  { contacto_id, template_id, variables = {} }: { contacto_id: string; template_id?: string; variables?: Record<string, string> },
  context: any
) {
  const envVars = context.env;
  const whatsappToken = envVars?.WHATSAPP_API_TOKEN;
  const phoneNumberId = envVars?.WHATSAPP_PHONE_NUMBER_ID;

  if (!whatsappToken || !phoneNumberId) {
    throw new Error('WhatsApp API no configurado. Configura WHATSAPP_API_TOKEN y WHATSAPP_PHONE_NUMBER_ID en variables de entorno.');
  }

  const contacto = await context.entities.Contacto.findOne({ id: contacto_id });
  if (!contacto) throw new Error('Contacto no encontrado');

  const telefono = contacto.telefono?.replace(/\D/g, '');
  if (!telefono) throw new Error('El contacto no tiene teléfono registrado');

  let contenidoFinal = '';
  let templateNombre = '';

  if (template_id) {
    const template = await context.entities.MensajeTemplate.findOne({ id: template_id });
    if (template) {
      templateNombre = template.nombre;
      contenidoFinal = template.contenido;
      // Reemplazar variables
      const varsConContexto = {
        nombre: contacto.nombre,
        ciudad: contacto.ciudad_interes,
        ...variables,
      };
      for (const [key, val] of Object.entries(varsConContexto)) {
        contenidoFinal = contenidoFinal.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(val || ''));
      }
    }
  } else {
    contenidoFinal = variables.mensaje || 'Hola, te contactamos desde nuestra inmobiliaria.';
  }

  // Meta WhatsApp Business API - envío de mensaje de texto libre
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: telefono.startsWith('57') ? telefono : `57${telefono}`,
    type: 'text',
    text: { preview_url: false, body: contenidoFinal },
  };

  const res = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${whatsappToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Error al enviar WhatsApp');

  // Registrar en historial
  await context.entities.MensajeEnviado.create({
    contacto_id,
    contacto_nombre: contacto.nombre,
    contacto_telefono: contacto.telefono,
    canal: 'WhatsApp',
    template_id: template_id || null,
    template_nombre: templateNombre,
    contenido_final: contenidoFinal,
    fecha_envio: new Date().toISOString(),
    estado: 'Enviado',
    mensaje_id_externo: data.messages?.[0]?.id || '',
    es_automatico: false,
  });

  return { message_id: data.messages?.[0]?.id, status: 'sent' };
}
