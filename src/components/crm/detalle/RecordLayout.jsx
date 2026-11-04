import React from 'react';

/**
 * Cascarón de página de detalle estilo HubSpot: header full-width + 3 columnas.
 * En móvil las columnas se apilan (izquierda → centro → derecha).
 * Props: header, left, center, right
 */
export default function RecordLayout({ header, left, center, right }) {
  return (
    <div className="max-w-[1440px] mx-auto px-5 md:px-6 py-5 space-y-6">
      <div className="pb-5 border-b border-border/60">{header}</div>
      <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)_360px] gap-6 items-start">
        <div className="space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1.5">
          {left}
        </div>
        <div className="space-y-4 min-w-0">
          {center}
        </div>
        <div className="space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1.5">
          {right}
        </div>
      </div>
    </div>
  );
}
