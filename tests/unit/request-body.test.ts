import { describe, expect, it } from "vitest";
import {
  RequestBodyTooLargeError,
  readRequestBodyLimited,
  readStreamLimited,
} from "@/lib/request-body";

describe("readRequestBodyLimited", () => {
  it("accepts a body exactly at the limit", async () => {
    const request = new Request("https://example.test", { method: "POST", body: "1234" });
    await expect(readRequestBodyLimited(request, 4)).resolves.toEqual(
      new TextEncoder().encode("1234")
    );
  });

  it("rejects a body over the limit even when Content-Length is absent", async () => {
    const request = new Request("https://example.test", {
      method: "POST",
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.enqueue(new Uint8Array([4, 5, 6]));
          controller.close();
        },
      }),
      // Required by Node when constructing a streaming Request.
      duplex: "half",
    } as RequestInit);

    await expect(readRequestBodyLimited(request, 5)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError
    );
  });

  it("rejects an oversized response stream while reading it", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.enqueue(new Uint8Array([4, 5, 6]));
        controller.close();
      },
    });

    await expect(readStreamLimited(stream, 5)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError
    );
  });

  it("rejects a declared oversized body before reading it", async () => {
    const request = new Request("https://example.test", {
      method: "POST",
      headers: { "content-length": "6" },
      body: "123456",
    });

    await expect(readRequestBodyLimited(request, 5)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError
    );
  });
});
