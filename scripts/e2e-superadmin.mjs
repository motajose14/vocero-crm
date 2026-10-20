/**
 * 031 — Self-test E2E del SaaS: superadmin, planes y los cuatro límites.
 * Guion tests/e2e/us-superadmin.md.
 *
 * Cubre el camino completo: sin el flag `/admin` no existe, con él se crean
 * planes y se asignan a un cliente; con los cuatro topes en 0 la organización
 * sigue RECIBIENDO mensajes (el webhook entra) pero no responde nada — ni IA,
 * ni humano, ni cerebro externo — mientras que manual, importación, equipo y
 * canal nuevo fallan 409 sin escribir nada.
 *
 * Uso: node --env-file=.env scripts/e2e-superadmin.mjs
 * Requiere: app corriendo (pnpm dev) con WA_MOCK_ENABLED=true; la receta
 * completa está en specs/001-vocero-core/quickstart.md. El correo de la cuenta
 * de prueba se puede cambiar con E2E_SA_EMAIL.
 *
 * Al terminar restaura lo suyo: la organización queda sin plan, el plan de
 * prueba se borra y la cuenta vuelve a NO ser superadmin.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const BASE = "http://localhost:3000";
const EMAIL = process.env.E2E_SA_EMAIL ?? "e2e-superadmin@vocero.test";
const PASS = "password-e2e-sa-123";
const S = Math.random().toString(36).slice(2, 6).toUpperCase();
const PN = "PN-SA-1";

let failures = 0;
const ok = (name, cond, extra = "") => {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const json = async (res) => {
  try {
    return await res.json();
  } catch {
    return null;
  }
};
const codigo = (data) => data?.error?.code ?? "";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const req = ctx.request;

console.log("== Setup: sesión de la cuenta de prueba ==");
let r = await req.post(`${BASE}/api/auth/sign-up/email`, {
  headers: { origin: BASE },
  data: { email: EMAIL, password: PASS, name: "Operador Superadmin" },
});
if (!r.ok()) {
  r = await req.post(`${BASE}/api/auth/sign-in/email`, {
    headers: { origin: BASE },
    data: { email: EMAIL, password: PASS },
  });
}
ok(`sesión de ${EMAIL}`, r.ok(), `status ${r.status()}`);
if (!r.ok()) {
  console.error(
    "No hay sesión: si la instancia ya tiene organizaciones, el registro está " +
      "cerrado. Crea la cuenta (o apunta E2E_SA_EMAIL a una existente) y repite."
  );
  await browser.close();
  process.exit(1);
}

console.log("\n== AC1: sin flag no hay admin ==");
r = await req.get(`${BASE}/api/admin/plans`);
ok("GET /api/admin/plans → 403 forbidden", r.status() === 403 && (await json(r))?.error?.code === "forbidden", `status ${r.status()}`);

const fueraDelPanel = () => !new URL(page.url()).pathname.startsWith("/admin");

const page = await ctx.newPage();
await page.goto(`${BASE}/admin`).catch(() => {});
ok(
  "el navegador en /admin NO llega al panel",
  fueraDelPanel(),
  page.url()
);

console.log("\n== AC2: conceder el flag ==");
const grant = spawnSync(process.execPath, ["scripts/superadmin-grant.mjs", EMAIL], {
  encoding: "utf8",
  cwd: ROOT,
});
ok("superadmin-grant sale con 0", grant.status === 0, (grant.stderr ?? "").trim());

await page.goto(`${BASE}/admin`).catch(() => {});
ok(
  "con el flag, /admin abre la lista de clientes",
  new URL(page.url()).pathname === "/admin/clientes",
  page.url()
);
await page.getByText("Planes", { exact: true }).first().waitFor({ timeout: 5000 }).catch(() => {});
ok(
  "el panel enseña su navegación (Clientes y Planes)",
  (await page.getByText("Planes", { exact: true }).count()) > 0
);

console.log("\n== AC3: planes ==");
r = await req.get(`${BASE}/api/admin/plans`);
let planes = (await json(r))?.plans ?? [];
ok("GET /api/admin/plans → 200", r.status() === 200, `status ${r.status()}`);
ok("existe un plan Free (asegurado al vuelo)", planes.some((p) => p.isFree));

const NOMBRE = `E2E Tope ${S}`;
const plan = { name: NOMBRE, maxContacts: 0, maxMembers: 0, maxChannels: 0, maxConversationsMonth: 0 };
r = await req.post(`${BASE}/api/admin/plans`, {
  data: plan,
  headers: { "content-type": "application/json" },
});
const planCreado = await json(r);
ok("crear el plan de tope → 201", r.status() === 201, JSON.stringify(await json(r)));
const planId = planCreado?.plan?.id;
ok("el plan trae sus cuatro límites en 0", planCreado?.plan?.maxContacts === 0 && planCreado?.plan?.maxConversationsMonth === 0);

r = await req.post(`${BASE}/api/admin/plans`, {
  data: plan,
  headers: { "content-type": "application/json" },
});
ok(
  "nombre repetido → 409 duplicate",
  r.status() === 409 && codigo(await json(r)) === "duplicate",
  `status ${r.status()}`
);

console.log("\n== AC4: el cliente de esta cuenta ==");
r = await req.get(`${BASE}/api/admin/organizations`);
const orgs = (await json(r))?.organizations ?? [];
ok("la lista trae plan y uso de cada cliente", orgs.length > 0 && "usage" in (orgs[0] ?? {}) && "plan" in (orgs[0] ?? {}));
let orgId = null;
for (const o of orgs) {
  const det = await json(await req.get(`${BASE}/api/admin/organizations/${o.id}`));
  if (det?.owner?.email?.toLowerCase() === EMAIL.toLowerCase()) orgId = o.id;
}
ok("encontré la organización dueña de la cuenta", !!orgId);

console.log("\n== AC5: asignar el plan (y no dejarlo a medias) ==");
r = await req.patch(`${BASE}/api/admin/organizations/${orgId}`, {
  data: { planId },
  headers: { "content-type": "application/json" },
});
ok("asignar plan → 200", r.status() === 200, `status ${r.status()}`);

r = await req.delete(`${BASE}/api/admin/plans/${planId}`);
ok(
  "borrar el plan que un cliente está usando → 409 plan_in_use",
  r.status() === 409 && codigo(await json(r)) === "plan_in_use",
  `status ${r.status()}`
);

console.log("\n== AC6: contactos (manual e importación) ==");
const contactos = async () => (await json(await req.get(`${BASE}/api/contacts`)))?.contacts ?? [];
const antesContactos = (await contactos()).length;
r = await req.post(`${BASE}/api/contacts`, {
  data: { name: `Contacto Tope ${S}`, phone: `52155${Math.floor(Math.random() * 9e7) + 1e7}` },
  headers: { "content-type": "application/json" },
});
ok(
  "crear contacto manual → 409 plan_limit",
  r.status() === 409 && codigo(await json(r)) === "plan_limit",
  `status ${r.status()}`
);
ok("no se creó ningún contacto", (await contactos()).length === antesContactos);

r = await req.post(`${BASE}/api/contacts/import`, {
  data: { contacts: [{ name: `Importado ${S}`, phone: `52156${Math.floor(Math.random() * 9e7) + 1e7}` }] },
  headers: { "content-type": "application/json" },
});
ok(
  "importar → 409 plan_limit (atómico)",
  r.status() === 409 && codigo(await json(r)) === "plan_limit",
  `status ${r.status()}`
);
ok("la importación no dejó ni el primer renglón", (await contactos()).length === antesContactos);

console.log("\n== AC7: equipo ==");
const equipo = async () => (await json(await req.get(`${BASE}/api/settings/team`)))?.members ?? [];
const miembrosAntes = (await equipo()).length;
r = await req.post(`${BASE}/api/settings/team`, {
  data: { name: `Invitada ${S}`, email: `invitada-${S.toLowerCase()}@vocero.test`, password: "password-inv-123" },
  headers: { "content-type": "application/json" },
});
ok(
  "invitar al equipo → 409 plan_limit",
  r.status() === 409 && codigo(await json(r)) === "plan_limit",
  `status ${r.status()}`
);
const miembrosDespues = await equipo();
ok(
  "no quedó ninguna cuenta suelta",
  miembrosDespues.length === miembrosAntes &&
    !miembrosDespues.some((m) => m.email?.includes(`invitada-${S.toLowerCase()}`))
);

console.log("\n== AC8: canales (solo cuenta el NUEVO) ==");
// Cada plataforma es UNA ranura de canal: mientras no haya credenciales de
// WhatsApp, conectarlo es un canal nuevo y el tope lo frena. Una vez
// conectado, re-guardar sus credenciales (token rotado) no lo es. En una
// instancia ya usada el canal puede estar conectado desde antes: ahí solo
// queda comprobar la excepción.
const waConectado = !!(await json(await req.get(`${BASE}/api/settings/whatsapp`)))?.connection;
if (!waConectado) {
  r = await req.put(`${BASE}/api/settings/whatsapp`, {
    data: { wabaId: "WABA-SA", phoneNumberId: PN, token: `tok-sa-${S}` },
    headers: { "content-type": "application/json" },
  });
  ok(
    "conectar WhatsApp con canales agotados → 409 plan_limit",
    r.status() === 409 && codigo(await json(r)) === "plan_limit",
    `status ${r.status()}`
  );

  r = await req.patch(`${BASE}/api/admin/organizations/${orgId}`, {
    data: { planId: null },
    headers: { "content-type": "application/json" },
  });
  ok("quito el plan un momento para poder conectar el canal", r.status() === 200, `status ${r.status()}`);
  r = await req.put(`${BASE}/api/settings/whatsapp`, {
    data: { wabaId: "WABA-SA", phoneNumberId: PN, token: `tok-sa-${S}` },
    headers: { "content-type": "application/json" },
  });
  ok("con el tope fuera, WhatsApp conecta → 200", r.status() === 200, `status ${r.status()}`);

  r = await req.patch(`${BASE}/api/admin/organizations/${orgId}`, {
    data: { planId },
    headers: { "content-type": "application/json" },
  });
  ok("vuelvo a poner el tope", r.status() === 200, `status ${r.status()}`);
} else {
  console.log(
    "  ○ WhatsApp ya estaba conectado en esta organización: el paso de «canal\n    nuevo bloqueado» se omite (se prueba en una instancia limpia)"
  );
}
r = await req.put(`${BASE}/api/settings/whatsapp`, {
  data: { wabaId: "WABA-SA", phoneNumberId: PN, token: `tok-sa-rotado-${S}` },
  headers: { "content-type": "application/json" },
});
ok("re-guardar el canal ya conectado → 200 (no cuenta como nuevo)", r.status() === 200, `status ${r.status()}`);

console.log("\n== AC9: el webhook entra, el chat se bloquea ==");
await req.delete(`${BASE}/api/dev/wa-mock/outbox`);
const CLIENTE = `Cliente Tope ${S}`;
const ENTRANTE = `521477${Math.floor(Math.random() * 9e6) + 1e6}`;
r = await req.post(`${BASE}/api/dev/wa-mock/inbound`, {
  data: {
    phoneNumberId: PN,
    from: ENTRANTE,
    name: CLIENTE,
    text: "hola, ¿me atienden?",
    waMessageId: `wamid.sa.${S}`,
  },
  headers: { "content-type": "application/json" },
});
ok("el mensaje del cliente entra aunque la org esté sobre el tope", r.status() === 200, `status ${r.status()}`);
await sleep(1500);
const conversaciones = (await json(await req.get(`${BASE}/api/conversations`)))?.conversations ?? [];
const conv = conversaciones.find((c) => c.contact?.name === CLIENTE);
ok("la conversación se creó (no se rechaza la entrada)", !!conv);

const outbox = async () => (await json(await req.get(`${BASE}/api/dev/wa-mock/outbox`)))?.outbox ?? [];
const fueraDeOutbox = async () => {
  const n = (await outbox()).length;
  await sleep(7500); // AGENT_COALESCE_MS (6000) + margen
  return (await outbox()).length === n;
};
const outboxAntes = (await outbox()).length;
ok("la IA no responde (espera pasada la ventana de coalesce)", await fueraDeOutbox());

if (conv) {
  r = await req.post(`${BASE}/api/conversations/${conv.id}/messages`, {
    data: { text: "te contesto desde la bandeja" },
    headers: { "content-type": "application/json" },
  });
  ok(
    "responder de humano → 409 plan_limit",
    r.status() === 409 && codigo(await json(r)) === "plan_limit",
    `status ${r.status()}`
  );
  ok("nada salió por WhatsApp", (await outbox()).length === outboxAntes);

  if (process.env.BOT_API_KEY) {
    r = await req.post(`${BASE}/api/bot/messages`, {
      data: { conversationId: conv.id, text: "respondo desde el cerebro externo" },
      headers: { "content-type": "application/json", "x-api-key": process.env.BOT_API_KEY },
    });
    ok(
      "el cerebro externo recibe el mismo 409 plan_limit",
      r.status() === 409 && codigo(await json(r)) === "plan_limit",
      `status ${r.status()}`
    );
    ok("sigue sin salir nada por WhatsApp", (await outbox()).length === outboxAntes);
  } else {
    console.log("  ○ prueba del cerebro externo omitida (falta BOT_API_KEY)");
  }

  console.log("\n== AC10: liberación perezoso (sin cron) ==");
  r = await req.patch(`${BASE}/api/admin/organizations/${orgId}`, {
    data: { planId: null },
    headers: { "content-type": "application/json" },
  });
  ok("quitar el plan → 200 (sin límites)", r.status() === 200, `status ${r.status()}`);
  r = await req.post(`${BASE}/api/conversations/${conv.id}/messages`, {
    data: { text: `desbloqueo ${S}` },
    headers: { "content-type": "application/json" },
  });
  ok("el primer envío posterior sale → 200", r.status() === 200, `status ${r.status()}`);
  const textoFuera = (await outbox())
    .map((o) => o.body?.text?.body ?? "")
    .some((t) => t.includes(`desbloqueo ${S}`));
  ok("y el mensaje llegó a WhatsApp", textoFuera);

  r = await req.post(`${BASE}/api/contacts`, {
    data: { name: `Sin tope ${S}`, phone: `52157${Math.floor(Math.random() * 9e7) + 1e7}` },
    headers: { "content-type": "application/json" },
  });
  ok("sin plan no hay tope: crear contacto → 201", r.status() === 201, `status ${r.status()}`);
} else {
  ok("conversación encontrada", false, "no se puede probar el bloqueo de chat");
}

console.log("\n== AC11: cierre ==");
r = await req.delete(`${BASE}/api/admin/plans/${planId}`);
ok("borrar el plan de prueba (ya sin clientes) → 200", r.status() === 200, `status ${r.status()}`);

const revoke = spawnSync(process.execPath, ["scripts/superadmin-grant.mjs", EMAIL, "off"], {
  encoding: "utf8",
  cwd: ROOT,
});
ok("la cuenta deja de ser superadmin", revoke.status === 0, (revoke.stderr ?? "").trim());
r = await req.get(`${BASE}/api/admin/plans`);
ok("sin flag vuelve el 403", r.status() === 403, `status ${r.status()}`);
await page.goto(`${BASE}/admin`).catch(() => {});
ok("y el navegador vuelve a quedar fuera del panel", fueraDelPanel(), page.url());

await browser.close();
console.log(`\n${failures === 0 ? "TODO VERDE" : `${failures} fallo(s)`}`);
process.exit(failures === 0 ? 0 : 1);
