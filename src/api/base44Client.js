import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

//Create a client with authentication required
export const base44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: '',
  requiresAuth: false,
  appBaseUrl
});

// Named entity exports for convenient imports
export const Contacto = base44.entities.Contacto;
export const Tarea = base44.entities.Tarea;
export const Nota = base44.entities.Nota;

// CRM B2B entities
export const Empresa = base44.entities.Empresa;
export const Oportunidad = base44.entities.Oportunidad;
export const ReunionNota = base44.entities.ReunionNota;

// Comercial: catálogo, inventario y cotizaciones
export const Producto = base44.entities.Producto;
export const MovimientoInventario = base44.entities.MovimientoInventario;
export const Cotizacion = base44.entities.Cotizacion;

// Email marketing entities
export const PlantillaEmail = base44.entities.PlantillaEmail;
export const Campana = base44.entities.Campana;
export const EmailEnviado = base44.entities.EmailEnviado;
export const Segmento = base44.entities.Segmento;

// IA Agente entities
export const Conversacion = base44.entities.Conversacion;
export const MensajeConversacion = base44.entities.MensajeConversacion;
export const HistorialLead = base44.entities.HistorialLead;
export const ConfigAgente = base44.entities.ConfigAgente;
export const ConocimientoRAG = base44.entities.ConocimientoRAG;
export const MemoriaChats = base44.entities.MemoriaChats;
