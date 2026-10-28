import { eq } from "drizzle-orm";
import { apiError, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { getDb, schema } from "@/lib/db";
import { orgUsage } from "@/server/plans/usage";

export const dynamic = "force-dynamic";

/** Plan asignado y uso actual de la organización autenticada. */
export const GET = withAuth(async (session) => {
  if (!canConfigure(session.role)) {
    return apiError(
      403,
      "forbidden",
      "Solo el propietario o administrador puede consultar el plan y el uso. Pedile a uno de ellos que lo revise."
    );
  }

  const db = getDb();
  const [organization] = await db
    .select({ planId: schema.organization.planId })
    .from(schema.organization)
    .where(eq(schema.organization.id, session.organizationId))
    .limit(1);

  if (!organization) {
    return apiError(404, "not_found", "Organización no encontrada");
  }

  const [plan] = organization.planId
    ? await db
        .select()
        .from(schema.plan)
        .where(eq(schema.plan.id, organization.planId))
        .limit(1)
    : [];
  const usage = await orgUsage(db, session.organizationId);

  return Response.json({
    plan: plan
      ? {
          id: plan.id,
          name: plan.name,
          isFree: plan.isFree,
          priceCents: plan.priceCents,
          active: plan.active,
          limits: {
            maxContacts: plan.maxContacts,
            maxMembers: plan.maxMembers,
            maxChannels: plan.maxChannels,
            maxConversationsMonth: plan.maxConversationsMonth,
          },
        }
      : null,
    usage,
  });
});
