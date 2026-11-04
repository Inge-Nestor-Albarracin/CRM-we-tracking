import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ConfigAgente } from '@/api/base44Client';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import {
  Bot, Plus, X, Save, Clock, MessageCircle,
  BookOpen, CheckCircle, Users, Phone, Zap, CalendarCheck,
} from 'lucide-react';

const CAMPOS_CALIFICACION = [
  { campo: 'Qué hace la empresa', detalle: 'a qué se dedica el negocio del lead' },
  { campo: 'Industria', detalle: 'se valida contra la lista de industrias excluidas' },
  { campo: 'Motivo de interés', detalle: 'por qué quieren la solución (pérdidas, auditorías, control...)' },
  { campo: 'Nombre', detalle: 'Emma lo pide máximo 2 veces; si no lo dan, sigue sin él' },
];

export default function ConfigAgenteIA() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [form, setForm] = useState({
    activo: true,
    instrucciones_sistema: '',
    conocimiento_base: [],
    brokers: [],
    industrias_excluidas: ['Retail'],
    telegram_grupo_chat_id: '',
    demora_segundos: 60,
  });

  const [nuevoKnowledge, setNuevoKnowledge] = useState('');
  const [nuevaIndustria, setNuevaIndustria] = useState('');
  const [gruposDetectados, setGruposDetectados] = useState(null);
  const [detectandoGrupos, setDetectandoGrupos] = useState(false);
  const [nuevoBroker, setNuevoBroker] = useState({ nombre: '', telefono: '', sector: 'Todos', zonas: '' });

  // ── Cargar config existente ──
  const { data: configExistente } = useQuery({
    queryKey: ['config_agente'],
    queryFn: () => ConfigAgente.list(),
    select: (data) => data[0],
  });

  useEffect(() => {
    if (configExistente) {
      setForm({
        activo: configExistente.activo ?? true,
        instrucciones_sistema: configExistente.instrucciones_sistema || '',
        conocimiento_base: configExistente.conocimiento_base || [],
        brokers: configExistente.brokers || [],
        industrias_excluidas: configExistente.industrias_excluidas || ['Retail'],
        telegram_grupo_chat_id: configExistente.telegram_grupo_chat_id || '',
        demora_segundos: Number(configExistente.demora_segundos) || 60,
      });
    }
  }, [configExistente]);

  // ── Guardar ──
  const guardar = useMutation({
    mutationFn: async () => {
      const payload = { ...form, demora_segundos: Number(form.demora_segundos) || 60, clave: 'general' };
      if (configExistente?.id) {
        return ConfigAgente.update(configExistente.id, payload);
      } else {
        return ConfigAgente.create(payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['config_agente']);
      toast({ title: 'Configuración guardada' });
    },
    onError: () => toast({ title: 'Error al guardar', variant: 'destructive' }),
  });

  const agregarKnowledge = () => {
    if (!nuevoKnowledge.trim()) return;
    setForm((f) => ({ ...f, conocimiento_base: [...f.conocimiento_base, nuevoKnowledge.trim()] }));
    setNuevoKnowledge('');
  };

  const eliminarKnowledge = (i) => {
    setForm((f) => ({ ...f, conocimiento_base: f.conocimiento_base.filter((_, idx) => idx !== i) }));
  };

  const agregarIndustria = () => {
    if (!nuevaIndustria.trim()) return;
    setForm((f) => ({ ...f, industrias_excluidas: [...(f.industrias_excluidas || []), nuevaIndustria.trim()] }));
    setNuevaIndustria('');
  };

  const agregarBroker = () => {
    if (!nuevoBroker.nombre.trim() || !nuevoBroker.telefono.trim()) return;
    const broker = {
      nombre: nuevoBroker.nombre.trim(),
      telefono: nuevoBroker.telefono.replace(/\D/g, ''),
      sector: nuevoBroker.sector,
      zonas: nuevoBroker.zonas
        .split(',')
        .map((b) => b.trim().toLowerCase())
        .filter(Boolean),
    };
    setForm((f) => ({ ...f, brokers: [...(f.brokers || []), broker] }));
    setNuevoBroker({ nombre: '', telefono: '', sector: 'Todos', zonas: '' });
  };

  const eliminarBroker = (i) => {
    setForm((f) => ({ ...f, brokers: f.brokers.filter((_, idx) => idx !== i) }));
  };

  const SECTOR_LABEL = {
    Academia: 'Academia', Bodegas: 'Bodegas', Industria_Petrolera: 'Industria Petrolera',
    Manufactura: 'Manufactura', Clubes: 'Clubes', Locativos: 'Locativos', Todos: 'Todos',
  };
  const SECTOR_COLOR = {
    Academia: 'bg-blue-50 text-blue-700 border-blue-200',
    Bodegas: 'bg-orange-50 text-orange-700 border-orange-200',
    Industria_Petrolera: 'bg-amber-50 text-amber-700 border-amber-200',
    Manufactura: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    Clubes: 'bg-pink-50 text-pink-700 border-pink-200',
    Locativos: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Todos: 'bg-violet-50 text-violet-700 border-violet-200',
  };

  // ── Detectar grupos de Telegram (para la agenda de Emma) ──
  const detectarGrupos = async () => {
    setDetectandoGrupos(true);
    try {
      const res = await base44.functions.invoke('telegramDetectarGrupos', {});
      setGruposDetectados(res.data || { bot_username: '', grupos: [] });
    } catch {
      toast({ title: 'No se pudieron detectar grupos', description: 'Revisa que el bot tenga TELEGRAM_BOT_TOKEN configurado.', variant: 'destructive' });
    }
    setDetectandoGrupos(false);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="w-6 h-6 text-violet-600" />
          <h1 className="text-[28px] font-bold tracking-tight text-foreground">Emma Gonzales</h1>
          <Badge variant={form.activo ? 'default' : 'secondary'} className="ml-2 flex items-center gap-1">
            {form.activo ? <><span className="w-1.5 h-1.5 rounded-full bg-green-400" />Activa</> : <><span className="w-1.5 h-1.5 rounded-full bg-gray-400" />Apagada</>}
          </Badge>
        </div>
        <Button onClick={() => guardar.mutate()} disabled={guardar.isPending} className="gap-2">
          <Save className="w-4 h-4" />
          {guardar.isPending ? 'Guardando...' : 'Guardar cambios'}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground -mt-4">
        Configuración de la agente de ventas por WhatsApp. Su conocimiento de venta vive en el RAG (módulo Conocimiento); aquí controlas comportamiento, calificación, agenda y equipo.
      </p>

      {/* Estado activo */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900">Emma activa</p>
            <p className="text-sm text-gray-500">Cuando está apagada no responde por WhatsApp, pero los mensajes entrantes siguen quedando registrados en la Bandeja y el CRM.</p>
          </div>
          <Switch
            checked={form.activo}
            onCheckedChange={(v) => setForm((f) => ({ ...f, activo: v }))}
          />
        </CardContent>
      </Card>

      {/* Calificacion */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle className="w-4 h-4" /> Calificación de leads
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="p-3 bg-violet-50 border border-violet-200 rounded-lg">
            <p className="text-xs font-medium text-violet-800 mb-2">Antes de agendar una reunión, Emma captura estos 4 datos conversando (sin interrogar):</p>
            <div className="space-y-1">
              {CAMPOS_CALIFICACION.map((c) => (
                <div key={c.campo} className="flex items-start gap-2 text-xs text-violet-700">
                  <CheckCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <span><strong>{c.campo}</strong>: {c.detalle}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-violet-600 mt-2">Los datos quedan guardados en la ficha del contacto. Si falta alguno, la acción de calificar se bloquea automáticamente.</p>
          </div>

          <div>
            <Label className="text-sm font-medium">Industrias excluidas</Label>
            <p className="text-xs text-gray-500 mb-2">
              Si el lead es de una de estas industrias, Emma lo descalifica con un mensaje amable. Cualquier otra industria pasa el filtro.
            </p>
            <div className="flex flex-wrap gap-2 mb-2">
              {(form.industrias_excluidas || []).map((ind, i) => (
                <span key={i} className="flex items-center gap-1 bg-red-50 text-red-700 text-xs px-2 py-1 rounded-full border border-red-200">
                  {ind}
                  <button onClick={() => setForm((f) => ({ ...f, industrias_excluidas: f.industrias_excluidas.filter((_, j) => j !== i) }))}>
                    <X className="w-3 h-3 hover:text-red-900" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="ej: Restaurantes..."
                value={nuevaIndustria}
                onChange={(e) => setNuevaIndustria(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && agregarIndustria()}
                className="flex-1"
              />
              <Button size="sm" variant="outline" onClick={agregarIndustria}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Agenda por Telegram */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarCheck className="w-4 h-4" /> Agenda: grupo de Telegram del equipo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-gray-500">
            Emma no ve el calendario: cuando un lead calificado quiere reunión, pregunta la disponibilidad en este grupo y avisa cuando la reunión queda confirmada.
            Pasos: 1) agrega el bot de Emma al grupo, 2) manden cualquier mensaje ahí, 3) usa "Detectar grupos" y elige el grupo.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="chat_id del grupo (ej: -1001234567890)"
              value={form.telegram_grupo_chat_id}
              onChange={(e) => setForm((f) => ({ ...f, telegram_grupo_chat_id: e.target.value }))}
              className="flex-1"
            />
            <Button size="sm" variant="outline" onClick={detectarGrupos} disabled={detectandoGrupos}>
              {detectandoGrupos ? 'Buscando...' : 'Detectar grupos'}
            </Button>
          </div>
          {gruposDetectados && (
            <div className="space-y-2">
              {gruposDetectados.bot_username && (
                <p className="text-xs text-gray-600">
                  Bot de Emma: <span className="font-mono">@{gruposDetectados.bot_username}</span>. Agrégalo al grupo como miembro y escriban un mensaje para que aparezca aquí.
                </p>
              )}
              {(gruposDetectados.grupos || []).length === 0 ? (
                <p className="text-xs text-amber-600">
                  No se han visto grupos todavía. Agrega el bot al grupo, manden un mensaje cualquiera y vuelve a detectar.
                </p>
              ) : (
                (gruposDetectados.grupos || []).map((g) => (
                  <div key={g.chat_id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-xs font-medium text-gray-800">{g.titulo}</p>
                      <p className="text-[10px] text-gray-500 font-mono">{g.chat_id}</p>
                    </div>
                    <Button
                      size="sm"
                      variant={form.telegram_grupo_chat_id === g.chat_id ? 'default' : 'outline'}
                      onClick={() => setForm((f) => ({ ...f, telegram_grupo_chat_id: g.chat_id }))}
                    >
                      {form.telegram_grupo_chat_id === g.chat_id ? 'Seleccionado' : 'Usar este'}
                    </Button>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cadencia */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4" /> Cadencia de respuesta
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label className="text-sm">Demora antes de responder (segundos)</Label>
          <Input
            type="number"
            min="0"
            value={form.demora_segundos}
            onChange={(e) => setForm((f) => ({ ...f, demora_segundos: e.target.value }))}
            className="w-40"
          />
          <p className="text-xs text-gray-500">
            Tiempo que Emma espera antes de mandar el primer globo (demora humana). Entre globos hay un intervalo adicional automático de 15 a 45 segundos.
          </p>
        </CardContent>
      </Card>

      {/* Instrucciones especificas */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageCircle className="w-4 h-4" /> Instrucciones específicas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-gray-500 mb-2">
            Reglas puntuales que se suman al prompt de Emma (encima del RAG). Úsalo para ajustes rápidos sin tocar el conocimiento.
          </p>
          <Textarea
            value={form.instrucciones_sistema}
            onChange={(e) => setForm((f) => ({ ...f, instrucciones_sistema: e.target.value }))}
            rows={6}
            placeholder="ej: Esta semana prioriza agendar para el jueves. No menciones el mes gratis salvo que pregunten por precio."
            className="text-sm"
          />
        </CardContent>
      </Card>

      {/* Conocimiento puntual */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="w-4 h-4" /> Datos puntuales
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-gray-500">
            Datos sueltos que Emma siempre tiene a mano (horarios, políticas, datos de contacto). El conocimiento de venta completo vive en el RAG.
          </p>
          <div className="space-y-2">
            {form.conocimiento_base.map((item, i) => (
              <div key={i} className="flex items-start gap-2 p-2 bg-gray-50 rounded-lg">
                <span className="text-xs text-gray-700 flex-1">{item}</span>
                <button onClick={() => eliminarKnowledge(i)} className="text-gray-400 hover:text-red-500">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Agregar dato..."
              value={nuevoKnowledge}
              onChange={(e) => setNuevoKnowledge(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && agregarKnowledge()}
              className="flex-1"
            />
            <Button size="sm" variant="outline" onClick={agregarKnowledge}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Aprendizajes aplicados (solo lectura) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="w-4 h-4" /> Aprendizajes aplicados
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-gray-500">
            Bloque compilado desde el módulo Aprendizajes (botón "Aplicar a Emma"). Tiene prioridad sobre el estilo general. Se edita desde ese módulo, no aquí.
          </p>
          {configExistente?.aprendizajes ? (
            <pre className="text-xs text-gray-700 bg-gray-50 border rounded-lg p-3 whitespace-pre-wrap max-h-60 overflow-y-auto">{configExistente.aprendizajes}</pre>
          ) : (
            <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded-lg">No hay aprendizajes aplicados todavía.</p>
          )}
        </CardContent>
      </Card>

      {/* Ejecutivos comerciales */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4" /> Ejecutivos comerciales
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-gray-500">
            Cuando un lead queda calificado, Emma le avisa por WhatsApp al ejecutivo asignado según sector y zona.
          </p>

          {(form.brokers || []).length === 0 && (
            <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded-lg">
              No hay ejecutivos configurados: todos los leads calificados irán al número de fallback.
            </p>
          )}
          <div className="space-y-2">
            {(form.brokers || []).map((broker, i) => (
              <div key={i} className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg border">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-gray-900">{broker.nombre}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${SECTOR_COLOR[broker.sector] || SECTOR_COLOR.Todos}`}>
                      {SECTOR_LABEL[broker.sector] || broker.sector}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                    <Phone className="w-3 h-3" />
                    <span>{broker.telefono}</span>
                  </div>
                  {broker.zonas?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {broker.zonas.map((b, j) => (
                        <span key={j} className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">
                          {b}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={() => eliminarBroker(i)} className="text-gray-400 hover:text-red-500 mt-0.5">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="border rounded-lg p-3 space-y-2 bg-white">
            <p className="text-xs font-medium text-gray-700">Agregar ejecutivo</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Nombre</Label>
                <Input
                  value={nuevoBroker.nombre}
                  onChange={(e) => setNuevoBroker((b) => ({ ...b, nombre: e.target.value }))}
                  placeholder="ej: Alejandro"
                  className="mt-0.5 h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Teléfono (con código país)</Label>
                <Input
                  value={nuevoBroker.telefono}
                  onChange={(e) => setNuevoBroker((b) => ({ ...b, telefono: e.target.value }))}
                  placeholder="ej: 573105771576"
                  className="mt-0.5 h-8 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Sector</Label>
                <select
                  value={nuevoBroker.sector}
                  onChange={(e) => setNuevoBroker((b) => ({ ...b, sector: e.target.value }))}
                  className="mt-0.5 w-full h-8 text-sm border rounded-md px-2 bg-white"
                >
                  <option value="Todos">Todos los sectores</option>
                  <option value="Academia">Academia</option>
                  <option value="Bodegas">Bodegas</option>
                  <option value="Industria_Petrolera">Industria Petrolera</option>
                  <option value="Manufactura">Manufactura</option>
                  <option value="Clubes">Clubes</option>
                  <option value="Locativos">Locativos</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">Zonas asignadas <span className="text-gray-400">(separadas por coma, opcional)</span></Label>
                <Input
                  value={nuevoBroker.zonas}
                  onChange={(e) => setNuevoBroker((b) => ({ ...b, zonas: e.target.value }))}
                  placeholder="ej: bogota, medellin, cali"
                  className="mt-0.5 h-8 text-sm"
                />
              </div>
            </div>
            <Button size="sm" onClick={agregarBroker} className="gap-1">
              <Plus className="w-3 h-3" /> Agregar ejecutivo
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
