import { eq, sql } from "drizzle-orm";
import { apiError, parseBody, withAdmin } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { planUpdateSchema } from "@/server/plans/schemas";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ planId: string }> };

async function planPorId(planId: string) {
  const [plan] = await getDb()
    .select()
    .from(schema.plan)
    .where(eq(schema.plan.id, planId))
    .limit(1);
  return plan;
}

/** Editar un plan: parcial real, los campos ausentes se quedan como están. */
export const PATCH = withAdmin(async (_session, req: Request, ctx: Params) => {
  const { planId } = await ctx.params;
  const body = await parseBody(req, planUpdateSchema);
  if (!body.ok) return body.response;

  const plan = await planPorId(planId);
  if (!plan) return apiError(404, "not_found", "Plan no encontrado");

  const data = body.data;
  // Solo lo que vino en el body: `undefined` en drizzle no toca la columna.
  await getDb()
    .update(schema.plan)
    .set({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.slug !== undefined ? { slug: data.slug } : {}),
      ...(data.isFree !== undefined ? { isFree: data.isFree } : {}),
      ...(data.priceCents !== undefined ? { priceCents: data.priceCents } : {}),
      ...(data.maxContacts !== undefined ? { maxContacts: data.maxContacts } : {}),
      ...(data.maxMembers !== undefined ? { maxMembers: data.maxMembers } : {}),
      ...(data.maxChannels !== undefined ? { maxChannels: data.maxChannels } : {}),
      ...(data.maxConversationsMonth !== undefined
        ? { maxConversationsMonth: data.maxConversationsMonth }
        : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
    })
    .where(eq(schema.plan.id, planId));

  const actualizado = await planPorId(planId);
  return Response.json({ plan: actualizado });
});

/**
 * Borrar un plan: si algún cliente lo tiene asignado → 409 `plan_in_use`
 * (borrarlo dejaría a la organización en un plan que ya no existe, y la
 * FK `restrict` lo impediría igual).
 */
export const DELETE = withAdmin(async (_session, _req: Request, ctx: Params) => {
  const { planId } = await ctx.params;
  const plan = await planPorId(planId);
  if (!plan) return apiError(404, "not_found", "Plan no encontrado");

  const db = getDb();
  const [usos] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.organization)
    .where(eq(schema.organization.planId, planId));
  if ((usos?.n ?? 0) > 0) {
    return apiError(
      409,
      "plan_in_use",
      `El plan «${plan.name}» está asignado a ${usos?.n} cliente(s); cámbiales de plan antes de borrarlo.`
    );
  }

  await db.delete(schema.plan).where(eq(schema.plan.id, planId));
  return Response.json({ ok: true });
});
