# Plan futuro — Módulo de Marketing (tipo HubSpot Marketing Hub) para WeTracking CRM

> Documento de planeación para **más adelante**. Objetivo: construir un módulo de Marketing
> completo, súper desarrollado y con interfaz pulida, replicando la lógica de HubSpot
> Marketing Hub, totalmente integrado al CRM que ya existe en WeTracking.
> Basado en el recorrido módulo por módulo del Marketing Hub de HubSpot (jul 2026).

---

## 1. Qué ya existe en WeTracking (base a aprovechar, NO reconstruir)

- **Email Marketing:** entidades `Campana`, `Segmento`, `PlantillaEmail`, `EmailEnviado`;
  páginas `email/campanas`, `email/segmentos`, `email/plantillas`, `email/metricas`;
  envío por **Gmail** (`ms@grouptso.com`, función `sendEmail`), tracking de aperturas
  (`trackEmailOpen`), programadas (`enviarCampanasProgramadas`).
- **CRM:** `Contacto`, `Empresa`, `Oportunidad`, pipeline (kanban), `Nota`, `Tarea`.
- **Analítica de leads:** página `analytics/leads`.
- **Agentes IA:** Emma (WhatsApp) y Nova (Telegram, ya crea campañas/segmentos/plantillas).
- **Marca:** logo, favicon WeTracking, firma por usuario (base de un "Brand Kit").
- **Dominio propio + correo propio** ya resueltos (crm.wetracking.co, ms@grouptso.com).

Conclusión: hay una **base de Email + CRM**; falta la **puerta de entrada (Formularios)**,
el **motor (Workflows)**, el **paraguas (Campañas)** y las capas de medición/adquisición.

---

## 2. Módulos a construir — mapeo HubSpot → WeTracking

Para cada uno: **qué hace**, **con qué se conecta**, **estado hoy**, **qué construir**
(entidades + funciones backend + interfaz).

### 2.1 Correo (Email Marketing) — MEJORAR lo existente
- **Qué hace:** crear, enviar y analizar campañas de correo masivo.
- **Interfaz objetivo (HubSpot):** 4 pestañas → Administrar (lista), Plantillas (diseños),
  Analizar (aperturas/clics/rebotes), Estado (entregabilidad).
- **Construir:** editor visual de plantillas (drag & drop o bloques), pruebas A/B,
  vista de entregabilidad/rebotes, mejorar el panel de métricas.

### 2.2 Formularios — NUEVO · **PRIORIDAD MÁXIMA** (puerta de entrada)
- **Qué hace:** formularios embebibles (pop-up, incrustado, standalone) para capturar leads,
  con lógica condicional y enriquecimiento.
- **Conexión:** al llenarse → crea/actualiza `Contacto` → puede disparar un Workflow →
  entra a una Lista/Segmento → queda asociado a una Campaña.
- **Construir:**
  - Entidades: `Formulario` (campos, estilo, destino), `FormularioRespuesta`.
  - Función **pública autocontenida** de captura (sin auth) que crea/actualiza el Contacto.
  - **Snippet JS embebible** para pegar en sitios externos + versión standalone en
    `crm.wetracking.co/f/:id`.
  - Constructor visual de formularios en el panel.

### 2.3 Campañas (paraguas) — NUEVO / EXTENDER
- **Qué hace:** agrupa todos los activos (emails, ads, landing pages, formularios, social)
  bajo un mismo objetivo y presupuesto, con métricas consolidadas de ROI.
- **Conexión:** es el punto donde TODOS los módulos se conectan.
- **Construir:** entidad `CampanaMkt` (paraguas, distinta de `Campana` de email) con
  objetivo, presupuesto, fechas y **assets asociados**; dashboard de ROI consolidado.

### 2.4 Automatización / Workflows — NUEVO · **PRIORIDAD ALTA** (el motor)
- **Qué hace:** disparadores → acciones. Ej: "si llena formulario X → enviar email Y,
  asignar a vendedor, subir score, mover etapa".
- **Conexión:** conecta Formularios, Email, Lead Scoring, CRM/Ventas.
- **Construir:** entidad `Workflow` (trigger + pasos), **ejecutor** (cron + por eventos),
  editor visual de flujos (nodos). Base44 ya tiene `workflows/` (por evento de conector).

### 2.5 Calificación de leads (Lead Scoring) — NUEVO / EXTENDER
- **Qué hace:** puntaje automático por comportamiento (aperturas, visitas, formularios).
- **Conexión:** Workflows (dispara al superar umbral) y CRM/Ventas (notifica al vendedor).
- **Construir:** campo `puntaje` en `Contacto` + reglas configurables + recálculo.
  Ya existe algo de calificación cualitativa vía Emma (`calificado`/`descalificado`).

### 2.6 Landing Pages — NUEVO
- **Qué hace:** páginas de captura (con formularios embebidos) hospedadas.
- **Construir:** constructor + hosting en `crm.wetracking.co/lp/:slug` (público, sin auth).

### 2.7 Redes sociales — NUEVO (Fase 3)
- **Qué hace:** programar/publicar en varias redes desde un calendario + medir interacción.
- **Conexión:** Campañas (ROI) y Contenidos.
- **Construir:** integraciones Meta/LinkedIn, calendario de publicación.

