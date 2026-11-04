# Traspaso de sesión — WeTracking CRM (18 → 26 ago 2026)

Documento para retomar el trabajo en un chat nuevo. Cubre **qué se hizo, por qué, qué
quedó verificado y qué falta**. Lo que está marcado como PENDIENTE es acción real, no
adorno.

---

## 0. Contexto del proyecto

| Dato | Valor |
|---|---|
| Producto | WeTracking — CRM/ERP B2B sobre **Base44** |
| Stack | React + Vite + shadcn/ui + TanStack Query · backend Deno (funciones Base44) |
| Dominio | `crm.wetracking.co` (alias `wtapp.base44.app`) |
| App ID | `6a43f4eff47c0d92cfe2b575` |
| Repo | `github.com/msg123455/crm-wetracking`, rama `main` |
| Modelo de IA | **Claude Sonnet 4.6** (`claude-sonnet-4-6`) en NOVA, Emma y procesarNotaReunion |

**Orden de despliegue (importante, se rompió una vez por saltárselo):**

```bash
git fetch origin && git pull --rebase origin main      # 1. traer lo del builder
npm run build                                          # 2. construir DESPUÉS del pull
npx base44 --app-id 6a43f4eff47c0d92cfe2b575 site deploy -y --no-build
npx base44 --app-id 6a43f4eff47c0d92cfe2b575 functions deploy <nombre>
```

Construir antes del pull deja hashes de assets viejos → **página en blanco** (fue la
causa del `/perfil` vacío). El fix es rebuild limpio + `Ctrl+Shift+R`.

> ⚠️ **`base44/.app.jsonc` no existe en este equipo** (está en `.gitignore` y se perdió).
> Por eso **todos** los comandos del CLI necesitan `--app-id 6a43f4eff47c0d92cfe2b575`.
> Sin ese flag responde *"App not configured"*. Alternativa: `base44 link`.

---

## 1. El hallazgo más importante de la sesión: preview vs prod

**`base44 functions deploy` NO publica. Escribe el BORRADOR (preview).** El runtime que
sirven `crm.wetracking.co` y `wtapp.base44.app` ejecuta el build **publicado**, así que
una función recién desplegada puede seguir respondiendo código viejo indefinidamente.

Lo confirma el propio CLI:

```
base44 logs --env preview   → "current draft"
base44 logs --env prod      → "published"
                              "No production logs found. Has this app been published?"
```

**Durante horas esto se leyó mal como "función maldita"** (deploy perdido) y casi lleva a
renombrar funciones y borrar otras para hacer cupo. Era falso: `base44 functions pull
<nombre>` devolvió el código NUEVO exacto — la plataforma sí lo tenía guardado, **solo
faltaba publicar**.

**Cómo diagnosticar bien la próxima vez:**

1. Poner una rama `?_probe=version` **antes** del `if (req.method !== 'POST')`. Si un GET
   devuelve `"Solo POST"`, está corriendo el build viejo.
2. `base44 functions pull <nombre>` para ver qué código tiene guardado la plataforma.
   ⚠️ **sobrescribe el `entry.ts` local** y deja basura (`function.jsonc` + una carpeta
   `base44/` anidada dentro del dir de la función) — copiar el archivo aparte antes y
   borrar los artefactos después.
3. Si el código guardado ya es el nuevo → el problema es **publicación**, no deploy. El
   usuario publica desde el builder de Base44.

**Descartado explícitamente:** caché de dominio/CDN (probado en ambos hosts) y que
`site deploy` publique las funciones (se corrió dos veces, incluso con el commit ya
pusheado, y no las publicó).

**Tope de funciones:** la app tiene **55 funciones desplegadas y el límite para crear
nuevas es 50**. No se puede crear ninguna función nueva hasta bajar de 50 (borrar una sola
no alcanza). Por eso el sync personal de notas vive dentro de `gmailKarenBandeja` en vez
de tener función propia. Se borró `testValentina` bajo el diagnóstico equivocado; su
código está en git y se puede redesplegar.

---

## 2. Notas de reuniones por persona ← lo último que se terminó

**Problema:** procesar las notas de Gemini del equipo de **otra empresa**, las de cada
persona por separado. El usuario **rechazó** la solución de reenviar todo a un buzón
central.

**Solución implementada y publicada:**

