import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { graphRequest } = vi.hoisted(() => ({ graphRequest: vi.fn() }));

vi.mock("@/lib/meta/client", () => ({ graphRequest }));

import {
  downloadGraphMedia,
  MediaFetchError,
} from "@/server/whatsapp/media";

describe("downloadGraphMedia size limits", () => {
  beforeEach(() => {
    graphRequest.mockReset();
    graphRequest.mockResolvedValue({ url: "https://media.example/file" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects an oversized response stream before buffering it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new Uint8Array([1, 2, 3]));
              controller.enqueue(new Uint8Array([4, 5, 6]));
              controller.close();
            },
          })
        )
      )
    );

    await expect(downloadGraphMedia("token", "wa_media", 5)).rejects.toMatchObject({
      name: "MediaFetchError",
      message: "El adjunto excede el límite de tamaño",
      gone: true,
    });
  });

  it("returns an in-limit response as a Buffer", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("data")));

    await expect(downloadGraphMedia("token", "wa_media", 4)).resolves.toMatchObject({
      data: Buffer.from("data"),
      fileSize: 4,
    });
  });

  it("rejects an oversized Content-Length before reading the response", async () => {
    const cancel = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream<Uint8Array>({
            cancel,
          }),
          { headers: { "content-length": "6" } }
        )
      )
    );

    await expect(downloadGraphMedia("token", "wa_media", 5)).rejects.toBeInstanceOf(
      MediaFetchError
    );
    expect(cancel).not.toHaveBeenCalled();
  });
});
