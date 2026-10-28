import { describe, expect, it, vi } from "vitest";
import { copiarTextoAlPortapapeles } from "@/components/admin/clientes-client";

describe("copiar contraseña de cliente", () => {
  it("copia el valor exacto y confirma el éxito", async () => {
    const writeText = vi.fn(async (_text: string) => undefined);

    await expect(
      copiarTextoAlPortapapeles("clave-de-un-solo-uso", { writeText })
    ).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("clave-de-un-solo-uso");
  });

  it("devuelve fallo si el portapapeles no está disponible o rechaza la copia", async () => {
    const writeText = vi.fn(async (_text: string) => {
      throw new Error("permission denied");
    });

    await expect(copiarTextoAlPortapapeles("clave", undefined)).resolves.toBe(false);
    await expect(copiarTextoAlPortapapeles("clave", { writeText })).resolves.toBe(false);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("clave");
  });
});
