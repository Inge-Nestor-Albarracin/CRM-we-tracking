# Fase 0: pasos para desplegar las correcciones de seguridad

Rama: `fase-0-seguridad`. Los IDs (SEG-xx, FE-xx) remiten a `AUDITORIA_WTAPP.md`.

**Quién hace qué:**
- **TÚ:** acciones en paneles, en GitHub o con secretos, que solo puede hacer una persona.
- **YO:** acciones que Claude ejecuta con el CLI de Base44 una vez que inicies sesión.

> **Regla de oro:** los valores de los secretos (tokens, claves) **nunca** se pegan en el chat. Se escriben directamente en Base44.

---

## Qué cambia

| ID | Dónde | Cambio |
|---|---|---|
| SEG-01 | `novaTelegram` | El secret del webhook pasa a ser obligatorio y hay lista blanca de usuarios y grupos. Las sondas `_probe=ttltest/contexto` exigen `x-cron-token` |
| SEG-02 | `copilotoEmpresa` | Exige sesión del CRM |
| SEG-03 | `sendEmail`, `gmailEnviar`, `enviarCampanasProgramadas` | Exigen sesión o `x-cron-token`. `gmailEnviar` valida el destinatario |
| SEG-04 | `enviarPendientes`, `procesarReunionesDiarias`, `emmaCrearReunion`, `emmaWhatsApp`, `webhookWhatsApp` | Se quitan los valores por defecto `wtsofia2026` y `wetracking2026` |
| SEG-05 | `emmaWhatsApp` | Verifica la firma de Meta (`X-Hub-Signature-256`) |
| SEG-07 | `useUserRole.js`, `Configuracion.jsx` | El rol Admin del CRM sale del rol de Base44, no de un correo fijo ni de `PerfilUsuario` |
| SEG-09 | — | Se eliminan `checkCredenciales`, `seedConocimiento`, `seedInventario`, `seedPlantillas` y `novaWebhook` |
| FE-04/05 | `Reuniones.jsx` | Sin borrado automático al entrar un admin. "Deduplicar" queda solo para admin |

**Estado en producción antes de desplegar (2026-11-06, `scripts/verificar-fase0.mjs`):** las 12 pruebas fallan. Se confirmó en vivo que `emmaCrearReunion` acepta el token viejo `wtsofia2026` y que `sendEmail`, `gmailEnviar`, `copilotoEmpresa` y `enviarCampanasProgramadas` responden sin sesión.

---

## Paso 0 — Hoy mismo, no depende del despliegue (TÚ, panel de Base44)

En **app.base44.com → la app → Panel → Usuarios de la app**:

1. **Quitar las cuentas del exempleado**, si aparecen: `massischonlau@gmail.com` y `ms@magmaconsultinggroup.com` (menú "⋯" de la fila).
2. **Revisar los roles.** Con SEG-07, solo será Admin en el CRM quien tenga rol `admin` aquí:
   - `karen@grouptso.com` es Admin en el CRM viejo. Si debe seguir siéndolo, ponle rol `admin`.
   - `wetdavpernettqu@gmail.com` también es Admin en el CRM viejo. Confirma quién es; si no es del equipo, quítalo.
   - `direccioncomercial@grouptso.com`: confirma quién la usa.
3. **No pulses "Publicar" ni le pidas cambios a la IA del editor** hasta terminar esta guía. Lo que haya en el editor se publica tal cual.

## Paso 1 — Respaldo de datos ✅ (hecho el 2026-11-06)

En `backup/2026-11-06T16-30`: 39 entidades y 1.489 registros. **Pendiente (TÚ):** copiar esa carpeta a un Drive de la empresa con acceso restringido.

Si pasan varios días antes de desplegar, repítelo:

```powershell
$env:B44_TOKEN = "<token de crm.wetracking.co>"
node scripts/backup-entidades.mjs
```

## Paso 2 — Subir la rama a GitHub (TÚ)

```bash
git push -u origin fase-0-seguridad
```

Cada vez que yo haga commits nuevos te voy a pedir que repitas `git push`.

## Paso 3 — Iniciar sesión en el CLI de Base44 (TÚ)

