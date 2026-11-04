import { useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Camera, Trash2 } from 'lucide-react';
import { Favicon } from './SelectorEmpresa';
import { useToast } from '@/components/ui/use-toast';

/**
 * Logo de la empresa con opción de cambiarlo: al pasar el mouse aparece una
 * cámara que abre el selector de archivo; el logo se sube y se guarda en
 * Empresa.logo_url. Si ya hay logo propio, se puede quitar para volver al
 * logo que sale del dominio web.
 * Props: empresa, onCambio(url), className
 */
export default function LogoEmpresaEditable({ empresa, onCambio, className = 'w-11 h-11' }) {
  const inputRef = useRef(null);
  const { toast } = useToast();
  const [subiendo, setSubiendo] = useState(false);

  async function subir(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSubiendo(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
      await onCambio(file_url);
      toast({ title: 'Logo actualizado' });
    } catch (err) {
      toast({ title: 'No se pudo subir el logo', description: err?.message || String(err), variant: 'destructive' });
    } finally {
      setSubiendo(false);
    }
  }

  async function quitar() {
    try {
      await onCambio('');
      toast({ title: 'Logo quitado' });
    } catch (err) {
      toast({ title: 'No se pudo quitar el logo', description: err?.message || String(err), variant: 'destructive' });
    }
  }

  return (
    <div className="relative group flex-shrink-0">
      <Favicon empresa={empresa} className={`${className} p-1 border border-border/40`} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={subiendo}
        title="Cambiar logo"
        className="absolute inset-0 rounded bg-black/50 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity flex items-center justify-center"
      >
        {subiendo
          ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          : <Camera className="w-4 h-4 text-white" />}
      </button>
      {empresa?.logo_url && !subiendo && (
        <button
          type="button"
          onClick={quitar}
          title="Quitar logo"
          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-background border border-border shadow-sm flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={subir} />
    </div>
  );
}