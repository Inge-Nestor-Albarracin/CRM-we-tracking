// v2026-08-03.cron-reuniones-diarias
// Cron diario: sincroniza las notas de reuniones de la cuenta conectada A NIVEL DE APP
// (Google Drive + Gmail = ms@grouptso.com) y procesa con IA las que queden Pendientes.
// Así las reuniones del día se procesan SOLAS, sin hacerlo manual desde la página de Reuniones.
//
//   GET/POST  /api/apps/{appId}/functions/procesarReunionesDiarias?token=...
//   Params:   token (requerido) · wait=1 (procesa sincrónico y devuelve el resumen; sin él
//             responde al instante y trabaja en segundo plano, ideal para el scheduler).
//   Env:      BASE44_API_KEY, CRON_TOKEN (obligatorio, sin valor por defecto).
//
// NOTA: solo cubre la conexión de APP (por ahora ms@grouptso.com). Teams/OneDrive son
// por-usuario (getCurrentAppUserConnection) y NO entran en la automatización hasta que
// cada perfil conecte su propia cuenta.

const APP_ID = '6a43f4eff47c0d92cfe2b575';
const BASE_URL = 'https://wtapp.base44.app';
const FN_URL = (name: string) => `${BASE_URL}/api/apps/${APP_ID}/functions/${name}`;
// La IA tarda ~30-45s por nota y la función tiene un límite de ejecución, así que se procesa
// un LOTE PEQUEÑO por corrida. Se recomienda agendar el cron cada ~30 min: drena el backlog
// y procesa las reuniones nuevas al poco de aparecer. El resto queda para la siguiente corrida.
const MAX_PROCESAR = 3;
const FECHA_CORTE = '2026-07-01';
const STALE_PROCESANDO_MS = 10 * 60 * 1000;   // notas atascadas en "Procesando" > 10 min -> reintentar
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* eslint-disable @typescript-eslint/no-explicit-any */
function jsonRes(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

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

Deno.serve(async (req) => {
  const apiKey = Deno.env.get('BASE44_API_KEY') || '';
  const cronToken = Deno.env.get('CRON_TOKEN') || '';
  if (!cronToken) return jsonRes({ error: 'CRON_TOKEN no configurado' }, 500);

  const url = new URL(req.url);
  let body: any = {};
  try { body = await req.json(); } catch { /* GET sin body */ }
  // Preferir la cabecera x-cron-token (no queda en logs). ?token= se mantiene por compatibilidad con cron-job.org.
  const token = req.headers.get('x-cron-token') || url.searchParams.get('token') || body.token || '';
  if (token !== cronToken) return jsonRes({ error: 'Unauthorized' }, 401);
  if (!apiKey) return jsonRes({ error: 'BASE44_API_KEY no configurada' }, 500);
  const wait = url.searchParams.get('wait') === '1' || body.wait === true;
  const max = Math.min(Math.max(Number(url.searchParams.get('max') || body.max) || MAX_PROCESAR, 1), 20);
  // Modo "solo hoy": procesa SOLO las reuniones cuya fecha es la de HOY (zona Bogotá).
  const soloHoy = url.searchParams.get('hoy') === '1' || body.hoy === true;
  const hoyBogota = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }); // YYYY-MM-DD

  const hdrs = { 'api_key': apiKey, 'Content-Type': 'application/json' };

  // Debug de dedup: para una nota, muestra su clave de título y las candidatas gemelas.
  const debugId = url.searchParams.get('debug');
  if (debugId) {
    const rN = await fetch(`${BASE_URL}/api/entities/ReunionNota/${debugId}`, { headers: hdrs });
    const nota = rN.ok ? await rN.json() : null;
    if (!nota) return jsonRes({ error: 'nota no encontrada' }, 404);
    const rAll = await fetch(`${BASE_URL}/api/entities/ReunionNota?limit=500&sort=-fecha_reunion`, { headers: hdrs });
    const todas = rAll.ok ? await rAll.json() : [];
    const ck = claveTitulo(nota.titulo || '');
    const fk = String(nota.fecha_reunion || '').slice(0, 10);
    const candidatos = (todas as any[]).filter((r) => r.id !== debugId)
      .map((r) => ({ id: r.id, titulo: r.titulo, fecha: String(r.fecha_reunion || '').slice(0, 10), estado: r.estado_procesamiento, descartada: !!r.descartada, clave: claveTitulo(r.titulo || '') }))
      .filter((r) => r.fecha === fk || r.clave === ck);
    return jsonRes({ nota: { id: debugId, titulo: nota.titulo, fecha: fk, estado: nota.estado_procesamiento, clave: ck, totalNotas: (todas as any[]).length }, candidatos });
  }

  // Diagnóstico rápido (sin procesar): cuántas notas hay por estado.
  if (url.searchParams.get('listar') === '1') {
    const conteo: Record<string, any> = {};
    for (const est of ['Pendiente', 'Error', 'Procesando', 'Procesado']) {
      const r = await fetch(`${BASE_URL}/api/entities/ReunionNota?estado_procesamiento=${est}&limit=100`, { headers: hdrs });
      const arr = r.ok ? await r.json() : [];
      conteo[est] = { total: arr.length, ids: arr.slice(0, 8).map((n: any) => ({ id: n.id, titulo: n.titulo, fecha: n.fecha_reunion, descartada: !!n.descartada })) };
    }
    return jsonRes({ ok: true, conteo });
  }

  const trabajo = async () => {
    const resumen: any = { sincronizadas: 0, deduplicadas: 0, procesadas: 0, pendientes_restantes: 0, fuentes: {} as Record<string, number>, errores: [] as string[] };
    const descartadasAhora = new Set<string>();

    // 1) Sincronizar Drive + Gmail (conexión de app). Cada uno crea ReunionNota Pendiente
    //    y ya deduplica por doc_id/gmail_message_id y por identidad de reunión (fecha+título).
    for (const fn of ['syncMeetingNotesDrive', 'syncMeetingNotesGmail']) {
      try {
        const r = await fetch(FN_URL(fn), { method: 'POST', headers: hdrs, body: '{}' });
        const data = r.ok ? await r.json() : { error: `${fn} ${r.status}` };
        if (data?.connected === false) { resumen.errores.push(`${fn}: no conectado`); continue; }
        const creadas = (data?.creadas || []).length;
        resumen.fuentes[fn] = creadas;
        resumen.sincronizadas += creadas;
        if (data?.error) resumen.errores.push(`${fn}: ${String(data.error).slice(0, 100)}`);
      } catch (e) { resumen.errores.push(`${fn}: ${String(e).slice(0, 100)}`); }
    }

    // 1b) DEDUPLICAR: la misma reunión llega por varias cuentas del equipo (comités con varios
    //     participantes). Se agrupa por identidad (fecha + título normalizado) y se marca como
    //     descartada todo menos la nota más completa de cada grupo, para NO procesarla N veces.
    try {
      const rAll = await fetch(`${BASE_URL}/api/entities/ReunionNota?limit=1000`, { headers: hdrs });
      const todas: any[] = rAll.ok ? await rAll.json() : [];
      const grupos = new Map<string, any[]>();
      for (const n of todas) {
        if (n.descartada) continue;
        const f = String(n.fecha_reunion || '').slice(0, 10);
        const ck = claveTitulo(n.titulo || '');
        if (!f || !ck) continue;
        const k = `${f}|${ck}`;
        const arr = grupos.get(k) || [];
        arr.push(n); grupos.set(k, arr);
      }
      const puntaje = (n: any) => (n.estado_procesamiento === 'Procesado' ? 1000 : 0) + (n.doc_id ? 100 : 0) + ((n.action_items || []).length * 10) + Math.min((n.acta_md || '').length / 100, 50);
      for (const grupo of grupos.values()) {
        if (grupo.length < 2) continue;
        grupo.sort((a, b) => puntaje(b) - puntaje(a));
        for (const dup of grupo.slice(1)) {
          try {
            // Borrar las tareas que generó la nota duplicada (si no, quedan tareas repetidas).
            const rT = await fetch(`${BASE_URL}/api/entities/Tarea?reunion_nota_id=${dup.id}&limit=200`, { headers: hdrs });
            if (rT.ok) for (const t of await rT.json()) { try { await fetch(`${BASE_URL}/api/entities/Tarea/${t.id}`, { method: 'DELETE', headers: hdrs }); } catch { /* ignore */ } }
            const { id: _i, created_date: _c, updated_date: _u, created_by: _b, ...base } = dup;
            base.descartada = true;
            await fetch(`${BASE_URL}/api/entities/ReunionNota/${dup.id}`, { method: 'PUT', headers: hdrs, body: JSON.stringify(base) });
            descartadasAhora.add(dup.id);
            resumen.deduplicadas++;
          } catch { /* ignore */ }
        }
      }
    } catch (e) { resumen.errores.push(`dedup: ${String(e).slice(0, 100)}`); }

    // 2) Reunir las notas por procesar: Pendientes (recién creadas + rezagadas), las que
    //    quedaron en Error (reintento) y las atascadas en "Procesando" hace rato (una corrida
    //    anterior murió por el límite de tiempo). Dedup por id.
    try {
      const porId = new Map<string, any>();
      for (const est of ['Pendiente', 'Error']) {
        const r = await fetch(`${BASE_URL}/api/entities/ReunionNota?estado_procesamiento=${est}&limit=100`, { headers: hdrs });
        if (r.ok) for (const n of await r.json()) porId.set(n.id, n);
      }
      const rProc = await fetch(`${BASE_URL}/api/entities/ReunionNota?estado_procesamiento=Procesando&limit=100`, { headers: hdrs });
      if (rProc.ok) {
        const ahora = Date.now();
        for (const n of await rProc.json()) {
          const upd = new Date(n.updated_date || n.created_date || 0).getTime();
          if (ahora - upd > STALE_PROCESANDO_MS) porId.set(n.id, n);   // solo las atascadas
        }
      }
      let candidatas = [...porId.values()].filter((n) => {
        if (n.descartada || descartadasAhora.has(n.id)) return false;
        const f = String(n.fecha_reunion || '').slice(0, 10);
        if (soloHoy) return f === hoyBogota;           // modo "solo hoy": solo las reuniones de HOY
        return !f || f >= FECHA_CORTE;                 // junio 2026 hacia atrás no se procesa
      });
      // Más recientes primero (procesa antes las reuniones del día).
      candidatas.sort((a, b) => String(b.fecha_reunion || b.created_date || '').localeCompare(String(a.fecha_reunion || a.created_date || '')));
      resumen.pendientes_restantes = Math.max(0, candidatas.length - max);
      for (const n of candidatas.slice(0, max)) {
        try {
          const r = await fetch(FN_URL('procesarReunion'), { method: 'POST', headers: hdrs, body: JSON.stringify({ reunion_nota_id: n.id }) });
          if (r.ok) resumen.procesadas++;
          else resumen.errores.push(`procesar ${n.id}: ${r.status}`);
        } catch (e) { resumen.errores.push(`procesar ${n.id}: ${String(e).slice(0, 80)}`); }
        await sleep(300);                              // no saturar la escritura de Base44
      }
    } catch (e) { resumen.errores.push(`listar pendientes: ${String(e).slice(0, 100)}`); }

    return resumen;
  };

  // Modo sincrónico (para probar a mano): espera y devuelve el resumen.
  if (wait) {
    const resumen = await trabajo();
    return jsonRes({ ok: true, ...resumen });
  }

  // Modo cron: responde al instante y trabaja en segundo plano (evita el corte de ~30s
  // del scheduler mientras la IA procesa cada reunión).
  const bg = trabajo().catch((e) => console.error('procesarReunionesDiarias bg:', String(e).slice(0, 200)));
  try { (globalThis as any).EdgeRuntime?.waitUntil?.(bg); } catch { /* si no existe, ya corre sin await */ }
  return jsonRes({ ok: true, started: true, message: 'Sincronizando y procesando reuniones del día en segundo plano' });
});
