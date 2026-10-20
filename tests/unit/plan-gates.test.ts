import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 031 — T6: los cuatro límites en sus PUERTAS y el chat sobre cuota.
 *
 * Semántica pedida (verbatim): por webhook todo entra y el chat bloqueado no
 * responde (ni IA ni persona); manual/importación/equipo/canal → 409
 * `plan_limit` que bloquea la creación. Aquí se prueba esa frontera: qué
 * responde la API y qué NO llega a escribirse.
 */

const state = vi.hoisted(() => ({
  /** Resultado que devuelven las guardas de `src/server/plans/guards`. */
  guard: null as null | { ok: false; code: "plan_limit"; message: string },
  /** `conversationBornBlockedNow`: ¿nace bloqueada? */
  naceBloqueada: false,
  /** `currentSendVerdict` para la conversación bajo prueba. */
  veredicto: "send" as "send" | "send_and_release" | "block",
  /** Credenciales ya existentes del canal (para el gate de canales). */
  canalYaConectado: false,
  llamadas: [] as string[],
  planBlocked: false,
  /** Fila que devuelve el `.returning()` del insert (null = conflicto). */
  filaInsert: null as unknown,
  /** Respuestas en orden para las consultas (`limit`/`await`). */
  cola: [] as unknown[][],
  /** Credenciales previas de WhatsApp (null = canal nuevo). */
  creds: null as unknown,
}));

vi.mock("@/lib/auth/session", () => {
  class UnauthorizedError extends Error {}
  return {
    UnauthorizedError,
    requireSession: async () => ({
      userId: "usr_1",
      organizationId: "org_a",
      role: "owner",
    }),
  };
});

vi.mock("@/server/plans/guards", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/server/plans/guards")>();
  return {
    ...original,
    checkCanCreateContact: vi.fn(async () => state.guard ?? { ok: true }),
    checkCanInviteMember: vi.fn(async () => state.guard ?? { ok: true }),
    checkCanConnectChannel: vi.fn(async () => state.guard ?? { ok: true }),
    // La excepción «re-guardar no cuenta» vive en la ruta (lee `previa`):
    // aquí se replica para que el test afirme QUÉ le pasó la ruta, no la BD.
    checkCanConnectThisChannel: vi.fn(
      async (_db: unknown, _org: string, opts: { yaConectado: boolean }) =>
        opts.yaConectado ? { ok: true } : state.guard ?? { ok: true }
    ),
    conversationBornBlockedNow: vi.fn(async () => state.naceBloqueada),
    currentSendVerdict: vi.fn(async () => state.veredicto),
  };
});

// Credenciales y conexión de WhatsApp: estado mutable, no un mock por test —
// el módulo de la ruta se importa una sola vez y conserva el PRIMER mock.
vi.mock("@/server/whatsapp/credentials", () => ({
  getCredentialsByOrg: vi.fn(async () => state.creds),
  saveCredentials: vi.fn(async () => {}),
  desconectarCanal: vi.fn(),
  tokenLast4: () => "1234",
}));
vi.mock("@/server/whatsapp/connect", () => ({
  testConnection: vi.fn(async () => ({
    ok: true as const,
    displayPhoneNumber: "5215500000000",
    verifiedName: "Vocero",
  })),
  registerWebhookForNumber: vi.fn(async () => ({ ok: true })),
  unregisterWebhookForNumber: vi.fn(),
}));
// La URL del webhook exige env completa; lo que importa aquí es que el
// guardado la llamó, no cómo la arma.
vi.mock("@/server/whatsapp/webhook-url", () => ({
  webhookPath: () => "/api/webhooks/wa/tok",
  webhookUrl: () => "https://ejemplo.test/api/webhooks/wa/tok",
  webhookVerifyToken: () => "verify",
}));

// El turno de IA: solo importa SI se agenda/despacha, no cómo se arma.
vi.mock("@/server/ai/pipeline", () => ({ scheduleAgentTurn: vi.fn() }));
vi.mock("@/server/dispatch/encolar", () => ({ despacharAlCerebro: vi.fn() }));
vi.mock("@/server/brains/config", () => ({ despachoActivo: () => false }));
vi.mock("@/lib/ai/provider", () => ({ isAiConfiguredFor: vi.fn(async () => true) }));

