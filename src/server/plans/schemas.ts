import { z } from "zod";

/**
 * 031 — Contrato de body de `/api/admin/*` (superadmin).
 *
 * Compartido por la ruta y por la UI de `/admin` para que el error 422 salga
 * con el mismo detalle en ambos lados. En español: es lo que el superadmin
 * ve cuando un campo no pasa.
 */

/** Entero ≥ 0, o `null` (= sin límite). Nunca fraccionario ni negativo. */
const limite = z
  .number()
  .int("Debe ser un número entero")
  .min(0, "No puede ser negativo")
  .nullable()
  .optional();

/** `null` y ausente significan lo mismo al CREAR: sin límite / sin tocar. */
export const planCreateSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio"),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug en minúsculas y guiones")
    .optional(),
  isFree: z.boolean().optional(),
  priceCents: z.number().int().min(0, "No puede ser negativo").optional(),
  active: z.boolean().optional(),
  maxContacts: limite,
  maxMembers: limite,
  maxChannels: limite,
  maxConversationsMonth: limite,
});

/** Edición parcial real: cualquier campo ausente se queda como estaba. */
export const planUpdateSchema = planCreateSchema.partial();

/**
 * Alta de un cliente: nombre del negocio y datos del dueño. El plan es
 * opcional — sin él la organización queda `plan_id NULL` (sin límites) hasta
 * que el superadmin asigne; con Free se pide explícitamente.
 */
export const orgCreateSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio"),
  ownerName: z.string().trim().min(1, "El nombre del dueño es obligatorio"),
  ownerEmail: z.string().trim().email("Correo inválido"),
  planId: z.string().min(1).nullable().optional(),
});

/** Asignar (o quitar con `null` = sin límites) el plan de una organización. */
export const orgAssignPlanSchema = z.object({
  planId: z.string().min(1).nullable(),
});

/**
 * Slug legible del nombre: sin acentos ni mayúsculas, colisiona → 409 en la
 * ruta. Sacado del esquema para que la ruta no tenga lógica de negocio.
 */
export function slugDeNombre(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/g, "") || "plan"
  );
}
