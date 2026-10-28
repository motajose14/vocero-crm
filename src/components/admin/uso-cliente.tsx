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
      consecuencia:
        "No se pueden crear contactos manualmente ni importar más. Los contactos que llegan por webhook siguen guardándose, pero sus chats nuevos pueden quedar bloqueados.",
    },
    {
      label: "Miembros",
      actual: uso.members,
      tope: limites?.maxMembers ?? null,
      consecuencia: "No se pueden invitar más miembros.",
    },
    {
      label: "Canales",
      actual: uso.channels,
      tope: limites?.maxChannels ?? null,
      consecuencia: "No se pueden conectar canales nuevos.",
    },
    {
      label: "Conversaciones del mes",
      actual: uso.conversationsThisMonth,
      tope: limites?.maxConversationsMonth ?? null,
      consecuencia:
        "Al superar el límite, las conversaciones nuevas se crean, pero su chat queda bloqueado. Los mensajes entrantes siguen llegando.",
    },
  ];

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-3">
        Las conversaciones se cuentan por mes calendario UTC; el contador se reinicia el día 1.
      </p>
      <dl className={cn("grid gap-3", compacto ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-4")}>
        {filas.map((fila) => {
          const lleno = fila.tope !== null && fila.actual >= fila.tope;
          const consecuencia = lleno ? fila.consecuencia : null;
          const maximoAccesible = Math.max(1, fila.tope ?? 1);
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
                  role="progressbar"
                  aria-label={`${fila.label}: ${fila.actual} de ${fila.tope}`}
                  aria-valuemin={0}
                  aria-valuenow={Math.min(maximoAccesible, Math.max(0, fila.actual))}
                  aria-valuemax={maximoAccesible}
                  aria-valuetext={`${fila.actual} de ${fila.tope}`}
                >
                  <div
                    className={cn(
                      "h-full rounded-full",
                      lleno ? "bg-danger" : "bg-primary"
                    )}
                    style={{
                      width: `${Math.min(100, Math.round((fila.actual / maximoAccesible) * 100))}%`,
                    }}
                  />
                </div>
              )}
              {consecuencia && (
                <p role="status" aria-live="polite" className="text-xs font-medium text-danger-text">
                  Límite alcanzado. {consecuencia}
                </p>
              )}
            </div>
          );
        })}
      </dl>
    </div>
  );
}
