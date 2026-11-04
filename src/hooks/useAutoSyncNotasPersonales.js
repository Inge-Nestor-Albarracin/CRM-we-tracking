import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';

// Sincroniza las notas de Gemini del Gmail PROPIO de quien está usando el CRM.
// Cada persona conecta su cuenta una sola vez (Configuración → Integraciones →
// "Gmail — Mis notas de reuniones") y a partir de ahí sus reuniones entran solas.
//
// Por qué se dispara desde el navegador y no desde un cron: el conector por usuario
// (getCurrentAppUserConnection) necesita la sesión de la persona, así que el servidor
// no puede leer buzones ajenos por su cuenta. El disparo ocurre al abrir el CRM.
//
// Por qué la función se llama "gmailKarenBandeja": es la que maneja el conector de
// Gmail por usuario y acepta { sincronizar_notas: true }. La app está en el tope de 50
// funciones de Base44, así que no se puede crear una con mejor nombre.
//
// La misma reunión con varios asistentes NO se duplica: el backend deduplica por
// clave fecha|título antes de crear la nota.

const CLAVE_SESION = 'wt_autosync_notas_v1'; // una corrida por sesión de navegador
const MAX_PROCESAR = 15; // techo de notas a procesar con IA por corrida

export function useAutoSyncNotasPersonales(email) {
  const qc = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    if (!email) return;
    const clave = `${CLAVE_SESION}:${email}`;
    try {
      if (sessionStorage.getItem(clave)) return;
      sessionStorage.setItem(clave, String(Date.now()));
    } catch {
      return; // sin sessionStorage no arriesgamos correr en cada navegación
    }

    let cancelado = false;
    (async () => {
      try {
        const res = await base44.functions.invoke('gmailKarenBandeja', { sincronizar_notas: true });
        const data = res?.data ?? res;
        // Sin Gmail propio conectado -> silencio total, no es un error del usuario.
        if (cancelado || data?.connected === false) return;

        const creadas = (data?.creadas || []).slice(0, MAX_PROCESAR);
        if (!creadas.length) return;

        qc.invalidateQueries({ queryKey: ['reuniones'] });
        toast({
          title: `${creadas.length} reunión(es) nuevas de tu correo`,
          description: 'Procesando con IA en segundo plano...',
        });

        for (const id of creadas) {
          if (cancelado) return;
          try {
            await base44.functions.invoke('procesarReunion', { reunion_nota_id: id });
          } catch {
            /* la nota queda en Pendiente y se puede reprocesar desde Reuniones */
          }
          qc.invalidateQueries({ queryKey: ['reuniones'] });
        }
        qc.invalidateQueries({ queryKey: ['tareas-global'] });
      } catch {
        /* el auto-sync nunca interrumpe: si falla, queda el botón manual */
      }
    })();

    return () => { cancelado = true; };
  }, [email, qc, toast]);
}
