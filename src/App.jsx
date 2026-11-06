import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import Layout from '@/components/Layout.jsx';
import { useUserRole } from '@/hooks/useUserRole';
import WeLogo from '@/components/brand/WeLogo';

// Páginas base
import Dashboard from '@/pages/Dashboard.jsx';
import Configuracion from '@/pages/Configuracion.jsx';
import Calendario from '@/pages/Calendario.jsx';
import Metas from '@/pages/Metas.jsx';

// CRM
import Pipeline from '@/pages/crm/Pipeline.jsx';
import Contactos from '@/pages/crm/Contactos.jsx';
import Empresas from '@/pages/crm/Empresas.jsx';
import EmpresaDetalle from '@/pages/crm/EmpresaDetalle.jsx';
import Reuniones from '@/pages/crm/Reuniones.jsx';
import ReunionDetalle from '@/pages/crm/ReunionDetalle.jsx';
import ActasReunion from '@/pages/crm/ActasReunion.jsx';
import ActaPrint from '@/pages/crm/ActaPrint.jsx';
import TareasCRM from '@/pages/crm/Tareas.jsx';
import PanelTareas from '@/pages/crm/PanelTareas.jsx';

// Comercial
import Cotizaciones from '@/pages/comercial/Cotizaciones.jsx';
import CotizacionPrint from '@/pages/comercial/CotizacionPrint.jsx';
import Productos from '@/pages/comercial/Productos.jsx';
import Videos from '@/pages/comercial/Videos.jsx';
import Presentaciones from '@/pages/comercial/Presentaciones.jsx';
import GuiaTags from '@/pages/comercial/GuiaTags.jsx';
import MiFirma from '@/pages/MiFirma.jsx';
import Perfil from '@/pages/Perfil.jsx';
import Inventario from '@/pages/comercial/Inventario.jsx';

// Proyecciones
import Proyecciones from '@/pages/Proyecciones.jsx';

// Email marketing
import Plantillas from '@/pages/email/Plantillas.jsx';
import Campanas from '@/pages/email/Campanas.jsx';
import Segmentos from '@/pages/email/Segmentos.jsx';
import MetricasEmail from '@/pages/email/Metricas.jsx';

// IA Agente + Lead management
import Inbox from '@/pages/inbox/Inbox.jsx';
import ContactoDetalle from '@/pages/crm/ContactoDetalle.jsx';
import AnalyticsLeads from '@/pages/analytics/AnalyticsLeads.jsx';
import ConsumoIA from '@/pages/analytics/ConsumoIA.jsx';
import ConfigAgenteIA from '@/pages/agente/ConfigAgente.jsx';
import TokenCalculator from '@/pages/agente/TokenCalculator.jsx';
import Copiloto from '@/pages/agente/Copiloto.jsx';
import Autoeducacion from '@/pages/agente/Autoeducacion.jsx';
import ConfigEvaluadorPage from '@/pages/agente/ConfigEvaluador.jsx';
import Aprendizajes from '@/pages/agente/Aprendizajes.jsx';
import GrupoTelegram from '@/pages/agente/GrupoTelegram.jsx';
import ChatsInternos from '@/pages/agente/ChatsInternos.jsx';