| Pieza | Archivo | Qué hace |
|---|---|---|
| Backend | `base44/functions/gmailKarenBandeja/entry.ts` | Con `{ sincronizar_notas: true }` lee el Gmail **del usuario logueado** vía `getCurrentAppUserConnection`. Devuelve `modo: "personal:<correo>"` |
| Lógica compartida | `base44/shared/notasGmail.ts` | `importarNotasGemini()` — búsqueda, dedup y creación de `ReunionNota` |
| Disparo automático | `src/hooks/useAutoSyncNotasPersonales.js` | Corre **1 vez por sesión de navegador** al abrir el CRM (`sessionStorage`), tope de **15** reuniones por corrida |
| Enganche | `src/components/Layout.jsx` | `useAutoSyncNotasPersonales(user?.email)` — aplica en cualquier página, no solo Reuniones |
| Manual | `src/pages/crm/Reuniones.jsx` | Sincronizar → **"Desde MI correo"**. El toast muestra de qué buzón leyó |

**Conector Gmail por usuario:** `6a739cba0cfbf2c423f6d6f2` (etiquetado "WeTracking Gmail
Karen", pero es genérico — sirve para cualquiera). Ya tiene scope `gmail.readonly`: es el
mismo que alimenta Perfil → Correo, no hay que reautorizar nada.

**Cómo se comporta:**
- Cada persona conecta **su** cuenta en Configuración → Integraciones (una sola vez).
- Al abrir el CRM entran sus notas, la IA hace resumen y crea tareas.
- Si no tiene Gmail conectado → **silencio total**, ningún error en pantalla.
- Misma reunión con varios asistentes → **entra una sola vez** (dedup por
  `claveReunion` = `fecha|títuloNormalizado`).

**⚠️ Límite estructural, no algo por hacer:** `getCurrentAppUserConnection` **necesita la
sesión de la persona**, así que **un cron no puede leer buzones ajenos**. Las notas de
cada quien entran cuando esa persona abre el CRM, no de madrugada. Es de la plataforma.

**Estado:** publicado y verificado — `gmailKarenBandeja?_probe=version` devuelve
`v2026-08-26.bandeja+notas`.

### Integraciones: bug real encontrado

La tarjeta "Mi Gmail — mis notas de reuniones" estaba **dentro del bloque `{isAdmin &&
...}`**: justo la gente que debía conectar su buzón (el equipo, incluida la otra empresa)
**nunca la veía**. Lo que sí veían eran las cuentas app-level, que muestran el mismo correo
para todos → se leía como "dato general".

Estado actual de `src/components/config/IntegracionesTab.jsx` — **solo conexiones por
usuario**, todas visibles para todo el equipo:

| Tarjeta | Chequeo | Tipo |
|---|---|---|
| Mi Gmail — mis notas de reuniones | `checkGmailKarenConnection` | por usuario |
| Microsoft Teams | `checkTeamsConnection` | por usuario |
| OneDrive — Notas de reuniones | `checkOneDriveConnection` | por usuario |
| Google Calendar | `checkCalendarConnection` | por usuario |
| Google Calendar — Cuenta adicional | `checkCalendarConnection2` | por usuario |

**Se eliminaron** las tarjetas app-level de **Gmail central** y **Google Drive** (petición
explícita del usuario: *"que solo salga lo que conecta cada usuario"*).

> **Consecuencia asumida:** el sync de Drive **sigue funcionando** (es el que trae los ~136
> docs por la cuenta compartida), pero ya **no hay dónde verificar esa conexión desde el
> CRM**. Si se cae, hay que mirarla en el panel de Base44. Se ofreció devolver esa sola
> tarjeta solo-admin; el usuario no ha respondido.

**PENDIENTE ofrecido, sin respuesta:** no existe vista de admin de "quién del equipo ya
conectó su Gmail" — la API de Base44 solo expone la conexión del usuario en sesión. La vía
sería registrarlo nosotros: al correr el auto-sync de alguien, estampar buzón + última
sincronización en su ficha de `MiembroEquipo` y mostrarlo en Config → Equipo.

---

## 3. Costos de IA — el hilo dominante de la sesión

**Objetivo del usuario:** bajar NOVA de ~$0.07 a **menos de $0.04 por mensaje**, con
números defendibles para cotizarle a clientes. Frase textual que marca el estándar de
rigor exigido:

> *"A mi hablame claro porfa con datos de verdad, nada que estoy correcto porque si. Esto
> es importante para el negocio."*

### Cómo funciona el caché (lo que se aplicó)

- El match del prefijo es **byte a byte**; orden de render `tools` → `system` → `messages`.
- Máximo **4 breakpoints**; mínimo **1024 tokens** por bloque en Sonnet 4.6.
- Precios relativos: **lectura 0.1×**, escritura 5m **1.25×**, escritura 1h **2×**.

**Invalidadores silenciosos que causaron los bugs reales de esta sesión:**

1. **Orden no determinista** devuelto por la API de listas → 15 de 18 consultas de NOVA no
   llevaban `sort=`. Síntoma medido: `lectura 4.619 / escritura 24.924`. Fix: ordenar por
   `id` con desempate determinista.
2. **Reloj dentro del bloque cacheado** — `horaHoyTexto` (hora + minuto) en el bloque
   cacheado de Emma lo rompía en cada request.
3. **Identificador por usuario en el prefijo** — "Estás hablando con X" y el chat del grupo
   de Telegram estaban dentro del `cache_control`.

### Estructura final de NOVA (`novaTelegram` y `copilotoEmpresa`, en paridad)

4 capas ordenadas de estable a volátil, todas `ttl: '1h'`, más una **quinta sin cachear**:

```
1. systemStatic     ttl 1h   instrucciones
2. ctxEquipo        ttl 1h   equipo + biblioteca
3. ctxDirectorio    ttl 1h   empresas / contactos / actas
4. ctxOperacion     ttl 1h   pipeline / cotizaciones / tareas
5. systemVolatil    SIN cache_control, al final: quién habla, fecha/hora, chat del grupo
```

`ttl:'1h'` es GA — **no lleva beta header**. Sondas disponibles:
`?_probe=version | contexto | ttltest`.

### Cifras verificadas (no estimadas)

| Concepto | Costo |
|---|---|
| Escritura con TTL 1h | **$0.1868** |
| Escritura con TTL 5m | **$0.1203** |
| Lectura | **$0.0184** |
| Sin caché | **$0.0982** |

- Tráfico real medido (**101 mensajes / 25 días**): **~$0.065 por mensaje**.
- Punto de equilibrio para la meta de $0.04: **8 mensajes por hora**.
- Comparación día a día que decidió el TTL: **21-ago → 1h $0.029 vs 5m $0.049**.

> **Errores propios que conviene no repetir:** cambié el TTL a 5 min dos veces basándome en
> un promedio global, y las capturas día-a-día del usuario lo desmintieron ambas veces. **El
> promedio global miente aquí; hay que mirar día por día.** Quedó en **1h**.

### Emma (WhatsApp)

- La función **activa es `emmaWhatsApp`** (el webhook de Meta apunta ahí), **no
  `webhookWhatsApp`** — ese quedó como respaldo con los mismos fixes.
- Estructura: `systemStable + systemReglas` cacheado (ttl 1h) + `systemVolatil` sin cachear.
- El RAG se ordenaba **solo por prioridad** → orden variable de la API → caché roto. Fix:
  desempate por `id`.
- Diagnóstico: `e.cache_debug` guarda la huella del prompt y el `usage` real en el estado
  del lead.
- Emma corre en el entorno **`preview`**: `base44 logs --function emmaWhatsApp --env preview`.
  Con `--env prod` sale "No production logs found" y despista.

### Módulo Consumo de IA

`src/pages/analytics/ConsumoIA.jsx` → ruta `/analytics/consumo-ia`, menú **IA Agente →
Consumo de IA**. Agrupa `NovaMensaje` en ventanas de 60 min = conversaciones; muestra
escrituras vs lecturas, gráficas, simulador de costos con presets y filtros
(presets / rango de fechas / persona). Datos desde el 24 de julio.

**Artifact con la explicación de costeo y el simulador:**
https://claude.ai/code/artifact/ece857f8-9af4-4417-98f7-ff34956cf51d

### RESUELTO — el TTL es una ventana CORREDIZA

**Leer el caché reinicia el reloj.** Medido empíricamente el 26-ago-2026 con
`novaTelegram?_probe=ttltest` (bloque fijo de 10.561 tokens, `ttl: '5m'`):

| Momento | Hora | Leído | Escrito | Veredicto |
|---|---|---|---|---|
| T+0 | 16:00:40 | 0 | 10.561 | ESCRIBIÓ |
| T+3 | 16:03:43 | 10.561 | 0 | LEYÓ |
| T+6 | **16:06:45** | **10.561** | **0** | **LEYÓ** |

**Por qué es concluyente:** la escritura fue a las 16:00:40 con TTL de 5 minutos; a las
16:06:45 — **6 min 5 s después** — seguía leyendo. Con ventana fija ya habría vencido y
reescrito. El `escrito: 0` de T+3 descarta que hubiera una segunda escritura explicando la
supervivencia. La única lectura consistente: **el acceso de T+3 renovó el reloj.**

**Qué implica para el costeo:** era el supuesto **optimista**. Como todas las cifras de
esta sección se calcularon con el **pesimista**, los costos reales son **hasta 7.1%
más bajos** de lo cotizado — las cotizaciones quedan conservadoras, no hay que rehacerlas.

**Consecuencia operativa:** una conversación activa mantiene el caché vivo indefinidamente
mientras los mensajes no se separen más que el TTL. Refuerza la decisión de dejar
**TTL 1h**: con conversación continua no se paga una segunda escritura.

*Salvedad: una sola corrida. El margen (6m05s contra un TTL de 5m) está muy por encima del
ruido, pero si se quiere blindar, repetir la sonda un par de veces.*

---

## 4. Otros trabajos cerrados

**Cotizaciones** (`src/components/cotizaciones/CotizacionForm.jsx`,
`base44/entities/Cotizacion.jsonc`)
- Arreglado el "comentario extra" que no guardaba (Base44 **descarta en silencio campos
  que no están en el schema** — misma causa del bug original de `notas`).
- Campos nuevos: `costo_envio`, `sw_modulo`, `sw_gigas`, `sw_solicitudes`.
- Texto predeterminado del software **totalmente editable y borrable** (`sw_descripcion`
  con flag `swDescEdited`).
- Dos subtipos de software por `sw_modulo`: **Inventarios** y **SAMM**, con campos propios.
- El usuario **sí quiere "SAMM" visible en el PDF** — contradice el RAG, **no es bug**.

**Migración de modelo** — se migró a Sonnet 5 y el usuario pidió **volver a 4.6**. Gotcha
documentado: en Sonnet 5, **omitir `thinking` activa thinking adaptativo por defecto** (al
revés que 4.6) y `max_tokens` cubre thinking + respuesta → truncaría el JSON de NOVA.

**Página `/perfil` en blanco** — no era código: se desplegó un `dist` construido **antes**
del pull. Ver el orden de despliegue en la sección 0.

---

## 5. Pendientes en una sola lista

**Del usuario (acciones manuales):**
1. Autorizar el **scope de escritura de Google Calendar** en la conexión compartida
   `googlecalendar`. Hoy es solo-lectura, y eso bloquea que Emma y NOVA **creen eventos**.
2. Configurar **cron-job.org** para `procesarReunionesDiarias`.
3. Agregar **`ELEVENLABS_API_KEY`** en las env de Base44 (STT/TTS ya implementados).
4. Decidir si se devuelve la tarjeta de **Google Drive** solo-admin en Integraciones.
5. Decidir si se arma la vista de **"quién ya conectó su Gmail"** en Config → Equipo.

**Técnicos:**
6. ~~Cerrar la prueba **ttltest**~~ — **RESUELTO 26-ago: ventana corrediza** (sección 3).
7. Verificar el fix de orden determinista de NOVA — hacen falta **2 mensajes dentro de la
   misma hora** y revisar el log `[nova-cache]`.
8. Verificar que el caché de Emma **lee** — 2 mensajes del mismo lead dentro de la hora.
9. `syncMeetingNotesGmail` y `syncMeetingNotesDrive` tienen sondas (`?probe=conectores`,
   `?debug=1`) **desplegadas pero sin publicar**.
10. Recuperar `base44/.app.jsonc` (`base44 link`) para dejar de pasar `--app-id`.
11. Bajar de 50 funciones si se necesita crear alguna nueva (hay 55).

---

## 6. Preferencias de trabajo del usuario

- **Push a GitHub después de cada conjunto de cambios**, sin acumular.
- Habla español coloquial colombiano; responder igual, **directo y sin adornos**.
- **Exige datos verificados**, no afirmaciones de cortesía. Si algo no se comprobó, decirlo.
- Cuando corrige o reafirma algo, **es una decisión** — ejecutarla, no re-litigarla.
- Prefiere entender **el porqué paso a paso** antes de aprobar una estructura.
