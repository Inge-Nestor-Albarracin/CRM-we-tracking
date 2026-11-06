import React from "react";
import WeLogo from "@/components/brand/WeLogo";

// Pantalla de acceso con la estética de la app de marca (login del "Diseño App v03"):
// fondo marino → azul con píldoras diagonales, logo en negativo y tarjeta blanca centrada.
export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="wt-fondo-marca relative min-h-screen flex items-center justify-center px-4 py-10 overflow-hidden">
      <span className="wt-pildora w-72 h-20 bg-wt-azul/40 -right-16 top-10" aria-hidden="true" />
      <span className="wt-pildora w-40 h-20 bg-wt-cian/25 right-40 top-44" aria-hidden="true" />
      <span className="wt-pildora w-64 h-20 bg-white/[0.06] -left-20 bottom-16" aria-hidden="true" />

      <div className="relative w-full max-w-md">
        <div className="flex flex-col items-center mb-8 text-white">
          <WeLogo className="h-10 w-auto" />
          <p className="mt-2 text-[13px] tracking-[0.18em] text-white/70">Soluciones Integrales</p>
        </div>
        <div className="bg-card text-card-foreground rounded-3xl shadow-2xl shadow-black/30 p-8">
          <div className="text-center mb-6">
            {Icon && (
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-wt-azul/10 mb-3">
                <Icon className="w-6 h-6 text-wt-azul" aria-hidden="true" />
              </div>
            )}
            <h1 className="text-2xl font-medium text-wt-azul">{title}</h1>
            {subtitle && <p className="text-muted-foreground text-sm mt-1.5">{subtitle}</p>}
          </div>
          {children}
        </div>
        {footer && (
          <p className="text-center text-sm text-white/70 mt-6">{footer}</p>
        )}
      </div>
    </div>
  );
}