/** El 409 llega con `plan_limit` y el mensaje claro del tope. */
function respuestaDeTope(res: Response) {
  expect(res.status).toBe(409);
}

// El lead es asunto de otra prueba (003): aquí solo importa si la puerta
// dejó pasar la creación del contacto.
vi.mock("@/server/inbox/lead-activity", () => ({
  createLeadForContact: vi.fn(async () => ({ id: "ld_1" })),
}));

beforeEach(async () => {
  state.guard = null;
  state.naceBloqueada = false;
  state.veredicto = "send";
  state.canalYaConectado = false;
  state.llamadas = [];
  state.planBlocked = false;
  state.filaInsert = null;
  state.cola = [];
  state.creds = null;
  // Los spies compartidos entre tests: sin esto, un test hereda el conteo del anterior.
  const guards = await import("@/server/plans/guards");
  vi.mocked(guards.currentSendVerdict).mockClear();
});

// ————— Puerta: contactos manuales —————

vi.mock("@/lib/db", () => {
  const registrar =
    (metodo: string, resolver?: () => unknown) =>
    (..._args: unknown[]) => {
      if (metodo === "insert" || metodo === "update") {
        state.llamadas.push(metodo);
      }
      const b: Record<string, unknown> = {};
      for (const m of [
        "values",
        "onConflictDoNothing",
        "returning",
        "where",
        "set",
        "select",
        "from",
        "innerJoin",
        "limit",
        "orderBy",
        "groupBy",
        "update",
        "delete",
      ]) {
        b[m] = (..._a: unknown[]) => {
          if (m === "insert" || m === "update") state.llamadas.push(m);
          if (m === "returning" || m === "limit") {
            return Promise.resolve(resolver ? resolver() : []);
          }
          if (m === "values" || m === "set") return b;
          return b;
        };
      }
      b.then = (
        onF: (v: unknown) => unknown,
        onR: (e: unknown) => unknown
      ) => Promise.resolve(resolver ? resolver() : []).then(onF, onR);
      return b;
    };
  return {
    getDb: () => ({
      insert: () =>
        registrar("insert", () => (state.filaInsert ? [state.filaInsert] : []))(),
      update: () => registrar("update")(),
      delete: () => registrar("delete")(),
      select: () => registrar("select", () => state.cola.shift() ?? [])(),
      transaction: (cb: (tx: unknown) => Promise<void>) =>
        cb({
          insert: () => registrar("insert")(),
          update: () => registrar("update")(),
        }),
    }),
    schema: new Proxy({}, { get: (_t, p) => ({ __t: String(p) }) }),
  };
});

describe("POST /api/contacts — tope de contactos", () => {
  it("en el tope → 409 plan_limit y NO inserta nada", async () => {
    state.guard = {
      ok: false,
      code: "plan_limit",
      message:
        "Límite de contactos de tu plan alcanzado (100). Actualiza tu plan para seguir agregando.",
    };
    const { POST } = await import("@/app/api/contacts/route");
    const res = await POST(
      new Request("http://t/api/contacts", {
        method: "POST",
        body: JSON.stringify({ name: "Ana", phone: "5215511111111" }),
      })
    );
    respuestaDeTope(res);
    const body = await res.json();
    expect(body.error.code).toBe("plan_limit");
    expect(body.error.message).toContain("alcanzado");
    expect(state.llamadas).not.toContain("insert");
  });

  it("con margen → crea el contacto", async () => {
    state.filaInsert = { id: "ct_1", organizationId: "org_a" };
    const { POST } = await import("@/app/api/contacts/route");
    const res = await POST(
      new Request("http://t/api/contacts", {
        method: "POST",
        body: JSON.stringify({ name: "Ana", phone: "5215511111111" }),
      })
    );
    expect(res.status).not.toBe(409);
    expect(state.llamadas).toContain("insert");
    expect(res.status).toBe(201);
  });
});

