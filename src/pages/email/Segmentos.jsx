import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Segmento, Contacto, Empresa } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Users, Building2, Pencil, Trash2, Eye, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import ConstructorSegmento from '@/components/email/ConstructorSegmento';
import { filtrarRegistros, destinatariosDeSegmento, describirCriterio, camposDe } from '@/lib/segmentos';

// Lista de contactos destinatarios (reutilizada en la vista previa y en "Ver")
function ListaDestinatarios({ contactos, empresasById }) {
  if (contactos.length === 0) return <p className="text-sm text-muted-foreground text-center py-6">Ningún contacto con email cumple los criterios.</p>;
  return (
    <div className="divide-y divide-border/40 max-h-80 overflow-y-auto">
      {contactos.map(c => {
        const emp = c.empresa_id ? empresasById[c.empresa_id] : null;
        return (
          <div key={c.id} className="flex items-center gap-3 py-2">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-semibold">{c.nombre?.charAt(0)?.toUpperCase()}</span>
            </div>
            <div className="min-w-0 flex-1">
              <Link to={`/crm/contactos/${c.id}`} className="text-sm font-medium hover:underline">{c.nombre}</Link>
              <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                <Mail className="w-3 h-3" />{c.email}
                {(emp?.nombre || c.empresa) && <span>· {emp?.nombre || c.empresa}</span>}
              </p>
            </div>
            {c.etapa_pipeline && <span className="text-[10px] border border-border text-muted-foreground rounded-full px-1.5 py-0.5 flex-shrink-0">{c.etapa_pipeline}</span>}
          </div>
        );
      })}
    </div>
  );
}

function nuevoVacio(tipo) {
  return { nombre: '', tipo, descripcion: '', logica: 'AND', filtros: [{ campo: camposDe(tipo)[0].key, operador: 'es', valor: '' }] };
}

