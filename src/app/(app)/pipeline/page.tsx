import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { getBranding } from "@/server/branding";
import { PipelineClient } from "@/components/pipeline/pipeline-client";

export const dynamic = "force-dynamic";

/**
 * La moneda se resuelve AQUÍ y baja como prop, igual que en Resultados: si el
 * cliente la pidiera, el tablero pintaría un instante con la moneda equivocada
 * —un total en pesos mientras el negocio trabaja en dólares— hasta que
 * respondiera `/api/pipeline/board`.
 */
export default async function PipelinePage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  const branding = await getBranding(session.organizationId);
  return <PipelineClient currency={branding.currency} />;
}
