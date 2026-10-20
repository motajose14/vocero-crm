import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { esSuperadmin } from "@/lib/auth/superadmin";
import { AdminNav } from "@/components/admin/admin-nav";

export const dynamic = "force-dynamic";

/**
 * 031 — Cascarón del panel de plataforma.
 *
 * La guarda vive AQUÍ y no en cada pantalla: `/admin` y `/api/admin/*` son dos
 * puertas con la misma llave, y esta es la del navegador. Sin el flag se
 * redirige a la app normal — ni se enseña la pantalla ni se cuenta que existe.
 *
 * Es deliberadamente minimal y está fuera de `appNavGroups`: administrar la
 * instancia no es una actividad del negocio de nadie.
 */
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!(await esSuperadmin(session.userId))) redirect("/");

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-4">
            <span className="text-sm font-semibold tracking-wide text-text-3 uppercase">
              Administración
            </span>
            <AdminNav />
          </div>
          <Link
            href="/inbox"
            className="text-sm text-text-2 underline-offset-4 hover:text-foreground hover:underline"
          >
            Volver al CRM
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