function AdminOnly({ children }) {
  const { isAdmin, isLoading } = useUserRole();
  if (isLoading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      // Splash de marca (como en el "Diseño App v03"): fondo marino → azul con el logo en negativo.
      <div className="wt-fondo-marca fixed inset-0 flex flex-col items-center justify-center gap-6 overflow-hidden">
        <span className="wt-pildora w-72 h-20 bg-wt-azul/40 -right-16 top-16" aria-hidden="true" />
        <span className="wt-pildora w-56 h-20 bg-white/[0.06] -left-16 bottom-20" aria-hidden="true" />
        <WeLogo className="relative h-10 w-auto text-white" />
        <div className="relative h-1 w-28 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-label="Cargando">
          <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-wt-cian to-wt-azul animate-[wt-carga_1.1s_ease-in-out_infinite]" />
        </div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />

        {/* Bandeja IA */}
        <Route path="/inbox" element={<Inbox />} />

        {/* Copiloto interno */}
        <Route path="/copiloto" element={<Copiloto />} />

        {/* CRM */}
        <Route path="/crm" element={<Navigate to="/crm/pipeline" replace />} />
        <Route path="/crm/pipeline" element={<Pipeline />} />
        <Route path="/crm/empresas" element={<Empresas />} />
        <Route path="/crm/empresas/:id" element={<EmpresaDetalle />} />
        <Route path="/crm/contactos" element={<Contactos />} />
        <Route path="/crm/contactos/:id" element={<ContactoDetalle />} />
        <Route path="/crm/reuniones" element={<Reuniones />} />
        <Route path="/crm/actas" element={<ActasReunion />} />
        <Route path="/crm/reuniones/:id" element={<ReunionDetalle />} />
        <Route path="/crm/tareas" element={<TareasCRM />} />
        <Route path="/crm/panel-tareas" element={<PanelTareas />} />

        {/* Comercial */}
        <Route path="/comercial" element={<Navigate to="/comercial/cotizaciones" replace />} />
        <Route path="/comercial/cotizaciones" element={<Cotizaciones />} />
        <Route path="/comercial/productos" element={<Productos />} />
        <Route path="/comercial/videos" element={<Videos />} />
        <Route path="/comercial/presentaciones" element={<Presentaciones />} />
        <Route path="/comercial/guia-tags" element={<GuiaTags />} />
        <Route path="/perfil" element={<Perfil />} />
        <Route path="/mi-firma" element={<Navigate to="/perfil" replace />} />
        <Route path="/comercial/inventario" element={<Inventario />} />

        {/* Proyecciones - Admin only */}
        <Route path="/proyecciones" element={<AdminOnly><Proyecciones /></AdminOnly>} />

        {/* Email marketing */}
        <Route path="/email" element={<Navigate to="/email/campanas" replace />} />
        <Route path="/email/campanas" element={<Campanas />} />
        <Route path="/email/segmentos" element={<Segmentos />} />
        <Route path="/email/plantillas" element={<Plantillas />} />
        <Route path="/email/metricas" element={<MetricasEmail />} />

        {/* IA Agente */}
        <Route path="/agente/configuracion" element={<AdminOnly><ConfigAgenteIA /></AdminOnly>} />
        <Route path="/agente/tokens" element={<AdminOnly><TokenCalculator /></AdminOnly>} />
        <Route path="/agente/grupo-telegram" element={<AdminOnly><GrupoTelegram /></AdminOnly>} />
        <Route path="/agente/chats-internos" element={<AdminOnly><ChatsInternos /></AdminOnly>} />
        <Route path="/agente/autoeducacion" element={<AdminOnly><Autoeducacion /></AdminOnly>} />
        <Route path="/agente/config-evaluador" element={<AdminOnly><ConfigEvaluadorPage /></AdminOnly>} />
        <Route path="/agente/aprendizajes" element={<AdminOnly><Aprendizajes /></AdminOnly>} />
        <Route path="/analytics/leads" element={<AnalyticsLeads />} />
        <Route path="/analytics/consumo-ia" element={<ConsumoIA />} />

        {/* Equipo - Admin only */}
        <Route path="/equipo/calendario" element={<AdminOnly><Calendario /></AdminOnly>} />
        <Route path="/equipo/metas" element={<AdminOnly><Metas /></AdminOnly>} />

        {/* Sistema */}
        <Route path="/configuracion" element={<Configuracion />} />
        <Route path="/mis-integraciones" element={<Navigate to="/configuracion" replace />} />

        {/* Redirects de rutas antiguas */}
        <Route path="/crm/negocios" element={<Navigate to="/crm/pipeline" replace />} />
        <Route path="/crm/propiedades" element={<Navigate to="/crm/empresas" replace />} />
        <Route path="/crm/propietarios" element={<Navigate to="/crm/contactos" replace />} />
        <Route path="/crm/visitas" element={<Navigate to="/crm/pipeline" replace />} />
        <Route path="/contratos/arriendos" element={<Navigate to="/crm/pipeline" replace />} />
        <Route path="/contratos/ventas" element={<Navigate to="/crm/pipeline" replace />} />
        <Route path="/comercio/inventario" element={<Navigate to="/comercial/inventario" replace />} />
        <Route path="/comercial/simulador" element={<Navigate to="/proyecciones" replace />} />
      </Route>
      {/* Vista imprimible sin Layout (sidebar/header) */}
      <Route path="/comercial/cotizaciones/:id/print" element={<CotizacionPrint />} />
      <Route path="/crm/reuniones/:id/acta" element={<ActaPrint />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App