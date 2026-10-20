import { eq } from "drizzle-orm";
import { apiError, parseBody, withAdmin } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { orgAssignPlanSchema } from "@/server/plans/schemas";
import { orgUsage } from "@/server/plans/usage";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ orgId: string }> };

async function orgPorId(orgId: string) {
  const [org] = await getDb()
    .select({
      id: schema.organization.id,
      name: schema.organization.name,
      slug: schema.organization.slug,
      createdAt: schema.organization.createdAt,
      planId: schema.organization.planId,
    })
    .from(schema.organization)
    .where(eq(schema.organization.id, orgId))
    .limit(1);
  return org;
}

/** Detalle de un cliente: plan, uso, y el dueño (su correo para contactarlo). */
export const GET = withAdmin(async (_session, _req: Request, ctx: Params) => {
  const { orgId } = await ctx.params;
  const org = await orgPorId(orgId);
  if (!org) return apiError(404, "not_found", "Cliente no encontrado");

  const db = getDb();
  const [plan] = org.planId
    ? await db.select().from(schema.plan).where(eq(schema.plan.id, org.planId)).limit(1)
    : [];

  // Dueño = la membresía `owner` (la que se creó con la org): su correo es lo
  // que el superadmin necesita para contactar al cliente.
  const dueños = await db
    .select({ role: schema.member.role, email: schema.user.email, name: schema.user.name })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .where(eq(schema.member.organizationId, orgId));
  const owner = dueños.find((m) => m.role === "owner") ?? null;

  const usage = await orgUsage(db, orgId);
  const limites = plan
    ? {
        maxContacts: plan.maxContacts,
        maxMembers: plan.maxMembers,
        maxChannels: plan.maxChannels,
        maxConversationsMonth: plan.maxConversationsMonth,
      }
    : null;

  return Response.json({
    organization: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      createdAt: org.createdAt.toISOString(),
    },
    plan: plan
      ? {
          id: plan.id,
          name: plan.name,
          isFree: plan.isFree,
          priceCents: plan.priceCents,
          active: plan.active,
          limits: limites,
        }
      : null,
    usage,
    owner: owner ? { name: owner.name, email: owner.email } : null,
  });
});

/**
 * Asignar o cambiar el plan (`null` = sin límites). No toca nada más de la
 * organización: las conversaciones bloqueadas se liberan solas en el primer
 * envío (bloqueo perezoso, sin cron).
 */
export const PATCH = withAdmin(async (_session, req: Request, ctx: Params) => {
  const { orgId } = await ctx.params;
  const body = await parseBody(req, orgAssignPlanSchema);
  if (!body.ok) return body.response;

  const org = await orgPorId(orgId);
  if (!org) return apiError(404, "not_found", "Cliente no encontrado");

  const { planId } = body.data;
  if (planId) {
    const db = getDb();
    const [existe] = await db
      .select({ id: schema.plan.id })
      .from(schema.plan)
      .where(eq(schema.plan.id, planId))
      .limit(1);
    if (!existe) {
      return apiError(422, "invalid_body", "planId: el plan indicado no existe");
    }
  }

  await getDb()
    .update(schema.organization)
    .set({ planId })
    .where(eq(schema.organization.id, orgId));

  const actualizada = await orgPorId(orgId);
  return Response.json({ organization: actualizada });
});
