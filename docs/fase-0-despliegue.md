# Fase 0 — Despliegue de las correcciones de seguridad

Rama: `fase-0-seguridad`. Referencias (SEG-xx, FE-xx) según `AUDITORIA_WTAPP.md`.

> ⚠️ **El orden importa.** Estas funciones ahora **fallan cerradas**: si falta una variable, se niegan a
> trabajar en vez de quedar abiertas. Si se despliegan antes de configurar las variables,
> **Emma, NOVA y los crons se detienen**.

## Qué cambia

| ID | Función / archivo | Cambio | Requiere |
|---|---|---|---|
| SEG-04 | `enviarPendientes`, `procesarReunionesDiarias`, `emmaCrearReunion`, `emmaWhatsApp`, `webhookWhatsApp` | Se quitan los valores por defecto `wtsofia2026` y `wetracking2026`. Los crons aceptan el token por la cabecera `x-cron-token`; `?token=` se mantiene por compatibilidad | `CRON_TOKEN`, `WHATSAPP_VERIFY_TOKEN` |
| SEG-01 | `novaTelegram` | El secret del webhook pasa a ser obligatorio. Lista blanca de usuarios y grupos. Las sondas `_probe=ttltest/contexto` exigen `x-cron-token` | `TELEGRAM_COPILOTO_SECRET`, `NOVA_TG_IDS`, `NOVA_TG_CHATS` (opcional) |
| SEG-02 | `copilotoEmpresa` | Exige sesión del CRM | — |
| SEG-03 | `sendEmail`, `gmailEnviar`, `enviarCampanasProgramadas` | Exigen sesión o `x-cron-token`. `gmailEnviar` valida el destinatario (bloquea la inyección de cabeceras) | `CRON_TOKEN` |
| SEG-05 | `emmaWhatsApp` | Verifica la firma `X-Hub-Signature-256` de Meta. La traza `x-emma-debug` exige `x-cron-token` | `META_APP_SECRET` |
| SEG-09 | `checkCredenciales`, `seedConocimiento`, `seedInventario`, `seedPlantillas`, `novaWebhook` | **Eliminadas** del repo (el código queda en el historial de git) | Borrarlas también en la plataforma |
| FE-04/05 | `src/pages/crm/Reuniones.jsx` | Se quita el borrado automático al entrar un admin. "Deduplicar" queda solo para admin | Desplegar el sitio |

## Paso 1 — Respaldo de datos (antes de nada)

En PowerShell, desde la carpeta `wtapp`:

```powershell
$env:B44_TOKEN = "<token>"   # F12 en crm.wetracking.co → Application → Local Storage → base44_access_token
node scripts/backup-entidades.mjs
```

Debe terminar sin `✘`. El resultado queda en `backup/<fecha>/` (está en `.gitignore`: no se sube).

## Paso 2 — Variables de entorno en Base44 (panel de la app → Settings / Secrets)

| Variable | Valor | Cómo obtenerlo |
|---|---|---|
| `CRON_TOKEN` | **Nuevo**, aleatorio de 32 o más caracteres | En PowerShell: `-join ((48..57)+(65..90)+(97..122) \| Get-Random -Count 40 \| % {[char]$_})` |
| `WHATSAPP_VERIFY_TOKEN` | El valor que está configurado en Meta → WhatsApp → Configuración → Webhook | Si nunca se configuró la variable, en Meta está `wetracking2026`: ponlo así por ahora y rótalo después en los dos lados |
| `META_APP_SECRET` | App Secret de la app de Meta | Meta for Developers → tu app → Configuración → Básica → Clave secreta de la app |
| `TELEGRAM_COPILOTO_SECRET` | **Nuevo**, aleatorio (solo letras, números, `_` y `-`) | Igual que `CRON_TOKEN` |
| `NOVA_TG_IDS` | IDs de Telegram del equipo, separados por coma | Cada persona le escribe a @userinfobot en Telegram y te pasa su "Id". Tras el despliegue, NOVA también le responde a quien no esté autorizado con su ID |
| `NOVA_TG_CHATS` | (Opcional) ID del grupo del equipo donde NOVA puede responder | Aparece en `MensajeGrupoTelegram.chat_id`, o en Configuración → Agente → Grupo Telegram |

