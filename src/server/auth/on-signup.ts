import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { ensureFreePlan } from "@/server/plans/free";

/** Etapas sembradas del pipeline (US2). */
const SEED_STAGES: { name: string; kind: "open" | "won" | "lost" }[] = [
  { name: "Nuevo", kind: "open" },
  { name: "En conversación", kind: "open" },
  { name: "Interesado", kind: "open" },
  { name: "Cliente", kind: "won" },
  { name: "Perdido", kind: "lost" },
];

type Opciones = { internal?: boolean };

/**
 * 031 — CADA registro público crea SU organización (S4): nombre propio,
 * slug único por construcción (sufijo del id), dueño, pipeline sembrado,
 * perfil del agente y el plan Free asignado.
 *
 * `internal: true` (alta de equipo vía `runInternalSignup`) NO crea
 * organización: su membresía la pone el dueño explícitamente (D8).
 * Sin advisory lock: ya no hay carrera de "primer arranque" — cada registro
 * lleva su propia org con un slug derivado de su propio id.
 */
export async function onUserCreated(
  userId: string,
  userName: string,
  opciones: Opciones = {}
) {
  if (opciones.internal) return;

  const db = getDb();
  // Fuera de la transacción: idempotente a prueba de carreras por sí solo.
  const planId = await ensureFreePlan(db);
  const name = userName ? `Negocio de ${userName}` : "Mi negocio";

  await crearOrgConDueño({ userId, name, planId });
}

/**
 * 031 — Crea una organización completa con su dueño: pipeline sembrado, perfil
 * del agente y membresía `owner`. La comparten el registro público (con el
 * plan Free) y el alta manual del superadmin (con el plan que elija).
 *
 * Sale con el id de la organización para que el llamador haga lo que necesite
 * con ella (asignar plan posterior, devolverla en la API…).
 */
export async function crearOrgConDueño(input: {
  userId: string;
  name: string;
  planId: string | null;
}): Promise<string> {
  const db = getDb();
  const orgId = newId("organization");
  const { userId, name, planId } = input;

  await db.transaction(async (tx) => {
    await tx.insert(schema.organization).values({
      id: orgId,
      name,
      slug: slugUnico(name, orgId),
      planId,
    });
    await tx.insert(schema.member).values({
      id: newId("member"),
      organizationId: orgId,
      userId,
      role: "owner",
    });
    await tx.insert(schema.pipelineStage).values(
      SEED_STAGES.map((s, i) => ({
        id: newId("stage"),
        organizationId: orgId,
        name: s.name,
        position: i,
        kind: s.kind,
      }))
    );
    await tx.insert(schema.agentProfile).values({
      id: newId("agentProfile"),
      organizationId: orgId,
    });
  });

  return orgId;
}

/**
 * Slug derivado del nombre con el sufijo del id de la organización: dos
 * registros con el mismo nombre jamás colisionan (el id es único) y no hace
 * falta leer la tabla para comprobarlo.
 */
export function slugUnico(name: string, orgId: string): string {
  const base =
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/g, "") || "negocio";
  return `${base}-${orgId.slice(-12)}`;
}

/** Organización activa de un usuario (su primera membresía). */
export async function resolveActiveOrganizationId(
  userId: string
): Promise<string | null> {
  return (await resolveMembership(userId))?.organizationId ?? null;
}

export async function resolveMembership(
  userId: string
): Promise<{ organizationId: string; role: string } | null> {
  const db = getDb();
  const rows = await db
    .select({
      organizationId: schema.member.organizationId,
      role: schema.member.role,
    })
    .from(schema.member)
    .where(eq(schema.member.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}
