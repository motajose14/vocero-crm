import { describe, expect, it, vi } from "vitest";

const credentials = vi.hoisted(() => new Map<string, string | null>());
vi.mock("@/server/whatsapp/credentials", () => ({
  getAppSecretByPhoneNumberId: async (id: string) => credentials.get(id) ?? null,
}));

import { appSecretForPayload } from "@/server/whatsapp/webhook-secret";

function payload(...ids: string[]) {
  return JSON.stringify({
    entry: ids.map((id) => ({
      changes: [{ value: { metadata: { phone_number_id: id } } }],
    })),
  });
}

describe("secreto de firma del webhook WhatsApp", () => {
  it("usa el App Secret guardado para el número y no requiere el secreto global", async () => {
    credentials.set("pn-1", "secret-1");
    expect(await appSecretForPayload(payload("pn-1"), undefined)).toBe("secret-1");
  });

  it("permite payloads con varios números que usan el mismo secreto de app", async () => {
    credentials.set("pn-1", "shared-secret");
    credentials.set("pn-2", "shared-secret");
    expect(await appSecretForPayload(payload("pn-1", "pn-2"), undefined)).toBe("shared-secret");
  });

  it("rechaza payloads con números de organizaciones que usan secretos distintos", async () => {
    credentials.set("pn-1", "secret-1");
    credentials.set("pn-2", "secret-2");
    expect(await appSecretForPayload(payload("pn-1", "pn-2"), undefined)).toBeNull();
  });

  it("mantiene el secreto global como respaldo para credenciales antiguas y eventos sin número", async () => {
    credentials.set("pn-legacy", null);
    expect(await appSecretForPayload(payload("pn-legacy"), "legacy-secret")).toBe("legacy-secret");
    expect(await appSecretForPayload(JSON.stringify({ object: "whatsapp_business_account" }), "legacy-secret"))
      .toBe("legacy-secret");
  });

  it("rechaza mezclar un App Secret guardado con otro secreto legacy", async () => {
    credentials.set("pn-1", "secret-1");
    credentials.set("pn-legacy", null);
    expect(
      await appSecretForPayload(payload("pn-1", "pn-legacy"), "legacy-secret")
    ).toBeNull();
  });

  it("falla cerrado si no hay secreto por número ni respaldo global", async () => {
    credentials.delete("pn-missing");
    expect(await appSecretForPayload(payload("pn-missing"), undefined)).toBeNull();
  });
});
