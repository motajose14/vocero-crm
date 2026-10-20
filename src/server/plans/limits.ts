import { schema } from "@/lib/db";

/**
 * 031 — Límites efectivos de un plan (SaaS).
 *
 * `null` en cualquier dimensión = sin límite: vale tanto para un plan que no
 * restringe esa dimensión como para una organización sin plan asignado
 * (`organization.plan_id NULL`, compatibilidad con instalaciones existentes).
 */

export type PlanRow = typeof schema.plan.$inferSelect;

export type PlanLimits = {
  maxContacts: number | null;
  maxMembers: number | null;
  maxChannels: number | null;
  maxConversationsMonth: number | null;
};

export const SIN_LIMITES: PlanLimits = {
  maxContacts: null,
  maxMembers: null,
  maxChannels: null,
  maxConversationsMonth: null,
};

/** Convierte la fila del plan (o su ausencia) en límites efectivos. */
export function limitsFor(plan: PlanRow | null | undefined): PlanLimits {
  if (!plan) return SIN_LIMITES;
  return {
    maxContacts: plan.maxContacts,
    maxMembers: plan.maxMembers,
    maxChannels: plan.maxChannels,
    maxConversationsMonth: plan.maxConversationsMonth,
  };
}

/**
 * ¿Pueden entrar `n` unidades más? Evalúa el recuento PRE-carga:
 * `actual + n <= max` — el centésimo contacto de un tope 100 entra, el 101 no.
 * `max null` = sin límite.
 */
export function hasRoom(actual: number, max: number | null, n = 1): boolean {
  return max === null || actual + n <= max;
}
