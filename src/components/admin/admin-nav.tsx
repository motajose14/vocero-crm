"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 031 — Navegación del panel de administración.
 *
 * Va aparte del `appNavGroups` del CRM: `/admin` no es una pantalla del
 * negocio, es la vista de PLATAFORMA, y mezclarla en el menú de un cliente
 * sería invitar a que un dueño la vea (y a explicar por qué no puede usarla).
 */
const LINKS = [
  { href: "/admin/clientes", label: "Clientes", icon: Building2 },
  { href: "/admin/planes", label: "Planes", icon: Layers },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1">
      {LINKS.map((link) => {
        const activo =
          pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              activo
                ? "bg-brand-tint text-brand"
                : "text-text-2 hover:bg-accent hover:text-foreground"
            )}
          >
            <link.icon className="h-4 w-4" strokeWidth={1.8} aria-hidden />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
