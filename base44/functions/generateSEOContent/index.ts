// Dispatcher del agente IA — quedan solo las acciones usadas por Valentina / ConfigAgente.
// Enruta por 'action': whatsapp_message | test_agent

export default async function generateSEOContent(input: any, context: any) {
  const action = input?.action || 'test_agent';
  const apiKey = context.env?.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY no configurada en los secretos del app.');

  // ─── ACTION: whatsapp_message ────────────────────────────────────────────────
  if (action === 'whatsapp_message') {
    const { mensaje, telefono, mensajeId, waPhoneId } = input;
    const waToken   = context.env?.WHATSAPP_API_TOKEN || '';
    const entities  = context.entities;
    const ahora     = new Date().toISOString();
    const telefonoLimpio = (telefono || '').replace(/\D/g, '');

    // 1. Contacto
    let contacto = await entities.Contacto.findOne({ telefono: telefonoLimpio }).catch(() => null);
    if (!contacto) {
      contacto = await entities.Contacto.create({ nombre: 'Lead ' + telefonoLimpio.slice(-4), telefono: telefonoLimpio, canal_adquisicion: 'Redes_sociales', etapa_pipeline: 'Lead', pipeline_tipo: 'Venta', fecha_primer_contacto: ahora.split('T')[0], ultima_actividad: ahora, temperatura: 'Frio', score_lead: 10, en_conversacion: true });
      await entities.HistorialLead.create({ contacto_id: contacto.id, tipo: 'Mensaje_WhatsApp', descripcion: 'Primer contacto vía WhatsApp', fecha: ahora, usuario_email: 'ia@sistema', es_automatico: true });
    } else {
      await entities.Contacto.update({ where: { id: contacto.id }, data: { ultima_actividad: ahora, en_conversacion: true } });
    }

    // 2. Conversación
    let conv = await entities.Conversacion.findOne({ contacto_id: contacto.id, canal: 'WhatsApp', estado: { $ne: 'Cerrada' } }).catch(() => null);
    if (!conv) {
      conv = await entities.Conversacion.create({ contacto_id: contacto.id, contacto_nombre: contacto.nombre, contacto_telefono: telefonoLimpio, canal: 'WhatsApp', estado: 'IA_Activa', ia_activa: true, fecha_inicio: ahora, fecha_ultimo_mensaje: ahora, mensajes_sin_leer: 1 });
      await entities.Contacto.update({ where: { id: contacto.id }, data: { conversacion_activa_id: conv.id } });
    } else {
      if (!conv.ia_activa) {
        await entities.MensajeConversacion.create({ conversacion_id: conv.id, contacto_id: contacto.id, canal: 'WhatsApp', direccion: 'Entrante', contenido: mensaje, tipo_contenido: 'Texto', fecha: ahora, enviado_por_ia: false, leido: false, mensaje_id_externo: mensajeId });
        await entities.Conversacion.update({ where: { id: conv.id }, data: { fecha_ultimo_mensaje: ahora, mensajes_sin_leer: (conv.mensajes_sin_leer || 0) + 1 } });
        return { ok: true, escalado: true };
      }
      await entities.Conversacion.update({ where: { id: conv.id }, data: { fecha_ultimo_mensaje: ahora, mensajes_sin_leer: (conv.mensajes_sin_leer || 0) + 1 } });
    }

    // 3. Guardar mensaje entrante
    await entities.MensajeConversacion.create({ conversacion_id: conv.id, contacto_id: contacto.id, canal: 'WhatsApp', direccion: 'Entrante', contenido: mensaje, tipo_contenido: 'Texto', fecha: ahora, enviado_por_ia: false, leido: false, mensaje_id_externo: mensajeId });

    // 4. Historial + config agente
    const historial = await entities.MensajeConversacion.findMany({ where: { conversacion_id: conv.id }, orderBy: { fecha: 'asc' }, take: 12 });
    const cfgArr = await entities.ConfigAgente.findMany({});
    const cfg = cfgArr[0] || { nombre_agente: 'Valentina', instrucciones_sistema: '', conocimiento_base: [], horario_inicio: '08:00', horario_fin: '20:00', fuera_de_horario_mensaje: '¡Hola! Estamos fuera de horario. 🏠', escalar_triggers: ['hablar con agente', 'urgente', 'queja'], activo: true };
    if (!cfg.activo) return { ok: true };

    // 5. Horario
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const [hI, mI] = (cfg.horario_inicio || '08:00').split(':').map(Number);
    const [hF, mF] = (cfg.horario_fin || '20:00').split(':').map(Number);
    if (nowMin < hI * 60 + mI || nowMin > hF * 60 + mF) {
      await _waSend(cfg.fuera_de_horario_mensaje, telefonoLimpio, waPhoneId, waToken, conv.id, contacto.id, ahora, entities);
      return { ok: true };
    }

    // 6. Propiedades
    const props = await entities.Propiedad.findMany({ where: { estado: 'Disponible' }, take: 8 });
    const catalogo = props.map((p: any) => `[${p.id}] ${p.tipo} ${p.operacion} | ${p.barrio || ''}, ${p.ciudad} | ${p.habitaciones || '?'}hab | ${p.precio_venta ? '$' + Math.round(p.precio_venta/1e6)+'M' : p.canon_arriendo ? '$'+(p.canon_arriendo/1e6).toFixed(1)+'M/mes' : 'Sin precio'}`).join('\n') || 'Sin propiedades disponibles.';

    // 7. Llamar a Claude
    const chatHistory = historial.map((m: any) => ({ role: m.direccion === 'Entrante' ? 'user' : 'assistant', content: m.contenido }));
    if (!chatHistory.length || chatHistory[chatHistory.length-1].role !== 'user') chatHistory.push({ role: 'user', content: mensaje });

    const escalar = (cfg.escalar_triggers || []).some((t: string) => mensaje.toLowerCase().includes(t.toLowerCase()));
    const systemPrompt = `Eres ${cfg.nombre_agente||'Valentina'}, asesora inmobiliaria. Atiendes por WhatsApp con calidez colombiana.\n${cfg.instrucciones_sistema||''}\nPROPIEDADES:\n${catalogo}\nLEAD: ${contacto.nombre} | interés: ${contacto.tipo_interes||'sin definir'} | presupuesto: ${contacto.presupuesto_max?'$'+Math.round(contacto.presupuesto_max/1e6)+'M':'sin definir'} | etapa: ${contacto.etapa_pipeline}\nFLUJO: saluda → compra/arriendo → ciudad → presupuesto → habitaciones → recomienda max 3 propiedades → propone visita.\nRESPONDE SIEMPRE con JSON: {"respuesta_texto":"mensaje con emojis ok","acciones":[{"tipo":"actualizar_lead","campos":{"tipo_interes":"Arriendo"}},{"tipo":"escalar_humano","razon":"..."},{"tipo":"agendar_visita","propiedad_id":"id","fecha_propuesta":"2026-06-25T10:00:00"},{"tipo":"marcar_calificado","score":75,"temperatura":"Caliente"}]}`;

    const cr = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 800, system: systemPrompt, messages: chatHistory }) });
    if (!cr.ok) { console.error('Error Claude:', await cr.text()); return { ok: false }; }
    const rawText = (await cr.json() as any).content?.[0]?.text || '{}';
    let ia: any = { respuesta_texto: '', acciones: [] };
    try { const m = rawText.match(/\{[\s\S]*\}/); if (m) ia = JSON.parse(m[0]); } catch { ia.respuesta_texto = rawText; }

    const respuesta = ia.respuesta_texto || '¿Me repites tu mensaje?';
    const acciones: any[] = ia.acciones || [];
    if (escalar && !acciones.find((a:any) => a.tipo === 'escalar_humano')) acciones.push({ tipo: 'escalar_humano', razon: 'Trigger detectado' });

    // 8. Ejecutar acciones
    const upd: Record<string, any> = { ultima_actividad: ahora };
    for (const acc of acciones) {
      if (acc.tipo === 'actualizar_lead') { Object.assign(upd, acc.campos||{}); await entities.HistorialLead.create({ contacto_id: contacto.id, tipo: 'Calificacion_IA', descripcion: 'IA actualizó: '+Object.keys(acc.campos||{}).join(', '), fecha: ahora, usuario_email: 'ia@sistema', es_automatico: true }); }
      else if (acc.tipo === 'escalar_humano') { await entities.Conversacion.update({ where: { id: conv.id }, data: { estado: 'En_Espera_Humano', ia_activa: false } }); await entities.HistorialLead.create({ contacto_id: contacto.id, tipo: 'Asignacion', descripcion: 'Escalado: '+(acc.razon||''), fecha: ahora, usuario_email: 'ia@sistema', es_automatico: true }); }
      else if (acc.tipo === 'agendar_visita' && acc.propiedad_id) { await entities.Visita.create({ propiedad_id: acc.propiedad_id, contacto_id: contacto.id, fecha_hora: acc.fecha_propuesta, agente_email: '', estado: 'Programada', tipo: 'Presencial' }); upd.etapa_pipeline = 'Visita_Agendada'; }
      else if (acc.tipo === 'marcar_calificado') { upd.score_lead = acc.score||50; upd.temperatura = acc.temperatura||'Tibio'; upd.ia_calificado = true; upd.prioridad = acc.score>=70?'Alta':acc.score>=40?'Media':'Baja'; }
    }
    await entities.Contacto.update({ where: { id: contacto.id }, data: upd });
    await _waSend(respuesta, telefonoLimpio, waPhoneId, waToken, conv.id, contacto.id, ahora, entities);
    return { ok: true, respuesta };
  }

  // ─── helpers ────────────────────────────────────────────────────────────────

  async function _waSend(texto: string, tel: string, phoneId: string, token: string, convId: string, contactoId: string, fecha: string, ents: any) {
    if (token && phoneId) {
      let t = tel.replace(/\D/g, '');
      if (!t.startsWith('57')) t = '57' + t;
      await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: t, type: 'text', text: { body: texto } }) }).catch(() => {});
    }
    await ents.MensajeConversacion.create({ conversacion_id: convId, contacto_id: contactoId, canal: 'WhatsApp', direccion: 'Saliente', contenido: texto, tipo_contenido: 'Texto', fecha, enviado_por_ia: true, leido: true });
  }

  async function callClaude(system: string, user: string, maxTokens = 4000) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
    });
    if (!r.ok) throw new Error('Error API Claude ' + r.status + ': ' + (await r.text()).slice(0, 300));
    const d = await r.json() as any;
    return d.content?.[0]?.text || '';
  }

  function parseJson(raw: string) {
    const m = raw.match(/\{[\s\S]*\}/);
    return JSON.parse(m ? m[0] : raw);
  }

  // ─── ACTION: test_agent ──────────────────────────────────────────────────────
  // Prueba el agente IA con un mensaje simulado (para ConfigAgente.jsx)
  if (action === 'test_agent') {
    const { mensaje = 'Hola, busco un apartamento' } = input;
    const cfgAgente = await context.entities.ConfigAgente.findOne({ clave: 'general' }) || {};
    const propiedades = await context.entities.Propiedad.findMany({ where: { estado: 'Disponible' }, take: 5 });
    const catalogo = propiedades.map((p: any) => `${p.tipo} ${p.operacion} | ${p.barrio || ''}, ${p.ciudad} | ${p.habitaciones || '?'}hab | ${p.precio_venta ? '$' + Math.round(p.precio_venta / 1_000_000) + 'M' : p.canon_arriendo ? '$' + (p.canon_arriendo / 1_000_000).toFixed(1) + 'M/mes' : ''}`).join('\n') || 'Sin propiedades.';

    const systemPrompt = `Eres ${cfgAgente.nombre_agente || 'Valentina'}, asesora inmobiliaria.
${cfgAgente.instrucciones_sistema || 'Atiende con calidez colombiana.'}
PROPIEDADES: ${catalogo}
REGLAS: español colombiano, de tú, máx 3 propiedades por mensaje.
RESPONDE ÚNICAMENTE con JSON: {"respuesta_texto":"tu respuesta aquí","acciones":[]}`;

    const raw = await callClaude(systemPrompt, mensaje, 600);
    let result: any;
    try { result = parseJson(raw); } catch { result = { respuesta_texto: raw }; }
    return { ok: true, respuesta: result.respuesta_texto || raw, acciones: result.acciones || [] };
  }

  throw new Error('Action no reconocida: ' + action);
}
