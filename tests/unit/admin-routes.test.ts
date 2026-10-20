import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 031 — Rutas `/api/admin/*`: el CRUD de planes y de clientes con la guarda
 * `withAdmin` por delante. La BD es un recorder thenable: cada consulta saca
 * su respuesta de una cola, así se afirma el COMPORTAMIENTO observable (409s,
 * parcial real, contraseña única) sin levantar Postgres.
 */

type Llamada = { metodo: string; args: unknown[] };

const state = vi.hoisted(() => ({
  superadmin: true,
  llamadas: [] as Llamada[],
  /** Respuestas en orden de consulta; vacío → `fallback`. */
  cola: [] as unknown[][],
  fallback: [] as unknown[],
  /** Qué devuelve cada módulo server que la ruta delega. */
  freeId: "pl_free",
  creado: null as unknown,
  errorAlta: null as Error | null,
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

vi.mock("@/lib/auth/superadmin", () => ({
  esSuperadmin: async () => state.superadmin,
}));

vi.mock("@/lib/db", () => {
  const registrar = (metodo: string) => (...args: unknown[]) => {
    state.llamadas.push({ metodo, args });
    return builder();
  };
  const builder = () => {
    const b: Record<string, unknown> = {};
    for (const m of [
      "select",
      "from",
      "leftJoin",
      "innerJoin",
      "where",
      "orderBy",
      "groupBy",
      "set",
      "insert",
      "update",
      "delete",
    ]) {
      b[m] = registrar(m);
    }
    const sacar = () => state.cola.shift() ?? state.fallback;
    // `insert().values()` no devuelve filas: no consume la cola de respuestas,
    // que representa SÓLO las consultas que sí leen.
    b.values = (...args: unknown[]) => {
      state.llamadas.push({ metodo: "values", args });
      return Promise.resolve();
    };
    b.limit = () => {
      state.llamadas.push({ metodo: "limit", args: [] });
      return Promise.resolve(sacar());
    };
    // Thenable: `await builder()` resuelve la siguiente respuesta de la cola.
    b.then = (
      onFulfilled: (v: unknown) => unknown,
      onRejected: (e: unknown) => unknown
    ) => Promise.resolve(sacar()).then(onFulfilled, onRejected);
    return b;
  };
  return {
    getDb: () => builder(),
    schema: new Proxy({}, { get: (_t, prop) => ({ __t: String(prop) }) }),
  };
});

vi.mock("@/server/plans/free", () => ({
  ensureFreePlan: vi.fn(async () => state.freeId),
}));

vi.mock("@/server/plans/usage", () => ({
  usageByOrg: vi.fn(async () => ({
    org_a: {
      contacts: 7,
      members: 2,
      channels: 1,
      conversationsThisMonth: 12,
    },
  })),
  orgUsage: vi.fn(async () => ({
    contacts: 7,
    members: 2,
    channels: 1,
    conversationsThisMonth: 12,
  })),
}));

vi.mock("@/server/plans/clientes", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/plans/clientes")>();
  return {
    ...original,
    crearCliente: vi.fn(async () => {
      if (state.errorAlta) throw state.errorAlta;
      return {
        organization: { id: "org_nueva", name: "Ferretería El Martillo" },
        owner: { name: "Ana Pérez", email: "ana@martillo.mx" },
        password: "abc123def456gh78",
      };
    }),
  };
});

import { GET as plansGET, POST as plansPOST } from "@/app/api/admin/plans/route";
import {
  DELETE as planDELETE,
  PATCH as planPATCH,
} from "@/app/api/admin/plans/[planId]/route";
import {
  GET as orgsGET,
  POST as orgsPOST,
} from "@/app/api/admin/organizations/route";
import {
  GET as orgGET,
  PATCH as orgPATCH,
} from "@/app/api/admin/organizations/[orgId]/route";
import { ensureFreePlan } from "@/server/plans/free";
import { AltaClienteError } from "@/server/plans/clientes";

const ctx = <T extends Record<string, string>>(params: T) => ({
  params: Promise.resolve(params),
});

const peticion = (body: unknown) =>
  new Request("http://test/api/admin", {
    method: "POST",
    body: JSON.stringify(body),
  });

const PLAN = {
  id: "pl_1",
  name: "Pro",
  slug: "pro",
  isFree: false,
  priceCents: 1900,
  maxContacts: 5000,
  maxMembers: null,
  maxChannels: 4,
  maxConversationsMonth: 500,
  active: true,
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

beforeEach(() => {
  state.superadmin = true;
  state.llamadas = [];
  state.cola = [];
  state.fallback = [];
  state.freeId = "pl_free";
  state.creado = null;
  state.errorAlta = null;
  vi.mocked(ensureFreePlan).mockClear();
});

describe("GET/POST /api/admin/plans", () => {
  it("lista: asegura el Free antes de responder y devuelve los cuatro límites", async () => {
    state.cola = [[PLAN]];
    const res = await plansGET();
    expect(res.status).toBe(200);
    expect(vi.mocked(ensureFreePlan)).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.plans).toHaveLength(1);
    expect(body.plans[0].maxConversationsMonth).toBe(500);
  });

  it("crear con slug ya usado → 409 y NO inserta", async () => {
    // 1ª consulta (¿slug duplicado?) → existe; no debe llegar el insert.
    state.cola = [[{ id: "pl_otro" }]];
    const res = await plansPOST(peticion({ name: "Pro" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("duplicate");
    expect(state.llamadas.some((l) => l.metodo === "insert")).toBe(false);
  });

  it("crear válido → 201 con el plan, slug derivado del nombre", async () => {
    // 1ª: sin duplicado; 2ª: el plan recién insertado.
    state.cola = [[], [PLAN]];
    const res = await plansPOST(
      peticion({
        name: "Pro",
        maxContacts: 5000,
        maxMembers: null,
        maxChannels: 4,
        maxConversationsMonth: 500,
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.plan.slug).toBe("pro");
    const insert = state.llamadas.find((l) => l.metodo === "values");
    expect(insert).toBeDefined();
    // `maxMembers: null` = sin límite, no 0: se guarda tal cual.
    const valores = insert?.args[0] as Record<string, unknown>;
    expect(valores.maxMembers).toBeNull();
    expect(valores.maxContacts).toBe(5000);
  });

  it("body inválido → 422 sin tocar la BD", async () => {
    const res = await plansPOST(peticion({ name: "" }));
    expect(res.status).toBe(422);
    expect(state.llamadas).toHaveLength(0);
  });
});

describe("PATCH/DELETE /api/admin/plans/[planId]", () => {
  it("edición parcial: solo cambia lo que vino en el body", async () => {
    // 1ª: lee el plan; 2ª: lo relee tras el update.
    state.cola = [[PLAN], [{ ...PLAN, name: "Pro 2" }]];
    const res = await planPATCH(peticion({ name: "Pro 2" }), ctx({ planId: "pl_1" }));
    expect(res.status).toBe(200);
    const update = state.llamadas.find((l) => l.metodo === "set");
    expect(update).toBeDefined();
    const campos = update?.args[0] as Record<string, unknown>;
    expect(campos.name).toBe("Pro 2");
    expect("maxContacts" in campos).toBe(false);
    expect("active" in campos).toBe(false);
  });

  it("plan inexistente → 404", async () => {
    state.cola = [[]];
    const res = await planPATCH(peticion({ name: "X" }), ctx({ planId: "pl_404" }));
    expect(res.status).toBe(404);
  });

  it("borrar un plan con clientes asignados → 409 plan_in_use y no borra", async () => {
    // 1ª: lee el plan; 2ª: cuenta clientes.
    state.cola = [[PLAN], [{ n: 3 }]];
    const res = await planDELETE(peticion({}), ctx({ planId: "pl_1" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("plan_in_use");
    expect(body.error.message).toContain("3 cliente");
    expect(state.llamadas.some((l) => l.metodo === "delete")).toBe(false);
  });

  it("borrar un plan sin clientes → 200 y se borra", async () => {
    state.cola = [[PLAN], [{ n: 0 }]];
    const res = await planDELETE(peticion({}), ctx({ planId: "pl_1" }));
    expect(res.status).toBe(200);
    expect(state.llamadas.some((l) => l.metodo === "delete")).toBe(true);
  });
});

describe("GET/POST /api/admin/organizations", () => {
  it("lista con el uso real de cada cliente agrupado", async () => {
    state.cola = [
      [
        {
          id: "org_a",
          name: "Ferretería El Martillo",
          slug: "ferreteria-el-martillo",
          createdAt: new Date("2026-01-01T00:00:00Z"),
          planId: "pl_free",
          planName: "Free",
          planIsFree: true,
          maxContacts: 100,
          maxMembers: 2,
          maxChannels: 1,
          maxConversationsMonth: 50,
        },
      ],
      [],
    ];
    const res = await orgsGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.organizations[0].plan.limits.maxContacts).toBe(100);
    expect(body.organizations[0].usage.contacts).toBe(7);
    expect(body.organizations[0].usage.conversationsThisMonth).toBe(12);
  });

  it("alta de cliente → 201 con la contraseña devuelta UNA vez", async () => {
    const res = await orgsPOST(
      peticion({
        name: "Ferretería El Martillo",
        ownerName: "Ana Pérez",
        ownerEmail: "ana@martillo.mx",
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.password).toHaveLength(16);
    expect(body.owner.email).toBe("ana@martillo.mx");
    expect(body.organization.id).toBe("org_nueva");
  });

  it("correo ya registrado → 409 y el error llega tipado", async () => {
    state.errorAlta = new AltaClienteError(
      409,
      "duplicate",
      "Ya existe una cuenta con ese correo"
    );
    const res = await orgsPOST(
      peticion({
        name: "Otra",
        ownerName: "Ana",
        ownerEmail: "ana@martillo.mx",
      })
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("duplicate");
  });
});

describe("GET/PATCH /api/admin/organizations/[orgId]", () => {
  it("detalle con plan, uso y el correo del dueño", async () => {
    state.cola = [
      [
        {
          id: "org_a",
          name: "Ferretería",
          slug: "ferreteria",
          createdAt: new Date("2026-01-01T00:00:00Z"),
          planId: "pl_1",
        },
      ],
      [PLAN],
      [{ role: "member", email: "colaborador@x.mx", name: "Leo" },
       { role: "owner", email: "ana@martillo.mx", name: "Ana Pérez" }],
      [],
    ];
    const res = await orgGET(peticion({}), ctx({ orgId: "org_a" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.owner.email).toBe("ana@martillo.mx");
    expect(body.plan.limits.maxContacts).toBe(5000);
    expect(body.usage.members).toBe(2);
  });

  it("asignar plan null = sin límites, y se escribe tal cual", async () => {
    // 1ª: lee la org; 2ª: relee tras el update.
    state.cola = [[{ id: "org_a", name: "Ferretería", planId: "pl_1" }], []];
    const res = await orgPATCH(peticion({ planId: null }), ctx({ orgId: "org_a" }));
    expect(res.status).toBe(200);
    const update = state.llamadas.find((l) => l.metodo === "set");
    expect((update?.args[0] as Record<string, unknown>).planId).toBeNull();
  });

  it("plan que no existe → 422 y no se escribe nada", async () => {
    state.cola = [[{ id: "org_a", name: "Ferretería", planId: null }], []];
    const res = await orgPATCH(peticion({ planId: "pl_404" }), ctx({ orgId: "org_a" }));
    expect(res.status).toBe(422);
    expect(state.llamadas.some((l) => l.metodo === "set")).toBe(false);
  });

  it("cliente inexistente → 404", async () => {
    state.cola = [[]];
    const res = await orgGET(peticion({}), ctx({ orgId: "org_404" }));
    expect(res.status).toBe(404);
  });
});

describe("la puerta de /api/admin", () => {
  it("sin el flag → 403 y ninguna consulta llega a la BD", async () => {
    state.superadmin = false;
    const res = await plansGET();
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("forbidden");
    expect(state.llamadas).toHaveLength(0);
    expect(vi.mocked(ensureFreePlan)).not.toHaveBeenCalled();
  });
});
