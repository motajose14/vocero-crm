import { getAppSecretByPhoneNumberId } from "@/server/whatsapp/credentials";

/**
 * Resuelve el secreto de firma para un payload entrante. El webhook es
 * compartido por la instancia: todos los números de un mismo payload deben
 * pertenecer a la misma app Meta (mismo App Secret), para que una app no pueda
 * firmar eventos destinados a otra organización. Eventos sin metadata usan el
 * secreto global de compatibilidad, si está configurado.
 */
export async function appSecretForPayload(
  rawBody: string,
  fallback: string | undefined
): Promise<string | null> {
  let ids: string[] = [];
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (parsed && typeof parsed === "object" && "entry" in parsed) {
      const entries = (parsed as { entry?: unknown }).entry;
      if (Array.isArray(entries)) {
        ids = entries.flatMap((entry) => {
          if (!entry || typeof entry !== "object" || !("changes" in entry)) return [];
          const changes = (entry as { changes?: unknown }).changes;
          if (!Array.isArray(changes)) return [];
          return changes.flatMap((change) => {
            if (!change || typeof change !== "object" || !("value" in change)) return [];
            const value = (change as { value?: unknown }).value;
            if (!value || typeof value !== "object" || !("metadata" in value)) return [];
            const metadata = (value as { metadata?: unknown }).metadata;
            if (!metadata || typeof metadata !== "object" || !("phone_number_id" in metadata)) return [];
            const id = (metadata as { phone_number_id?: unknown }).phone_number_id;
            return typeof id === "string" && id ? [id] : [];
          });
        });
      }
    }
  } catch {
    return fallback ?? null;
  }

  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return fallback ?? null;
  const secrets = await Promise.all(
    uniqueIds.map(async (id) => (await getAppSecretByPhoneNumberId(id)) ?? fallback ?? null)
  );
  if (secrets.some((secret) => secret === null)) return null;
  const [first, ...rest] = secrets;
  return first && rest.every((secret) => secret === first) ? first : null;
}
