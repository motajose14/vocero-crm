# 031 — Superadmin SaaS: planes y límites multi-tenant

> Objetivo: transformar una instancia de Vocero en un SaaS multi-tenant: un superadmin de
> plataforma maneja los clientes (organizaciones), crea planes —incluido un plan Free— y
> aplica límites por organización. Sin cobros: la facturación es la etapa 2.
> Rama: `feat/superadmin-planes-limites`. Tracking operativo: `odd/tasks/superadmin-saas.md`.

## El problema

Hoy Vocero es estrictamente «una instancia = un negocio»: `isPublicSignupAllowed()`
(`src/server/auth/registration.ts:13`) cierra el registro público en cuanto existe una
organización, y `onUserCreated` (`src/server/auth/on-signup.ts:31`) devuelve temprano si
alguna organización existe, de modo que una instalación solo crea UNA organización. La
Constitución (Principio VIII) además declara fuera de alcance «billing, planes,
multi-instancia». No existe ningún concepto de plan, de límites ni de administrador de
plataforma: no se puede operar un despliegue que aloje a varios clientes cobrados por
plan.

## Decisiones

- **D1 — Una sola instancia multi-tenant.** Un único despliegue aloja N organizaciones;
  el superadmin opera un panel `/admin` en la misma app. (Decisión del dueño, L3.)
- **D2 — Cobros fuera.** Solo planes administrados a mano; `price_cents` es dato de
  exhibición. Billing = etapa 2. (L5.)
- **D3 — Cuatro límites por plan**: `max_contacts`, `max_members`, `max_channels`,
  `max_conversations_month`. `null` = sin límite. (L4.)
- **D4 — Semántica de bloqueo**: el tráfico entrante de Meta NUNCA se rechaza; la
  restricción dura (409) aplica a las acciones internas, y las conversaciones nacidas
  sobre cuota nacen con chat bloqueado (ni IA ni persona responden). (L6 y L7, verbatim
  en «Comportamiento observable».)
- **D5 — `organization.plan_id NULL` = sin límites.** Las instalaciones existentes que
  actualicen no quedan capadas de golpe; el superadmin asigna planes a mano. Las altas
  por registro público del SaaS reciben el plan Free sembrado por la migración. (L9.)
- **D6 — Bloqueo perezoso, sin cron**: `conversation.plan_blocked` se limpia en el
  primer envío cuando la organización actualmente está dentro de límites (plan nuevo, mes
  nuevo o contactos por debajo del tope). (L9.)
- **D7 — Superadmin fuera de toda organización**: flag `user.is_superadmin`, alta
  explícita con `pnpm superadmin:grant <correo>`; no vive en el `nav.ts` de ningún
  cliente.
- **D8 — Una organización por registro público.** El bypass interno
  (`runInternalSignup`) de las invitaciones de equipo NO crea organización.

## Alcance

**Dentro**

- Tablas `plan` y `organization.plan_id`; columnas `user.is_superadmin` y
  `conversation.plan_blocked`; migración `drizzle/0021_*` (aditiva, siembra el plan
  «Free»).
- Módulo `src/server/plans/` con los límites efectivos de una organización, sus
  contadores y la guarda de bloqueo.
- Registro público abierto: cada registro crea la SUYA organización con plan Free.
- API `/api/admin/*`: organizaciones (lista con uso, detalle, crear con cuenta dueña,
  asignar/cambiar plan) y planes (CRUD con `is_free`).
- Aplicación de límites en: `POST /api/contacts`, `POST /api/contacts/import`, invitación
  de equipo (`POST /api/settings/team`), conexión de canal nuevo (rutas
  `PUT/POST /api/settings/{whatsapp,instagram,messenger,tiktok}`), creación de
  conversación (`getOrCreateConversation`) y envío (`src/server/inbox/send.ts` con
  desbloqueo perezoso). El turno del agente no se agenda en conversaciones bloqueadas.
- UI `/admin` (layout propio con guard de superadmin): pantallas Clientes y Planes.
- Nuevo 409 tipado `plan_limit` en el envío (incluido `POST /api/bot/messages`,
  aditivo al contrato) y `plan_in_use` al borrar un plan asignado.
- Tests unitarios de cada regla; guion e2e del flujo; docs (AGENTS.md, contrato bot).

**Fuera**

- Checkout, webhooks de pago, facturación (etapa 2).
- Suspensión/baja de clientes (no pedido; futura).
- Selector de organización para usuarios multi-miembro (cada dueño de cliente tiene una).
- Límite de mensajes de IA, de medios o de citas (no elegidos en L4).

## Comportamiento observable

### Historia 1 — Registro abierto, un cliente por alta (P1)