En una terminal, dentro de `wtapp`:

```bash
npx base44 login
```

Se abre el navegador: entra con la cuenta que tiene acceso de developer al editor. Para comprobarlo:

```bash
npx base44 whoami
```

Avísame cuando esté. La sesión queda guardada en el PC y desde ahí puedo usar el CLI.

## Paso 4 — Traer el código actual del editor e integrarlo (YO) ✅ (2026-11-06)

- **Checkpoint en el editor:** "Antes de Fase 0 (respaldo de seguridad)" (`6aee0ecc49d6642c399cb109`). Si algo sale mal, se restaura desde el historial de versiones del editor.
- **Código del editor == nuestra base `e8b1499`.** Ningún archivo de `src/` ni de `base44/` difiere. El "nombre editable" y el "logo propio" (`CampoEditable.jsx`, `LogoEmpresaEditable.jsx`) **ya estaban en el código**; lo que falta es **publicarlos**.
- Se copiaron a la rama los `function.jsonc` del editor (50 funciones desplegadas). `classifyLead` y `sendWhatsAppMessage` **no están desplegadas**, lo que confirma FE-01.
- ⚠️ `base44 eject` **creó una app copia** (`crm-we-tracking-copy-421d0d53.base44.app`, id `6aee0ef58f382dbe421d0d53`) sin datos ni secretos. **TÚ:** bórrala desde su panel (app.base44.com → esa app → Configuración → Eliminar). No volver a usar `eject`.
- **Secretos configurados hoy (solo nombres):** `ANTHROPIC_API_KEY`, `BASE44_API_KEY`, `ELEVENLABS_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_COPILOTO_TOKEN`, `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` y `WHATSAPP_VERIFY_TOKEN`.
  - **No existe `CRON_TOKEN`**: hoy todo funciona con el valor por defecto `wtsofia2026`, que está publicado en GitHub.
  - **No existe `TELEGRAM_COPILOTO_SECRET`**: el webhook de NOVA no tiene ninguna protección.

> **Ojo al publicar:** el editor tiene cambios acumulados desde la última publicación (el editor dice que es del 7 de octubre). Al pulsar Publicar salen **esos cambios + la Fase 0**. Antes de publicar, revisa la **Vista previa** del editor (Paso 7).

## Paso 5 — Configurar los secretos (TÚ)

Hazlo en **Panel → Seguridad / Secrets** del editor de Base44. También se puede con `npx base44 secrets set NOMBRE=valor` en tu terminal, pero el panel no deja el valor guardado en el historial de la consola.

Generar un valor aleatorio en PowerShell (para `CRON_TOKEN` y `TELEGRAM_COPILOTO_SECRET`):

```powershell
-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 40 | ForEach-Object {[char]$_})
```

**Configúralos en este orden.** Algunos afectan también al código viejo que está publicado ahora:

| # | Variable | Valor | ¿Afecta al código actual? |
|---|---|---|---|
| a | `META_APP_SECRET` | Meta for Developers → tu app → Configuración → Básica → **Clave secreta de la app** | No. Se puede poner ya |
| b | `NOVA_TG_IDS` | IDs de Telegram del equipo, separados por coma. Cada uno le escribe a **@userinfobot** y te pasa su "Id" | No |
| c | `NOVA_TG_CHATS` | (Opcional) ID del grupo del equipo donde NOVA responde. Sin esta variable, NOVA solo funciona en chats privados | No |
| d | ~~`WHATSAPP_VERIFY_TOKEN`~~ | **Ya existe.** No hay que hacer nada | — |
| e | `CRON_TOKEN` | **Nuevo**, aleatorio | **Sí.** Los crons que hoy usan `?token=wtsofia2026` empiezan a fallar. **Inmediatamente después**, en cron-job.org, cambia en cada cron `?token=wtsofia2026` por `?token=<nuevo>` |
| f | `TELEGRAM_COPILOTO_SECRET` | **Nuevo**, aleatorio (solo letras y números) | **Sí.** NOVA deja de responder hasta registrar el secret en Telegram. **Inmediatamente después**, abre en el navegador:<br>`https://api.telegram.org/bot<TOKEN_DEL_BOT_NOVA>/setWebhook?url=<URL_ACTUAL>&secret_token=<SECRET>`<br>La `<URL_ACTUAL>` sale de `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`. Debe responder `"ok":true` |

