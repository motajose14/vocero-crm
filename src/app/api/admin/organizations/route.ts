import { eq, sql } from "drizzle-orm";
import { parseBody, withAdmin } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { errorDeAlta, crearCliente } from "@/server/plans/clientes";
import { orgCreateSchema } from "@/server/plans/schemas";
import { usageByOrg } from "@/server/plans/usage";

export const dynamic = "force-dynamic";

/**
 * 031 — Lista de clientes (superadmin): plan asignado + uso actual contra los
 * cuatro límites. `usageByOrg` hace UNA tanda de consultas agrupadas para la
 * lista entera, no una por cliente.
 */
export const GET = withAdmin(async () => {
  const db = getDb();
  const orgs = await db
    .select({
      id: schema.organization.id,
      name: schema.organization.name,
      slug: schema.organization.slug,
      createdAt: schema.organization.createdAt,
      planId: schema.organization.planId,
      planName: schema.plan.name,
      planIsFree: schema.plan.isFree,
      maxContacts: schema.plan.maxContacts,
      maxMembers: schema.plan.maxMembers,
      maxChannels: schema.plan.maxChannels,
      maxConversationsMonth: schema.plan.maxConversationsMonth,
    })
    .from(schema.organization)
    .leftJoin(schema.plan, eq(schema.organization.planId, schema.plan.id))
    .orderBy(sql`${schema.organization.createdAt} ASC`);

  const uso = await usageByOrg(
    db,
    orgs.map((o) => o.id)
  );

  return Response.json({
    organizations: orgs.map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      createdAt: o.createdAt.toISOString(),
      plan: o.planId
        ? {
            id: o.planId,
            name: o.planName,
            isFree: o.planIsFree,
            limits: {
              maxContacts: o.maxContacts,
              maxMembers: o.maxMembers,
              maxChannels: o.maxChannels,
              maxConversationsMonth: o.maxConversationsMonth,
            },
          }
        : null,
      usage: uso[o.id] ?? {
        contacts: 0,
        members: 0,
        channels: 0,
        conversationsThisMonth: 0,
      },
    })),
  });
});

/**
 * Crear un cliente manualmente: cuenta dueña + organización con pipeline,
 * perfil y plan. La contraseña aleatoria se devuelve UNA sola vez — no se
 * guarda en ningún sitio, ni siquiera en el log.
 */
export const POST = withAdmin(async (_session, req: Request) => {
  const body = await parseBody(req, orgCreateSchema);
  if (!body.ok) return body.response;

  try {
    const cliente = await crearCliente(body.data);
    return Response.json(cliente, { status: 201 });
  } catch (err) {
    return errorDeAlta(err);
  }
});
