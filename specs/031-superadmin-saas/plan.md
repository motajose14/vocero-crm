# 031 — Plan técnico: superadmin SaaS

> Spec: `spec.md` · Tareas: `tasks.md` · Tracking: `odd/tasks/superadmin-saas.md`

## Arquitectura

Un módulo nuevo `src/server/plans/` concentra TODO lo que sabe qué puede hacer una
organización; los puntos de entrada solo preguntan y fallan, nunca recalculan límites a
su aire.

```text
src/server/plans/
  limits.ts     # límites efectivos de una org (plan asignado / NULL = sin límite)
  usage.ts      # contadores: contactos, miembros, canales conectados, conversaciones del mes
  guards.ts     # assertCan* → lanza ApiError/SendError 409 plan_limit ANTES de escribir
  blocked.ts    # evaluar/bloquear/desbloquear conversaciones (guarda perezosa)
```

## Modelo de datos (migración `drizzle/0021_*`, aditiva)

| Tabla / columna | Cambio |
|---|---|
| `plan` (nueva) | `id` (pk `pl_*`), `name`, `slug` unique, `is_free` bool default false, `price_cents` int null, `max_contacts` int null, `max_members` int null, `max_channels` int null, `max_conversations_month` int null, `active` bool default true, `created_at` |
| `organization.plan_id` | text null → FK `plan` (sin cascade: borrar plan asignado se rechaza en la app, 409 `plan_in_use`) |
| `user.is_superadmin` | bool not null default false (flag de plataforma, independiente de `member.role`) |
| `conversation.plan_blocked` | bool not null default false |
| Free idempotente en runtime | `ensureFreePlan()` en `src/server/plans/free.ts`: `INSERT … ON CONFLICT (slug) DO NOTHING` (`slug='free'`, `is_free=true`, límites por defecto), llamado en el alta por registro y en la API de planes. `drizzle/` se genera, nunca se edita a mano: la migración 0021 es solo DDL. |

Límites por defecto del Free (editables por el superadmin): 100 contactos, 2 miembros,
1 canal, 50 conversaciones/mes.

## Puntos de aplicación (los cuatro límites + el chat)

| Regla | Dónde se cumple | Error |
|---|---|---|
| Contactos manual | `src/app/api/contacts/route.ts` POST, antes del insert | 409 `plan_limit` |
| Contactos import | `src/app/api/contacts/import/route.ts` → `importContacts`, chequeo `count + nuevos <= tope` antes del batch | 409 `plan_limit` (atómico) |
| Miembros | `src/app/api/settings/team/route.ts` POST, junto al gate `owner` | 409 `plan_limit` |
| Canal nuevo | rutas `settings/{whatsapp,instagram,messenger,tiktok}`: solo si el canal NO tenía credenciales y `canales_conectados >= tope` | 409 `plan_limit` |
| Conversación nueva | `src/server/inbox/ingest.ts` `getOrCreateConversation`: si la org está sobre cuota o sobre tope de contactos, insert con `plan_blocked=true` (solo cuando `inserted[0]` devolvió fila; `is_test` nunca) | — (entra igual) |
| Envío | `src/server/inbox/send.ts` pre-vuelo: `plan_blocked` → si hoy está dentro de límites limpia el flag y sigue; si no, lanza `SendError "plan_limit"` | 409 `plan_limit` (humano, IA, bot y cerebro externo pasan por aquí) |
| Turno IA | `src/server/ai/trigger.ts`: no agenda turno ni despacha si `conversation.plan_blocked` | — (ahorra tokens) |

Nuevo 409 tipado: aditivo al contrato («agregar una llave cabe»). Se documenta en
`AGENTS.md` y en el contrato `/api/bot`.

## Registro multi-tenant

- `registration.ts`: el gate pasa a permitir registro cuando está abierto en SaaS (el
  feature lo reemplaza: registro público siempre disponible, sin condición de instancia
  vacía; `ALLOW_SIGNUP=false` puede seguir usándose para cerrarlo a mano).
- `on-signup.ts`: `onUserCreated` crea organización + etapas + perfil + plan Free en TODO
  registro público; el contexto `runInternalSignup` (invitación de equipo) no crea
  organización. El `AsyncLocalStorage` del bypass se expone desde `auth/index.ts` hacia
  `on-signup` sin romper el orden de imports.
- Slug de organización: derivado del correo/nombre con sufijo único en colisión.
- `resolveActiveOrganizationId` sigue tomando la primera membresía (cada dueño de
  cliente tiene exactamente una organización; multi-membresía fuera de alcance).

## API de administración (`/api/admin/*`)

`withAuth` + helper `requireSuperadmin(session)` (lee `user.is_superadmin`) en cada ruta.
Zod en todo body; errores con `apiError`.

- `GET /api/admin/organizations` — lista con plan + uso/límites.
- `GET /api/admin/organizations/[id]` — detalle + uso + recuento de conversaciones del mes.
- `POST /api/admin/organizations` — crea org (etapas + perfil) y cuenta dueña con
  contraseña aleatoria devuelta una vez; asigna plan (default Free).
- `PATCH /api/admin/organizations/[id]` — `planId` (asignar/cambiar; `null` = sin límites).
- `GET/POST /api/admin/plans`, `PATCH/DELETE /api/admin/plans/[id]` — CRUD; DELETE con
  clientes → 409 `plan_in_use`.

## UI `/admin`

- `src/app/(app)/admin/layout.tsx`: `getSessionOrNull()` + carga de `is_superadmin`;
  sin flag → `redirect("/")`. NO renderiza shell propio: vive dentro del route group
  `(app)`, que no agrega URL (las rutas siguen `/admin*`) pero envuelve el panel con el
  mismo cascarón —sidebar incluido— que al resto del CRM, como ya hace con Ajustes.
  Un cascarón propio hacía saltar de la aplicación a algo visualmente ajeno (L20).
  El guardarraíl `admin-cross-org-guard.test.ts` fija que `esSuperadmin` solo lo leen
  `withAdmin`, este layout y `(app)/layout.tsx` (que solo LEE el flag para pintar).
- `/admin` (redirect a clientes), `/admin/clientes` (lista + uso), `/admin/clientes/[id]`
  (detalle + asignación de plan), `/admin/planes` (CRUD con Free).
- UI con tokens de `globals.css` (`bg-background`, `text-foreground`, `bg-primary`…), sin
  hex sueltos; textos en español; sin «Vocero» cableado.

## Superadmin bootstrap

`scripts/superadmin-grant.mjs <correo>` → `UPDATE "user" SET is_superadmin=true WHERE
email=…`; script de package.json `superadmin:grant`. Sale con código distinto si no
existe el correo.

## Orden de tareas y dependencias

T1 (Constitución + spec) → T2 (esquema) → T3 (módulo plans) → T4 (registro) →
T5 (superadmin + API) → T6 (aplicar límites) → T7 (UI) → T8 (docs + e2e + gates).

## Riesgos

- `registration.test.ts` y `nav.test.ts` afirman formas exactas: se actualizan con el
  cambio, nunca se relajan sin cubrir la regla nueva.
- El gate de envío en `send.ts` es único para todos los caminos de salida: es el
  guardarraíl; probarlo con cada fuente (humano, IA, bot).
- `stage-history-guard.test.ts` no debe verse afectado (nadie más escribe `lead.stageId`).
