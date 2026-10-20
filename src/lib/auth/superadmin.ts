import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/**
 * 031 — Superadmin de plataforma (SaaS).
 *
 * Es un atributo del USUARIO, no de su organización: una misma persona puede
 * ser dueña de su cliente y, además, administrar la instancia. NO pasa por
 * `scoped()`: es el único lecto de usuario fuera del alcance de tenant, y lo
 * hace este módulo, no cada ruta.
 */
export async function esSuperadmin(userId: string): Promise<boolean> {
  const [fila] = await getDb()
    .select({ flag: schema.user.isSuperadmin })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
    .limit(1);
  return fila?.flag === true;
}
