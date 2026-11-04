import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutGrid, Users, Settings, LogOut, Menu, X,
  ChevronRight, ClipboardList,
  Building2, Briefcase, Package, Tags, NotebookPen,
  BarChart3, MessageSquare, Bot, LineChart,
  Mail, Send, FileText, Sparkles, Video, Radar, GraduationCap, SlidersHorizontal, Lightbulb, Presentation, CircleUser,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Conversacion } from '@/api/base44Client';
import NotificationBell from '@/components/NotificationBell';
import CopilotoWidget from '@/components/CopilotoWidget';
import MobileTabBar from '@/components/MobileTabBar';
import { useUserRole } from '@/hooks/useUserRole';
import { useAutoSyncNotasPersonales } from '@/hooks/useAutoSyncNotasPersonales';

const NAV_SECTIONS = [
  {
    key: 'crm',
    label: 'CRM',
    icon: Users,
    basePath: '/crm',
    items: [
      { label: 'Pipeline', path: '/crm/pipeline', icon: BarChart3 },
      { label: 'Empresas', path: '/crm/empresas', icon: Building2 },
      { label: 'Contactos', path: '/crm/contactos', icon: Users },
      { label: 'Reuniones', path: '/crm/reuniones', icon: NotebookPen },
      { label: 'Actas de Reunión', path: '/crm/actas', icon: FileText },
      { label: 'Tareas', path: '/crm/tareas', icon: ClipboardList },
      { label: 'Panel de tareas', path: '/crm/panel-tareas', icon: LayoutGrid },
      { label: 'Analítica Leads', path: '/analytics/leads', icon: LineChart },
    ],
  },
  {
    key: 'comercial',
    label: 'Comercial',
    icon: Briefcase,
    basePath: '/comercial',
    items: [
      { label: 'Cotizaciones', path: '/comercial/cotizaciones', icon: FileText },
      { label: 'Productos', path: '/comercial/productos', icon: Tags },
      { label: 'Inventario', path: '/comercial/inventario', icon: Package },
      { label: 'Videos', path: '/comercial/videos', icon: Video },
      { label: 'Presentaciones', path: '/comercial/presentaciones', icon: Presentation },
      { label: 'Guía de tags', path: '/comercial/guia-tags', icon: Radar },
    ],
  },
  {
    key: 'email',
    label: 'Email',
    icon: Mail,
    basePath: '/email',
    items: [
      { label: 'Campanas', path: '/email/campanas', icon: Send },
      { label: 'Segmentos', path: '/email/segmentos', icon: Users },
      { label: 'Plantillas', path: '/email/plantillas', icon: FileText },
      { label: 'Metricas', path: '/email/metricas', icon: BarChart3 },
    ],
  },
  {
    key: 'ia_agente',
    label: 'IA Agente',
    icon: Bot,
    basePath: '/agente',
    items: [
      { label: 'Bandeja WhatsApp', path: '/inbox', icon: MessageSquare },
      { label: 'Grupo Telegram', path: '/agente/grupo-telegram', icon: MessageSquare },
      { label: 'Chats internos', path: '/agente/chats-internos', icon: MessageSquare },
      { label: 'Autoeducación', path: '/agente/autoeducacion', icon: GraduationCap },
      { label: 'Calculadora de tokens', path: '/agente/tokens', icon: SlidersHorizontal },
      { label: 'Consumo de IA', path: '/analytics/consumo-ia', icon: LineChart },
      { label: 'Config Evaluador', path: '/agente/config-evaluador', icon: SlidersHorizontal },
      { label: 'Aprendizajes', path: '/agente/aprendizajes', icon: Lightbulb },
      { label: 'Configurar IA', path: '/agente/configuracion', icon: Bot },
    ],
  },
];

// Rutas que un usuario Comercial puede ver en el menú.
// (Configuración e IA Agente/Emma quedan solo para Admin; Analítica Leads sí la ve.)
const COMERCIAL_PATHS = [
  '/',
  '/crm/pipeline', '/crm/empresas', '/crm/contactos', '/crm/reuniones', '/crm/actas', '/crm/tareas', '/crm/panel-tareas', '/analytics/leads',
  '/comercial/cotizaciones', '/comercial/productos', '/comercial/inventario', '/comercial/videos', '/comercial/presentaciones', '/comercial/guia-tags',
];

