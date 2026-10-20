import { ClientesClient } from "@/components/admin/clientes-client";

export const dynamic = "force-dynamic";

/** 031 — Lista de clientes del SaaS: plan asignado y uso contra los tope. */
export default function AdminClientesPage() {
  return <ClientesClient />;
}
