import { useQuery } from '@tanstack/react-query';
import { Campana, EmailEnviado } from '@/api/base44Client';

function tasa(num, total) {
  if (!total) return '0%';
  return `${Math.round((num / total) * 100)}%`;
}

const ESTADO_COLOR = {
  Borrador: 'bg-gray-100 text-gray-600',
  Programada: 'bg-yellow-100 text-yellow-700',
  Enviando: 'bg-blue-100 text-blue-700',
  Enviada: 'bg-green-100 text-green-700',
  Pausada: 'bg-orange-100 text-orange-700',
};

function KPI({ label, value, sub }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-sm font-medium">{label}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

export default function Metricas() {
  const { data: campanas = [], isLoading: loadingCamp } = useQuery({
    queryKey: ['campanas'],
    queryFn: () => Campana.list('-fecha_creacion'),
  });

  const { data: emails = [], isLoading: loadingEmails } = useQuery({
    queryKey: ['emails-enviados'],
    queryFn: () => EmailEnviado.list('-fecha_envio'),
  });

  const isLoading = loadingCamp || loadingEmails;

  // KPIs globales (todos los registros)
  const totalEnviados   = emails.length;
  const totalAbiertos   = emails.filter(e => ['Abierto', 'Respondido'].includes(e.estado)).length;
  const totalRespondidos = emails.filter(e => e.estado === 'Respondido').length;
  const tasaApertura    = tasa(totalAbiertos, totalEnviados);
  const tasaRespuesta   = tasa(totalRespondidos, totalEnviados);

  if (isLoading) return <div className="p-6 text-muted-foreground">Cargando...</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Metricas de email</h1>
        <p className="text-muted-foreground text-sm mt-1">Resultados globales de todas las campanas</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KPI label="Total enviados" value={totalEnviados.toLocaleString()} />
        <KPI label="Tasa de apertura" value={tasaApertura} sub={`${totalAbiertos} abiertos`} />
        <KPI label="Tasa de respuesta" value={tasaRespuesta} sub={`${totalRespondidos} respondidos`} />
        <KPI label="Campanas totales" value={campanas.length} sub={`${campanas.filter(c => c.estado === 'Enviada').length} enviadas`} />
      </div>

      {/* Tabla de campanas */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Resultados por campana</h2>
        {campanas.length === 0 ? (
          <p className="text-muted-foreground text-sm">No hay campanas todavia.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-3 pr-4 font-medium">Campana</th>
                  <th className="text-left py-3 pr-4 font-medium">Estado</th>
                  <th className="text-right py-3 pr-4 font-medium">Enviados</th>
                  <th className="text-right py-3 pr-4 font-medium">Abiertos</th>
                  <th className="text-right py-3 pr-4 font-medium">% apertura</th>
                  <th className="text-right py-3 pr-4 font-medium">Respondidos</th>
                  <th className="text-right py-3 font-medium">% respuesta</th>
                </tr>
              </thead>
              <tbody>
                {campanas.map((c) => (
                  <tr key={c.id} className="border-b hover:bg-muted/30">
                    <td className="py-3 pr-4">
                      <div className="font-medium">{c.nombre}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-xs">{c.asunto}</div>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${ESTADO_COLOR[c.estado] || 'bg-gray-100 text-gray-600'}`}>
                        {c.estado}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right">{c.total_enviados || 0}</td>
                    <td className="py-3 pr-4 text-right">{c.total_abiertos || 0}</td>
                    <td className="py-3 pr-4 text-right font-medium text-green-600">{tasa(c.total_abiertos, c.total_enviados)}</td>
                    <td className="py-3 pr-4 text-right">{c.total_respondidos || 0}</td>
                    <td className="py-3 text-right font-medium text-purple-600">{tasa(c.total_respondidos, c.total_enviados)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