describe("POST /api/contacts/import — atómico", () => {
  it("la importación completa sobre el tope → 409 y NO se escribe nada", async () => {
    state.guard = {
      ok: false,
      code: "plan_limit",
      message: "Límite de contactos de tu plan alcanzado (100).",
    };
    const importContacts = vi.fn();
    vi.doMock("@/server/contacts-import", () => ({ importContacts }));
    const { POST } = await import("@/app/api/contacts/import/route");
    const res = await POST(
      new Request("http://t/api/contacts/import", {
        method: "POST",
        body: JSON.stringify({
          contacts: [{ name: "Ana", phone: "5215511111111" }],
        }),
      })
    );
    respuestaDeTope(res);
    expect(importContacts).not.toHaveBeenCalled();
    expect(state.llamadas).not.toContain("insert");
    vi.doUnmock("@/server/contacts-import");
  });
});

// ————— Puerta: miembros del equipo —————

describe("POST /api/settings/team — tope de equipo", () => {
  it("en el tope → 409 y NI se abre la cuenta", async () => {
    state.guard = {
      ok: false,
      code: "plan_limit",
      message: "Límite de usuarios del equipo de tu plan alcanzado (2).",
    };
    const { POST } = await import("@/app/api/settings/team/route");
    const res = await POST(
      new Request("http://t/api/settings/team", {
        method: "POST",
        body: JSON.stringify({
          name: "Leo",
          email: "leo@x.mx",
          password: "secreta123",
        }),
      })
    );
    respuestaDeTope(res);
    expect((await res.json()).error.code).toBe("plan_limit");
    // La guarda corre ANTES del signup: un 409 no deja cuentas sueltas.
    expect(state.llamadas).not.toContain("insert");
  });
});

// ————— Puerta: canal nuevo —————

describe("PUT /api/settings/whatsapp — tope de canales", () => {
  it("canal NUEVO sobre el tope → 409 y no se valida ni guarda nada", async () => {
    state.guard = {
      ok: false,
      code: "plan_limit",
      message: "Límite de canales conectados de tu plan alcanzado (1).",
    };
    state.creds = null; // sin credenciales = canal nuevo
    const { PUT } = await import("@/app/api/settings/whatsapp/route");
    const { testConnection } = await import("@/server/whatsapp/connect");
    vi.mocked(testConnection).mockClear();

    const res = await PUT(
      new Request("http://t/api/settings/whatsapp", {
        method: "PUT",
        body: JSON.stringify({
          wabaId: "waba_1",
          phoneNumberId: "pn_1",
          token: "tok_1",
        }),
      })
    );
    respuestaDeTope(res);
    expect((await res.json()).error.code).toBe("plan_limit");
    expect(testConnection).not.toHaveBeenCalled();
  });

  it("el canal YA conectado re-guarda credenciales sin tropezar con el tope", async () => {
    state.guard = {
      ok: false,
      code: "plan_limit",
      message: "Límite de canales conectados de tu plan alcanzado (1).",
    };
    state.creds = { token: "viejo" }; // ya tenía: re-guardar no es conectar
    const { PUT } = await import("@/app/api/settings/whatsapp/route");
    const { testConnection } = await import("@/server/whatsapp/connect");
    vi.mocked(testConnection).mockClear();

    const res = await PUT(
      new Request("http://t/api/settings/whatsapp", {
        method: "PUT",
        body: JSON.stringify({
          wabaId: "waba_1",
          phoneNumberId: "pn_1",
          token: "tok_2",
        }),
      })
    );
    expect(res.status).not.toBe(409);
    expect(testConnection).toHaveBeenCalledTimes(1);
    state.creds = null;
  });
});

// ————— Webhook: la conversación entra y nace bloqueada —————

describe("getOrCreateConversation — por webhook nada se rechaza", () => {
  it("org sobre cuota → la conversación ENTRA y nace con plan_blocked", async () => {
    state.naceBloqueada = true;
    state.filaInsert = { id: "cv_1", isTest: false, planBlocked: false };
    const { getOrCreateConversation } = await import("@/server/inbox/ingest");
    const conv = await getOrCreateConversation("org_a", "ct_1");
    expect(conv.id).toBe("cv_1");
    expect(conv.planBlocked).toBe(true);
    expect(state.llamadas).toContain("insert");
    expect(state.llamadas).toContain("update");
  });

  it("con margen → entra desbloqueada y no se toca nada más", async () => {
    state.naceBloqueada = false;
    state.filaInsert = { id: "cv_2", isTest: false, planBlocked: false };
    const { getOrCreateConversation } = await import("@/server/inbox/ingest");
    const conv = await getOrCreateConversation("org_a", "ct_1");
    expect(conv.planBlocked).toBe(false);
    expect(state.llamadas).not.toContain("update");
  });

  it("conversación de pruebas (Laboratorio) → JAMÁS se bloquea", async () => {
    state.naceBloqueada = true;
    state.filaInsert = { id: "cv_run", isTest: true, planBlocked: false };
    const { getOrCreateConversation } = await import("@/server/inbox/ingest");
    const conv = await getOrCreateConversation("org_a", "ct_1");
    expect(conv.planBlocked).toBe(false);
    expect(state.llamadas).not.toContain("update");
  });
});

