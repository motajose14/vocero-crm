import { apiError, withAuth } from "@/lib/api";
import {
  readRequestBodyLimited,
  RequestBodyTooLargeError,
} from "@/lib/request-body";
import { getConversation } from "@/server/inbox/queries";
import { SendError, sendMediaMessage } from "@/server/inbox/send";
import {
  MEDIA_LIMITS,
  MediaValidationError,
  validateOutgoing,
} from "@/server/whatsapp/media";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const MAX_MULTIPART_OVERHEAD_BYTES = 1024 * 1024;
const MAX_MEDIA_UPLOAD_BODY_BYTES =
  MEDIA_LIMITS.document.maxBytes + MAX_MULTIPART_OVERHEAD_BYTES;

const SEND_ERROR_STATUS: Record<SendError["code"], number> = {
  sandbox_violation: 403,
  not_connected: 409,
  reconnect_required: 409,
  window_closed: 409,
  message_limit: 409,
  /** 031: sobre el límite del plan (aditivo al contrato). */
  plan_limit: 409,
  text_too_long: 422,
  meta_error: 422,
  meta_unavailable: 503,
  upload_failed: 502,
};

/**
 * 008 — Envía un adjunto de archivo por la conversación (multipart):
 * `file` (binario, requerido) + `caption` (opcional). La validación de tipo y
 * tamaño ocurre ANTES de tocar Graph (413/415 con el límite en el mensaje).
 */
export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const conv = await getConversation(session.organizationId, id);
  if (!conv) return apiError(404, "not_found", "Conversación no encontrada");

  let form: FormData | null;
  try {
    const body = await readRequestBodyLimited(req, MAX_MEDIA_UPLOAD_BODY_BYTES);
    form = await new Request(req.url, {
      method: req.method,
      headers: req.headers,
      body,
    }).formData().catch(() => null);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return apiError(413, "too_large", "La solicitud excede el límite permitido");
    }
    throw error;
  }
  if (!form) {
    return apiError(400, "invalid", "Se esperaba multipart/form-data");
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return apiError(422, "invalid", "Falta el archivo (campo `file`)");
  }
  const captionRaw = form.get("caption");
  const caption =
    typeof captionRaw === "string" && captionRaw.trim()
      ? captionRaw.trim().slice(0, 1024)
      : undefined;

  try {
    validateOutgoing(file.type || "application/octet-stream", file.size);
  } catch (err) {
    if (err instanceof MediaValidationError) {
      return apiError(
        err.code === "too_large" ? 413 : 415,
        err.code,
        err.message
      );
    }
    throw err;
  }

  const data = Buffer.from(await file.arrayBuffer());

  try {
    const result = await sendMediaMessage({
      conversationId: id,
      organizationId: session.organizationId,
      file: {
        data,
        mimeType: file.type || "application/octet-stream",
        fileName: file.name || undefined,
      },
      caption,
    });
    return Response.json({ messageId: result.messageId }, { status: 201 });
  } catch (err) {
    if (err instanceof MediaValidationError) {
      return apiError(
        err.code === "too_large" ? 413 : 415,
        err.code,
        err.message
      );
    }
    if (err instanceof SendError) {
      return apiError(SEND_ERROR_STATUS[err.code], err.code, err.message);
    }
    throw err;
  }
});
