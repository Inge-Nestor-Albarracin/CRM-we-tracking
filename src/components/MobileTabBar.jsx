import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutGrid, MessageSquare, Users, Settings } from 'lucide-react';

const TABS = [
  { label: 'Inicio', path: '/', icon: LayoutGrid },
  { label: 'Bandeja', path: '/inbox', icon: MessageSquare },
  { label: 'CRM', path: '/crm/pipeline', icon: Users },
  { label: 'Ajustes', path: '/configuracion', icon: Settings },
];

export default function MobileTabBar() {
  const location = useLocation();

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-card/90 backdrop-blur-xl border-t border-border/60 pb-[env(safe-area-inset-bottom,0px)]">
      <div className="flex items-center justify-around h-14">
        {TABS.map((tab) => {
          const active = isActive(tab.path);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={`relative flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-lg transition-colors ${
                active ? 'text-wt-azul' : 'text-muted-foreground'
              }`}
            >
              {active && <span className="absolute -top-1 h-1 w-6 rounded-full bg-gradient-to-r from-wt-cian to-wt-azul" aria-hidden="true" />}
              <Icon className="w-[22px] h-[22px]" strokeWidth={active ? 2.4 : 2} />
              <span className={`text-[10px] ${active ? 'font-bold' : 'font-medium'}`}>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}