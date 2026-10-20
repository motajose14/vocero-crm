import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { limitsFor, hasRoom, type PlanLimits, type PlanRow } from "./limits";
import {
  countContacts,
  countMembers,
  countChannels,
  countConversationsMonth,
} from "./usage";
import {
  conversationBornBlocked,
  sendVerdict,
  type ChatUsage,
  type SendVerdict,
} from "./blocked";

/**
 * 031 — Guardas de límite: se preguntan ANTES de escribir y devuelven un
 * resultado tipado que la ruta traduce en `apiError(409, "plan_limit", …)`.
 * Nunca escriben ellas mismas: solo leen estado y deciden.
 */

type Db = ReturnType<typeof getDb>;

export type Guard = { ok: true } | { ok: false; code: "plan_limit"; message: string };

export const GUARD_OK: Guard = { ok: true };

const tope = (message: string): Guard => ({
  ok: false,
  code: "plan_limit",
  message,
});

/** Plan efectivo de la organización (sin plan asignado = sin límites). */
export async function planForOrg(db: Db, orgId: string): Promise<PlanRow | null> {
  const [org] = await db
    .select({ planId: schema.organization.planId })
    .from(schema.organization)
    .where(scoped(schema.organization.id, orgId))
    .limit(1);
  if (!org?.planId) return null;
  const [plan] = await db
    .select()
    .from(schema.plan)
    .where(eq(schema.plan.id, org.planId))
    .limit(1);
  return plan ?? null;
}

async function limitsForOrg(db: Db, orgId: string): Promise<PlanLimits> {
  return limitsFor(await planForOrg(db, orgId));
}

/** ¿Puede crear `n` contactos más (manual o importación)? */
export async function checkCanCreateContact(
  db: Db,
  orgId: string,
  n = 1
): Promise<Guard> {
  const [limits, contacts] = await Promise.all([
    limitsForOrg(db, orgId),
    countContacts(db, orgId),
  ]);
  if (hasRoom(contacts, limits.maxContacts, n)) return GUARD_OK;
  return tope(
    `Límite de contactos de tu plan alcanzado (${limits.maxContacts}). Actualiza tu plan para seguir agregando.`
  );
}

/** ¿Puede invitar un miembro más al equipo? */
export async function checkCanInviteMember(db: Db, orgId: string): Promise<Guard> {
  const [limits, members] = await Promise.all([
    limitsForOrg(db, orgId),
    countMembers(db, orgId),
  ]);
  if (hasRoom(members, limits.maxMembers)) return GUARD_OK;
  return tope(
    `Límite de usuarios del equipo de tu plan alcanzado (${limits.maxMembers}). Actualiza tu plan para invitar a más personas.`
  );
}

/** ¿Puede conectar un canal nuevo (el que ya tiene credenciales no cuenta)? */
export async function checkCanConnectChannel(db: Db, orgId: string): Promise<Guard> {
  const [limits, channels] = await Promise.all([
    limitsForOrg(db, orgId),
    countChannels(db, orgId),
  ]);
  if (hasRoom(channels, limits.maxChannels)) return GUARD_OK;
  return tope(
    `Límite de canales conectados de tu plan alcanzado (${limits.maxChannels}). Actualiza tu plan para conectar más canales.`
  );
}

/**
 * Tras insertar la conversación nueva (el webhook siempre ingiere): ¿nace
 * con el chat bloqueado? El recuento del mes YA la incluye.
 */
export async function conversationBornBlockedNow(
  db: Db,
  orgId: string,
  now = new Date()
): Promise<boolean> {
  const [limits, contacts, conversationsThisMonth] = await Promise.all([
    limitsForOrg(db, orgId),
    countContacts(db, orgId),
    countConversationsMonth(db, orgId, now),
  ]);
  return conversationBornBlocked(limits, {
    contacts,
    conversationsThisMonth,
  });
}

/**
 * Veredicto del envío con el estado ACTUAL de la organización: una
 * conversación bloqueada se libera sola (`send_and_release`) si la org volvió
 * dentro de límites (plan nuevo, mes nuevo, contactos por debajo del tope).
 */
export async function currentSendVerdict(
  db: Db,
  orgId: string,
  conversation: { planBlocked: boolean },
  now = new Date()
): Promise<SendVerdict> {
  const [limits, contacts, conversationsThisMonth] = await Promise.all([
    limitsForOrg(db, orgId),
    countContacts(db, orgId),
    countConversationsMonth(db, orgId, now),
  ]);
  const usage: ChatUsage = { contacts, conversationsThisMonth };
  return sendVerdict(conversation, limits, usage);
}
