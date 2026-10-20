import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 031 — Registro multi-tenant (S4): CADA registro público crea SU propia
 * organización (con pipeline, perfil del agente y plan Free asignado); el
 * bypass interno de invitación de equipo (runInternalSignup) NO crea
 * organización. Antes solo existía una organización por instancia y el
 * registro posterior quedaba huérfano (sin org ni plan).
 */

type Insert = { table: string; values: Record<string, unknown> };

let inserts: Insert[] = [];

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    transaction: (cb: (tx: unknown) => Promise<void>) =>
      cb({
        execute: () => Promise.resolve(),
        insert: (table: { __t: string }) => ({
          values: (v: Record<string, unknown> | Record<string, unknown>[]) => {
            const lista = Array.isArray(v) ? v : [v];
            for (const values of lista) inserts.push({ table: table.__t, values });
            return Promise.resolve();
          },
        }),
      }),
  }),
  schema: {
    organization: { __t: "organization" },
    member: { __t: "member" },
    pipelineStage: { __t: "pipelineStage" },
    agentProfile: { __t: "agentProfile" },
  },
}));

vi.mock("@/server/plans/free", () => ({
  ensureFreePlan: vi.fn(async () => "pl_free_test"),
}));

import { onUserCreated } from "@/server/auth/on-signup";

function cuenta(tabla: string): Insert[] {
  return inserts.filter((i) => i.table === tabla);
}

/** Primera fila esperada (los tests afirman el largo antes; noUncheckedIndexedAccess). */
function primero(lista: Insert[]): Insert {
  const fila = lista[0];
  if (!fila) throw new Error("se esperaba al menos una inserción");
  return fila;
}

beforeEach(() => {
  inserts = [];
});

describe("onUserCreated — una organización por registro público (031)", () => {
  it("registro público con organizaciones ya existentes → crea LA SUYA con plan Free", async () => {
    await onUserCreated("usr_1", "Ana Pérez");

    const orgs = cuenta("organization");
    expect(orgs).toHaveLength(1);
    const org = primero(orgs);
    expect(org.values.planId).toBe("pl_free_test");
    expect(org.values.name).toBe("Negocio de Ana Pérez");
    expect(String(org.values.slug)).toMatch(/^negocio-de-ana/);
  });

  it("deja al usuario como dueño, siembra las 5 etapas y el perfil del agente", async () => {
    await onUserCreated("usr_1", "Ana");

    const miembros = cuenta("member");
    expect(miembros).toHaveLength(1);
    expect(primero(miembros).values).toMatchObject({
      userId: "usr_1",
      role: "owner",
    });
    expect(cuenta("pipelineStage")).toHaveLength(5);
    expect(cuenta("agentProfile")).toHaveLength(1);
  });

  it("registro público con nombre vacío → nombre y slug de reserva", async () => {
    await onUserCreated("usr_2", "");
    const org = primero(cuenta("organization"));
    expect(org.values.name).toBe("Mi negocio");
    expect(String(org.values.slug)).toMatch(/^mi-negocio-/);
  });

  it("dos registros públicos → dos slugs distintos (unicidad por construcción)", async () => {
    await onUserCreated("usr_a", "Ana");
    await onUserCreated("usr_b", "Ana");
    const [a, b] = cuenta("organization").map((i) => i.values.slug);
    expect(a).not.toBe(b);
  });

  it("alta interna (invitación de equipo) → NO crea organización", async () => {
    await onUserCreated("usr_inv", "Colaborador", { internal: true });
    expect(cuenta("organization")).toHaveLength(0);
    expect(cuenta("member")).toHaveLength(0);
    expect(cuenta("pipelineStage")).toHaveLength(0);
    expect(cuenta("agentProfile")).toHaveLength(0);
  });
});
