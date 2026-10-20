import { and, eq, gte, inArray, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
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

/**
 * 031 — Uso de VARIAS organizaciones de una vez (lista del superadmin).
 *
 * Cuatro consultas agrupadas en vez de cuatro por cliente: con cientos de
 * organizaciones la diferencia es la diferencia entre una pantalla ágil y una
 * que no carga. Los ids fuera de `orgIds` simplemente no aparecen.
 *
 * ATENCIÓN: es el ÚNICO lector de estas tablas sin `scoped()` — la lista de
 * plataforma existe para ver a todos los clientes. Vive aquí, en el módulo de
 * planes, para que ninguna ruta de dominio lo imite.
 */
export async function usageByOrg(
  db: Db,
  orgIds: string[],
  now = new Date()
): Promise<Record<string, Usage>> {
  const vacio: Record<string, Usage> = {};
  if (orgIds.length === 0) return vacio;

  // Tabla con su columna de tenant: el tipo base `PgTable` ya no arrastra el
  // nombre de tabla, que es lo que hacía incompatible a unas con otras.
  type TablaOrg = PgTable & { organizationId: PgColumn };

  const grupos = async (tabla: TablaOrg) =>
    db
      .select({
        orgId: tabla.organizationId,
        n: sql<number>`count(*)::int`,
      })
      .from(tabla)
      .where(inArray(tabla.organizationId, orgIds))
      .groupBy(tabla.organizationId);

  // La columna base tipa `orgId` como `unknown` (el genérico de PgColumn está
  // vacío): el valor siempre es el id de texto de la tabla, nunca un número.
  const porOrg = (filas: { orgId: unknown; n: number }[]) => {
    const mapa: Record<string, number> = {};
    for (const fila of filas) mapa[String(fila.orgId)] = fila.n;
    return mapa;
  };

  const [contactos, miembros, conversaciones, wa, ig, ms, tt] =
    await Promise.all([
      grupos(schema.contact),
      grupos(schema.member),
      db
        .select({
          orgId: schema.conversation.organizationId,
          n: sql<number>`count(*)::int`,
        })
        .from(schema.conversation)
        .where(
          and(
            inArray(schema.conversation.organizationId, orgIds),
            eq(schema.conversation.isTest, false),
            gte(schema.conversation.createdAt, startOfMonthUtc(now))
          )
        )
        .groupBy(schema.conversation.organizationId),
      grupos(schema.metaCredentials),
      grupos(schema.instagramCredentials),
      grupos(schema.messengerCredentials),
      grupos(schema.tiktokCredentials),
    ]);

  const c = porOrg(contactos);
  const m = porOrg(miembros);
  const v = porOrg(conversaciones);
  // Cada canal aporta 1 si tiene credenciales guardadas (misma regla que
  // countChannels: un canal repetido en varias tablas no suma dos veces).
  const porCanal = [wa, ig, ms, tt].map(porOrg);

  const salida: Record<string, Usage> = {};
  for (const orgId of orgIds) {
    salida[orgId] = {
      contacts: c[orgId] ?? 0,
      members: m[orgId] ?? 0,
      channels: porCanal.filter((mapa) => (mapa[orgId] ?? 0) > 0).length,
      conversationsThisMonth: v[orgId] ?? 0,
    };
  }
  return salida;
}