// ————— Envío: ni IA ni persona responden en una conversación bloqueada —————

describe("sendText — pre-vuelo del plan", () => {
  /** Conversación real bloqueada (WhatsApp, sin pruebas). */
  const filaBloqueada = () => [
    {
      conversation: {
        id: "cv_1",
        organizationId: "org_a",
        channel: "whatsapp",
        isTest: false,
        planBlocked: true,
        lastInboundAt: new Date(),
        lastMessageAt: null,
        handoffAt: null,
        aiEnabled: true,
      },
      contact: { id: "ct_1", waIdentity: "5215511111111", phone: "5215511111111" },
    },
  ];

  it("sobre el tope → SendError plan_limit y NO llama a Graph", async () => {
    state.veredicto = "block";
    state.cola = [filaBloqueada()];
    const { sendText } = await import("@/server/inbox/send");
    await expect(
      sendText({ conversationId: "cv_1", organizationId: "org_a", text: "hola" })
    ).rejects.toMatchObject({ code: "plan_limit" });
    // Ningún insert de mensaje: el envío ni se intenta.
    expect(state.llamadas).not.toContain("insert");
  });

  it("volvió dentro de límites → se limpia el flag (desbloqueo perezoso) y sigue", async () => {
    state.veredicto = "send_and_release";
    state.cola = [filaBloqueada()];
    const { sendText } = await import("@/server/inbox/send");
    await expect(
      sendText({ conversationId: "cv_1", organizationId: "org_a", text: "hola" })
    ).rejects.toMatchObject({ code: "not_connected" });

    // El único update de la secuencia es el que baja `plan_blocked`.
    expect(state.llamadas).toContain("update");
    const update = state.llamadas.filter((m) => m === "update");
    expect(update).toHaveLength(1);
  });

  it("sin bloqueo → el veredicto ni se consulta (0 consultas de plan)", async () => {
    state.veredicto = "block"; // si se preguntara, bloquearía: no debe preguntar
    state.cola = [
      [
        {
          conversation: {
            id: "cv_1",
            organizationId: "org_a",
            channel: "whatsapp",
            isTest: false,
            planBlocked: false,
            lastInboundAt: new Date(),
          },
          contact: { id: "ct_1", waIdentity: "5215511111111" },
        },
      ],
    ];
    const { currentSendVerdict } = await import("@/server/plans/guards");
    const { sendText } = await import("@/server/inbox/send");
    await expect(
      sendText({ conversationId: "cv_1", organizationId: "org_a", text: "hola" })
    ).rejects.toMatchObject({ code: "not_connected" });
    expect(currentSendVerdict).not.toHaveBeenCalled();
    vi.mocked(currentSendVerdict).mockClear();
  });
});

// ————— Turno de IA: sin tokens para un chat que no puede responder —————

describe("maybeRunAgentTurn — conversación bloqueada", () => {
  it("plan_blocked → no agenda turno NI despacha al cerebro", async () => {
    state.cola = [[{ planBlocked: true }]];
    const { maybeRunAgentTurn } = await import("@/server/ai/trigger");
    const { scheduleAgentTurn } = await import("@/server/ai/pipeline");
    const { despacharAlCerebro } = await import("@/server/dispatch/encolar");
    vi.mocked(scheduleAgentTurn).mockClear();
    vi.mocked(despacharAlCerebro).mockClear();

    await maybeRunAgentTurn("cv_1", "org_a", "msg_1");

    expect(scheduleAgentTurn).not.toHaveBeenCalled();
    expect(despacharAlCerebro).not.toHaveBeenCalled();
  });
});
