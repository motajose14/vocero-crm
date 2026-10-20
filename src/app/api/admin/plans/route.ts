import { eq, sql } from "drizzle-orm";
import { apiError, parseBody, withAdmin } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { ensureFreePlan } from "@/server/plans/free";
import { planCreateSchema, slugDeNombre } from "@/server/plans/schemas";

export const dynamic = "force-dynamic";

/**
 * 031 — Planes (superadmin).
 *
 * GET asegura el Free antes de listar: una instancia recién actualizada ve el
 * plan de entrada sin que nadie tenga que recordar sembrarlo. El orden deja el
 * Free primero, que es con el que trabaja el 90 % del tiempo.
 */
export const GET = withAdmin(async () => {
  await ensureFreePlan();
  const db = getDb();
  const planes = await db.select().from(schema.plan).orderBy(
    sql`${schema.plan.isFree} DESC, ${schema.plan.createdAt} ASC`
  );
  return Response.json({
    plans: planes.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      isFree: p.isFree,
      priceCents: p.priceCents,
      maxContacts: p.maxContacts,
      maxMembers: p.maxMembers,
      maxChannels: p.maxChannels,
      maxConversationsMonth: p.maxConversationsMonth,
      active: p.active,
      createdAt: p.createdAt.toISOString(),
    })),
  });
});

/** Crear un plan: slug derivado del nombre y único por tabla. */
export const POST = withAdmin(async (_session, req: Request) => {
  const body = await parseBody(req, planCreateSchema);
  if (!body.ok) return body.response;

  const data = body.data;
  const slug = data.slug ?? slugDeNombre(data.name);
  const db = getDb();

  const [dup] = await db
    .select({ id: schema.plan.id })
    .from(schema.plan)
    .where(eq(schema.plan.slug, slug))
    .limit(1);
  if (dup) {
    return apiError(409, "duplicate", `Ya existe un plan con el slug «${slug}»`);
  }

  const id = newId("plan");
  await db.insert(schema.plan).values({
    id,
    name: data.name,
    slug,
    isFree: data.isFree ?? false,
    priceCents: data.priceCents ?? null,
    maxContacts: data.maxContacts ?? null,
    maxMembers: data.maxMembers ?? null,
    maxChannels: data.maxChannels ?? null,
    maxConversationsMonth: data.maxConversationsMonth ?? null,
    active: data.active ?? true,
  });

  const [creado] = await db
    .select()
    .from(schema.plan)
    .where(eq(schema.plan.id, id))
    .limit(1);
  return Response.json({ plan: creado }, { status: 201 });
});
