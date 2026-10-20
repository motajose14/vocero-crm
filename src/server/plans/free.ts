import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";

/**
 * 031 — El plan «Free» de entrada.
 *
 * No vive en la migración porque `drizzle/` se genera y NUNCA se edita a mano
 * (L12): se asegura de forma idempotente cada vez que hace falta (alta por
 * registro público, API de planes del superadmin).
 */
export const PLAN_FREE_DEFECTO = {
  name: "Free",
  slug: "free",
  isFree: true,
  priceCents: 0,
  maxContacts: 100,
  maxMembers: 2,
  maxChannels: 1,
  maxConversationsMonth: 50,
  active: true,
} as const;

type Db = ReturnType<typeof getDb>;

/**
 * Devuelve el id del plan Free, creándolo si no existe (re-ejecutable y a
 * prueba de carreras: el `ON CONFLICT` absorbe al ganador y volvemos a leer).
 */
export async function ensureFreePlan(db: Db = getDb()): Promise<string> {
  const leido = await leerFree(db);
  if (leido) return leido;

  await db
    .insert(schema.plan)
    .values({ id: newId("plan"), ...PLAN_FREE_DEFECTO })
    .onConflictDoNothing({ target: schema.plan.slug });

  const creado = await leerFree(db);
  if (!creado) {
    throw new Error("ensureFreePlan(): no se pudo asegurar el plan Free");
  }
  return creado;
}

async function leerFree(db: Db): Promise<string | null> {
  const [fila] = await db
    .select({ id: schema.plan.id })
    .from(schema.plan)
    .where(eq(schema.plan.slug, PLAN_FREE_DEFECTO.slug))
    .limit(1);
  return fila?.id ?? null;
}
