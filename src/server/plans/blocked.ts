import type { PlanLimits } from "./limits";

/**
 * 031 — Reglas de bloqueo de conversaciones por límite de plan (L6/L7).
 *
 * Todo es puro: el llamador aporta el recuento. OJO con el orden — cuando se
 * evalúa el nacimiento, la conversación YA está insertada, así que la cuota
 * mensual del recuento LA INCLUYE (la Nª de un tope N queda dentro; la N+1ª
 * queda fuera). Los mensajes entrantes NUNCA se rechazan: solo se decide si
 * el chat nace o sigue bloqueado (ni IA ni persona responden).
 */

export type ChatUsage = {
  contacts: number;
  conversationsThisMonth: number;
};

/** Recién creada: ¿nace con el chat bloqueado? */
export function conversationBornBlocked(
  limits: PlanLimits,
  usage: ChatUsage
): boolean {
  // Contactos: el recuento NO cambia con el nacimiento → estar en el tope
  // alcanzado bloquea («ya alcanzó su límite»).
  const sobreContactos =
    limits.maxContacts !== null && usage.contacts >= limits.maxContacts;
  // Conversaciones: el recuento YA la incluye → solo bloquea si quedó por
  // ENCIMA de la cuota (la 50ª de 50 pasa; la 51ª nace bloqueada).
  const sobreConversaciones =
    limits.maxConversationsMonth !== null &&
    usage.conversationsThisMonth > limits.maxConversationsMonth;
  return sobreContactos || sobreConversaciones;
}

/**
 * Desbloqueo perezoso (se evalúa en el primer envío posterior): ¿la
 * organización VOLVIÓ a tener margen — plan nuevo, mes nuevo o contactos por
 * debajo del tope? `actual < max`: estar EXACTAMENTE en el tope sigue
 * «alcanzado» y el chat sigue bloqueado.
 */
export function withinLimitsForSend(
  limits: PlanLimits,
  usage: ChatUsage
): boolean {
  const sinContactos =
    limits.maxContacts === null || usage.contacts < limits.maxContacts;
  const sinConversaciones =
    limits.maxConversationsMonth === null ||
    usage.conversationsThisMonth < limits.maxConversationsMonth;
  return sinContactos && sinConversaciones;
}

export type SendVerdict = "send" | "send_and_release" | "block";

/** Qué hace el envío según el flag de la conversación y el estado ACTUAL. */
export function sendVerdict(
  conversation: { planBlocked: boolean },
  limits: PlanLimits,
  usage: ChatUsage
): SendVerdict {
  if (!conversation.planBlocked) return "send";
  return withinLimitsForSend(limits, usage) ? "send_and_release" : "block";
}
