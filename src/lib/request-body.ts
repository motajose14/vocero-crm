export const MAX_WEBHOOK_BODY_BYTES = 5 * 1024 * 1024;

/** Raised when a streamed request body exceeds its configured byte limit. */
export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request body exceeds the configured size limit");
    this.name = "RequestBodyTooLargeError";
  }
}

/**
 * Read a request body without ever retaining more than `maxBytes` of chunks.
 * Content-Length is an early-rejection hint only; streamed bytes are counted
 * independently because the header may be missing or inaccurate.
 */
export async function readRequestBodyLimited(
  request: Request,
  maxBytes: number
): Promise<Uint8Array<ArrayBuffer>> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {
    throw new RequestBodyTooLargeError();
  }
  return readStreamLimited(request.body, maxBytes);
}

/** Read a response/request stream without retaining more than `maxBytes`. */
export async function readStreamLimited(
  stream: ReadableStream<Uint8Array> | null,
  maxBytes: number
): Promise<Uint8Array<ArrayBuffer>> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError("maxBytes must be a non-negative safe integer");
  }
  if (!stream) return new Uint8Array();

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new RequestBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}
