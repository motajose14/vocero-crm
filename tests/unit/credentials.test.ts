import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * FR-040/FR-080s: el token se guarda cifrado (jamás texto plano en la fila)
 * y a la UI solo viajan los últimos 4 caracteres.
 */

const insertedRows: Record<string, unknown>[] = [];
const conflictUpdates: Record<string, unknown>[] = [];
const selectedRows: Record<string, unknown>[] = [];

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => selectedRows }),
      }),
    }),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        insertedRows.push(v);
        return {
          onConflictDoUpdate: (value: { set: Record<string, unknown> }) => {
            conflictUpdates.push(value.set);
            return Promise.resolve();
          },
        };
      },
    }),
  }),
  schema: {
    metaCredentials: {
      organizationId: "organization_id",
      phoneNumberId: "phone_number_id",
      appSecretCipher: "app_secret_cipher",
      appSecretIv: "app_secret_iv",
      appSecretTag: "app_secret_tag",
    },
  },
}));

beforeEach(() => {
  insertedRows.length = 0;
  conflictUpdates.length = 0;
  selectedRows.length = 0;
});

beforeAll(() => {
  process.env.APP_BASE_URL = "http://localhost:3000";
  process.env.DATABASE_URL = "postgresql://t:t@localhost:5432/t";
  process.env.BETTER_AUTH_SECRET = "secret-de-test-suficiente";
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  process.env.META_WEBHOOK_VERIFY_TOKEN = "verify-test";
});

describe("credenciales de WhatsApp", () => {
  it("cifra el token y el App Secret: la fila no contiene ninguno en texto plano", async () => {
    const { saveCredentials } = await import("@/server/whatsapp/credentials");
    const token = "EAAG-token-super-secreto-abcd";
    const appSecret = "app-secret-super-secreto";
    await saveCredentials({
      organizationId: "org_1",
      wabaId: "waba1",
      phoneNumberId: "pn1",
      token,
      appSecret,
    });
    const row = insertedRows[0]!;
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain(appSecret);
    expect(row.tokenCipher).toBeTruthy();
    expect(row.tokenIv).toBeTruthy();
    expect(row.tokenTag).toBeTruthy();
    expect(row.appSecretCipher).toBeTruthy();
    expect(row.appSecretIv).toBeTruthy();
    expect(row.appSecretTag).toBeTruthy();

    // El cifrado es reversible con la clave de la instancia.
    const { decryptSecret } = await import("@/lib/crypto");
    expect(
      decryptSecret({
        cipher: row.tokenCipher as string,
        iv: row.tokenIv as string,
        tag: row.tokenTag as string,
      })
    ).toBe(token);
    expect(
      decryptSecret({
        cipher: row.appSecretCipher as string,
        iv: row.appSecretIv as string,
        tag: row.appSecretTag as string,
      })
    ).toBe(appSecret);
    selectedRows.push({
      cipher: row.appSecretCipher,
      iv: row.appSecretIv,
      tag: row.appSecretTag,
    });
    const { getAppSecretByPhoneNumberId } = await import("@/server/whatsapp/credentials");
    await expect(getAppSecretByPhoneNumberId("pn1")).resolves.toBe(appSecret);
  });

  it("al actualizar sin App Secret conserva las columnas cifradas existentes", async () => {
    const { saveCredentials } = await import("@/server/whatsapp/credentials");
    await saveCredentials({
      organizationId: "org_1",
      wabaId: "waba1",
      phoneNumberId: "pn1",
      token: "token-nuevo",
    });
    expect(conflictUpdates).toHaveLength(1);
    expect(conflictUpdates[0]).not.toHaveProperty("appSecretCipher");
    expect(conflictUpdates[0]).not.toHaveProperty("appSecretIv");
    expect(conflictUpdates[0]).not.toHaveProperty("appSecretTag");
  });

  it("tokenLast4 expone solo los últimos 4 caracteres", async () => {
    const { tokenLast4 } = await import("@/server/whatsapp/credentials");
    expect(tokenLast4("EAAG-token-super-secreto-abcd")).toBe("abcd");
  });
});
