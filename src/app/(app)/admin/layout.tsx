import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { esSuperadmin } from "@/lib/auth/superadmin";

// La bandera y la sesión se leen en cada petición: si esto se resolviera al
// construir, quedaría cacheado quién es superadmin.
export const dynamic = "force-dynamic";

/**
 * 031 — Cascarón del panel de plataforma.
 *
 * La guarda vive AQUÍ y no en cada pantalla: `/admin` y `/api/admin/*` son dos
 * puertas con la misma llave, y esta es la del navegador. Sin el flag se
 * redirige a la app normal — ni se enseña la pantalla ni se cuenta que existe.
 *
 * NO lleva sidebar propio ni cascarón propio: el panel es una sección MÁS del
 * CRM, igual que Ajustes, y el menú lateral que lo envuelve ya es el del
 * usuario. Un segundo cascarón es lo que hacía saltar de la app a algo
 * ajeno (L20 del dueño).
 */
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!(await esSuperadmin(session.userId))) redirect("/");

  return (
    <div className="flex h-full flex-col">
      <header className="border-b px-4 py-3 sm:px-6 sm:py-4">
        <h2 className="text-[17px] font-bold tracking-tight">Plataforma</h2>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">{children}</div>
    </div>
  );
}
