"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { UsoCliente, type Uso, type Limites } from "@/components/admin/uso-cliente";

type Plan = {
  id: string;
  name: string;
  isFree: boolean;
  priceCents: number | null;
  active: boolean;
  limits: Limites;
};

type Detalle = {
  organization: { id: string; name: string; slug: string | null; createdAt: string };
  plan: Plan | null;
  usage: Uso;
  owner: { name: string; email: string } | null;
};

/**
 * 031 — Detalle de un cliente: su uso y el plan asignado.
 *
 * `planId` vacío (sin plan) es una opción válida y visible: es la
 * compatibilidad con instalaciones que ya existían antes del SaaS, que quedan
 * sin límites hasta que el superadmin decida lo contrario.
 */
export function ClienteClient({ orgId }: { orgId: string }) {
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [planId, setPlanId] = useState<string>("__sin_plan__");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const refetch = useCallback(async () => {
    const [res, resPlanes] = await Promise.all([
      fetch(`/api/admin/organizations/${orgId}`).catch(() => null),
      fetch("/api/admin/plans").catch(() => null),
    ]);
    if (res?.ok) {
      const data = (await res.json()) as Detalle;
      setDetalle(data);
      setPlanId(data.plan?.id ?? "__sin_plan__");
    }
    if (resPlanes?.ok) {
      const data = (await resPlanes.json()) as { plans: Plan[] };
      setPlanes(data.plans);
    }
  }, [orgId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function guardar() {
    setGuardando(true);
    setError(null);
    setOk(false);
    const body = planId === "__sin_plan__" ? null : planId;
    const res = await fetch(`/api/admin/organizations/${orgId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId: body }),
    }).catch(() => null);
    setGuardando(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "No se pudo guardar el plan");
      return;
    }
    setOk(true);
    void refetch();
  }

  if (!detalle) return <p className="text-sm text-text-3">Cargando…</p>;

  return (
    <div className="space-y-6">
      <Link
        href="/admin/clientes"
        className="inline-flex items-center gap-1.5 text-sm text-text-2 hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Clientes
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-foreground">
          {detalle.organization.name}
        </h1>
        {detalle.plan ? (
          <Badge variant={detalle.plan.isFree ? "secondary" : "default"}>
            {detalle.plan.name}
          </Badge>
        ) : (
          <Badge variant="outline">sin plan</Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Uso actual</CardTitle>
          <CardDescription>
            {detalle.owner
              ? `Dueño: ${detalle.owner.name} · ${detalle.owner.email}`
              : "Esta organización no tiene dueño registrado."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UsoCliente uso={detalle.usage} limites={detalle.plan?.limits ?? null} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plan asignado</CardTitle>
          <CardDescription>
            Cambiar el plan no borra nada: las conversaciones que quedaron
            bloqueadas se liberan solas en el primer envío cuando hay margen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-sm space-y-1.5">
            <Label htmlFor="plan-select">Plan</Label>
            <select
              id="plan-select"
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
            >
              <option value="__sin_plan__">Sin plan (sin límites)</option>
              {planes.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                  {plan.active ? "" : " (desactivado)"}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-danger-text">{error}</p>}
          {ok && (
            <p className="text-sm text-success-text">Plan guardado.</p>
          )}
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar plan"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
