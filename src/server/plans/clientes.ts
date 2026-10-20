import { eq } from "drizzle-orm";
import { apiError } from "@/lib/api";
import { getAuth, runInternalSignup } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { crearOrgConDueño } from "@/server/auth/on-signup";
import { ensureFreePlan } from "@/server/plans/free";

/**
 * 031 — Alta manual de un cliente por el superadmin.
 *
 * Tres pasos en orden y sin atajos: validar el plan (si no existe, no se crea
 * NADA — ni cuenta ni organización), crear la cuenta dueña con el bypass
 * interno (que NO genera otra organización: la creamos aquí con el plan que
 * corresponde) y sólo entonces crear la organización completa.
 *
 * El `try` rodea solo la cuenta: si el correo ya existe, no queda ninguna
 * organización huérfana detrás.
 */

export type AltaCliente = {
  organization: { id: string; name: string };
  owner: { name: string; email: string };
  /** Se muestra UNA vez; no se guarda ni se registra en ningún log. */
  password: string;
};

export class AltaClienteError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "AltaClienteError";
  }
}

export async function crearCliente(input: {
  name: string;
  ownerName: string;
  ownerEmail: string;
  planId?: string | null;
}): Promise<AltaCliente> {
  const db = getDb();

  // `planId` ausente → Free (lo que todo cliente nuevo recibe); `null` explícito
  // → sin límites, para dar de alta a un cliente heredado sin tope alguno.
  const planId =
    input.planId === undefined ? await ensureFreePlan(db) : input.planId;
  if (planId) {
    const [existe] = await db
      .select({ id: schema.plan.id })
      .from(schema.plan)
      .where(eq(schema.plan.id, planId))
      .limit(1);
    if (!existe) {
      throw new AltaClienteError(
        422,
        "invalid_body",
        "planId: el plan indicado no existe"
      );
    }
  }

  const password = passwordAleatoria();
  const auth = getAuth();
  let userId: string;
  try {
    const result = await runInternalSignup(() =>
      auth.api.signUpEmail({
        body: {
          name: input.ownerName,
          email: input.ownerEmail,
          password,
        },
      })
    );
    userId = result.user.id;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "No se pudo crear la cuenta";
    if (/exist/i.test(message)) {
      throw new AltaClienteError(409, "duplicate", "Ya existe una cuenta con ese correo");
    }
    throw new AltaClienteError(422, "invalid_body", message);
  }

  const orgId = await crearOrgConDueño({
    userId,
    name: input.name,
    planId,
  });

  return {
    organization: { id: orgId, name: input.name },
    owner: { name: input.ownerName, email: input.ownerEmail },
    password,
  };
}

/** Traduce el error tipado a la respuesta HTTP de la API. */
export function errorDeAlta(err: unknown): Response {
  if (err instanceof AltaClienteError) {
    return apiError(err.status, err.code, err.message);
  }
  throw err;
}

/**
 * Contraseña aleatoria de 16 caracteres: cómoda de copiar y pegar, imposible
 * de adivinar. `crypto.getRandomValues` del runtime, sin dependencias nuevas.
 */
export function passwordAleatoria(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url").slice(0, 16);
}
