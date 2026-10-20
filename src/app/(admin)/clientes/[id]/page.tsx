import { ClienteClient } from "@/components/admin/cliente-client";

export const dynamic = "force-dynamic";

/** 031 — Detalle de un cliente: uso actual y asignación de plan. */
export default async function AdminClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ClienteClient orgId={id} />;
}
