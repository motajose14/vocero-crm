import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  role: "owner",
  organizationId: "org_customer_a",
  selects: [] as unknown[][],
  queries: [] as { method: string; args: unknown[] }[],
  usage: {
    contacts: 7,
    members: 2,
    channels: 1,
    conversationsThisMonth: 12,
  },
}));

vi.mock("@/lib/auth/session", () => ({
  UnauthorizedError: class UnauthorizedError extends Error {},
  requireSession: async () => ({
    userId: "user_1",
    organizationId: state.organizationId,
    role: state.role,
  }),
}));

vi.mock("drizzle-orm", () => ({
  eq: (column: unknown, value: unknown) => ({ column, value }),
}));

vi.mock("@/lib/db", () => {
  const schema = new Proxy({}, { get: (_target, table) => new Proxy({}, {
    get: (_table, column) => `${String(table)}.${String(column)}`,
  }) });
  const db = {
    select: (selection: unknown) => {
      state.queries.push({ method: "select", args: [selection] });
      return builder();
    },
  };
  const builder = () => {
    const chain: Record<string, unknown> = {};
    for (const method of ["from", "where"]) {
      chain[method] = (...args: unknown[]) => {
        state.queries.push({ method, args });
        return chain;
      };
    }
    chain.limit = (...args: unknown[]) => {
      state.queries.push({ method: "limit", args });
      return Promise.resolve(state.selects.shift() ?? []);
    };
    return chain;
  };
  return { getDb: () => db, schema };
});

vi.mock("@/server/plans/usage", () => ({
  orgUsage: vi.fn(async (_db: unknown, organizationId: string) => {
    state.queries.push({ method: "orgUsage", args: [organizationId] });
    return state.usage;
  }),
}));

import { GET } from "@/app/api/plan-uso/route";
import { orgUsage } from "@/server/plans/usage";

describe("GET /api/plan-uso", () => {
  beforeEach(() => {
    state.role = "owner";
    state.organizationId = "org_customer_a";
    state.queries = [];
    state.selects = [
      [{ planId: "plan_growth" }],
      [{
        id: "plan_growth",
        name: "Crecimiento",
        isFree: false,
        priceCents: 4900,
        active: true,
        maxContacts: 100,
        maxMembers: 5,
        maxChannels: 3,
        maxConversationsMonth: 1000,
      }],
    ];
    vi.mocked(orgUsage).mockClear();
  });

  it("permite owner y admin, devuelve su plan, uso y límites de su tenant", async () => {
    for (const role of ["owner", "admin"]) {
      state.role = role;
      state.queries = [];
      state.selects = [
        [{ planId: "plan_growth" }],
        [{
          id: "plan_growth",
          name: "Crecimiento",
          isFree: false,
          priceCents: 4900,
          active: true,
          maxContacts: 100,
          maxMembers: 5,
          maxChannels: 3,
          maxConversationsMonth: 1000,
        }],
      ];

      const response = await GET();
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        plan: {
          id: "plan_growth",
          name: "Crecimiento",
          isFree: false,
          priceCents: 4900,
          active: true,
          limits: {
            maxContacts: 100,
            maxMembers: 5,
            maxChannels: 3,
            maxConversationsMonth: 1000,
          },
        },
        usage: state.usage,
      });
      expect(state.queries).toContainEqual({
        method: "where",
        args: [{ column: "organization.id", value: "org_customer_a" }],
      });
      expect(orgUsage).toHaveBeenLastCalledWith(expect.anything(), "org_customer_a");
    }
  });

  it("representa fielmente una organización sin plan asignado", async () => {
    state.selects = [[{ planId: null }]];

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ plan: null, usage: state.usage });
    expect(orgUsage).toHaveBeenCalledWith(expect.anything(), "org_customer_a");
  });

  it("deniega miembros antes de leer plan o uso", async () => {
    state.role = "member";

    const response = await GET();

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        code: "forbidden",
        message: "Solo el propietario o administrador puede consultar el plan y el uso. Pedile a uno de ellos que lo revise.",
      },
    });
    expect(state.queries).toEqual([]);
    expect(orgUsage).not.toHaveBeenCalled();
  });
});
