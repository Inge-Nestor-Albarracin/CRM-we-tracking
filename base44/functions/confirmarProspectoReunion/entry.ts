// v2026-07-29.2-multi-empresa
// Confirma los prospectos nuevos detectados en una reunión: crea UNA O VARIAS Empresas
// (por dominio de correo) + sus Contacto(s) + una Oportunidad por empresa, y enlaza HACIA ATRÁS
// la reunión (a la empresa principal) y todas sus tareas.
// POST body: { reunion_nota_id: string }
// Env: BASE44_API_KEY. AUTOCONTENIDO (sin imports de ../../shared).

const BASE_URL = 'https://wtapp.base44.app';

function jsonRes(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

function normalizar(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(s\.?a\.?s\.?|ltda\.?|s\.?a\.?|sas|ltda)\b/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

type ContactoSug = { nombre?: string; email?: string; cargo?: string };
type EmpresaSug = { empresa_nombre?: string; dominio?: string; contactos?: ContactoSug[] };
type Sugerencia = { empresas?: EmpresaSug[]; empresa_nombre?: string; dominio?: string; contactos?: ContactoSug[] };

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonRes({ message: 'Solo POST' }, 405);

  const apiKey = Deno.env.get('BASE44_API_KEY') || '';
  if (!apiKey) return jsonRes({ message: 'BASE44_API_KEY no configurada' }, 500);
  const hdrs = { 'api_key': apiKey, 'Content-Type': 'application/json' };

  let body: { reunion_nota_id?: string };
  try { body = await req.json(); } catch { return jsonRes({ message: 'Body JSON invalido' }, 400); }
  const notaId = body.reunion_nota_id;
  if (!notaId) return jsonRes({ message: 'reunion_nota_id es requerido' }, 400);

  try {
    // 1. Cargar la reunión
    const rNota = await fetch(`${BASE_URL}/api/entities/ReunionNota/${notaId}`, { headers: hdrs });
    if (!rNota.ok) return jsonRes({ message: 'ReunionNota no encontrada' }, 404);
    const nota = await rNota.json();

    if (nota.sugerencia_estado === 'confirmada') {
      return jsonRes({ ok: true, ya_confirmada: true, empresa_id: nota.empresa_id, oportunidad_id: nota.oportunidad_id, contacto_ids: nota.contactos_ids || [] });
    }

    let sug: Sugerencia = {};
    try { sug = JSON.parse(nota.sugerencia_json || '{}'); } catch { sug = {}; }
    // Normaliza a un arreglo de empresas (compat con el formato viejo de una sola empresa).
    const empresasSug: EmpresaSug[] = (Array.isArray(sug.empresas) && sug.empresas.length)
      ? sug.empresas
      : (sug.empresa_nombre ? [{ empresa_nombre: sug.empresa_nombre, dominio: sug.dominio, contactos: sug.contactos }] : []);
    if (empresasSug.length === 0) return jsonRes({ message: 'La reunión no tiene un prospecto sugerido para confirmar' }, 400);
    const fecha = (nota.fecha_reunion || '').slice(0, 10) || new Date().toISOString().slice(0, 10);

    // Empresas existentes (para reutilizar por nombre o dominio, sin duplicar).
    let empresasCRM: { id: string; nombre: string; dominio_web?: string }[] = [];
    const rEmp = await fetch(`${BASE_URL}/api/entities/Empresa?limit=500`, { headers: hdrs });
    if (rEmp.ok) empresasCRM = await rEmp.json();

    const empresaIds: string[] = [];
    const oportunidadIds: string[] = [];
    const contactoIds: string[] = [];
    const creado: { empresa: string; empresa_id: string; contactos: number; oportunidad_id: string }[] = [];

    // Crea CADA empresa detectada (con su dominio) + sus contactos + una oportunidad.
    for (const emp of empresasSug) {
      const empresaNombre = (emp.empresa_nombre || '').trim();
      if (!empresaNombre) continue;
      const dominio = (emp.dominio || '').toLowerCase();
      const objetivo = normalizar(empresaNombre);

      let empresaId = '';
      const match = empresasCRM.find(e => normalizar(e.nombre) === objetivo
        || (!!dominio && String(e.dominio_web || '').toLowerCase().includes(dominio)));
      if (match) empresaId = match.id;
      if (!empresaId) {
        const payloadE: Record<string, unknown> = { nombre: empresaNombre, estado: 'Prospecto', notas: `Creada por NOVA desde la reunión "${nota.titulo}"${fecha ? ` (${fecha})` : ''}` };
        if (dominio) payloadE.dominio_web = dominio;
        const rNew = await fetch(`${BASE_URL}/api/entities/Empresa`, { method: 'POST', headers: hdrs, body: JSON.stringify(payloadE) });
        if (!rNew.ok) continue;
        empresaId = (await rNew.json()).id;
        empresasCRM.push({ id: empresaId, nombre: empresaNombre, dominio_web: dominio });
      }

      // Contactos de esta empresa (reutiliza por email; si no, crea).
      const idsEmp: string[] = [];
      for (const c of (emp.contactos || [])) {
        const nombre = (c.nombre || '').trim();
        if (!nombre) continue;
        const email = (c.email || '').trim();
        let contactoId = '';
        if (email) {
          const rB = await fetch(`${BASE_URL}/api/entities/Contacto?email=${encodeURIComponent(email)}`, { headers: hdrs });
          if (rB.ok) { const f = await rB.json(); if (Array.isArray(f) && f.length > 0) contactoId = f[0].id; }
        }
        if (!contactoId) {
          const payloadC: Record<string, unknown> = { nombre, empresa: empresaNombre, empresa_id: empresaId, etapa_pipeline: 'Lead', canal_adquisicion: 'Reunión', fecha_primer_contacto: fecha };
          if (email) payloadC.email = email;
          if (c.cargo) payloadC.cargo = c.cargo;
          const rNewC = await fetch(`${BASE_URL}/api/entities/Contacto`, { method: 'POST', headers: hdrs, body: JSON.stringify(payloadC) });
          if (rNewC.ok) contactoId = (await rNewC.json()).id || '';
        }
        if (contactoId) { idsEmp.push(contactoId); contactoIds.push(contactoId); }
        await new Promise(r => setTimeout(r, 100));
      }

      // Oportunidad de esta empresa (primera etapa del pipeline).
      let oportunidadId = '';
      const rOp = await fetch(`${BASE_URL}/api/entities/Oportunidad`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ nombre: empresaNombre, empresa_id: empresaId, contacto_id: idsEmp[0] || undefined, etapa: 'Visita_Inicial', origen: 'Reunión', descripcion: `Creada por NOVA desde la reunión "${nota.titulo}"${fecha ? ` (${fecha})` : ''}` }),
      });
      if (rOp.ok) oportunidadId = (await rOp.json()).id || '';

      empresaIds.push(empresaId);
      if (oportunidadId) oportunidadIds.push(oportunidadId);
      creado.push({ empresa: empresaNombre, empresa_id: empresaId, contactos: idsEmp.length, oportunidad_id: oportunidadId });
      await new Promise(r => setTimeout(r, 120));
    }

    if (empresaIds.length === 0) throw new Error('No se pudo crear ninguna empresa');

    // La reunión se liga a la empresa PRINCIPAL (la primera) + TODOS los contactos creados.
    const empresaId = empresaIds[0];
    const oportunidadId = oportunidadIds[0] || nota.oportunidad_id || '';
    const contactoPrincipal = contactoIds[0] || '';

    // 5. Enlazar la reunión (PUT full-replace: leer -> merge -> PUT completo).
    const { id: _i, created_date: _c, updated_date: _u, created_by: _b, ...notaBase } = nota;
    Object.assign(notaBase, {
      empresa_id: empresaId,
      contactos_ids: contactoIds,
      oportunidad_id: oportunidadId,
      sugerencia_estado: 'confirmada',
    });
    await fetch(`${BASE_URL}/api/entities/ReunionNota/${notaId}`, {
      method: 'PUT', headers: hdrs, body: JSON.stringify(notaBase),
    });

    // 6. Enlazar TODAS las tareas de la reunión (trazabilidad total).
    let tareasActualizadas = 0;
    try {
      const rT = await fetch(`${BASE_URL}/api/entities/Tarea?reunion_nota_id=${notaId}&limit=1000`, { headers: hdrs });
      if (rT.ok) {
        const tareas: Record<string, unknown>[] = await rT.json();
        for (const t of tareas) {
          const { id: ti, created_date: _tc, updated_date: _tu, created_by: _tb, ...tareaBase } = t as { id: string } & Record<string, unknown>;
          Object.assign(tareaBase, {
            empresa_id: empresaId,
            contacto_id: contactoPrincipal || tareaBase.contacto_id || '',
            oportunidad_id: oportunidadId || tareaBase.oportunidad_id || '',
          });
          try {
            const rUp = await fetch(`${BASE_URL}/api/entities/Tarea/${ti}`, {
              method: 'PUT', headers: hdrs, body: JSON.stringify(tareaBase),
            });
            if (rUp.ok) tareasActualizadas++;
          } catch { /* seguir con el resto */ }
          await new Promise(r => setTimeout(r, 120));
        }
      }
    } catch { /* si falla el enlace de tareas, la empresa/contacto/deal ya quedaron */ }

    return jsonRes({
      ok: true,
      empresa_id: empresaId,
      empresas: creado,
      contacto_ids: contactoIds,
      oportunidad_id: oportunidadId || null,
      tareas_actualizadas: tareasActualizadas,
    });
  } catch (e) {
    return jsonRes({ message: String((e as Error)?.message || e).slice(0, 500) }, 500);
  }
});
