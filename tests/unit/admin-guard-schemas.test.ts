import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 031 — Superadmin: la guarda `withAdmin` (sesión + flag de plataforma) y los
 * esquemas Zod de /api/admin/*. Los ruteadores se prueban en sus propios
 * archivos; aquí está la puerta y el contrato del body.
 */

const state = vi.hoisted(() => ({
  superadmin: true,
  unauthenticated: false,
  llamado: 0,
}));

vi.mock("@/lib/auth/session", () => {
  // Refleja producción: sin sesión, `requireSession` lanza UnauthorizedError
  // (así el 401 sale del mismo camino que en vivo, no de un error genérico).
  class UnauthorizedError extends Error {}
  return {
    UnauthorizedError,
    requireSession: async () => {
      if (state.unauthenticated) throw new UnauthorizedError("sin sesión");
      return { userId: "usr_1", organizationId: "org_a", role: "owner" };
    },
  };
});

vi.mock("@/lib/auth/superadmin", () => ({
  esSuperadmin: async () => state.superadmin,
}));

import { withAdmin, parseBody } from "@/lib/api";
import {
  planCreateSchema,
  planUpdateSchema,
  orgCreateSchema,
  orgAssignPlanSchema,
} from "@/server/plans/schemas";

beforeEach(() => {
  state.superadmin = true;
  state.unauthenticated = false;
  state.llamado = 0;
});

const handler = withAdmin(async () => {
  state.llamado += 1;
  return Response.json({ ok: true });
});

describe("withAdmin — la puerta de /api/admin", () => {
  it("superadmin → pasa y ejecuta el handler", async () => {
    const res = await handler();
    expect(res.status).toBe(200);
    expect(state.llamado).toBe(1);
  });

  it("usuario normal (sin flag) → 403 y el handler jamás corre", async () => {
    state.superadmin = false;
    const res = await handler();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("forbidden");
    expect(state.llamado).toBe(0);
  });

  it("sin sesión → el 401 de withAuth, sin tocar el flag", async () => {
    state.unauthenticated = true;
    const res = await handler();
    expect(res.status).toBe(401);
    expect(state.llamado).toBe(0);
  });
});

describe("esquemas de /api/admin/plans", () => {
  it("crear plan válido con los 4 límites y sin límite como null", () => {
    const parsed = planCreateSchema.safeParse({
      name: "Pro",
      isFree: false,
      priceCents: 1900,
      maxContacts: 5000,
      maxMembers: null,
      maxChannels: 4,
      maxConversationsMonth: 500,
    });
    expect(parsed.success).toBe(true);
  });

  it("crear plan: name obligatorio y límites no negativos ni fraccionarios", () => {
    expect(planCreateSchema.safeParse({ name: "" }).success).toBe(false);
    expect(
      planCreateSchema.safeParse({ name: "Pro", maxContacts: -1 }).success
    ).toBe(false);
    expect(
      planCreateSchema.safeParse({ name: "Pro", maxMembers: 2.5 }).success
    ).toBe(false);
    expect(
      planCreateSchema.safeParse({ name: "Pro", priceCents: -10 }).success
    ).toBe(false);
  });

  it("editar plan: todo opcional pero coherente (parcial real)", () => {
    expect(planUpdateSchema.safeParse({}).success).toBe(true);
    expect(planUpdateSchema.safeParse({ name: "Pro 2" }).success).toBe(true);
    expect(planUpdateSchema.safeParse({ maxChannels: null }).success).toBe(true);
    expect(planUpdateSchema.safeParse({ maxChannels: "x" }).success).toBe(false);
  });
});

describe("esquemas de /api/admin/organizations", () => {
  it("crear cliente: nombre, dueño y correo válidos; plan opcional", () => {
    expect(
      orgCreateSchema.safeParse({
        name: "Ferretería El Martillo",
        ownerName: "Ana Pérez",
        ownerEmail: "ana@martillo.mx",
      }).success
    ).toBe(true);
    expect(
      orgCreateSchema.safeParse({
        name: "Ferretería",
        ownerName: "Ana",
        ownerEmail: "no-es-correo",
      }).success
    ).toBe(false);
  });

  it("asignar plan: string o null (null = sin límites), nada más", () => {
    expect(orgAssignPlanSchema.safeParse({ planId: "pl_1" }).success).toBe(true);
    expect(orgAssignPlanSchema.safeParse({ planId: null }).success).toBe(true);
    expect(orgAssignPlanSchema.safeParse({}).success).toBe(false);
    expect(orgAssignPlanSchema.safeParse({ planId: 7 }).success).toBe(false);
  });
});

describe("parseBody sobre los esquemas admin", () => {
  it("body inválido → 422 con detalle", async () => {
    const req = new Request("http://test", {
      method: "POST",
      body: JSON.stringify({ name: "" }),
    });
    const body = await parseBody(req, planCreateSchema);
    expect(body.ok).toBe(false);
    if (!body.ok) expect(body.response.status).toBe(422);
  });
});
