import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { CalendarPlus, Mail, Link, Unlink, CheckCircle2, Loader2, MessageSquare, Cloud } from 'lucide-react';

const CALENDAR_CONNECTOR_ID = '6a18839dc1f7c1f1c25e5638';
const TEAMS_CONNECTOR_ID = '6a6abe4e8046024839fa9ea7';
const ONEDRIVE_CONNECTOR_ID = '6a6ac2bcc7f6324a62b63151';
const GMAIL2_CONNECTOR_ID = '6a739cba0cfbf2c423f6d6f2'; // "WeTracking Gmail Karen" (cuenta Gmail adicional por usuario)
const CALENDAR2_CONNECTOR_ID = '6a739d78248267b88077301d'; // "WeTracking Calendar Karen" (calendario adicional por usuario)

export default function IntegracionesTab() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [calConnected, setCalConnected] = useState(false);
  const [calLoading, setCalLoading] = useState(true);

  const [cal2Connected, setCal2Connected] = useState(false);
  const [cal2Loading, setCal2Loading] = useState(true);

  const [gmail2Connected, setGmail2Connected] = useState(false);
  const [gmail2Email, setGmail2Email] = useState('');
  const [gmail2Loading, setGmail2Loading] = useState(true);

  const [teamsConnected, setTeamsConnected] = useState(false);
  const [teamsEmail, setTeamsEmail] = useState('');
  const [teamsLoading, setTeamsLoading] = useState(true);

  const [oneDriveConnected, setOneDriveConnected] = useState(false);
  const [oneDriveEmail, setOneDriveEmail] = useState('');
  const [oneDriveLoading, setOneDriveLoading] = useState(true);

  // Rule 2: reusable fetch — doubles as connection check AND data loader
  const checkCalendar = async () => {
    setCalLoading(true);
    try {
      const res = await base44.functions.invoke('checkCalendarConnection', {});
      setCalConnected(res.data?.connected || false);
    } catch {
      setCalConnected(false);
    }
    setCalLoading(false);
  };

  const checkCalendar2 = async () => {
    setCal2Loading(true);
    try {
      const res = await Promise.race([
        base44.functions.invoke('checkCalendarConnection2', {}),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
      ]);
      const data = res?.data ?? res;
      setCal2Connected(data?.connected || false);
    } catch {
      setCal2Connected(false);
    }
    setCal2Loading(false);
  };

  const checkGmail2 = async () => {
    setGmail2Loading(true);
    try {
      const res = await Promise.race([
        base44.functions.invoke('checkGmailKarenConnection', {}),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
      ]);
      const data = res?.data ?? res;
      setGmail2Connected(data?.connected || false);
      setGmail2Email(data?.email || '');
    } catch {
      setGmail2Connected(false);
    }
    setGmail2Loading(false);
  };

  const checkTeams = async () => {
    setTeamsLoading(true);
    try {
      const res = await Promise.race([
        base44.functions.invoke('checkTeamsConnection', {}),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
      ]);
      const data = res?.data ?? res;
      setTeamsConnected(data?.connected || false);
      setTeamsEmail(data?.email || data?.displayName || '');
    } catch {
      setTeamsConnected(false);
    }
    setTeamsLoading(false);
  };

  const checkOneDrive = async () => {
    setOneDriveLoading(true);
    try {
      const res = await Promise.race([
        base44.functions.invoke('checkOneDriveConnection', {}),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
      ]);
      const data = res?.data ?? res;
      setOneDriveConnected(data?.connected || false);
      setOneDriveEmail(data?.email || data?.displayName || '');
    } catch {
      setOneDriveConnected(false);
    }
    setOneDriveLoading(false);
  };

  // Rule 1+2: check auth first, then fetch to detect connection status
  useEffect(() => {
    base44.auth.isAuthenticated().then(async (authed) => {
      if (authed) {
        const me = await base44.auth.me();
        setUser(me);
        checkCalendar();
        checkCalendar2();
        checkGmail2();
        checkTeams();
        checkOneDrive();
      }
      setLoading(false);
    });
  }, []);

  // Rule 3: open OAuth popup, poll for close, then re-fetch
  const handleConnect = async (connectorId, recheckFn) => {
    let url;
    try {
      url = await base44.connectors.connectAppUser(connectorId);
    } catch (err) {
      alert('No se pudo iniciar la conexión con Google: ' + (err?.message || err));
      return;
    }
    const popup = window.open(url, '_blank');
    if (!popup) {
      // Popup bloqueado por el navegador → abrir en la misma pestaña
      window.location.href = url;
      return;
    }
    // Re-chequea al cerrar el popup y también un failsafe a los 90s por si queda abierto
    const timer = setInterval(() => {
      if (popup.closed) {
        clearInterval(timer);
        recheckFn();
      }
    }, 500);
    setTimeout(() => clearInterval(timer), 90000);
  };

  const handleDisconnect = async (connectorId, resetFn) => {
    await base44.connectors.disconnectAppUser(connectorId);
    resetFn();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="bg-card rounded-xl p-6 text-center">
        <p className="text-sm text-muted-foreground mb-3">Inicia sesión para conectar tus integraciones</p>
        <Button onClick={() => base44.auth.redirectToLogin()} size="sm" className="rounded-lg">
          Iniciar sesión
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Estas conexiones son POR PERSONA: viven en la sesión de quien está logueado,
          no en la app. Se dice explícito porque antes parecía "dato general". */}
      <div className="rounded-xl border border-border bg-muted/40 px-4 py-3">
        <p className="text-sm font-semibold text-foreground">Tus conexiones</p>
        <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
          Lo de abajo es <strong>tuyo</strong>, no de la empresa: estás conectando como{' '}
          <strong>{user?.email || 'tu usuario'}</strong>. Cada persona del equipo entra con su usuario y
          conecta sus propias cuentas; lo que conectes aquí no le aparece a nadie más.
        </p>
      </div>

      {/* Gmail por usuario: cada persona conecta SU cuenta y sus notas entran solas.
          Va de PRIMERO y fuera del bloque de admin: los que más lo necesitan (el equipo,
          incluida gente de otra empresa) no son admins y antes ni veían esta tarjeta. */}
      <ConnectorCard
        icon={Mail}
        iconBg="bg-blue-50 dark:bg-blue-950/30"
        iconColor="text-blue-600"
        title="Mi Gmail — mis notas de reuniones"
        description="Conecta TU propia cuenta de Gmail. Al abrir el CRM se importan solas las notas de Gemini de tus reuniones y la IA crea el resumen y las tareas. Cada persona del equipo conecta la suya; si varios estuvieron en la misma reunión, se guarda una sola vez."
        connected={gmail2Connected}
        loading={gmail2Loading}
        statusExtra={gmail2Email ? `(${gmail2Email})` : ''}
        onConnect={() => handleConnect(GMAIL2_CONNECTOR_ID, checkGmail2)}
        onDisconnect={() => handleDisconnect(GMAIL2_CONNECTOR_ID, () => { setGmail2Connected(false); setGmail2Email(''); })}
        connectLabel="Conectar Gmail"
        disconnectLabel="Desconectar"
      />

      {/* Microsoft Teams */}
      <ConnectorCard
        icon={MessageSquare}
        iconBg="bg-indigo-50 dark:bg-indigo-950/30"
        iconColor="text-indigo-600"
        title="Microsoft Teams"
        description="Conecta tu cuenta para sincronizar las transcripciones de tus reuniones de Teams (igual que Google Drive). La IA procesa cada transcripción, genera el acta y crea las tareas. Cada usuario conecta su propia cuenta."
        connected={teamsConnected}
        loading={teamsLoading}
        statusExtra={teamsEmail ? `(${teamsEmail})` : ''}
        onConnect={() => handleConnect(TEAMS_CONNECTOR_ID, checkTeams)}
        onDisconnect={() => handleDisconnect(TEAMS_CONNECTOR_ID, () => { setTeamsConnected(false); setTeamsEmail(''); })}
        connectLabel="Conectar Teams"
        disconnectLabel="Desconectar"
      />

      {/* OneDrive */}
      <ConnectorCard
        icon={Cloud}
        iconBg="bg-sky-50 dark:bg-sky-950/30"
        iconColor="text-sky-600"
        title="OneDrive — Notas de reuniones"
        description="Conecta tu cuenta de OneDrive para sincronizar archivos con notas de reuniones (Word, texto) igual que Google Drive. La IA procesa cada archivo, genera el acta y crea las tareas. Cada usuario conecta su propia cuenta."
        connected={oneDriveConnected}
        loading={oneDriveLoading}
        statusExtra={oneDriveEmail ? `(${oneDriveEmail})` : ''}
        onConnect={() => handleConnect(ONEDRIVE_CONNECTOR_ID, checkOneDrive)}
        onDisconnect={() => handleDisconnect(ONEDRIVE_CONNECTOR_ID, () => { setOneDriveConnected(false); setOneDriveEmail(''); })}
        connectLabel="Conectar OneDrive"
        disconnectLabel="Desconectar"
      />

      {/* Google Calendar */}
      <ConnectorCard
        icon={CalendarPlus}
        iconBg="bg-green-50 dark:bg-green-950/30"
        iconColor="text-green-600"
        title="Google Calendar"
        description="Cuando conectas tu cuenta, cada tarea que crees se agrega automáticamente a tu Google Calendar como evento de 30 minutos."
        connected={calConnected}
        loading={calLoading}
        onConnect={() => handleConnect(CALENDAR_CONNECTOR_ID, checkCalendar)}
        onDisconnect={() => handleDisconnect(CALENDAR_CONNECTOR_ID, () => setCalConnected(false))}
        connectLabel="Conectar Google Calendar"
        disconnectLabel="Desconectar Calendar"
      />

      {/* Google Calendar — Cuenta adicional (WeTracking Calendar Karen) */}
      <ConnectorCard
        icon={CalendarPlus}
        iconBg="bg-green-50 dark:bg-green-950/30"
        iconColor="text-green-600"
        title="Google Calendar — Cuenta adicional"
        description="Conecta una segunda cuenta de Google Calendar con las mismas capacidades que la principal: crear eventos (con Meet e invitados), listar y verificar. Cada usuario conecta su propia cuenta."
        connected={cal2Connected}
        loading={cal2Loading}
        onConnect={() => handleConnect(CALENDAR2_CONNECTOR_ID, checkCalendar2)}
        onDisconnect={() => handleDisconnect(CALENDAR2_CONNECTOR_ID, () => setCal2Connected(false))}
        connectLabel="Conectar Google Calendar"
        disconnectLabel="Desconectar"
      />

    </div>
  );
}

