import { redirect } from "next/navigation";

/** `/admin` sin pantalla propia: se entra por la lista de clientes. */
export default function AdminIndexPage() {
  redirect("/admin/clientes");
}