export default function Layout() {
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isAdmin, isComercial, rol } = useUserRole();

  const [openSections, setOpenSections] = useState(() => {
    const initial = {};
    NAV_SECTIONS.forEach(s => {
      if (window.location.pathname.startsWith(s.basePath)) {
        initial[s.key] = true;
      }
    });
    return initial;
  });

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  // Cada quien trae SUS propias notas de Gemini al abrir el CRM (una vez por sesión).
  useAutoSyncNotasPersonales(user?.email);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    NAV_SECTIONS.forEach(s => {
      if (location.pathname.startsWith(s.basePath)) {
        setOpenSections(prev => ({ ...prev, [s.key]: true }));
      }
    });
  }, [location.pathname]);

  const toggleSection = (key) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const isItemActive = (path) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  const isSectionActive = (basePath) => location.pathname.startsWith(basePath);

  const handleLogout = () => {
    base44.auth.logout('/');
  };

  const { data: convEsperando = [] } = useQuery({
    queryKey: ['conv_esperando_nav'],
    queryFn: () => Conversacion.filter({ estado: 'En_Espera_Humano' }, '-fecha_ultimo_mensaje'),
    refetchInterval: 30000,
    staleTime: 20000,
  });

  const { data: convSinLeer = [] } = useQuery({
    queryKey: ['conv_sin_leer_nav'],
    queryFn: () => Conversacion.list('-fecha_ultimo_mensaje'),
    select: (data) => data.filter((c) => c.mensajes_sin_leer > 0),
    refetchInterval: 30000,
    staleTime: 20000,
  });

  const totalBadge = convSinLeer.length + convEsperando.length;

  const navContent = (
    <>
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <Link
          to="/"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[15px] transition-all duration-200 ${
            location.pathname === '/'
              ? 'bg-muted text-foreground font-semibold'
              : 'text-foreground hover:bg-muted'
          }`}
        >
          <LayoutGrid className="w-[19px] h-[19px] flex-shrink-0" />
          <span>Dashboard</span>
        </Link>

        <Link
          to="/inbox"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[15px] transition-all duration-200 ${
            location.pathname === '/inbox'
              ? 'bg-muted text-foreground font-semibold'
              : 'text-foreground hover:bg-muted'
          }`}
        >
          <MessageSquare className="w-[19px] h-[19px] flex-shrink-0" />
          <span className="flex-1">Bandeja</span>
          {totalBadge > 0 && (
            <span className="bg-red-500 text-white text-[11px] font-semibold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center">
              {totalBadge > 9 ? '9+' : totalBadge}
            </span>
          )}
        </Link>

        <Link
          to="/copiloto"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[15px] transition-all duration-200 ${
            location.pathname === '/copiloto'
              ? 'bg-muted text-foreground font-semibold'
              : 'text-foreground hover:bg-muted'
          }`}
        >
          <Sparkles className="w-[19px] h-[19px] flex-shrink-0" />
          <span>Copiloto</span>
        </Link>

        <div className="pt-4 pb-1.5">
          <p className="px-3 text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Módulos</p>
        </div>

        {NAV_SECTIONS.map(section => {
          const visibleItems = isComercial
            ? section.items.filter(i => COMERCIAL_PATHS.includes(i.path))
            : section.items;
          if (visibleItems.length === 0) return null;

          const SectionIcon = section.icon;
          const sectionActive = isSectionActive(section.basePath);
          const isOpen = openSections[section.key];

          return (
            <div key={section.key}>
              <button
                onClick={() => toggleSection(section.key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[15px] transition-all duration-200 ${
                  sectionActive
                    ? 'text-foreground font-medium bg-muted'
                    : 'text-foreground hover:bg-muted'
                }`}
              >
                <SectionIcon className="w-[19px] h-[19px] flex-shrink-0" />
                <span className="flex-1 text-left">{section.label}</span>
                <ChevronRight
                  className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
                />
              </button>

              {isOpen && (
                <div className="ml-4 mt-0.5 mb-1 space-y-0.5 border-l border-border/60 pl-2">
                  {visibleItems.map(item => {
                    const active = isItemActive(item.path);
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-[8px] text-[14px] transition-all duration-200 ${
                          active
                            ? 'bg-muted text-foreground font-medium'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                        }`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        <div className="pt-4 pb-1.5">
          <p className="px-3 text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Sistema</p>
        </div>

        <Link
          to="/configuracion"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[15px] transition-all duration-200 ${
            location.pathname === '/configuracion'
              ? 'bg-muted text-foreground font-semibold'
              : 'text-foreground hover:bg-muted'
          }`}
        >
          <Settings className="w-[19px] h-[19px] flex-shrink-0" />
          <span>Configuración</span>
        </Link>
      </nav>

      <div className="px-3 pb-4 pt-3 border-t border-border/60">
        {user && (
          <Link to="/perfil" onClick={() => setMobileOpen(false)} className="block px-2 py-1.5 mb-1 rounded-[8px] hover:bg-muted/60 transition-colors" title="Mi perfil">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm flex-shrink-0">
                {user.full_name?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-[13px] font-medium text-foreground truncate">{user.full_name}</p>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 border ${isAdmin ? 'border-border text-muted-foreground' : 'border-border text-muted-foreground'}`}>
                    {rol}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
              </div>
              <CircleUser className="w-4 h-4 text-muted-foreground/50 flex-shrink-0" />
            </div>
          </Link>
        )}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 text-[14px] text-red-500 hover:bg-red-500/5 rounded-[8px] transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Cerrar sesión
        </button>
      </div>
    </>
  );

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* z-30: por encima de la página y por DEBAJO de todo lo que flota encima de ella
          (overlay del menú móvil z-40, diálogos z-50, visores z-60, toasts z-100). Estuvo en
          z-[9999] y por eso la barra tapaba la parte de arriba de cualquier ventana modal,
          como la de Nueva cotización. El 9999 venía de los popovers de FullCalendar, que se
          bajan en index.css. */}
      <header className="fixed top-0 left-0 right-0 z-30 flex items-center h-12 px-4 bg-card/80 backdrop-blur-xl border-b border-border/60 shrink-0">
        <button
          onClick={() => setMobileOpen(true)}
          className="md:hidden p-1.5 rounded-lg hover:bg-muted text-foreground mr-2"
        >
          <Menu className="w-5 h-5" />
        </button>

        <Link to="/" className="flex items-center gap-2.5 mr-4">
          <img
            src="https://media.base44.com/images/public/6a43f4eff47c0d92cfe2b575/e332deb61_Logo-WeTr-RGB_V-Original-color2.png"
            alt="WeTracking"
            className="h-12 w-auto rounded-[6px] flex-shrink-0 object-contain"
          />
        </Link>

        <div className="flex-1 pointer-events-none" />

        <div className="flex items-center gap-1.5">
          <CopilotoWidget />
          <NotificationBell />
        </div>
      </header>

      {/* Spacer: el header es fixed (fuera del flujo), esto rellena su altura */}
      <div className="h-12 shrink-0" aria-hidden="true" />

      <div className="flex flex-1 overflow-hidden">
        <div className="hidden md:flex w-60 bg-card flex-col border-r border-border/60">
          {navContent}
        </div>

        {mobileOpen && (
          <div
            className="fixed inset-0 bg-black/30 z-40 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        <div
          className={`fixed inset-y-0 left-0 z-50 w-72 bg-card flex flex-col border-r border-border/60 transform transition-transform duration-300 ease-out md:hidden ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between px-4 h-12 border-b border-border/60">
            <div className="flex items-center gap-2.5">
              <img
                src="https://media.base44.com/images/public/6a43f4eff47c0d92cfe2b575/e332deb61_Logo-WeTr-RGB_V-Original-color2.png"
                alt="WeTracking"
                className="h-6 w-auto rounded-[6px] flex-shrink-0 object-contain"
              />
            </div>
            <button
              onClick={() => setMobileOpen(false)}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          {navContent}
        </div>

        <div className="flex-1 overflow-auto pb-14 md:pb-0">
          <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 md:py-8">
            <Outlet />
          </div>
        </div>
      </div>

      <MobileTabBar />
    </div>
  );
}