Avísame cuando estén a, b, e y f (c es opcional). **No me pases los valores.** Puedo comprobar que existen con `secrets list`, que solo muestra los nombres.

## Paso 6 — Subir los cambios al editor (YO) ✅ (2026-11-06)

Hecho: 10 funciones desplegadas, 6 eliminadas (las 5 de SEG-09 + `testValentina`, un sandbox de pruebas abierto que reapareció al sincronizar), 50 funciones en remoto = 50 en el repo. Checkpoint `Fase 0 - seguridad (sin publicar)` (`6aee149632ff04a4c3ab5362`).


1. Escribir en el código del editor los archivos de la rama (`sandbox write`), sin usar su IA.
2. Desplegar las funciones modificadas (`functions deploy <nombre>`, una por una; **nunca** `--force`).
3. Eliminar las 5 funciones de SEG-09. Si el CLI no lo permite, te indico cómo hacerlo en el panel.
4. Crear el checkpoint `"Fase 0 — seguridad"` en el historial del editor.

## Paso 7 — Publicar ✅ (2026-11-06 19:14 UTC)

Publicado el checkpoint `6aee149632ff04a4c3ab5362` con la API de Base44 (`POST /api/apps/{app_id}/deploy`; el CLI 0.3.1 no tiene comando `publish`). Commit desplegado `2bf35bd`.


1. En el editor, abre **Vista previa** y revisa lo básico: login, Dashboard, una empresa, una cotización y Reuniones.
2. Botón **Publicar** en la barra superior del editor. Hasta este momento, producción sigue con el código viejo.

## Paso 8 — Verificar (YO + TÚ)

**YO:** `node scripts/verificar-fase0.mjs` debe mostrar las 12 pruebas con ✔. ✅ **12/12 el 2026-11-06**, tanto en `wtapp.base44.app` como en `crm.wetracking.co`.

**TÚ, pruebas manuales:**

| Prueba | Resultado esperado |
|---|---|
| Escribirle a Emma por WhatsApp desde un teléfono | Responde |
| Escribirle a NOVA desde tu Telegram (si tu ID está en `NOVA_TG_IDS`) | Responde |
| Escribirle a NOVA desde un Telegram que no sea del equipo | "No estás autorizado… Tu ID es …" |
| Entrar al CRM con analistainventarios@ | Se ven los menús de admin (Agente IA, Proyecciones, Equipo…) |
| Copiloto web dentro del CRM | Responde |
| Enviar una cotización de prueba por correo a ti mismo | Llega |
| Historial de cron-job.org | Respuestas 200, no 401 |

**Si algo falla:** en Panel → Funciones → logs de la función, los mensajes `no configurado` / `no autorizado` dicen qué variable falta. Para volver atrás: historial de versiones del editor → checkpoint "Antes de Fase 0" → Publicar.

## Paso 9 — Pasar los crons a cabecera (TÚ, después de verificar)

En cron-job.org, en cada cron: quitar `?token=...` de la URL y agregar la cabecera `x-cron-token: <CRON_TOKEN>`. Así el token deja de quedar en los logs.

## Paso 10 — Cerrar el acceso del exempleado (TÚ, esta semana)

1. **Propiedad de la app:** pasarla de ms@grouptso.com a analistainventarios@ (Panel → Usuarios → "⋯", o soporte de Base44).
2. **Rotar las claves de los proveedores** y reemplazarlas en Base44: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`, `WHATSAPP_API_TOKEN` (System User de Meta Business) y `BASE44_API_KEY`.
3. **Bots de Telegram:** en BotFather, `/revoke` para obtener tokens nuevos de Emma y de NOVA. Actualizar `TELEGRAM_BOT_TOKEN` y `TELEGRAM_COPILOTO_TOKEN`, y repetir el `setWebhook` del Paso 5f para cada bot.
4. **Quitarle el acceso** en Meta Business, cron-job.org y el GitHub viejo, y desconectar ese repo del editor si sigue vinculado.
