import { cn } from "@/lib/utils";

export type Uso = {
  contacts: number;
  members: number;
  channels: number;
  conversationsThisMonth: number;
};

export type Limites = {
  maxContacts: number | null;
  maxMembers: number | null;
  maxChannels: number | null;
  maxConversationsMonth: number | null;
};

/**
 * 031 — Los cuatro números de una organización contra el tope de su plan.
 *
 * `null` = sin límite, y ahí NO se pinta barra: no hay nada que llenar. La
 * barra se tiñe al llegar al tope, que es el momento en que al dueño le
 * importa mirarla.
 */
export function UsoCliente({
  uso,
  limites,
  compacto = false,
}: {
  uso: Uso;
  limites: Limites | null;
  compacto?: boolean;
}) {
  const filas = [
    {
      label: "Contactos",
      actual: uso.contacts,
      tope: limites?.maxContacts ?? null,
    },
    {
      label: "Miembros",
      actual: uso.members,
      tope: limites?.maxMembers ?? null,
    },
    {
      label: "Canales",
      actual: uso.channels,
      tope: limites?.maxChannels ?? null,
    },
    {
      label: "Conversaciones del mes",
      actual: uso.conversationsThisMonth,
      tope: limites?.maxConversationsMonth ?? null,
    },
  ];

  return (
    <dl className={cn("grid gap-3", compacto ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-4")}>
      {filas.map((fila) => {
        const lleno = fila.tope !== null && fila.actual >= fila.tope;
        return (
          <div key={fila.label} className="space-y-1">
            <dt className="text-xs text-text-3">{fila.label}</dt>
            <dd className="text-sm font-semibold text-foreground tabular-nums">
              {fila.actual}
              {fila.tope !== null && (
                <span className={cn("font-normal", lleno ? "text-danger-text" : "text-text-3")}>
                  {" / "}
                  {fila.tope}
                </span>
              )}
              {fila.tope === null && (
                <span className="ml-1 text-xs font-normal text-text-3">sin límite</span>
              )}
            </dd>
            {fila.tope !== null && (
              <div
                className="h-1.5 overflow-hidden rounded-full bg-subtle"
                role="presentation"
              >
                <div
                  className={cn(
                    "h-full rounded-full",
                    lleno ? "bg-danger" : "bg-primary"
                  )}
                  style={{
                    width: `${Math.min(100, Math.round((fila.actual / Math.max(1, fila.tope)) * 100))}%`,
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </dl>
  );
}
