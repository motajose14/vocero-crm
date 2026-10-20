import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { getBranding } from "@/server/branding";
import { PlanesClient } from "@/components/admin/planes-client";

export const dynamic = "force-dynamic";

/**
 * 031 — Planes del SaaS: crear, editar, desactivar y borrar.
 *
 * El precio se exhibe en la moneda que el superadmin eligió en Ajustes → Marca.
 * Los planes son objetos de plataforma y no tienen moneda propia —no la
 * necesitan: aquí no se cobra—, así que la del dueño de la instancia es la que
 * define en qué moneda cotiza su lista. Antes venía cableada a MXN.
 */
export default async function AdminPlanesPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  const branding = await getBranding(session.organizationId);
  return <PlanesClient currency={branding.currency} />;
}