## Paso 3 — Registrar el secret en el webhook de NOVA

Como `novaWebhook` se eliminó, se hace directamente con la API de Telegram. Abre esta URL en el navegador, reemplazando los valores:

```
https://api.telegram.org/bot<TELEGRAM_COPILOTO_TOKEN>/setWebhook?url=https://crm.wetracking.co/api/functions/novaTelegram&secret_token=<TELEGRAM_COPILOTO_SECRET>
```

Antes, confirma la URL actual con `https://api.telegram.org/bot<TOKEN>/getWebhookInfo` y usa **esa misma URL** en `url=`. Debe responder `"ok":true`.

## Paso 4 — Desplegar (desde `wtapp`, con `npx base44 login` hecho)

```bash
npm run build
npx base44 --app-id 6a43f4eff47c0d92cfe2b575 site deploy -y --no-build
npx base44 --app-id 6a43f4eff47c0d92cfe2b575 functions deploy emmaWhatsApp
npx base44 --app-id 6a43f4eff47c0d92cfe2b575 functions deploy novaTelegram
npx base44 --app-id 6a43f4eff47c0d92cfe2b575 functions deploy copilotoEmpresa
npx base44 --app-id 6a43f4eff47c0d92cfe2b575 functions deploy sendEmail
npx base44 --app-id 6a43f4eff47c0d92cfe2b575 functions deploy gmailEnviar
npx base44 --app-id 6a43f4eff47c0d92cfe2b575 functions deploy enviarCampanasProgramadas
npx base44 --app-id 6a43f4eff47c0d92cfe2b575 functions deploy enviarPendientes
npx base44 --app-id 6a43f4eff47c0d92cfe2b575 functions deploy procesarReunionesDiarias
npx base44 --app-id 6a43f4eff47c0d92cfe2b575 functions deploy emmaCrearReunion
npx base44 --app-id 6a43f4eff47c0d92cfe2b575 functions deploy webhookWhatsApp
```

Luego **borrar en la plataforma** las 5 funciones eliminadas (`checkCredenciales`, `seedConocimiento`, `seedInventario`, `seedPlantillas`, `novaWebhook`), desde el panel de funciones de Base44 o con el CLI (verificar el comando con `npx base44 functions --help`).

**Finalmente: Publish en el builder.** Sin esto, producción sigue con el código viejo.

## Paso 5 — Actualizar los crons externos (cron-job.org)

En cada cron (`enviarPendientes`, `procesarReunionesDiarias` y `enviarCampanasProgramadas` si existe):
- Quitar `?token=...` de la URL.
- Agregar la cabecera `x-cron-token: <nuevo CRON_TOKEN>`.

## Paso 6 — Verificación

| Prueba | Resultado esperado |
|---|---|
| `GET .../functions/emmaWhatsApp?_probe=version` | `v2026-11-04.emmaWhatsApp.fase0` |
| `GET .../functions/novaTelegram?_probe=version` | `v2026-11-04.novaTelegram.fase0` |
| Escribir a Emma por WhatsApp desde un teléfono | Responde (la firma de Meta es válida) |
| Escribir a NOVA desde una cuenta del equipo | Responde |
| Escribir a NOVA desde una cuenta ajena | "No estás autorizado… tu ID es …" |
| Copiloto web con sesión iniciada | Funciona |
| Enviar una cotización por email desde el CRM | Se envía |
| `enviarPendientes` en cron-job.org | Historial con 200, no 401 |

**Si algo falla:** revisar en los logs de la función el mensaje `no configurado` o `no autorizado`, que indica qué variable falta.

## Paso 7 — Rotación de secretos (cuando todo lo anterior funcione)

Generar claves nuevas y reemplazarlas en Base44: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`, `WHATSAPP_API_TOKEN` (System User de Meta Business) y `BASE44_API_KEY`. En los bots de Telegram, usar `/revoke` en BotFather para obtener tokens nuevos, actualizar `TELEGRAM_BOT_TOKEN` y `TELEGRAM_COPILOTO_TOKEN`, y repetir el Paso 3 para los dos bots.
