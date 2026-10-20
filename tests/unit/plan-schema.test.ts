import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { newId } from "@/lib/db/ids";

/**
 * 031 — Superadmin SaaS: el esquema necesita su superficie de planes y
 * límites. Aquí se fija la forma (columnas SQL) antes de que exista la
 * migración; la lógica de límites vive en src/server/plans y sus pruebas.
 */

type AnyPgTable = Parameters<typeof getTableConfig>[0];

function columnNames(table: AnyPgTable): string[] {
  return getTableConfig(table).columns.map((c) => c.name);
}

describe("esquema de planes y límites (031)", () => {
  it("existe la tabla plan con sus cuatro límites", () => {
    expect(schema.plan).toBeDefined();
    const names = columnNames(schema.plan);
    expect(names).toEqual(
      expect.arrayContaining([
        "id",
        "name",
        "slug",
        "is_free",
        "price_cents",
        "max_contacts",
        "max_members",
        "max_channels",
        "max_conversations_month",
        "active",
        "created_at",
      ])
    );
  });

  it("organization.planId existe y es anulable (NULL = sin límites)", () => {
    const names = columnNames(schema.organization);
    expect(names).toContain("plan_id");
  });

  it("user.isSuperadmin existe (flag de plataforma fuera de toda org)", () => {
    const names = columnNames(schema.user);
    expect(names).toContain("is_superadmin");
  });

  it("conversation.planBlocked existe con default false", () => {
    const names = columnNames(schema.conversation);
    expect(names).toContain("plan_blocked");
    const col = getTableConfig(schema.conversation).columns.find(
      (c) => c.name === "plan_blocked"
    );
    expect(col).toBeDefined();
    // default en el cliente de drizzle: false
    expect(String(col?.default)).toContain("false");
  });

  it("newId(\"plan\") usa el prefijo pl_", () => {
    expect(newId("plan")).toMatch(/^pl_[0-9a-z]{20}$/);
  });
});
