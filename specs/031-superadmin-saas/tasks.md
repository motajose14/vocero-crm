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
- [ ] **T3** — `src/server/plans/` (`limits.ts`, `usage.ts`, `guards.ts`, `blocked.ts`) +
  pruebas unitarias. Specs: S3.
- [ ] **T4** — Registro multi-tenant: registro abierto, organización por registro con
  plan Free, bypass interno intacto; actualiza `tests/unit/registration.test.ts`.
  Specs: S4.
- [ ] **T5** — Superadmin: flag, `requireSuperadmin`, `scripts/superadmin-grant.mjs`,
  API `/api/admin/*` (organizaciones + planes CRUD) + pruebas. Specs: S1, S2, S5.
- [ ] **T6** — Límites en sus puertas (contactos, import, equipo, canales), conversación
  sobre cuota con `plan_blocked`, guarda de envío con desbloqueo perezoso, sin turno de
  IA en bloqueadas + pruebas. Specs: S3, Historias 4-5.
- [ ] **T7** — UI `/admin`: layout guard, Clientes (lista/detalle/asignar plan), Planes.
  Specs: S1, S6.
- [ ] **T8** — Docs (AGENTS.md, contrato `/api/bot` con `plan_limit`), guion e2e, cuatro
  gates en verde. Specs: S3, requisitos no funcionales.
