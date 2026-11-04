import { Link } from 'react-router-dom';
import { StickyNote, Mail, CheckCircle2, Circle, TrendingUp, MessageCircle, NotebookPen, Clock, Pencil, FileText, Link2, UserPlus, Building2 } from 'lucide-react';
import { timeAgo } from '@/lib/feed';

const ICONOS = {
  nota: StickyNote,
  email: Mail,
  tarea: CheckCircle2,
  cambio_etapa: TrendingUp,
  whatsapp: MessageCircle,
  reunion: NotebookPen,
  historial: Clock,
  edicion: Pencil,
  negocio: TrendingUp,
  cotizacion: FileText,
  documento: FileText,
  contacto: UserPlus,
  empresa: Building2,
  vinculo: Link2,
};

export default function FeedItem({ item }) {
  const Icon = ICONOS[item.tipo] || Clock;
  const IconResuelto = item.tipo === 'tarea' && !item.completada ? Circle : Icon;

  const contenido = (
    <>
      <IconResuelto className="w-4 h-4 text-muted-foreground/60 mt-0.5 flex-shrink-0" strokeWidth={1.75} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-medium text-foreground">{item.titulo}</span>
          <span className="text-[11px] text-muted-foreground flex-shrink-0">{timeAgo(item.fecha)}</span>
        </div>
        {item.subtitulo && (
          <p className={`text-sm mt-0.5 whitespace-pre-wrap break-words ${item.completada ? 'line-through text-muted-foreground' : 'text-foreground/80'}`}>
            {item.subtitulo}
          </p>
        )}
        {item.meta && <p className="text-[11px] text-muted-foreground mt-0.5">{item.meta}</p>}
      </div>
    </>
  );

  const clase = 'flex gap-3 p-3.5 rounded-xl border border-border/60 bg-card';
  if (item.link) return <Link to={item.link} className={`${clase} hover:bg-muted/30 transition-colors`}>{contenido}</Link>;
  return <div className={clase}>{contenido}</div>;
}
