import { describe, expect, it } from "vitest";
import {
  limitsFor,
  hasRoom,
  SIN_LIMITES,
  type PlanLimits,
} from "@/server/plans/limits";
import { PLAN_FREE_DEFECTO } from "@/server/plans/free";
import {
  conversationBornBlocked,
  withinLimitsForSend,
  sendVerdict,
} from "@/server/plans/blocked";

/**
 * 031 — Lógica de límites del SaaS (toda pura, sin BD).
 *
 * Reglas del spec (L4/L6/L7):
 *  - null en un límite = sin límite (también organization.plan_id NULL).
 *  - Crear/contacto/equipo/canal: entra mientras `actual + n <= max`.
 *  - Conversación sobre cuota: nace bloqueada cuando, tras insertarse, la
 *    conversación supera la cuota mensual o la org ya está en el tope de
 *    contactos.
 *  - El bloqueo se libera en el primer envío si la org VOLVIÓ a tener
 *    margen (plan nuevo, mes nuevo, contactos por debajo del tope): evalúa
 *    `actual < max` — estar EXACTAMENTE en el tope sigue «alcanzado».
 */

const libre: PlanLimits = SIN_LIMITES;
const free: PlanLimits = {
  maxContacts: 100,
  maxMembers: 2,
  maxChannels: 1,
  maxConversationsMonth: 50,
};

describe("limitsFor — límites efectivos", () => {
  it("plan NULL (instalación existente) = sin límites", () => {
    expect(limitsFor(null)).toEqual(SIN_LIMITES);
    expect(limitsFor(undefined)).toEqual(SIN_LIMITES);
  });

  it("los null del plan pasan como sin límite por dimensión", () => {
    const l = limitsFor({ ...rowFree(), maxContacts: null });
    expect(l.maxContacts).toBeNull();
    expect(l.maxMembers).toBe(2);
  });

  it("conserva los valores del plan", () => {
    expect(limitsFor(rowFree())).toEqual(free);
  });
});

describe("hasRoom — ¿cabe crear n más?", () => {
  it("sin límite siempre cabe", () => {
    expect(hasRoom(1_000_000, null)).toBe(true);
  });
  it("99 de 100 → crea el centésimo; 100 de 100 → tope", () => {
    expect(hasRoom(99, 100)).toBe(true);
    expect(hasRoom(100, 100)).toBe(false);
  });
  it("lote: importar 5 con 95/100 cabe; con 96/100 → 101 > 100 no", () => {
    expect(hasRoom(95, 100, 5)).toBe(true);
    expect(hasRoom(96, 100, 5)).toBe(false);
  });
  it("49 de 50 → la 50ª conversación del mes entra", () => {
    expect(hasRoom(49, 50)).toBe(true);
  });
});

describe("plan Free por defecto", () => {
  it("es free, activo, sin precio y con los 4 límites asumidos", () => {
    expect(PLAN_FREE_DEFECTO).toEqual({
      name: "Free",
      slug: "free",
      isFree: true,
      priceCents: 0,
      maxContacts: 100,
      maxMembers: 2,
      maxChannels: 1,
      maxConversationsMonth: 50,
      active: true,
    });
  });
});

describe("conversationBornBlocked — la conversación sobre cuota nace bloqueada", () => {
  it("organización sin plan nunca bloquea", () => {
    expect(conversationBornBlocked(libre, { contacts: 9999, conversationsThisMonth: 9999 })).toBe(false);
  });

  it("dentro de cuota no bloquea (la 50ª de 50 entra: el recuento la incluye)", () => {
    expect(conversationBornBlocked(free, { contacts: 99, conversationsThisMonth: 50 })).toBe(false);
  });

  it("la 51ª de 50 sí nace bloqueada", () => {
    expect(conversationBornBlocked(free, { contacts: 99, conversationsThisMonth: 51 })).toBe(true);
  });

  it("sobre el tope de contactos (100/100) nace bloqueada aunque la cuota esté holgada", () => {
    expect(conversationBornBlocked(free, { contacts: 100, conversationsThisMonth: 1 })).toBe(true);
  });

  it("99/100 contactos con cuota holgada no bloquea", () => {
    expect(conversationBornBlocked(free, { contacts: 99, conversationsThisMonth: 1 })).toBe(false);
  });
});

describe("withinLimitsForSend — desbloqueo perezoso en el primer envío", () => {
  it("exactamente en el tope de contactos (100/100) sigue alcanzado", () => {
    expect(withinLimitsForSend(free, { contacts: 100, conversationsThisMonth: 10 })).toBe(false);
  });

  it("borró un contacto (99/100) → ya dentro de límites", () => {
    expect(withinLimitsForSend(free, { contacts: 99, conversationsThisMonth: 10 })).toBe(true);
  });

  it("misma sin salida: 51 conversaciones del mes contra tope 50", () => {
    expect(withinLimitsForSend(free, { contacts: 10, conversationsThisMonth: 51 })).toBe(false);
  });

  it("subió de plan (51 bajo tope 200) o cambió de mes (0/50) → dentro", () => {
    expect(withinLimitsForSend(free, { contacts: 10, conversationsThisMonth: 51 })).toBe(false);
    expect(withinLimitsForSend({ ...free, maxConversationsMonth: 200 }, { contacts: 10, conversationsThisMonth: 51 })).toBe(true);
    expect(withinLimitsForSend(free, { contacts: 10, conversationsThisMonth: 0 })).toBe(true);
  });

  it("sin plan siempre dentro", () => {
    expect(withinLimitsForSend(libre, { contacts: 10_000, conversationsThisMonth: 10_000 })).toBe(true);
  });
});

describe("sendVerdict — qué hace el envío en una conversación", () => {
  const uso = { contacts: 10, conversationsThisMonth: 3 };

  it("conversación no bloqueada → envía", () => {
    expect(sendVerdict({ planBlocked: false }, free, uso)).toBe("send");
  });

  it("bloqueada y la org sigue fuera de límites → bloquea", () => {
    expect(sendVerdict({ planBlocked: true }, free, { contacts: 100, conversationsThisMonth: 60 })).toBe("block");
  });

  it("bloqueada pero la org volvió dentro de límites → libera y envía", () => {
    expect(sendVerdict({ planBlocked: true }, free, uso)).toBe("send_and_release");
  });
});

/** Fila mínima con la forma del plan para los tests puros. */
function rowFree() {
  return {
    id: "pl_test",
    name: "Free",
    slug: "free",
    isFree: true,
    priceCents: 0,
    maxContacts: 100,
    maxMembers: 2,
    maxChannels: 1,
    maxConversationsMonth: 50,
    active: true,
    createdAt: new Date(),
  };
}
