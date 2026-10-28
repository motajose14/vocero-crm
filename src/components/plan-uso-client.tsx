"use client";

import { useEffect, useState } from "react";
import { UsoCliente, type Limites, type Uso } from "@/components/admin/uso-cliente";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Plan = {
  id: string;
  name: string;
  isFree: boolean;
  priceCents: number | null;
  active: boolean;
  limits: Limites;
};

type PlanUso = {
  plan: Plan | null;
  usage: Uso;
};

/**
 * 031 — Pantalla «Plan y uso».
 *
 * `<main>` del cascarón es `overflow-hidden` sin padding, así que esta
 * pantalla —igual que Resultados y Agente— lleva SU propio encabezado y su
 * área con scroll y `p-4 sm:p-6`. Sin eso el contenido queda pegado al borde
 * y se corta al pasar la altura de la ventana.
 */
export function PlanUsoClient() {
  const [data, setData] = useState<PlanUso | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    void fetch("/api/plan-uso")
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          throw new Error(body?.error?.message ?? "No se pudo cargar el plan y uso.");
        }
        return (await response.json()) as PlanUso;
      })
      .then((result) => {
        if (vigente) setData(result);
      })
      .catch((cause: unknown) => {
        if (vigente) {
          setError(
            cause instanceof Error ? cause.message : "No se pudo cargar el plan y uso."
          );
        }
      });
    return () => {
      vigente = false;
    };
  }, []);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b px-4 py-3 sm:px-6 sm:py-4">
        <h1 className="text-[17px] font-bold tracking-tight">Plan y uso</h1>
        <p className="text-xs text-text-3">
          El plan que pone los límites de esta organización y cómo se está usando.
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {error ? (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        ) : !data ? (
          <p role="status" className="text-sm text-text-3">
            Cargando plan y uso…
          </p>
        ) : (
          <div className="max-w-3xl space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Plan asignado</CardTitle>
                <CardDescription>
                  El plan que establece los límites de esta organización.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.plan ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-semibold text-foreground">
                      {data.plan.name}
                    </span>
                    {data.plan.isFree && <Badge variant="secondary">Gratis</Badge>}
                    {!data.plan.active && <Badge variant="warning">Inactivo</Badge>}
                  </div>
                ) : (
                  <p className="text-sm font-medium text-foreground">Sin plan asignado</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Uso actual</CardTitle>
                <CardDescription>
                  Valores actuales frente al límite de cada recurso.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <UsoCliente uso={data.usage} limites={data.plan?.limits ?? null} />
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