export function ConnectorCard({ icon: Icon, iconBg, iconColor, title, description, connected, loading, statusExtra, onConnect, onDisconnect, connectLabel, disconnectLabel }) {
  return (
    <div className="bg-card rounded-xl p-5 space-y-3">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center flex-shrink-0`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            {loading ? (
              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
            ) : connected ? (
              <span className="flex items-center gap-1 text-[10px] font-medium text-green-700 bg-green-100 dark:bg-green-950/40 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3" /> Conectado {statusExtra}
              </span>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1 flex-wrap">
        {connected ? (
          <>
            <Button onClick={onConnect} variant="outline" size="sm" className="gap-2 rounded-lg">
              <Link className="w-3.5 h-3.5" /> Reconectar
            </Button>
            <Button onClick={onDisconnect} variant="outline" size="sm" className="gap-2 rounded-lg text-destructive border-destructive/30 hover:bg-destructive/5">
              <Unlink className="w-3.5 h-3.5" /> {disconnectLabel}
            </Button>
          </>
        ) : (
          <Button onClick={onConnect} size="sm" className="gap-2 rounded-lg" disabled={loading}>
            <Link className="w-3.5 h-3.5" /> {loading ? 'Verificando...' : connectLabel}
          </Button>
        )}
        <p className="text-xs text-muted-foreground">Solo afecta tu cuenta — cada usuario conecta la suya.</p>
      </div>
    </div>
  );
}