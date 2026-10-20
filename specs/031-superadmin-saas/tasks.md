# 031 — Tareas

> IDs compartidos con `odd/tasks/superadmin-saas.md` (logbook operativo con estado y
> commits). Ruta: todas `inline` — el padre del ODD escribe siguiendo su logbook; no hay
> unidades paralelas con superficies disjuntas.

- [x] **T1** — Enmendar la Constitución (Principio VIII `:233-235`, intro `:55-57`,
  Principio III `:126-129`) y escribir `specs/031-superadmin-saas/{spec,plan,tasks}.md`.
  Specs: todas (habilita el resto). Commit `e4c269e`.
- [x] **T2** — Esquema: tabla `plan`, `organization.plan_id`, `user.is_superadmin`,
  `conversation.plan_blocked`; `pnpm db:generate` → `drizzle/0021_*` (solo DDL; el Free
  lo asegura `ensureFreePlan()` en runtime). Prueba RED→GREEN: `tests/unit/plan-schema.test.ts`.
  Suite 1150/1150 + typecheck en verde. Specs: S2, S3, S5.
- [x] **T3** — `src/server/plans/` (`limits.ts`, `free.ts`, `blocked.ts`, `usage.ts`,
  `guards.ts`) + pruebas unitarias. Prueba RED→GREEN: `tests/unit/planes-limites.test.ts`
  (21 tests: semántica null=sin límite, tope, Free 100/2/1/50, nacimiento bloqueado,
  desbloqueo perezoso y veredicto de envío). Specs: S3.
- [x] **T4** — Registro multi-tenant: con registro habilitado, organización por registro
  con plan Free (`ensureFreePlan`), bypass interno intacto (no crea org);
  `tests/unit/on-signup.test.ts` RED→GREEN (5) y `registration.test.ts` sigue en verde
  (el gate `ALLOW_SIGNUP` no cambia). Specs: S4.
- [x] **T5** — Superadmin: flag `user.is_superadmin` + `esSuperadmin`, guarda
  `withAdmin` (401 → 403 `forbidden` sin ejecutar el handler), esquemas Zod de
  `/api/admin/*`, `GET/POST /api/admin/plans`, `PATCH/DELETE .../plans/[planId]`
  (409 `plan_in_use`), `GET/POST /api/admin/organizations` (alta con contraseña
  aleatoria devuelta una vez), `GET/PATCH .../organizations/[orgId]`,
  `usageByOrg` agrupado y `scripts/superadmin-grant.mjs` (`pnpm superadmin:grant`);
  `admin-guard-schemas.test.ts` (9) + `admin-routes.test.ts` (16) RED→GREEN.
  Specs: S1, S2, S5.
- [x] **T6** — Límites en sus puertas: `checkCanCreateContact` en `POST /api/contacts`
  y en la importación (todos los renglones válidos antes de tocar nada → atómico),
  `checkCanInviteMember` en equipo ANTES del signup, `checkCanConnectThisChannel` en las
  cuatro rutas de canal (solo cuenta el NUEVO; re-guardar no tropezca). Conversación que
  nace con `plan_blocked=true` en `getOrCreateConversation` (`is_test` nunca), pre-vuelo
  en `send.ts` (`block` → `SendError plan_limit` 409; `send_and_release` limpia el flag)
  y `maybeRunAgentTurn` sin turno ni despacho en bloqueadas. Contrato `/api/bot`:
  llave aditiva `plan_limit` (409). `plan-gates.test.ts` RED→GREEN (13) +
  `whatsapp-save-webhook.test.ts` con la guarda mockeada. Specs: S3, Historias 4-5.
- [x] **T7** — UI `/admin`: `admin/layout.tsx` con la guarda (`getSessionOrNull` +
  `esSuperadmin` → `redirect("/")`), shell mínimo fuera de `appNavGroups`, `/admin`
  redirige a Clientes; `clientes-client.tsx` (lista con uso + alta con la contraseña
  devuelta una vez), `cliente-client.tsx` (detalle, dueño y asignación de plan, con
  «sin plan» = sin límites) y `planes-client.tsx` (CRUD, vacío = sin límite, `switch`
  de activo). `uso-cliente.tsx` comparte los cuatro números con barra que se tiñe al
  tope. Tokens de `globals.css`; cuatro gates en verde. Specs: S1, S6.
- [x] **T8** — Docs: `AGENTS.md` (módulo `plans/`, `src/app/admin/`, `admin/*` en la
  API, `plan_limit` en el contrato `/api/bot`, invariante «el superadmin es la única
  puerta que cruza organizaciones», `pnpm superadmin:grant`), `plan.md` corregido
  (el panel es el segmento `admin/`, no un route group). Guardarraíl
  `admin-cross-org-guard.test.ts` (5) que escanea `src/`. Guion `tests/e2e/us-superadmin.md`
  (24 pasos) + arnés `scripts/e2e-superadmin.mjs` — CORRIDO contra la app con mocks:
  36/36 verdes. Cuatro gates en verde (typecheck, lint, suite 108/1219, build con
  `/admin/clientes` y `/admin/planes`). Specs: S3, S6, requisitos no funcionales.
