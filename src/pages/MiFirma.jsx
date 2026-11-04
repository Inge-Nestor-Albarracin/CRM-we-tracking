import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { PenLine, Upload, Save, X } from 'lucide-react';

export default function MiFirma() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [user, setUser] = useState(null);
  const [form, setForm] = useState({ nombre: '', cargo: '', firma_url: '' });
  const [subiendo, setSubiendo] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => { base44.auth.me().then(setUser).catch(() => {}); }, []);

  const { data: perfiles = [] } = useQuery({
    queryKey: ['perfiles-usuario'],
    queryFn: () => base44.entities.PerfilUsuario.list(),
    enabled: !!user,
  });
  const perfil = perfiles.find(p => p.email && user?.email && p.email.toLowerCase() === user.email.toLowerCase());

  useEffect(() => {
    if (user) setForm({
      nombre: perfil?.nombre || user.full_name || '',
      cargo: perfil?.cargo || '',
      firma_url: perfil?.firma_url || '',
    });
  }, [perfil, user]);

  async function subirFirma(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubiendo(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm(f => ({ ...f, firma_url: file_url }));
    } catch (err) {
      toast({ title: 'Error al subir la firma', description: err?.message || String(err), variant: 'destructive' });
    }
    setSubiendo(false);
    e.target.value = '';
  }

  async function guardar() {
    if (!user?.email) return;
    try {
      const datos = { email: user.email, nombre: form.nombre, cargo: form.cargo, firma_url: form.firma_url };
      if (perfil?.id) await base44.entities.PerfilUsuario.update(perfil.id, datos);
      else await base44.entities.PerfilUsuario.create({ ...datos, rol: 'Comercial' });
      qc.invalidateQueries({ queryKey: ['perfiles-usuario'] });
      toast({ title: 'Firma guardada', description: 'Aparecerá en las cotizaciones que crees.' });
    } catch (err) {
      toast({ title: 'Error al guardar', description: err?.message || String(err), variant: 'destructive' });
    }
  }

  return (
    <div className="space-y-5 max-w-lg">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
          <PenLine className="w-6 h-6 text-primary" /> Mi firma
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Tu nombre, cargo y firma se ponen en las cotizaciones que tú creas.</p>
      </div>

      <div className="bg-card border border-border/50 rounded-xl p-5 space-y-4">
        <div className="space-y-1.5">
          <Label>Nombre completo</Label>
          <Input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Karen Rojas" />
        </div>
        <div className="space-y-1.5">
          <Label>Cargo</Label>
          <Input value={form.cargo} onChange={e => setForm(f => ({ ...f, cargo: e.target.value }))} placeholder="Gerente General" />
        </div>
        <div className="space-y-1.5">
          <Label>Firma (imagen)</Label>
          <p className="text-[11px] text-muted-foreground -mt-1">PNG con fondo transparente o blanco. Se muestra sobre "Cordialmente:".</p>
          <div className="flex items-center gap-3 mt-1">
            {form.firma_url
              ? <img src={form.firma_url} alt="Firma" className="h-16 w-auto object-contain border border-border/40 rounded-lg bg-white p-1" />
              : <div className="h-16 w-40 rounded-lg bg-muted flex items-center justify-center text-xs text-muted-foreground">Sin firma</div>}
            <div className="flex flex-col gap-1.5">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={subirFirma} />
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={subiendo}>
                <Upload className="w-3.5 h-3.5 mr-1" /> {subiendo ? 'Subiendo...' : form.firma_url ? 'Cambiar' : 'Subir firma'}
              </Button>
              {form.firma_url && <Button type="button" variant="ghost" size="sm" onClick={() => setForm(f => ({ ...f, firma_url: '' }))}><X className="w-3.5 h-3.5 mr-1" /> Quitar</Button>}
            </div>
          </div>
        </div>
        <Button onClick={guardar} className="mt-1"><Save className="w-4 h-4 mr-1" /> Guardar firma</Button>
      </div>
    </div>
  );
}
