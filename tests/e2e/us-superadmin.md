# E2E — Superadmin, planes y los cuatro límites (031)

Precondición: app corriendo con mocks (`WA_MOCK_ENABLED=true`,
`META_GRAPH_BASE_URL` → `/api/dev/wa-mock/graph`), `BOT_API_KEY` configurada
(≥16 caracteres), una cuenta de prueba que empiece SIN el flag de superadmin y
**ningún superadmin en la instancia** (es una instalación recién levantada).

Idea: `/admin` y `/api/admin/*` no existen para nadie hasta que alguien corre
`pnpm superadmin:grant -- <correo>`. Desde ahí el superadmin crea planes con
los cuatro topes y se los asigna a sus clientes; la organización que está
sobre el tope sigue recibiendo mensajes, pero no responde nada.

## Guarda del panel

1. Con sesión iniciada, `GET /api/admin/plans` → **403** `forbidden` (la
   sesión alcanza; el flag no).
2. Ir a `/admin` en el navegador → redirige a `/`: la pantalla ni se enseña.
3. `pnpm superadmin:grant -- <correo>` → `GET /api/admin/plans` → **200** y en
   la lista aparece un plan `isFree` (el Free de arranque, creado al vuelo).
4. Volver a `/admin` → cae en `/admin/clientes` con su navegación
   (Clientes / Planes).

## Planes

5. `POST /api/admin/plans` con `name` repetido → **409** `duplicate`.
6. Crear «E2E Tope» con los cuatro límites en `0` → **201**.
7. Con ese plan asignado a un cliente, `DELETE /api/admin/plans/<id>` → **409**
   `plan_in_use`: no se borra un plan que alguien está usando.

## Asignar el plan a un cliente

8. `GET /api/admin/organizations` → la lista trae `plan` y `usage` de cada
   cliente; el dueño de la cuenta de prueba aparece en `GET
   /api/admin/organizations/<id>`.
9. `PATCH /api/admin/organizations/<id> {planId}` → **200**. `{planId: null}`
   es «sin plan = sin límites» y también es válido.

## Contactos: manual e importación hacen 409

10. `POST /api/contacts` con teléfono nuevo → **409** `plan_limit`.
11. `POST /api/contacts/import` con uno o varios renglones → **409**
    `plan_limit`; `GET /api/contacts` no cambió: **no se creó ni el primero**
    (la importación es atómica).
12. Lo que entra por webhook SÍ pasa: `POST /api/dev/wa-mock/inbound` →
    **200** y la conversación aparece en `GET /api/conversations`.

## Equipo: el cuarto límite

13. `POST /api/settings/team` con un correo nuevo → **409** `plan_limit`.
14. `GET /api/settings/team` → mismos miembros: **no quedó ninguna cuenta
    suelta** (la guarda va antes del alta).

## Canales: solo cuenta el NUEVO

Cada plataforma (WhatsApp, Instagram, Messenger, TikTok) es UNA ranura de
canal: conectarla cuenta, re-guardar sus credenciales no.

15. Con WhatsApp **sin conectar** y `maxChannels` en 0,
    `PUT /api/settings/whatsapp` → **409** `plan_limit`.
16. Quitando el plan un momento (`{planId: null}`), la misma llamada → **200**
    y el canal queda conectado.
17. Con el tope de vuelta, `PUT /api/settings/whatsapp` con el MISMO número y
    token rotado → **200**: re-guardar las credenciales de un canal ya
    conectado no es conectar otro canal.

## El chat sobre cuota (Historia 5)

Cita verbatim del dueño: «La B, por webhoook tanto conversaciones como
contactos entran pero se bloquea el chat si ya alcanzo su limite, y por
creacion manual o importacion lanza error 409 y bloquea la creacion.»

18. Tras el inbound del paso 12, esperar más que `AGENT_COALESCE_MS` (6000 por
    defecto) → el outbox de wa-mock NO creció: **la IA no contestó** y tampoco
    hubo despacho al cerebro externo.
19. `POST /api/conversations/<id>/messages` → **409** `plan_limit` y nada
    salió por WhatsApp: **ni la IA ni el humano responden**.
20. `POST /api/bot/messages {conversationId, text}` con `X-API-Key` → **409**
    `plan_limit`: el cerebro externo recibe el mismo tope.

## Liberación perezosa (sin cron)

21. `PATCH /api/admin/organizations/<id> {planId: null}` (o un plan con
    margen) → el primer `POST /api/conversations/<id>/messages` → **200** y el
    mensaje llega al outbox: la conversación se desbloqueó sola en ese primer
    envío.
22. `POST /api/contacts` → **201**: sin plan no hay tope (Historia 6).

## Cierre

23. Borrar el plan de prueba (ya sin clientes) → **200**.
24. `pnpm superadmin:grant -- <correo> off` → `GET /api/admin/plans` vuelve a
    **403**: la instalación queda con cero superadmins.

Arnés: `node --env-file=.env scripts/e2e-superadmin.mjs`.