### 2.8 Anuncios (Ads) — NUEVO (Fase 3)
- **Qué hace:** conectar Google/Meta/LinkedIn Ads, medir ROI con datos del CRM, audiencias
  de retargeting.
- **Conexión:** Contactos (qué anuncio generó qué lead) y Campañas (gasto + resultados).

### 2.9 SEO / Contenidos (Blog) — NUEVO (Fase 3)
- **Qué hace:** topic clusters, auditar keywords, monitorear posicionamiento; blog + landings.

### 2.10 Eventos de marketing — NUEVO (Fase 3)
- **Qué hace:** webinars/eventos, registro y asistencia.
- **Conexión:** Contactos (cada registro crea/actualiza contacto), Workflows (recordatorios).

### 2.11 Buyer Intent (Intención de compra) — NUEVO (Fase 3)
- **Qué hace:** identifica qué empresas visitan el sitio y su nivel de interés (IP → empresa).
- **Construir:** código de seguimiento (snippet) instalado en el sitio → registros de Empresa
  + eventos de visita; se conecta con Workflows para asignar leads por intención.

### 2.12 Brand Kit (Marca) — NUEVO / CENTRALIZAR
- **Qué hace:** repositorio de logos, favicons, colores y tipografías, aplicados
  automáticamente a landings, blog, emails y formularios.
- **Estado:** WeTracking ya tiene logo/favicon/firma → centralizar en una entidad `BrandKit`.

### 2.13 AEO (Answer Engine Optimization) — NUEVO (Beta / Fase 3)
- **Qué hace:** analiza cómo aparece la marca en respuestas de IA (ChatGPT/Perplexity/Gemini)
  y recomienda mejoras. Encaja bien con nuestras integraciones de IA existentes.

### 2.14 Analíticas de marketing — NUEVO (Fase 2)
- **Qué hace:** panel consolidado: tráfico del sitio, conversión de formularios, rendimiento
  de emails y campañas — todo en un lugar.

---

## 3. El flujo completo (cómo se conecta todo)

```
Visitante (con código de seguimiento) ─► Buyer Intent (empresa que visita)
        │
        ▼  llena
   Formulario ─► crea/actualiza Contacto (CRM)
        │                 │
        │                 ▼ comportamiento
        │           Lead Scoring (puntaje)
        │                 │ supera umbral
        ▼                 ▼
     Workflow (Automatización) ─► secuencia de Emails / asignar vendedor / mover etapa
        │
        ▼  todo agrupado bajo
     Campaña (paraguas) ◄── Ads, Redes sociales, Landing pages, Formularios, Emails
        │
   Brand Kit define lo visual de todo el contenido
        │
        ▼
   Analíticas de marketing (consolida los números de cada pieza)
```

---

## 4. Interfaz (UX)

- Nueva sección **"Marketing"** en el sidebar, con submódulos (Correo, Formularios, Campañas,
  Automatización, Lead Scoring, Landing, Social, Ads, SEO, Eventos, Analíticas, Brand Kit).
- Cada módulo con su vista tipo HubSpot: listas con filtros, editores visuales, dashboards.
- Reutilizar componentes del app (tablas, modales, badges, toasts) para consistencia.
- Constructores visuales (formularios, workflows, landings, emails) son el mayor esfuerzo de UI.

---

## 5. Priorización sugerida (fases)

**Fase 1 — Fundamentos que desbloquean el flujo (lo que HubSpot tiene bloqueado y da más valor):**
1. **Formularios** + captura pública (la puerta de entrada de leads).
2. **Workflows / Automatización** (el motor que conecta todo).
3. **Campañas paraguas** (agrupar activos + ROI).
4. **Lead Scoring** (priorizar leads).

**Fase 2 — Medición y contenido:**
5. **Landing pages** (con formularios).
6. **Analíticas de marketing** consolidadas.
7. Mejorar **Email** (4 pestañas + editor visual + A/B + entregabilidad).
8. **Brand Kit** centralizado.

**Fase 3 — Adquisición y avanzado:**
9. Redes sociales, 10. Ads, 11. SEO/Blog, 12. Eventos, 13. Buyer Intent (tracking),
14. AEO.

---

## 6. Notas técnicas (Base44)

- **Entidades nuevas** por módulo (Formulario, FormularioRespuesta, Workflow, CampanaMkt,
  BrandKit, LandingPage, EventoMkt, etc.).
- **Funciones autocontenidas** para lo público: captura de formularios, tracking del sitio,
  ejecutor de workflows (cron + por eventos). Deben ser autocontenidas (sin imports de shared).
- **Páginas públicas** (sin auth) para formularios standalone y landing pages en
  `crm.wetracking.co/f/:id` y `/lp/:slug`.
- **Snippet JS embebible** para formularios y tracking en sitios externos.
- Aprovechar que **Nova** ya crea campañas/segmentos/plantillas → extender para que también
  cree formularios, workflows y landings por instrucción.

---

_Fuente del mapeo: recorrido del Marketing Hub de HubSpot (plan Free/Starter, varias secciones
bloqueadas por plan). Este documento es el norte; se implementa por fases cuando se decida._