export default function Segmentos() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(nuevoVacio('contacto'));
  const [verLista, setVerLista] = useState(false);       // preview list toggle en el modal
  const [verSegmento, setVerSegmento] = useState(null);  // dialog "ver contactos" desde la lista

  const { data: segmentos = [], isLoading } = useQuery({ queryKey: ['segmentos'], queryFn: () => Segmento.list('-updated_date') });
  const { data: contactos = [] } = useQuery({ queryKey: ['contactos'], queryFn: () => Contacto.list() });
  const { data: empresas = [] } = useQuery({ queryKey: ['empresas'], queryFn: () => Empresa.list() });

  const empresasById = useMemo(() => Object.fromEntries(empresas.map(e => [e.id, e])), [empresas]);

  // Vista previa: destinatarios (contactos con email) del segmento en edición
  const previewLista = useMemo(() => destinatariosDeSegmento(form, contactos, empresas), [form, contactos, empresas]);
  const preview = useMemo(() => ({
    destinatarios: previewLista.length,
    empresasMatch: form.tipo === 'empresa' ? filtrarRegistros(empresas, form.filtros, form.logica).length : null,
  }), [previewLista, form, empresas]);

  const listaVer = useMemo(() => verSegmento ? destinatariosDeSegmento(verSegmento, contactos, empresas) : [], [verSegmento, contactos, empresas]);

  const conteoPorSegmento = useMemo(() => {
    const map = {};
    for (const s of segmentos) map[s.id] = destinatariosDeSegmento(s, contactos, empresas).length;
    return map;
  }, [segmentos, contactos, empresas]);

  const guardar = useMutation({
    mutationFn: () => {
      const datos = { nombre: form.nombre, tipo: form.tipo, descripcion: form.descripcion, logica: form.logica, filtros: form.filtros.filter(f => f.campo && f.operador) };
      return editId ? Segmento.update(editId, datos) : Segmento.create(datos);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['segmentos'] }); setModal(false); toast({ title: editId ? 'Segmento actualizado' : 'Segmento creado' }); },
    onError: (err) => toast({ title: 'Error al guardar', description: err?.message || String(err), variant: 'destructive' }),
  });

  const eliminar = useMutation({
    mutationFn: (id) => Segmento.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['segmentos'] }),
  });

  function abrirCrear(tipo) { setEditId(null); setForm(nuevoVacio(tipo)); setVerLista(false); setModal(true); }
  function abrirEditar(s) {
    const tipo = s.tipo || 'contacto';
    setEditId(s.id);
    setForm({ nombre: s.nombre, tipo, descripcion: s.descripcion || '', logica: s.logica || 'AND', filtros: (s.filtros || []).length ? s.filtros : [] });
    setVerLista(false);
    setModal(true);
  }
  function cambiarTipo(tipo) {
    // al cambiar de tipo se reinician los criterios (los campos son distintos)
    setForm(f => ({ ...f, tipo, filtros: [{ campo: camposDe(tipo)[0].key, operador: 'es', valor: '' }] }));
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Segmentos</h1>
          <p className="text-muted-foreground text-sm mt-1">Listas de destinatarios por criterios — se usan en las campañas</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => abrirCrear('contacto')}><Users className="w-4 h-4 mr-1" /> Por contacto</Button>
          <Button onClick={() => abrirCrear('empresa')}><Building2 className="w-4 h-4 mr-1" /> Por empresa</Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Cargando...</p>
      ) : segmentos.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">No hay segmentos todavía. Crea uno por contacto o por empresa.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {segmentos.map(s => {
            const tipo = s.tipo || 'contacto';
            return (
              <div key={s.id} className="bg-card border border-border/60 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {tipo === 'empresa' ? <Building2 className="w-3.5 h-3.5 text-muted-foreground/60" /> : <Users className="w-3.5 h-3.5 text-muted-foreground/60" />}
                      <p className="font-medium">{s.nombre}</p>
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground border border-border rounded-full px-1.5 py-0.5">{tipo}</span>
                    </div>
                    {s.descripcion && <p className="text-xs text-muted-foreground mt-0.5">{s.descripcion}</p>}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(s.filtros || []).filter(f => f.campo && f.operador).map((f, i) => (
                        <span key={i} className="text-[11px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{describirCriterio(tipo, f)}</span>
                      ))}
                      {(s.filtros || []).filter(f => f.campo && f.operador).length === 0 && (
                        <span className="text-[11px] text-muted-foreground">Todos</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <button className="text-right hover:opacity-70" onClick={() => setVerSegmento(s)} title="Ver contactos">
                      <p className="text-lg font-semibold leading-none">{conteoPorSegmento[s.id] ?? '—'}</p>
                      <p className="text-[11px] text-muted-foreground">destinatarios</p>
                    </button>
                    <button className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground" onClick={() => setVerSegmento(s)} title="Ver contactos"><Eye className="w-3.5 h-3.5" /></button>
                    <button className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground" onClick={() => abrirEditar(s)}><Pencil className="w-3.5 h-3.5" /></button>
                    <button className="p-1.5 hover:bg-destructive/10 hover:text-destructive rounded-lg text-muted-foreground" onClick={() => { if (confirm(`¿Eliminar el segmento "${s.nombre}"?`)) eliminar.mutate(s.id); }}><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? 'Editar segmento' : 'Nuevo segmento'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-1">
            {/* Tipo */}
            <div className="space-y-1.5">
              <Label>Tipo de segmento</Label>
              <div className="flex gap-2">
                <button type="button" onClick={() => cambiarTipo('contacto')} className={`flex-1 flex items-center justify-center gap-2 border rounded-lg px-3 py-2 text-sm ${form.tipo === 'contacto' ? 'border-primary bg-primary/5 font-medium' : 'hover:bg-muted'}`}>
                  <Users className="w-4 h-4" /> Por contacto
                </button>
                <button type="button" onClick={() => cambiarTipo('empresa')} className={`flex-1 flex items-center justify-center gap-2 border rounded-lg px-3 py-2 text-sm ${form.tipo === 'empresa' ? 'border-primary bg-primary/5 font-medium' : 'hover:bg-muted'}`}>
                  <Building2 className="w-4 h-4" /> Por empresa
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {form.tipo === 'empresa'
                  ? 'Filtras empresas; los destinatarios de la campaña serán los contactos de esas empresas.'
                  : 'Filtras contactos directamente.'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nombre *</Label>
                <Input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder={form.tipo === 'empresa' ? 'Ej: Clientes activos de Oil & Energy' : 'Ej: Calificados de Oil & Energy'} />
              </div>
              <div className="space-y-1.5">
                <Label>Descripción</Label>
                <Input value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Opcional" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Criterios {form.tipo === 'empresa' ? 'de la empresa' : 'del contacto'}</Label>
              <ConstructorSegmento
                tipo={form.tipo}
                filtros={form.filtros}
                setFiltros={(filtros) => setForm(f => ({ ...f, filtros }))}
                logica={form.logica}
                setLogica={(logica) => setForm(f => ({ ...f, logica }))}
              />
            </div>

            <div>
              <div className="flex items-center justify-between bg-muted/40 rounded-lg px-3 py-2">
                <span className="text-sm text-muted-foreground">
                  {form.tipo === 'empresa' ? `${preview.empresasMatch} empresas · destinatarios (contactos con email)` : 'Contactos con email que cumplen'}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-semibold">{preview.destinatarios}</span>
                  {preview.destinatarios > 0 && (
                    <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setVerLista(v => !v)}>
                      <Eye className="w-3.5 h-3.5 mr-1" /> {verLista ? 'Ocultar' : 'Ver'}
                    </Button>
                  )}
                </div>
              </div>
              {verLista && (
                <div className="border border-border/60 rounded-lg px-3 mt-2">
                  <ListaDestinatarios contactos={previewLista} empresasById={empresasById} />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(false)}>Cancelar</Button>
            <Button onClick={() => guardar.mutate()} disabled={!form.nombre || guardar.isPending}>{guardar.isPending ? 'Guardando...' : 'Guardar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ver contactos de un segmento */}
      <Dialog open={!!verSegmento} onOpenChange={(o) => !o && setVerSegmento(null)}>
        <DialogContent className="max-w-lg max-h-[90vh]">
          <DialogHeader><DialogTitle>{verSegmento?.nombre} — {listaVer.length} destinatarios</DialogTitle></DialogHeader>
          <div className="px-1">
            <ListaDestinatarios contactos={listaVer} empresasById={empresasById} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerSegmento(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
