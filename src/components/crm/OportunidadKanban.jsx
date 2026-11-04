import React from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { GripVertical, Pencil, CalendarDays } from 'lucide-react';
import { Favicon } from './SelectorEmpresa';

// Etapas del proceso comercial de WeTracking (mismas del pipeline de HubSpot)
export const ETAPAS_OPORTUNIDAD = [
  { key: 'Visita_Inicial',         label: 'Visita Inicial',           color: 'bg-slate-400' },
  { key: 'Creacion_Cotizacion',    label: 'Creación de Cotización',   color: 'bg-blue-500' },
  { key: 'Cotizacion_Enviada',     label: 'Cotización Enviada',       color: 'bg-amber-500' },
  { key: 'Visita_Post_Cotizacion', label: 'Visita Post Cotización',   color: 'bg-orange-500' },
  { key: 'Decisor_Convencido',     label: 'Decisor Convencido',       color: 'bg-violet-500' },
  { key: 'Cierre_Ganado',          label: 'Cierre Ganado',            color: 'bg-green-500' },
  { key: 'Cierre_Perdido',         label: 'Cierre Perdido',           color: 'bg-red-500' },
];

export const ETAPAS_CERRADAS_OP = ['Cierre_Ganado', 'Cierre_Perdido'];
export const ETAPAS_ABIERTAS_OP = ETAPAS_OPORTUNIDAD.map(e => e.key).filter(k => !ETAPAS_CERRADAS_OP.includes(k));

function formatValor(n, moneda = 'COP') {
  if (!n) return null;
  const pref = moneda === 'USD' ? 'USD ' : '$';
  if (n >= 1_000_000_000) return `${pref}${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${pref}${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${pref}${(n / 1_000).toFixed(0)}K`;
  return `${pref}${n}`;
}

function OportunidadCard({ oportunidad, empresa, index, onEdit }) {
  const vencida = oportunidad.fecha_cierre_estimada
    && !ETAPAS_CERRADAS_OP.includes(oportunidad.etapa)
    && new Date(oportunidad.fecha_cierre_estimada) < new Date();

  return (
    <Draggable draggableId={oportunidad.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          onClick={() => !snapshot.isDragging && onEdit(oportunidad)}
          className={`p-3 rounded-xl transition-all cursor-pointer group ${
            snapshot.isDragging
              ? 'shadow-lg bg-card ring-1 ring-primary/30'
              : 'bg-card hover:bg-muted/40'
          }`}
        >
          <div className="flex items-start gap-2">
            <div
              {...provided.dragHandleProps}
              className="mt-0.5 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-foreground leading-snug">{oportunidad.nombre}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <Favicon empresa={empresa} className="w-4 h-4" />
                <p className="text-xs text-muted-foreground truncate">{empresa?.nombre || 'Sin empresa'}</p>
              </div>
              <div className="flex items-center justify-between mt-1.5">
                {oportunidad.valor_estimado ? (
                  <span className="text-xs font-semibold text-foreground">
                    {formatValor(oportunidad.valor_estimado, oportunidad.moneda)}
                  </span>
                ) : <span />}
                <div className="flex items-center gap-1.5">
                  {oportunidad.fecha_cierre_estimada && (
                    <span className={`text-[10px] flex items-center gap-0.5 ${vencida ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>
                      <CalendarDays className="w-2.5 h-2.5" />
                      {new Date(oportunidad.fecha_cierre_estimada + 'T00:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                  {oportunidad.responsable && (
                    <span
                      className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[9px] font-semibold flex items-center justify-center"
                      title={oportunidad.responsable}
                    >
                      {oportunidad.responsable.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(oportunidad); }}
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-muted text-muted-foreground/50 rounded-md transition-all flex-shrink-0"
            >
              <Pencil className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </Draggable>
  );
}

/**
 * Kanban de oportunidades con drag & drop.
 * Props: oportunidades, empresasById (map id->Empresa), onMove(oportunidad, nuevaEtapa), onEdit(oportunidad)
 */
export default function OportunidadKanban({ oportunidades, empresasById, onMove, onEdit }) {
  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    const nuevaEtapa = destination.droppableId;
    const op = oportunidades.find(o => o.id === draggableId);
    if (op && op.etapa !== nuevaEtapa) {
      onMove(op, nuevaEtapa);
    }
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
        {ETAPAS_OPORTUNIDAD.map(({ key, label, color }) => {
          const enEtapa = oportunidades.filter(o => o.etapa === key);
          const totalCOP = enEtapa.filter(o => (o.moneda || 'COP') === 'COP').reduce((s, o) => s + (o.valor_estimado || 0), 0);
          const totalUSD = enEtapa.filter(o => o.moneda === 'USD').reduce((s, o) => s + (o.valor_estimado || 0), 0);
          return (
            <div key={key} className="flex flex-col bg-muted/30 rounded-xl overflow-hidden flex-shrink-0 w-60">
              <div className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${color}`} />
                  <h3 className="font-medium text-xs text-foreground uppercase tracking-wide">{label}</h3>
                  <span className="ml-auto text-xs text-muted-foreground">{enEtapa.length}</span>
                </div>
                {(totalCOP > 0 || totalUSD > 0) && (
                  <p className="text-[11px] text-muted-foreground mt-1 pl-4">
                    {totalCOP > 0 && formatValor(totalCOP, 'COP')}
                    {totalCOP > 0 && totalUSD > 0 && ' · '}
                    {totalUSD > 0 && formatValor(totalUSD, 'USD')}
                  </p>
                )}
              </div>

              <Droppable droppableId={key}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`flex-1 px-2 pb-2 space-y-1.5 min-h-[120px] transition-colors ${
                      snapshot.isDraggingOver ? 'bg-primary/5' : ''
                    }`}
                  >
                    {enEtapa.map((op, index) => (
                      <OportunidadCard
                        key={op.id}
                        oportunidad={op}
                        empresa={empresasById[op.empresa_id]}
                        index={index}
                        onEdit={onEdit}
                      />
                    ))}
                    {provided.placeholder}
                    {enEtapa.length === 0 && !snapshot.isDraggingOver && (
                      <p className="text-xs text-muted-foreground/40 text-center py-6">
                        Arrastra aquí
                      </p>
                    )}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}