Dado el registro público (abierto en SaaS), cuando un usuario se registra entonces se
crea UNA organización suya con etapas de pipeline y perfil de agente (igual que el primer
arranque de hoy) y se le asigna el plan «Free»; el bypass interno de invitación de equipo
no crea organización. El registro ya NO se cierra tras la primera organización.

### Historia 2 — Superadmin maneja clientes (P1)

Dado un usuario con `is_superadmin`, cuando entra a `/admin` entonces ve la lista de
clientes con plan y uso actual (contactos, miembros, canales, conversaciones del mes vs
su tope); puede ver el detalle, crear un cliente manualmente (organización + cuenta dueña
con correo y contraseña generada mostrada una vez) y asignar o cambiar su plan. Dado un
usuario sin ese flag, `/admin` y `/api/admin/*` responden 401/403 y `/admin` redirige.

### Historia 3 — Planes con Free (P1)

Dado el superadmin en Pantalla → Planes, cuando crea o edita un plan entonces define
nombre, marcador «Free», precio mensual de exhibición y los cuatro límites (vacío =
sin límite); puede desactivarlo. Si intenta borrar un plan con clientes asignados recibe
409 `plan_in_use`. La migración siembra un plan «Free» editable.

### Historia 4 — Límites duros en la puerta (P1)

Con la organización en el tope de contactos, al crear un contacto manual o importar un
CSV entonces NADA se crea y la API responde 409 `plan_limit` con mensaje claro (la
importación es atómica). Igual para invitar un miembro sobre el tope de equipo y para
conectar un canal nuevo sobre el tope de canales (re-guardar credenciales de un canal ya
conectado no cuenta). Los mensajes que entran por webhook crean contacto y conversación
SIN excepción.

### Historia 5 — Conversación sobre cuota: chat bloqueado (P1)

Con la organización que ya agotó su cuota mensual de conversaciones (o sobre el tope de
contactos), cuando llega el primer mensaje de un cliente nuevo entonces la conversación
se crea igual (el mensaje entra) pero con `plan_blocked`: el agente de IA no responde, el
despacho a cerebro externo no ocurre y ningún envío humano o de bot sale de esa
conversación — 409 `plan_limit`. Cita verbatim del dueño (L7): «La B, por webhoook tanto
conversaciones como contactos entran pero se bloquea el chat si ya alcanzo su limite, y
por creacion manual o importacion lanza error 409 y bloquea la creacion.» Cita verbatim
del dueño (L6): «los contactos y conversiones entran pero el chat se debe bloquear para
que la ia no pueda responder pero el usuario tampoco». Las conversaciones creadas dentro
de cuota no se tocan; las de prueba (`is_test`) no cuentan ni se bloquean. En el primer
envío posterior, si la organización ya está dentro de límites (subió de plan, cambió de
mes o bajaron los contactos), `plan_blocked` se limpia y el mensaje sale.

### Historia 6 — Organización sin plan (P1)

Una organización con `plan_id NULL` no tiene ningún límite (compatibilidad con
instalaciones existentes al actualizar); el superadmin le asigna un plan cuando quiera.

## Requisitos no funcionales

- Migración aditiva y re-ejecutable (`pnpm db:generate`, `drizzle/0021_*`); una
  instalación existente actualiza sin pasos manuales y sin perder capacidad.
- Todo nuevo query de dominio pasa por `scoped()`; el superadmin es la única puerta que
  cruza organizaciones (revisable con una prueba que escanee `src/`).
- Zod en todo input de `/api/admin/*`; errores tipados con `apiError`.
- La guarda de límites es previa a la escritura y al llamado a Meta: un 409 no deja fila
  parcial ni mensaje suelto.
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` en verde con y sin banderas
  (`CHANNELS`, `AGENDA`).
- Sin cron ni jobs nuevos: el bloqueo se re-evalúa en el camino del envío.

## Constitution Check

- Principio I (open source MIT / soberanía): se conserva; el núcleo sigue dependiendo de
  Postgres + Cloud API + LLM opcional; `/admin` es parte de la misma app.
- Principio III (multi-tenant real): reforzado; `scoped()` sigue obligatorio en todo
  query, y `/admin` es la única puerta cross-org.
- Principio VI (specs): ciclo completo en `specs/031-superadmin-saas/` porque toca modelo
  de datos y agrega un código tipado al contrato `/api/bot`.
- Principio VIII (alcance): **enmendado por esta feature** — la versión vigente tras T1
  incluye explícitamente el SaaS multi-tenant de una instancia, planes y límites, y deja
  fuera cobros/checkout (etapa 2). El enmendado es requisito previo a cualquier código.
- Constitución III / guardarraíles: `tenant.test.ts`, `stage-history-guard.test.ts`,
  `nav.test.ts` y `registration.test.ts` deben seguir en verde (los de registro se
  actualizan a la nueva regla).
