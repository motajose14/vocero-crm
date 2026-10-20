import { eq, gte, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";

/**
 * 031 — Recuento del uso real de una organización contra los límites de su
 * plan. Los cuatro números que la guarda de límites consulta antes de
 * decidir; nada de esto cachea, cada pregunta lee el estado actual.
 */

type Db = ReturnType<typeof getDb>;

export type Usage = {
  contacts: number;
  members: number;
  channels: number;
  conversationsThisMonth: number;
};

/**
 * Inicio de mes en UTC: la conexión fija `TimeZone=UTC` (invariante del
 * proyecto), así que mes = mes del reloj en UTC.
 */
export function startOfMonthUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Contactos del tenant. */
export async function countContacts(db: Db, orgId: string): Promise<number> {
  const [fila] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, orgId));
  return fila?.n ?? 0;
}

/** Miembros del equipo (dueños y colaboradores con cuenta en la org). */
export async function countMembers(db: Db, orgId: string): Promise<number> {
  const [fila] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.member)
    .where(scoped(schema.member.organizationId, orgId));
  return fila?.n ?? 0;
}

/**
 * Canales conectados: cuántos de los cuatro tienen credenciales guardadas
 * (re-guardar las de un canal ya conectado no suma — no es un canal nuevo).
 */
export async function countChannels(db: Db, orgId: string): Promise<number> {
  const [wa, ig, ms, tt] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.metaCredentials)
      .where(scoped(schema.metaCredentials.organizationId, orgId)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.instagramCredentials)
      .where(scoped(schema.instagramCredentials.organizationId, orgId)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.messengerCredentials)
      .where(scoped(schema.messengerCredentials.organizationId, orgId)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.tiktokCredentials)
      .where(scoped(schema.tiktokCredentials.organizationId, orgId)),
  ]);
  return [wa, ig, ms, tt]
    .map((fila) => fila[0]?.n ?? 0)
    .filter((n) => n > 0).length;
}

/**
 * Conversaciones REALES creadas este mes (el Laboratorio `is_test` no cuenta
 * ni se bloquea). Al nacimiento de una conversación el llamador consulta
 * DESPUÉS del insert, de modo que el recuento ya la incluye — que es
 * exactamente la regla de `conversationBornBlocked`.
 */
export async function countConversationsMonth(
  db: Db,
  orgId: string,
  now = new Date()
): Promise<number> {
  const [fila] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.conversation)
    .where(
      scoped(
        schema.conversation.organizationId,
        orgId,
        eq(schema.conversation.isTest, false),
        gte(schema.conversation.createdAt, startOfMonthUtc(now))
      )
    );
  return fila?.n ?? 0;
}

/** Los cuatro recuentos de una vez (lista/detalle del superadmin). */
export async function orgUsage(
  db: Db,
  orgId: string,
  now = new Date()
): Promise<Usage> {
  const [contacts, members, channels, conversationsThisMonth] =
    await Promise.all([
      countContacts(db, orgId),
      countMembers(db, orgId),
      countChannels(db, orgId),
      countConversationsMonth(db, orgId, now),
    ]);
  return { contacts, members, channels, conversationsThisMonth };
}
