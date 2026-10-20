import {
  CalendarDays,
  ChartColumn,
  FlaskConical,
  Inbox,
  Kanban,
  ListChecks,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import { canConfigure } from "@/lib/auth/roles";

/**
 * #87 — El modelo del menú, separado del componente que lo pinta.
 *
 * Qué entradas existen lo deciden dos cosas que el nav de cliente no puede
 * leer solo: las banderas de la instancia (`AGENDA`, `CHANNELS`, `ATRIBUCION`,
 * que bajan por prop desde el servidor) y el rol de quien mira. Tenerlo aquí,
 * sin React, deja que una prueba unitaria afirme qué aparece y qué no sin
 * dibujar nada.
 */

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Muestra el contador de no leídos (solo la Bandeja). */
  badge?: boolean;
};

export type NavGroup = {
  /** Encabezado pequeño; sin él, el grupo es una entrada suelta. */
  title?: string;
  items: NavItem[];
};

/** La única entrada que va abajo, separada del resto. */
export const SETTINGS_ITEM: NavItem = {
  href: "/settings",
  label: "Ajustes",
  icon: Settings,
};

/**
 * Grupos de la barra lateral, en el orden en que se leen: lo que se atiende
 * cada día, lo que configura al agente y, al final, cómo va el negocio.
 */
export function appNavGroups({
  agenda = false,
  role,
  superadmin = false,
}: {
  /** 015 — "Citas" solo existe si esta instancia encendió la agenda. */
  agenda?: boolean;
  /** #86 — La guía de inicio solo para quien puede configurar. */
  role?: string | null;
  /** 031 — El panel de plataforma es solo para superadmins de la instancia. */
  superadmin?: boolean;
}): NavGroup[] {
  const trabajo: NavItem[] = [
    { href: "/inbox", label: "Bandeja", icon: Inbox, badge: true },
    { href: "/pipeline", label: "Pipeline", icon: Kanban },
    { href: "/contacts", label: "Contactos", icon: Users },
  ];
  // Citas va después de Contactos: es el paso siguiente de un trato, no una
  // sección aparte.
  if (agenda) trabajo.push({ href: "/bookings", label: "Citas", icon: CalendarDays });

  const agente: NavItem[] = [];
  // Un miembro del equipo no puede hacer ninguno de los pasos de la guía.
  if (canConfigure(role)) {
    agente.push({ href: "/onboarding", label: "Guía de inicio", icon: ListChecks });
  }
  agente.push(
    { href: "/agent", label: "Agente", icon: Sparkles },
    { href: "/lab", label: "Laboratorio", icon: FlaskConical }
  );

  const grupos: NavGroup[] = [
    { title: "Trabajo", items: trabajo },
    { title: "Agente", items: agente },
    // 019 — Se mide al final: primero se atiende y se organiza.
    { items: [{ href: "/results", label: "Resultados", icon: ChartColumn }] },
  ];

  // 031 — Administrar la instancia no es una actividad del negocio de nadie:
  // va en su propio grupo, al final, y solo quien tiene el flag lo ve. Que el
  // enlace exista no amplía la llave: `/admin` y `/api/admin/*` siguen
  // preguntando por `is_superadmin` en el servidor.
  if (superadmin) {
    grupos.push({
      title: "Plataforma",
      items: [{ href: "/admin", label: "Panel de plataforma", icon: ShieldCheck }],
    });
  }

  return grupos;
}

/**
 * 031 — La etiqueta bajo el nombre en el pie del menú.
 *
 * El flag de superadmin gana al rol de la organización: una misma persona
 * puede ser dueña de su cliente y, además, administrar la instancia, y
 * enseñarle "Propietario" sería disfrazarle del hecho más importante de su
 * sesión.
 */
export function rolLabel({
  role,
  superadmin = false,
}: {
  role?: string | null;
  superadmin?: boolean;
}): string {
  if (superadmin) return "Superadmin";
  return role === "owner" ? "Propietario" : "Equipo";
}

export type SettingsLink = { href: string; label: string };

export type SettingsSection = {
  title: string;
  links: SettingsLink[];
};

/**
 * Ajustes en tres secciones: por dónde entran los mensajes, qué hace el agente
 * con ellos y lo que es del negocio. Una pestaña por canal no escala; una
 * sección por canal, sí: cada canal nuevo cae en "Canales" sin tocar el resto.
 *
 * Instagram no tiene pantalla propia todavía: sus credenciales se guardan
 * por API (`/api/settings/instagram`). Cuando la tenga, va aquí tras
 * `CHANNELS`, igual que Messenger.
 */
export function settingsSections({
  agenda = false,
  atribucion = false,
  instagram = false,
  messenger = false,
  tiktok = false,
}: {
  agenda?: boolean;
  /** 016 — "Anuncios" existe solo con la bandera ATRIBUCION. */
  atribucion?: boolean;
  /** 023 — "Instagram" solo si el canal está encendido con CHANNELS. */
  instagram?: boolean;
  /** 017 — "Messenger", igual. */
  messenger?: boolean;
  /** 022 — "TikTok", igual: solo con el canal en CHANNELS. */
  tiktok?: boolean;
}): SettingsSection[] {
  const canales: SettingsLink[] = [];
  // 023 — "Estado" reúne todos los canales; con WhatsApp solo no aporta nada
  // que su pantalla no diga, así que no existe (ADR-001).
  if (instagram || messenger || tiktok) {
    canales.push({ href: "/settings/channels", label: "Estado" });
  }
  canales.push({ href: "/settings/whatsapp", label: "WhatsApp" });
  if (instagram) canales.push({ href: "/settings/instagram", label: "Instagram" });
  if (messenger) canales.push({ href: "/settings/messenger", label: "Messenger" });
  if (tiktok) canales.push({ href: "/settings/tiktok", label: "TikTok" });

  // #85 — el proveedor de IA se configura aquí; el entorno queda de respaldo.
  const agente: SettingsLink[] = [{ href: "/settings/ai", label: "IA" }];
  if (agenda) agente.push({ href: "/settings/calendar", label: "Agenda" });

  const negocio: SettingsLink[] = [
    { href: "/settings/branding", label: "Marca" },
    { href: "/settings/templates", label: "Plantillas" },
    { href: "/settings/team", label: "Equipo" },
  ];
  if (atribucion) negocio.push({ href: "/settings/ads", label: "Anuncios" });

  return [
    { title: "Canales", links: canales },
    { title: "Agente", links: agente },
    { title: "Negocio", links: negocio },
  ];
}

/** Activa si la ruta es la entrada o cuelga de ella (`/inbox/cv_123`). */
export function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
