// v2026-08-03b.guard-dedup-robusto-equipo-configurable
// Procesa una nota de reunión con IA: extrae resumen, decisiones, action items
// (creando Tareas), tipo de reunión y vínculos a empresas/contactos del CRM.
// POST body: { reunion_nota_id: string }
// Env: BASE44_API_KEY. LLM: SOLO InvokeLLM de Base44 (créditos de integración) + reintento. Sin API de Anthropic.
// Para notas de Drive: conector 'googledrive'.
// AUTOCONTENIDO (sin imports de ../../shared) para que Base44 lo despliegue siempre.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const BASE_URL = 'https://wtapp.base44.app';

function jsonRes(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

function decodeB64Url(data: string): string {
  try {
    const bin = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder('utf-8').decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch { return ''; }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n').replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type GmailPart = { mimeType?: string; body?: { data?: string }; parts?: GmailPart[] };
function extraerCuerpo(payload: GmailPart): string {
  let plano = ''; let html = '';
  (function walk(p: GmailPart) {
    if (!p) return;
    if (p.mimeType === 'text/plain' && p.body?.data) plano += decodeB64Url(p.body.data) + '\n';
    else if (p.mimeType === 'text/html' && p.body?.data) html += decodeB64Url(p.body.data) + '\n';
    (p.parts || []).forEach(walk);
  })(payload);
  return (plano.trim() || (html.trim() ? stripHtml(html) : '')).trim();
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Correos del EQUIPO interno de WeTracking. Las tareas de estas personas son "equipo";
// las de cualquier otro (clientes/prospectos/externos) son "cliente".
const EQUIPO_WETRACKING = [
  'karen@grouptso.com',
  'ingenierodesarrollo@wetracking.co',
  'ms@grouptso.com',
  'ts@grouptso.com',
  'direccioncomercial@grouptso.com',
];
// El equipo también por NOMBRE (las tareas suelen tener el responsable por nombre, no correo).
const EQUIPO_NOMBRES = ['David Pernett', 'Karen Rojas', 'Thomas Schonlau', 'Massimiliano Schonlau', 'Gisell Reyes'];

// --- Helpers para leer un Google Doc con sus pestañas (Notas + Transcripción) ---
// La Docs API con includeTabsContent=true devuelve todas las tabs del documento.
/* eslint-disable @typescript-eslint/no-explicit-any */
function textoDeContenido(content: any[]): string {
  let out = '';
  for (const el of content || []) {
    if (el.paragraph) {
      for (const pe of el.paragraph.elements || []) {
        if (pe.textRun?.content) {
          out += pe.textRun.content;
          // Correo escondido en el hipervínculo (invitado mostrado como nombre): lo anexamos.
          const url = pe.textRun.textStyle?.link?.url || '';
          const em = url.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
          if (em && !pe.textRun.content.includes(em[0])) out += ` <${em[0]}>`;
        } else if (pe.person?.personProperties) {
          // "Smart chip" de persona (invitados de la reunión): el correo va en personProperties.email.
          const pp = pe.person.personProperties;
          out += `${pp.name || ''}${pp.email ? ` <${pp.email}>` : ''} `;
        } else if (pe.richLink?.richLinkProperties?.title) {
          out += `${pe.richLink.richLinkProperties.title} `;
        }
      }
    } else if (el.table) {
      for (const row of el.table.tableRows || []) {
        for (const cell of row.tableCells || []) {
          out += textoDeContenido(cell.content || []);
        }
      }
    }
  }
  return out;
}

function textoDeTab(tab: any): string {
  const titulo = tab?.tabProperties?.title || '';
  const cuerpo = textoDeContenido(tab?.documentTab?.body?.content || []);
  let out = titulo ? `\n===== ${titulo} =====\n${cuerpo}` : cuerpo;
  for (const child of tab?.childTabs || []) out += textoDeTab(child);
  return out;
}

function textoDeDoc(doc: any): string {
  if (Array.isArray(doc?.tabs) && doc.tabs.length > 0) {
    return doc.tabs.map(textoDeTab).join('\n').trim();
  }
  return textoDeContenido(doc?.body?.content || []).trim();
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function normalizar(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(s\.?a\.?s\.?|ltda\.?|s\.?a\.?|sas|ltda)\b/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Clave de identidad de una reunión por su título (misma normalización que el dedup del sync):
// sin tildes, sin prefijo "Notas:", sin puntuación. Dos notas con la misma clave+fecha son la
// MISMA reunión (llegó por varias cuentas del equipo).
function claveTitulo(titulo: string): string {
  return (titulo || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/notas?\s+de\s+gemini/g, ' ')
    .replace(/^\s*notas?\s*:?\s*/i, '')
    .replace(/gmt\s*[+-]?\s*\d{1,2}:?\d{2}/g, ' ')
    .replace(/\d{4}[/.-]\d{1,2}[/.-]\d{1,2}/g, ' ')
    .replace(/\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/g, ' ')
    .replace(/\d{1,2}:\d{2}(:\d{2})?/g, ' ')
    .replace(/\d{1,2}\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[a-z]*\.?\s+\d{2,4}/g, ' ')
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

// strict=true (contactos): exige coincidencia de nombre COMPLETO (nombre+apellido),
// para no vincular "Karen" con "Karen Parra". strict=false (empresas): tolerante.
function matchPorNombre(nombre: string, lista: { id: string; nombre: string }[], strict = false): string | null {
  const n = normalizar(nombre);
  if (!n) return null;
  // 1. Coincidencia exacta del nombre completo (siempre)
  for (const item of lista) if (normalizar(item.nombre) === n) return item.id;
  const palabras = n.split(' ').filter((p) => p.length > 2);
  if (strict) {
    // Contactos: requiere que coincidan al menos 2 palabras (nombre y apellido).
    if (palabras.length < 2) return null;
    for (const item of lista) {
      const lp = normalizar(item.nombre).split(' ').filter(Boolean);
      const comunes = palabras.filter((p) => lp.includes(p)).length;
      if (comunes >= 2) return item.id;
    }
    return null;
  }
  // Empresas: tolerante por substring, pero solo con nombres suficientemente largos
  // (>= 4 chars) para no matchear por fragmentos cortos y meter empresas equivocadas.
  for (const item of lista) {
    const ln = normalizar(item.nombre);
    if (!ln) continue;
    if (n.length >= 4 && ln.length >= 4 && (ln.includes(n) || n.includes(ln))) return item.id;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonRes({ message: 'Solo POST' }, 405);
  if (new URL(req.url).searchParams.get('_probe') === 'version') return jsonRes({ version: 'v2026-08-04.solo-invokellm' });

  const apiKey = Deno.env.get('BASE44_API_KEY') || '';
  if (!apiKey) return jsonRes({ message: 'BASE44_API_KEY no configurada' }, 500);

  let body: { reunion_nota_id?: string };
  try { body = await req.json(); } catch { return jsonRes({ message: 'Body JSON invalido' }, 400); }
  const notaId = body.reunion_nota_id;
  if (!notaId) return jsonRes({ message: 'reunion_nota_id es requerido' }, 400);

  const hdrs = { 'api_key': apiKey, 'Content-Type': 'application/json' };

  // Cargar la nota (el PUT de Base44 es full-replace: siempre leer -> merge -> PUT completo)
  const rNota = await fetch(`${BASE_URL}/api/entities/ReunionNota/${notaId}`, { headers: hdrs });
  if (!rNota.ok) return jsonRes({ message: 'ReunionNota no encontrada' }, 404);
  const nota = await rNota.json();
  const { id: _id, created_date: _cd, updated_date: _ud, created_by: _cb, ...notaBase } = nota;

  async function putNota(patch: Record<string, unknown>) {
    Object.assign(notaBase, patch);
    await fetch(`${BASE_URL}/api/entities/ReunionNota/${notaId}`, {
      method: 'PUT', headers: hdrs, body: JSON.stringify(notaBase),
    });
  }

  // Anti-duplicado: si esta MISMA reunión (mismo día + título) YA fue procesada en otra nota
  // (los comités con varios del equipo llegan una vez por participante), no la reprocesamos ni
  // duplicamos sus tareas: la marcamos como descartada y salimos.
  try {
    const fechaClave = (nota.fecha_reunion || '').slice(0, 10);
    const tituloClave = claveTitulo(nota.titulo || '');
    if (fechaClave && tituloClave) {
      // Traemos las notas y filtramos EN CÓDIGO (el filtro REST por campo de fecha no es
      // fiable). Buscamos una gemela: misma fecha + mismo título normalizado, ya Procesada.
      const rSib = await fetch(`${BASE_URL}/api/entities/ReunionNota?limit=500&sort=-fecha_reunion`, { headers: hdrs });
      if (rSib.ok) {
        const hermanas = await rSib.json();
        const gemela = (hermanas || []).find((r: { id: string; descartada?: boolean; estado_procesamiento?: string; titulo?: string; fecha_reunion?: string }) =>
          r.id !== notaId && !r.descartada && r.estado_procesamiento === 'Procesado'
          && String(r.fecha_reunion || '').slice(0, 10) === fechaClave
          && claveTitulo(r.titulo || '') === tituloClave);
        if (gemela) {
          await putNota({ estado_procesamiento: 'Procesado', descartada: true, error_procesamiento: `Duplicada de la reunión ${gemela.id}` });
          return jsonRes({ ok: true, duplicada: true, de: gemela.id, message: 'Reunión duplicada: ya estaba procesada en otra nota' });
        }
      }
    }
  } catch { /* si falla el chequeo, procesamos normal */ }

  await putNota({ estado_procesamiento: 'Procesando', error_procesamiento: '' });

  try {
    // 1. Obtener el contenido crudo
    let contenido = '';
    const b44 = createClientFromRequest(req);

    // 1a. Google Doc (Drive/Gemini): trae TODAS las pestañas (Notas + Transcripción)
    //     vía Docs API. Aplica a notas de Drive y al doc enlazado en las de Gmail.
    if (nota.doc_id) {
      try {
        const { accessToken } = await b44.asServiceRole.connectors.getConnection('googledrive');
        const rDoc = await fetch(
          `https://docs.googleapis.com/v1/documents/${nota.doc_id}?includeTabsContent=true`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );
        if (rDoc.ok) {
          contenido = textoDeDoc(await rDoc.json());
        } else if (nota.origen === 'Google_Drive') {
          // Fallback a export de Drive para notas puras de Drive
          const rExp = await fetch(
            `https://www.googleapis.com/drive/v3/files/${nota.doc_id}/export?mimeType=text/plain`,
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
          );
          if (rExp.ok) contenido = await rExp.text();
        }
      } catch (docErr) {
        // Sin acceso al doc (p. ej. compartido con otra cuenta): caeremos al correo/extracto
        if (nota.origen === 'Google_Drive') throw docErr;
      }
    }

    // 1b. Cuerpo del correo (Gmail integrado de Base44) si el doc no dio contenido
    if (!contenido.trim() && nota.origen === 'Gmail' && nota.gmail_message_id) {
      const { accessToken } = await b44.asServiceRole.connectors.getConnection('gmail');
      const rMsg = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${nota.gmail_message_id}?format=full`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      if (rMsg.ok) {
        const full = await rMsg.json();
        contenido = extraerCuerpo(full.payload || {}) || full.snippet || '';
      }
    }

    // 1c. Contenido subido manualmente
    if (!contenido.trim() && nota.contenido_url) {
      const rTxt = await fetch(nota.contenido_url);
      if (rTxt.ok) contenido = await rTxt.text();
    }

    // 1d. Último recurso: el extracto guardado
    if (!contenido.trim()) contenido = nota.extracto || '';

    if (!contenido.trim()) throw new Error('La nota no tiene contenido para procesar');
    contenido = contenido.slice(0, 40000);

    // Correos que aparecen en el doc (lista de invitados/asistentes). El DOMINIO revela la empresa.
    const RE_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
    const correosTexto = (contenido.match(RE_EMAIL) || []).map(s => s.toLowerCase());

    // FUENTE CONFIABLE (independiente de los smart-chips del doc): los DESTINATARIOS del
    // correo de "Notas de Gemini" (To/Cc/From) son los invitados de la reunión con su email.
    const correosMeta: string[] = [];
    if (nota.gmail_message_id) {
      try {
        const { accessToken: gToken } = await b44.asServiceRole.connectors.getConnection('gmail');
        const rH = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${nota.gmail_message_id}?format=metadata&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=From&metadataHeaders=Bcc`,
          { headers: { 'Authorization': `Bearer ${gToken}` } }
        );
        if (rH.ok) {
          const meta = await rH.json();
          const cab = (meta.payload?.headers || [])
            .filter((h: { name: string }) => ['To', 'Cc', 'From', 'Bcc'].includes(h.name))
            .map((h: { value: string }) => h.value).join(' ');
          for (const m of (cab.match(RE_EMAIL) || [])) correosMeta.push(m.toLowerCase());
        }
      } catch { /* opcional: si falla, quedan los del texto */ }
    }
    const correosDoc = [...new Set([...correosTexto, ...correosMeta])];

    // Guardar el contenido completo (notas + transcripción) en file storage para que
    // "Ver contenido completo" lo muestre sin volver a consultar Drive/Gmail.
    let contenidoUrl = nota.contenido_url || '';
    try {
      const archivo = new File([contenido], `reunion-${notaId}.txt`, { type: 'text/plain' });
      const up = await b44.integrations.Core.UploadFile({ file: archivo });
      if (up?.file_url) contenidoUrl = up.file_url;
    } catch { /* si falla la subida, conservamos el contenido_url previo */ }

    // 2. Contexto del CRM
    const [rEmp, rCon, rUsr, rMie] = await Promise.all([
      fetch(`${BASE_URL}/api/entities/Empresa?limit=500`, { headers: hdrs }),
      fetch(`${BASE_URL}/api/entities/Contacto?limit=500`, { headers: hdrs }),
      fetch(`${BASE_URL}/api/entities/User?limit=100`, { headers: hdrs }),
      fetch(`${BASE_URL}/api/entities/MiembroEquipo?limit=200`, { headers: hdrs }),
    ]);
    const empresas: { id: string; nombre: string; dominio_web?: string }[] = rEmp.ok ? await rEmp.json() : [];
    const contactos: { id: string; nombre: string; empresa?: string }[] = rCon.ok ? await rCon.json() : [];
    const usuarios: { email: string; full_name?: string }[] = rUsr.ok ? await rUsr.json() : [];

    // Equipo interno CONFIGURABLE (Configuración → Equipo). Es la fuente de verdad para
    // clasificar tareas equipo/cliente y para que la IA asigne a la persona correcta.
    // Si aún no hay miembros cargados, caemos a la lista fija de respaldo.
    const miembros: { nombre?: string; email?: string; activo?: boolean }[] = rMie.ok ? await rMie.json() : [];
    const miembrosActivos = miembros.filter(m => m.activo !== false);
    const EQUIPO_NOMBRES_DYN = miembrosActivos.length ? miembrosActivos.map(m => m.nombre || '').filter(Boolean) : EQUIPO_NOMBRES;
    const EQUIPO_WETRACKING_DYN = miembrosActivos.length
      ? [...new Set(miembrosActivos.map(m => (m.email || '').toLowerCase()).filter(Boolean))]
      : EQUIPO_WETRACKING;

    const listaEmpresas = empresas.map(e => `${e.id} | ${e.nombre}`).join('\n') || '(ninguna)';
    const listaContactos = contactos.map(c => `${c.id} | ${c.nombre} | ${c.empresa || ''}`).join('\n') || '(ninguno)';
    const listaEquipo = usuarios.map(u => `${u.email} | ${u.full_name || ''}`).join('\n') || '(ninguno)';

    // 3. Llamada a la IA
    const prompt = `NOTAS DE LA REUNIÓN
Título: ${nota.titulo}
Fecha registrada: ${nota.fecha_reunion || nota.created_date?.slice(0, 10) || 'desconocida'}

El contenido puede venir de un Google Doc de "Notas de Gemini" con dos secciones marcadas
"===== Notas =====" (resumen/detalles/próximos pasos) y "===== Transcripción =====" (diálogo
palabra por palabra). Usa AMBAS: apóyate en las Notas para el resumen y las decisiones, y en la
Transcripción para captar compromisos y tareas concretas que no quedaron en las notas.
"""
${contenido}
"""

CORREOS DETECTADOS EN EL DOC (inclúyelos TODOS en la tabla de Asistentes junto a su nombre; el DOMINIO de cada correo identifica la empresa de esa persona):
${correosDoc.join('\n') || '(ninguno)'}

EMPRESAS EN EL CRM (id | nombre):
${listaEmpresas}

CONTACTOS EN EL CRM (id | nombre | empresa):
${listaContactos}

EQUIPO INTERNO (email | nombre):
${listaEquipo}

Devuelve SOLO este JSON:
{
  "tipo": "Comite_Comercial" | "Reunion_Cliente" | "Otro",
  "resumen": "3 a 5 frases en español con lo esencial de la reunión",
  "asistentes": [{ "nombre": "...", "correo": "email o null" }],
  "decisiones": ["decisión tomada", "..."],
  "action_items": [{ "titulo": "título corto y claro de la tarea (una frase accionable, máx ~90 caracteres, SIN cortar a media palabra)", "descripcion": "el compromiso COMPLETO y detallado tal como se acordó (no lo cortes)", "responsable_nombre": "nombre o null", "responsable_email": "email del equipo interno si coincide, o null", "fecha_limite": "YYYY-MM-DD o null", "ambito": "equipo | cliente", "empresa_nombre": "empresa/cliente al que pertenece ESTA tarea (usa el nombre exacto de la lista de empresas si aplica), o null" }],
  "acta_md": "acta formal COMPLETA en Markdown siguiendo el FORMATO de abajo",
  "empresas": [{ "nombre_detectado": "...", "dominio": "dominio del correo de esa empresa (ej. agico.com.pa) o null", "empresa_id": "id de la lista o null" }],
  "contactos": [{ "nombre_detectado": "...", "correo": "su email o null", "empresa_nombre": "empresa a la que pertenece por el dominio de su correo, o null", "contacto_id": "id de la lista o null" }],
  "fecha_reunion": "YYYY-MM-DD o null"
}

FORMATO DEL ACTA (campo "acta_md") — replica esta estructura de acta de WeTracking, en Markdown:
## Acta de reunión — <título>
**Fecha:** <fecha en formato DD/MM/AAAA> · **Modalidad:** <Presencial/Virtual si se menciona, si no omite> · **Asunto:** <asunto>

**Objetivo:** <1 frase con el objetivo de la reunión>

### Asistentes
| Nombre | Correo |
|---|---|
(una fila por asistente. El CORREO es el email con el que se conectó o que aparece junto a su nombre en las notas o la transcripción. Si no aparece su correo, deja "—". NO inventes correos.)

### Temas tratados
1. <tema>
2. <tema>

### Desarrollo de la reunión
Esta es la parte MÁS IMPORTANTE y debe ser LARGA y EXHAUSTIVA: son las MINUTAS completas de la reunión, no un resumen. BÁSATE PRINCIPALMENTE EN LA TRANSCRIPCIÓN (el texto palabra por palabra), no solo en las notas cortas — ahí está el detalle real de lo que se habló.
Requisitos:
- Cubre TODOS los temas y sub-temas que se tocaron, en orden. No omitas nada relevante.
- Por cada tema, un bloque con **el tema en negrita** seguido de MÍNIMO 4 a 6 párrafos sustanciales (no frases sueltas).
- En cada bloque desarrolla a fondo: el contexto y por qué surgió el tema; qué planteó cada parte y sus argumentos; los datos, cifras, nombres, sistemas o ejemplos concretos mencionados; las dudas, objeciones o riesgos que salieron; las alternativas que se evaluaron; qué se decidió y la justificación; y los próximos pasos o pendientes que quedaron.
- Escribe en prosa profesional, fiel a lo hablado (NO inventes hechos ni cifras que no estén), pero exprimiendo todo el detalle que sí está en la transcripción.
- El objetivo es que alguien que no asistió entienda la reunión COMPLETA leyendo solo esta sección. Apunta a un desarrollo de varios párrafos por tema, extenso.

### Compromisos
| Actividad | Responsable |
|---|---|
(una fila por cada compromiso/tarea; responsable = quién quedó a cargo. NO incluyas columna ni dato de fecha en esta tabla.)

Los "action_items" (que sí llevan fecha_limite internamente) y la tabla de Compromisos deben referirse a los mismos compromisos.

EQUIPO INTERNO DE WETRACKING — sus tareas SIEMPRE son "ambito":"equipo": ${EQUIPO_NOMBRES_DYN.join(', ')} (correos: ${EQUIPO_WETRACKING_DYN.join(', ')}). CUALQUIER otra persona (clientes, prospectos, contratistas, externos) → "ambito":"cliente". El responsable_email solo se pone si es uno de esos correos del equipo.

Reglas:
- "ambito" de cada action_item: "equipo" si el responsable es del equipo WeTracking (alguno de esos correos, o su nombre); "cliente" si el responsable es un cliente/prospecto/externo. Si no está claro, usa "equipo".
- "Comite_Comercial" = reunión interna del equipo WeTracking (revisión de pipeline, seguimiento de clientes, metas). "Reunion_Cliente" = reunión con un cliente o prospecto.
- No inventes empresas ni personas que no estén mencionadas en las notas.
- EMPRESAS: puedes tolerar variaciones del nombre ("Uniandes" = "Universidad de los Andes").
- CONTACTOS (¡importante, sé estricto!): vincula un contacto_id SOLO si el NOMBRE COMPLETO (nombre y apellido) coincide con alguien de la lista Y tiene sentido con la empresa de esta reunión. Si en la reunión solo se menciona un primer nombre (ej. "Karen", "Miguel"), o la persona de la lista pertenece a una empresa DISTINTA a la de la reunión, NO la vincules: déjala con "contacto_id": null. Es mejor no vincular que vincular a la persona equivocada.
- CORREOS Y EMPRESAS POR DOMINIO (MUY IMPORTANTE): extrae TODOS los correos de los invitados/asistentes (aparecen en el encabezado del doc y en la lista de arriba). El DOMINIO del correo identifica la empresa: @buenaventuragolfclub.com → Buenaventura Golf Club, @agico.com.pa → Agico, @idaesoluciones.com → IDA Soluciones. IGNORA los dominios de correo personal (gmail.com, hotmail.com, outlook.com, yahoo.com) y los del equipo (grouptso.com, wetracking.co) para identificar empresas. Una MISMA reunión puede tener VARIAS empresas externas (varios dominios distintos): detéctalas TODAS en "empresas" con su "dominio" — NO te quedes solo con una. Asocia cada contacto a su empresa por el dominio de su correo (campo "empresa_nombre" del contacto).
- La tabla de Asistentes del acta DEBE incluir el correo de cada persona cuando exista (usa la lista de CORREOS DETECTADOS); solo deja "—" si de verdad no hay correo.
- RESPONSABLES (asignación exacta): para cada action_item identifica quién quedó a cargo según la transcripción. Si es del EQUIPO INTERNO de WeTracking, pon su "responsable_email" EXACTO de la lista del equipo; si es un cliente/externo, pon solo "responsable_nombre" y "responsable_email": null.
- Resuelve fechas relativas ("el viernes", "próxima semana") respecto a la fecha de la reunión.
- Ignora saludos, logística de la llamada y small talk.`;

    // LLM integrado de Base44 (usa los créditos de integración de Base44, no una API key propia).
    const promptCompleto = `Eres un analista senior que procesa notas de reuniones de WeTracking (empresa colombiana B2B de tecnología RFID para trazabilidad y gestión de activos e inventarios). Extraes con precisión los compromisos, responsables y fechas, y redactas actas formales claras. Respondes ÚNICAMENTE con JSON válido, sin texto adicional.

${prompt}`;
    // Esquema de salida estructurada: garantiza JSON válido y que el acta_md no se corte por parseo.
    const esquemaSalida = {
      type: 'object',
      properties: {
        tipo: { type: 'string' },
        resumen: { type: 'string' },
        asistentes: {
          type: 'array',
          items: { type: 'object', properties: { nombre: { type: 'string' }, correo: { type: 'string' } } },
        },
        decisiones: { type: 'array', items: { type: 'string' } },
        action_items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              titulo: { type: 'string' },
              descripcion: { type: 'string' },
              responsable_nombre: { type: 'string' },
              responsable_email: { type: 'string' },
              fecha_limite: { type: 'string' },
              ambito: { type: 'string' },
              empresa_nombre: { type: 'string' },
            },
          },
        },
        acta_md: { type: 'string' },
        empresas: {
          type: 'array',
          items: { type: 'object', properties: { nombre_detectado: { type: 'string' }, dominio: { type: 'string' }, empresa_id: { type: 'string' } } },
        },
        contactos: {
          type: 'array',
          items: { type: 'object', properties: { nombre_detectado: { type: 'string' }, correo: { type: 'string' }, empresa_nombre: { type: 'string' }, contacto_id: { type: 'string' } } },
        },
        fecha_reunion: { type: 'string' },
      },
    };

    let extraccion: {
      tipo?: string;
      resumen?: string;
      asistentes?: { nombre: string; correo?: string | null }[];
      decisiones?: string[];
      action_items?: { titulo?: string | null; descripcion: string; responsable_nombre?: string | null; responsable_email?: string | null; fecha_limite?: string | null; ambito?: string; empresa_nombre?: string | null }[];
      acta_md?: string;
      empresas?: { nombre_detectado: string; dominio?: string | null; empresa_id?: string | null }[];
      contactos?: { nombre_detectado: string; correo?: string | null; empresa_nombre?: string | null; contacto_id?: string | null }[];
      fecha_reunion?: string | null;
    } = {};
    let fuenteIA = '';
    // 1. Base44 InvokeLLM (créditos de integración de Base44) con claude_sonnet_4_6:
    //    modelo de alta calidad para redactar actas exhaustivas y fieles a la transcripción.
    //    Cuesta ~15 créditos por reunión (vs ~1 del modelo automatic), pero la sección de
    //    Desarrollo del acta queda completa y profesional en vez de corta y superficial.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r: any = await b44.integrations.Core.InvokeLLM({ prompt: promptCompleto, response_json_schema: esquemaSalida, model: 'claude_sonnet_4_6' });
      const obj = (r && typeof r === 'object' && !Array.isArray(r)) ? (r.data && typeof r.data === 'object' ? r.data : r) : null;
      if (obj && (obj.acta_md || obj.resumen || (obj.action_items && obj.action_items.length))) {
        extraccion = obj;
        fuenteIA = 'base44-sonnet';
      }
    } catch { /* caemos al reintento abajo */ }

    // 2. Reintento con el MISMO modelo claude_sonnet_4_6. Si tampoco resuelve, se marca la
    //    nota en Error para reprocesar luego (0 costo API de Anthropic).
    if (!fuenteIA) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r2: any = await b44.integrations.Core.InvokeLLM({ prompt: promptCompleto, response_json_schema: esquemaSalida, model: 'claude_sonnet_4_6' });
        const obj2 = (r2 && typeof r2 === 'object' && !Array.isArray(r2)) ? (r2.data && typeof r2.data === 'object' ? r2.data : r2) : null;
        if (obj2 && (obj2.acta_md || obj2.resumen || (obj2.action_items && obj2.action_items.length))) {
          extraccion = obj2;
          fuenteIA = 'base44-sonnet';
        }
      } catch { /* sin resultado */ }
    }
    if (!fuenteIA) throw new Error('El InvokeLLM (claude_sonnet_4_6) no generó el acta. Reprocesa la reunión más tarde.');

    // 4. Matching de respaldo server-side para nombres sin id
    const empresasResueltas: string[] = [];
    const empresasSinMatch: string[] = [];
    for (const e of extraccion.empresas || []) {
      let eid = e.empresa_id || null;
      if (!eid) eid = matchPorNombre(e.nombre_detectado, empresas);
      if (eid && empresas.some(x => x.id === eid)) empresasResueltas.push(eid);
      else if (e.nombre_detectado) empresasSinMatch.push(e.nombre_detectado);
    }

    const contactosResueltos: string[] = [];
    const contactosSinMatch: string[] = [];
    for (const c of extraccion.contactos || []) {
      let cid = c.contacto_id || null;
      if (!cid) cid = matchPorNombre(c.nombre_detectado, contactos, true);
      if (cid && contactos.some(x => x.id === cid)) contactosResueltos.push(cid);
      else if (c.nombre_detectado) contactosSinMatch.push(c.nombre_detectado);
    }

    // Preferir la empresa recién detectada al reprocesar (así se corrige una mal puesta antes).
    const empresaPrincipal = empresasResueltas[0] || nota.empresa_id || undefined;
    const contactoPrincipal = contactosResueltos[0] || '';
    const fechaReunion = nota.fecha_reunion || extraccion.fecha_reunion || undefined;

    // 5. Regenerar las Tareas de la reunión. Al reprocesar, borramos las tareas que
    //    generó ESTA reunión y las creamos de nuevo (evita duplicados y corrige
    //    empresas/títulos mal puestos antes). Las tareas manuales (sin reunion_nota_id) no se tocan.
    const emailsEquipo = new Set(usuarios.map(u => u.email));
    try {
      const rPrev = await fetch(`${BASE_URL}/api/entities/Tarea?reunion_nota_id=${notaId}&limit=1000`, { headers: hdrs });
      if (rPrev.ok) {
        const prevTareas: { id: string }[] = await rPrev.json();
        for (const t of prevTareas) {
          try { await fetch(`${BASE_URL}/api/entities/Tarea/${t.id}`, { method: 'DELETE', headers: hdrs }); } catch { /* ignore */ }
        }
      }
    } catch { /* si no se pudieron borrar, seguimos igual */ }

    const actionItems: { descripcion: string; responsable: string; fecha_limite: string; tarea_id: string }[] = [];

    for (const item of extraccion.action_items || []) {
      if (!item.descripcion) continue;

      const fechaLimite = item.fecha_limite
        || new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0];
      const ambito = item.ambito === 'cliente' ? 'cliente' : 'equipo';
      // Título corto (del modelo) sin cortar; si no vino, usa la descripción como respaldo.
      const tituloTarea = (item.titulo && item.titulo.trim())
        ? item.titulo.trim().slice(0, 160)
        : item.descripcion.slice(0, 160);
      // Empresa por tarea: la que el modelo asignó a ESA tarea. Si no hay, se hereda
      // la de la reunión SOLO cuando es una reunión con un cliente (en Comités internos
      // NO se hereda, para no estampar un cliente a 50 tareas).
      const empTarea = item.empresa_nombre ? matchPorNombre(item.empresa_nombre, empresas) : null;
      const empFinal = empTarea || (extraccion.tipo === 'Reunion_Cliente' ? empresaPrincipal : undefined);
      const payloadTarea: Record<string, unknown> = {
        titulo: tituloTarea,
        descripcion: `${item.descripcion}\n\n— Origen: reunión "${nota.titulo}"${fechaReunion ? ` (${fechaReunion})` : ''}`,
        fecha_limite: fechaLimite,
        prioridad: 'Media',
        reunion_nota_id: notaId,
        ambito,
      };
      if (item.responsable_nombre) payloadTarea.responsable = item.responsable_nombre;
      if (empFinal) payloadTarea.empresa_id = empFinal;
      // Trazabilidad: si la tarea es de la empresa principal de la reunión, enlázala también
      // al contacto principal y a la oportunidad (deal) para que aparezca en la actividad de los tres.
      if (empFinal && empFinal === empresaPrincipal) {
        if (contactoPrincipal) payloadTarea.contacto_id = contactoPrincipal;
        if (nota.oportunidad_id) payloadTarea.oportunidad_id = nota.oportunidad_id;
      }
      if (item.responsable_email && emailsEquipo.has(item.responsable_email)) {
        payloadTarea.asignado_a = item.responsable_email;
      }

      // Crear la tarea con reintentos: Base44 puede rechazar ráfagas de escrituras,
      // por eso antes solo se creaban algunas (p. ej. 3 de 7). Reintentamos con espera.
      let tareaId = '';
      for (let intento = 0; intento < 4 && !tareaId; intento++) {
        if (intento > 0) await new Promise(r => setTimeout(r, 600 * intento));
        try {
          const rT = await fetch(`${BASE_URL}/api/entities/Tarea`, {
            method: 'POST', headers: hdrs, body: JSON.stringify(payloadTarea),
          });
          if (rT.ok) { const t = await rT.json(); tareaId = t.id || ''; }
        } catch { /* reintentar */ }
      }
      // Pausa breve entre creaciones para no saturar la escritura de Base44.
      await new Promise(r => setTimeout(r, 150));

      actionItems.push({
        descripcion: item.descripcion,
        responsable: item.responsable_nombre || item.responsable_email || '',
        fecha_limite: item.fecha_limite || fechaLimite,
        tarea_id: tareaId,
      });
    }

    // 5b. DETECCIÓN DE EMPRESAS POR DOMINIO DE CORREO + sugerencia de prospectos nuevos.
    //     Los correos de los invitados llevan la empresa en el dominio
    //     (superintendente@buenaventuragolfclub.com -> Buenaventura Golf Club). Una reunión
    //     puede tener VARIAS empresas (varios dominios). Se agrupan los correos externos por
    //     dominio corporativo y las empresas que NO estén en el CRM se dejan como sugerencia
    //     para crear (TODAS, no solo una).
    const DOMINIOS_LIBRES = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'yahoo.es', 'icloud.com', 'live.com', 'me.com', 'proton.me', 'protonmail.com'];
    const DOMINIOS_EQUIPO = ['grouptso.com', 'wetracking.co'];
    const correosAsist = (extraccion.asistentes || []).map(a => (a?.correo || '').toLowerCase()).filter(Boolean);
    const correosContacto = (extraccion.contactos || []).map(c => (c?.correo || '').toLowerCase()).filter(Boolean);
    const todosCorreos = [...new Set([...correosDoc, ...correosAsist, ...correosContacto])];
    const dominioDe = (email: string) => (email.split('@')[1] || '').toLowerCase();
    const esCorreoEquipo = (email: string) => EQUIPO_WETRACKING_DYN.includes(email) || DOMINIOS_EQUIPO.some(d => dominioDe(email) === d || dominioDe(email).endsWith('.' + d));

    // Nombre de una persona a partir del correo (usa asistentes/contactos; si no, deriva del local part).
    const nombreDeCorreo = (email: string): string => {
      for (const a of extraccion.asistentes || []) if ((a?.correo || '').toLowerCase() === email && a.nombre) return a.nombre;
      for (const c of extraccion.contactos || []) if ((c?.correo || '').toLowerCase() === email && c.nombre_detectado) return c.nombre_detectado;
      const lp = (email.split('@')[0] || '').replace(/[._-]+/g, ' ').replace(/\d+/g, ' ').replace(/\s+/g, ' ').trim();
      return lp ? lp.split(' ').map(w => (w ? w[0].toUpperCase() + w.slice(1) : '')).join(' ') : email;
    };
    // Nombre de la empresa a partir del dominio (usa el nombre del modelo si lo dio para ese dominio).
    const nombreDeDominio = (dom: string): string => {
      for (const e of extraccion.empresas || []) if (normalizar(e.dominio || '') === normalizar(dom) && e.nombre_detectado) return e.nombre_detectado;
      const raiz = (dom.split('.')[0] || dom);
      return raiz.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    };
    // ¿Ya existe una empresa para este dominio? (por dominio_web o por nombre)
    const empresaExisteParaDominio = (dom: string, nombre: string): boolean => {
      const raiz = dom.split('.')[0];
      const porDom = empresas.some((e) => {
        const dw = String(e.dominio_web || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        return dw && (dw.includes(dom) || dom.includes(dw) || (raiz.length >= 4 && dw.includes(raiz)));
      });
      return porDom || !!matchPorNombre(nombre, empresas);
    };

    // Agrupar correos externos por dominio corporativo.
    const porDominio: Record<string, string[]> = {};
    for (const email of todosCorreos) {
      const dom = dominioDe(email);
      if (!dom || esCorreoEquipo(email) || DOMINIOS_LIBRES.includes(dom)) continue;
      (porDominio[dom] ||= []).push(email);
    }

    const empresasNuevas: { empresa_nombre: string; dominio: string; contactos: { nombre: string; email: string; cargo: string }[] }[] = [];
    for (const dom of Object.keys(porDominio)) {
      const nombre = nombreDeDominio(dom);
      if (empresaExisteParaDominio(dom, nombre)) continue; // ya está en el CRM
      const contactos = [...new Set(porDominio[dom])].slice(0, 8).map(email => ({ nombre: nombreDeCorreo(email), email, cargo: '' }));
      empresasNuevas.push({ empresa_nombre: nombre, dominio: dom, contactos });
    }

    let sugerenciaEstado: string = nota.sugerencia_estado || 'ninguna';
    let sugerenciaJson: string = nota.sugerencia_json || '';
    if (sugerenciaEstado !== 'confirmada' && sugerenciaEstado !== 'ignorada') {
      if (extraccion.tipo !== 'Comite_Comercial' && empresasNuevas.length > 0) {
        // Multi-empresa (empresas[]) + compat con el formato viejo (empresa_nombre/contactos = la 1ª).
        sugerenciaJson = JSON.stringify({ empresas: empresasNuevas, empresa_nombre: empresasNuevas[0].empresa_nombre, contactos: empresasNuevas[0].contactos });
        sugerenciaEstado = 'pendiente';
      } else {
        sugerenciaEstado = 'ninguna';
        sugerenciaJson = '';
      }
    }

    // 6. Guardar todo
    await putNota({
      tipo: ['Comite_Comercial', 'Reunion_Cliente', 'Otro'].includes(extraccion.tipo || '') ? extraccion.tipo : 'Otro',
      resumen: extraccion.resumen || '',
      asistentes: extraccion.asistentes || [],
      decisiones: extraccion.decisiones || [],
      action_items: actionItems,
      acta_md: extraccion.acta_md || '',
      contenido_url: contenidoUrl,
      extracto: contenido.slice(0, 800),
      empresa_id: empresaPrincipal || '',
      contactos_ids: contactosResueltos,
      empresas_detectadas: empresasSinMatch,
      contactos_detectados: contactosSinMatch,
      fecha_reunion: fechaReunion || '',
      sugerencia_estado: sugerenciaEstado,
      sugerencia_json: sugerenciaJson,
      estado_procesamiento: 'Procesado',
      error_procesamiento: '',
    });

    return jsonRes({
      ok: true,
      fuente_ia: fuenteIA,
      acta_generada: !!extraccion.acta_md,
      resumen: extraccion.resumen,
      tareas_creadas: actionItems.filter(a => a.tarea_id).length,
      empresa_id: empresaPrincipal || null,
      sugerencia_estado: sugerenciaEstado,
    });

  } catch (e) {
    const msg = String((e as Error)?.message || e).slice(0, 500);
    await putNota({ estado_procesamiento: 'Error', error_procesamiento: msg });
    return jsonRes({ message: msg }, 500);
  }
});