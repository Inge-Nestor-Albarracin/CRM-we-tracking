// Registro de actividad / trazabilidad (audit log estilo HubSpot).
// Cada movimiento en una empresa/contacto/oportunidad se guarda con fecha y QUIÉN lo hizo.
import { base44 } from '@/api/base44Client';

let _user = null;
async function usuarioActual() {
  if (_user) return _user;
  try { _user = await base44.auth.me(); } catch { _user = {}; }
  return _user;
}

// Nombre "bonito" del usuario para mostrar en el feed. Usa PerfilUsuario si existe.
async function nombreUsuario(u) {
  const email = (u?.email || '').toLowerCase();
  try {
    const perfiles = await base44.entities.PerfilUsuario.list();
    const p = (perfiles || []).find(x => (x.email || '').toLowerCase() === email);
    if (p?.nombre) return p.nombre;
  } catch { /* sin perfiles */ }
  return u?.full_name || (email ? email.split('@')[0] : 'Alguien');
}

/**
 * Registra una actividad. Best-effort: si falla, NO bloquea la acción principal.
 * @param {{empresa_id?:string, contacto_id?:string, oportunidad_id?:string, tipo:string, descripcion:string, campo?:string, valor_anterior?:string, valor_nuevo?:string}} datos
 */
export async function registrarActividad(datos) {
  try {
    const u = await usuarioActual();
    const nombre = await nombreUsuario(u);
    await base44.entities.Actividad.create({
      empresa_id: datos.empresa_id || undefined,
      contacto_id: datos.contacto_id || undefined,
      oportunidad_id: datos.oportunidad_id || undefined,
      tipo: datos.tipo || 'edicion',
      descripcion: datos.descripcion || '',
      campo: datos.campo || undefined,
      valor_anterior: datos.valor_anterior != null ? String(datos.valor_anterior) : undefined,
      valor_nuevo: datos.valor_nuevo != null ? String(datos.valor_nuevo) : undefined,
      fecha: new Date().toISOString(),
      usuario_email: u?.email || '',
      usuario_nombre: nombre,
    });
  } catch { /* no bloquear la acción del usuario */ }
}
