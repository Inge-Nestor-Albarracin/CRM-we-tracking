import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Cotizacion, Empresa, Contacto, base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, FileText, Printer, Send, Copy, CheckCircle2, XCircle, Trash2, Pencil } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import CotizacionForm from '@/components/cotizaciones/CotizacionForm';
import TRMIndicator from '@/components/TRMIndicator';
import { formatMoneda, estadoEfectivo, WETRACKING, APP_URL } from '@/lib/wetracking';
import { useUserRole } from '@/hooks/useUserRole';

const ESTADO_STYLE = {
  Borrador: 'bg-gray-100 text-gray-600',
  Enviada: 'bg-blue-100 text-blue-700',
  Aceptada: 'bg-green-100 text-green-700',
  Rechazada: 'bg-red-100 text-red-600',
  Vencida: 'bg-amber-100 text-amber-700',
};

function cuerpoEmailCotizacion(cot, empresa) {
  const filas = (cot.items || []).map(it => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${it.producto_nombre}${it.descripcion ? `<br><span style="color:#6b7280;font-size:12px;">${it.descripcion}</span>` : ''}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${it.cantidad}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatMoneda(it.precio_unitario, cot.moneda)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatMoneda(it.total_linea, cot.moneda)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f4f4f7;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">
<table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="background:#0b1f3a;padding:20px 28px;">
  <p style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">${WETRACKING.nombre}</p>
  <p style="margin:4px 0 0;color:#8fd3f4;font-size:12px;">${WETRACKING.tagline}</p>
</td></tr>
<tr><td style="padding:24px 28px;">
  <p style="margin:0 0 4px;font-size:18px;color:#111827;font-weight:bold;">Cotización ${cot.numero}</p>
  <p style="margin:0 0 16px;font-size:13px;color:#6b7280;">
    Para: ${empresa?.nombre || ''} · Emitida: ${cot.fecha_emision} · Válida hasta: ${cot.fecha_vencimiento}
  </p>
  <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#111827;border-collapse:collapse;">
    <tr style="background:#f9fafb;color:#6b7280;font-size:11px;text-transform:uppercase;">
      <th style="padding:8px 12px;text-align:left;">Producto</th>
      <th style="padding:8px 12px;text-align:right;">Cant.</th>
      <th style="padding:8px 12px;text-align:right;">Precio</th>
      <th style="padding:8px 12px;text-align:right;">Total</th>
    </tr>
    ${filas}
  </table>
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;font-size:13px;color:#111827;">
    <tr><td></td><td width="230">
      <p style="margin:2px 0;"><span style="color:#6b7280;">Subtotal:</span> <strong style="float:right;">${formatMoneda(cot.subtotal, cot.moneda)}</strong></p>
      ${cot.descuento_total > 0 ? `<p style="margin:2px 0;"><span style="color:#6b7280;">Descuento:</span> <strong style="float:right;">−${formatMoneda(cot.descuento_total, cot.moneda)}</strong></p>` : ''}
      <p style="margin:2px 0;"><span style="color:#6b7280;">IVA ${cot.iva_pct}%:</span> <strong style="float:right;">${formatMoneda(cot.iva_valor, cot.moneda)}</strong></p>
      <p style="margin:6px 0 0;padding-top:6px;border-top:2px solid #0b1f3a;font-size:15px;"><span>Total:</span> <strong style="float:right;">${formatMoneda(cot.total, cot.moneda)}</strong></p>
    </td></tr>
  </table>
  ${cot.condiciones_pago ? `<p style="margin:16px 0 4px;font-size:12px;color:#6b7280;"><strong>Condiciones de pago:</strong> ${cot.condiciones_pago}</p>` : ''}
  ${cot.tiempo_entrega ? `<p style="margin:4px 0;font-size:12px;color:#6b7280;"><strong>Tiempo de entrega:</strong> ${cot.tiempo_entrega}</p>` : ''}
  ${cot.notas ? `<p style="margin:4px 0;font-size:12px;color:#6b7280;">${cot.notas}</p>` : ''}
</td></tr>
<tr><td style="background:#f9fafb;padding:16px 28px;font-size:11px;color:#9ca3af;">
  ${WETRACKING.nombre} · ${WETRACKING.nit} · ${WETRACKING.direccion} · ${WETRACKING.telefono} · ${WETRACKING.web}
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export default function Cotizaciones() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isAdmin } = useUserRole();

  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [filtroEstado, setFiltroEstado] = useState('todas');
  const [filtroEmpresa, setFiltroEmpresa] = useState('todas');
  const [filtroTipo, setFiltroTipo] = useState('todas');
  const [envioTarget, setEnvioTarget] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const { data: cotizaciones = [], isLoading } = useQuery({
    queryKey: ['cotizaciones'],
    queryFn: () => Cotizacion.list('-fecha_emision'),
  });

  const { data: empresas = [] } = useQuery({
    queryKey: ['empresas'],
    queryFn: () => Empresa.list(),
  });

  const { data: contactos = [] } = useQuery({
    queryKey: ['contactos'],
    queryFn: () => Contacto.list(),
  });

  const empresasById = useMemo(() => Object.fromEntries(empresas.map(e => [e.id, e])), [empresas]);
  const contactosById = useMemo(() => Object.fromEntries(contactos.map(c => [c.id, c])), [contactos]);

  // Empresas que tienen al menos una cotización (para el filtro).
  const empresasConCotizacion = useMemo(() => {
    const ids = new Set(cotizaciones.map(c => c.empresa_id).filter(Boolean));
    return empresas.filter(e => ids.has(e.id)).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  }, [empresas, cotizaciones]);

  const cambiarEstado = useMutation({
    mutationFn: ({ id, data }) => Cotizacion.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cotizaciones'] }),
    onError: (err) => toast({ title: 'Error', description: err?.message || String(err), variant: 'destructive' }),
  });

  const duplicar = useMutation({
    mutationFn: async (cot) => {
      const lista = await Cotizacion.list();
      const year = new Date().getFullYear();
      const re = new RegExp(`^COT-${year}-(\\d+)$`);
      const seqs = lista.map(c => c.numero?.match(re)).filter(Boolean).map(m => parseInt(m[1], 10));
      const numero = `COT-${year}-${String((seqs.length ? Math.max(...seqs) : 0) + 1).padStart(3, '0')}`;
      const { id, created_date, updated_date, created_by, ...resto } = cot;
      return Cotizacion.create({
        ...resto, numero, estado: 'Borrador',
        fecha_emision: new Date().toISOString().split('T')[0],
        enviada_a: undefined, fecha_envio: undefined,
      });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['cotizaciones'] });
      toast({ title: `Duplicada como ${res?.numero}` });
    },
    onError: (err) => toast({ title: 'Error al duplicar', description: err?.message || String(err), variant: 'destructive' }),
  });

  const eliminar = useMutation({
    mutationFn: async (cot) => {
      // Borrar también el/los Documento(s) que enlazan a esta cotización.
      try {
        const docs = await base44.entities.Documento.filter({ empresa_id: cot.empresa_id }).catch(() => []);
        for (const d of docs.filter(x => (x.contenido || '').includes(`/cotizaciones/${cot.id}/`))) {
          try { await base44.entities.Documento.delete(d.id); } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
      return Cotizacion.delete(cot.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cotizaciones'] });
      toast({ title: 'Cotización eliminada' });
    },
    onError: (err) => toast({ title: 'Error al eliminar', description: err?.message || String(err), variant: 'destructive' }),
  });

  async function enviarPorEmail() {
    const cot = envioTarget;
    const contacto = contactosById[cot.contacto_id];
    if (!contacto?.email) return;
    setEnviando(true);
    try {
      const empresa = empresasById[cot.empresa_id];
      const html = cuerpoEmailCotizacion(cot, empresa);
      const res = await base44.functions.invoke('sendEmail', {
        modo: 'individual',
        contacto_ids: [cot.contacto_id],
        asunto: `Cotización ${cot.numero} — ${WETRACKING.nombre}`,
        cuerpo_html: html,
      });
      const resultados = res?.resultados ?? [];
      if (resultados.length > 0 && !resultados[0]?.ok) {
        toast({ title: 'Email no enviado', description: resultados[0]?.error || 'El proveedor rechazó el envío', variant: 'destructive' });
      } else {
        await Cotizacion.update(cot.id, { estado: 'Enviada', enviada_a: contacto.email, fecha_envio: new Date().toISOString() });
        qc.invalidateQueries({ queryKey: ['cotizaciones'] });
        toast({ title: 'Cotización enviada', description: `A ${contacto.email}` });
        setEnvioTarget(null);
      }
    } catch (err) {
      toast({ title: 'Error al enviar', description: err?.message || String(err), variant: 'destructive' });
    }
    setEnviando(false);
  }

  const visibles = cotizaciones.filter(c => {
    if (filtroEstado !== 'todas' && estadoEfectivo(c) !== filtroEstado) return false;
    if (filtroEmpresa !== 'todas' && c.empresa_id !== filtroEmpresa) return false;
    if (filtroTipo !== 'todas' && (c.tipo || 'hardware') !== filtroTipo) return false;
    return true;
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Cotizaciones</h1>
          <p className="text-sm text-muted-foreground mt-1">{cotizaciones.length} cotización{cotizaciones.length !== 1 ? 'es' : ''}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <TRMIndicator />
          <Select value={filtroEmpresa} onValueChange={setFiltroEmpresa}>
            <SelectTrigger className="w-52 h-9"><SelectValue placeholder="Empresa" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las empresas</SelectItem>
              {empresasConCotizacion.map(e => <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todo tipo</SelectItem>
              <SelectItem value="hardware">Hardware</SelectItem>
              <SelectItem value="software">Software</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filtroEstado} onValueChange={setFiltroEstado}>
            <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {['Borrador', 'Enviada', 'Aceptada', 'Rechazada', 'Vencida'].map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-9" onClick={() => { setEditando(null); setFormOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Nueva cotización
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando...</div>
      ) : visibles.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">No hay cotizaciones{filtroEstado !== 'todas' ? ` en estado ${filtroEstado}` : ' todavía'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibles.map(cot => {
            const empresa = empresasById[cot.empresa_id];
            const contacto = contactosById[cot.contacto_id];
            const estado = estadoEfectivo(cot);
            return (
              <div key={cot.id} className="bg-card border border-border/40 rounded-xl p-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex-1 min-w-48">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button className="font-semibold text-sm hover:underline" onClick={() => { setEditando(cot); setFormOpen(true); }}>
                        {cot.numero}
                      </button>
                      <Badge className={`text-[10px] border-transparent ${ESTADO_STYLE[estado] || ''}`}>{estado}</Badge>
                      <Badge className={`text-[10px] border-transparent ${cot.tipo === 'software' ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-700'}`}>
                        {cot.tipo === 'software' ? 'Software' : 'Hardware'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {empresa?.nombre || 'Sin empresa'}
                      {contacto && ` · ${contacto.nombre}`}
                      {cot.fecha_emision && ` · ${new Date(cot.fecha_emision + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                      {` · ${(cot.items || []).length} ítem${(cot.items || []).length !== 1 ? 's' : ''}`}
                    </p>
                  </div>
                  <p className="text-base font-bold">{formatMoneda(cot.total, cot.moneda)}</p>
                  <div className="flex items-center gap-1 flex-wrap">
                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { setEditando(cot); setFormOpen(true); }}>
                      <Pencil className="w-3.5 h-3.5 mr-1" /> Editar
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => window.open(`${APP_URL}/comercial/cotizaciones/${cot.id}/print`, '_blank')}>
                      <Printer className="w-3.5 h-3.5 mr-1" /> Imprimir
                    </Button>
                    <Button
                      variant="outline" size="sm" className="h-8 text-xs"
                      disabled={!contacto?.email}
                      title={!contacto?.email ? 'El contacto destinatario no tiene email' : ''}
                      onClick={() => setEnvioTarget(cot)}
                    >
                      <Send className="w-3.5 h-3.5 mr-1" /> Enviar
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 text-xs" title="Duplicar" onClick={() => duplicar.mutate(cot)} disabled={duplicar.isPending}>
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    {isAdmin && (
                    <Button
                      variant="ghost" size="sm"
                      className="h-8 text-xs text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10"
                      title="Eliminar"
                      onClick={() => { if (window.confirm(`¿Eliminar la cotización ${cot.numero}? Esta acción no se puede deshacer.`)) eliminar.mutate(cot); }}
                      disabled={eliminar.isPending}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                    )}
                    {(estado === 'Enviada' || estado === 'Vencida') && (
                      <>
                        <Button variant="ghost" size="sm" className="h-8 text-xs text-green-600" onClick={() => cambiarEstado.mutate({ id: cot.id, data: { estado: 'Aceptada' } })}>
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Aceptada
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 text-xs text-red-500" onClick={() => cambiarEstado.mutate({ id: cot.id, data: { estado: 'Rechazada' } })}>
                          <XCircle className="w-3.5 h-3.5 mr-1" /> Rechazada
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CotizacionForm open={formOpen} onOpenChange={setFormOpen} cotizacion={editando} />

      {/* Confirmación de envío */}
      <Dialog open={!!envioTarget} onOpenChange={(o) => !o && setEnvioTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Enviar cotización</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-1">
            Se enviará <span className="font-medium text-foreground">{envioTarget?.numero}</span> por email a{' '}
            <span className="font-medium text-foreground">{contactosById[envioTarget?.contacto_id]?.email}</span> y quedará en estado Enviada.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnvioTarget(null)}>Cancelar</Button>
            <Button onClick={enviarPorEmail} disabled={enviando}>
              <Send className="w-3.5 h-3.5 mr-1.5" />
              {enviando ? 'Enviando...' : 'Enviar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
