"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatMoneyCents } from "@/lib/money";

type Plan = {
  id: string;
  name: string;
  slug: string;
  isFree: boolean;
  priceCents: number | null;
  maxContacts: number | null;
  maxMembers: number | null;
  maxChannels: number | null;
  maxConversationsMonth: number | null;
  active: boolean;
  createdAt: string;
};

/** Campo numérico editable: vacío = sin límite (`null`), nunca 0. */
const CAMPOS = [
  { key: "maxContacts", label: "Contactos" },
  { key: "maxMembers", label: "Miembros del equipo" },
  { key: "maxChannels", label: "Canales conectados" },
  { key: "maxConversationsMonth", label: "Conversaciones al mes" },
] as const;

type CampoKey = (typeof CAMPOS)[number]["key"];

function vacioAValor(raw: string): number | null {
  const limpio = raw.trim();
  if (limpio === "") return null;
  const n = Number(limpio);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function valorAVacio(v: number | null): string {
  return v === null ? "" : String(v);
}

/** 031 — Pantalla de Planes: crear, editar y desactivar. El Free siempre existe. */
export function PlanesClient({ currency }: { currency: string }) {
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [cargando, setCargando] = useState(true);
  const [nuevo, setNuevo] = useState({
    name: "",
    maxContacts: "",
    maxMembers: "",
    maxChannels: "",
    maxConversationsMonth: "",
  });
  const [creando, setCreando] = useState(false);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * Texto tal cual se teclea, por campo: `vacioAValor` devuelve `null` para
   * basura y eso vaciaría el input en mitad de escribir «12a» → borraría el
   * «12». El valor parseado viaja aparte; al salir del campo se guarda.
   */
  const [crudo, setCrudo] = useState<Record<string, string>>({});

  const refetch = useCallback(async () => {
    const res = await fetch("/api/admin/plans").catch(() => null);
    setCargando(false);
    if (!res?.ok) return;
    const data = (await res.json()) as { plans: Plan[] };
    setPlanes(data.plans);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function crear() {
    setCreando(true);
    setError(null);
    const res = await fetch("/api/admin/plans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: nuevo.name,
        maxContacts: vacioAValor(nuevo.maxContacts),
        maxMembers: vacioAValor(nuevo.maxMembers),
        maxChannels: vacioAValor(nuevo.maxChannels),
        maxConversationsMonth: vacioAValor(nuevo.maxConversationsMonth),
      }),
    }).catch(() => null);
    setCreando(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "No se pudo crear el plan");
      return;
    }
    setNuevo({
      name: "",
      maxContacts: "",
      maxMembers: "",
      maxChannels: "",
      maxConversationsMonth: "",
    });
    void refetch();
  }

  async function guardar(plan: Plan) {
    setError(null);
    const res = await fetch(`/api/admin/plans/${plan.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: plan.name,
        priceCents: plan.priceCents,
        maxContacts: plan.maxContacts,
        maxMembers: plan.maxMembers,
        maxChannels: plan.maxChannels,
        maxConversationsMonth: plan.maxConversationsMonth,
        active: plan.active,
      }),
    }).catch(() => null);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "No se pudo guardar el plan");
      return;
    }
    void refetch();
  }

  async function borrar(plan: Plan) {
    setBorrando(plan.id);
    setError(null);
    const res = await fetch(`/api/admin/plans/${plan.id}`, {
      method: "DELETE",
    }).catch(() => null);
    setBorrando(null);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "No se pudo borrar el plan");
      return;
    }
    void refetch();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Crear plan</CardTitle>
          <CardDescription>
            Un campo vacío significa «sin límite». El precio es de exhibición:
            aquí no se cobra nada.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-5">
            <div className="space-y-1.5">
              <Label htmlFor="plan-nombre">Nombre</Label>
              <Input
                id="plan-nombre"
                value={nuevo.name}
                onChange={(e) => setNuevo({ ...nuevo, name: e.target.value })}
              />
            </div>
            {CAMPOS.map((campo) => (
              <div key={campo.key} className="space-y-1.5">
                <Label htmlFor={`nuevo-${campo.key}`}>{campo.label}</Label>
                <Input
                  id={`nuevo-${campo.key}`}
                  inputMode="numeric"
                  placeholder="sin límite"
                  value={nuevo[campo.key]}
                  onChange={(e) =>
                    setNuevo({ ...nuevo, [campo.key]: e.target.value })
                  }
                />
              </div>
            ))}
          </div>
          <Button onClick={crear} disabled={creando || !nuevo.name.trim()}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            {creando ? "Creando…" : "Crear plan"}
          </Button>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-danger-text">{error}</p>}
      {cargando && <p className="text-sm text-text-3">Cargando…</p>}

      <div className="space-y-4">
        {planes.map((plan) => (
          <Card key={plan.id}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CardTitle>{plan.name}</CardTitle>
                  {plan.isFree && <Badge variant="secondary">Free</Badge>}
                  {!plan.active && (
                    <Badge variant="outline">desactivado</Badge>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-text-2">
                    Activo
                    <Switch
                      checked={plan.active}
                      onCheckedChange={(next) =>
                        guardar({ ...plan, active: next })
                      }
                      label={`Plan ${plan.name} activo`}
                    />
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={borrando === plan.id}
                    onClick={() => borrar(plan)}
                    aria-label={`Borrar plan ${plan.name}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </div>
              <CardDescription>
                Slug <span className="font-mono">{plan.slug}</span>
                {plan.priceCents !== null && (
                  <span>
                    {" · "}
                    {formatMoneyCents(plan.priceCents, currency)}/mes
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-5">
              <div className="space-y-1.5">
                <Label htmlFor={`${plan.id}-name`}>Nombre</Label>
                <Input
                  id={`${plan.id}-name`}
                  value={plan.name}
                  onChange={(e) =>
                    setPlanes(
                      planes.map((p) =>
                        p.id === plan.id ? { ...p, name: e.target.value } : p
                      )
                    )
                  }
                  onBlur={() => guardar(plan)}
                />
              </div>
              {CAMPOS.map((campo) => (
                <div key={campo.key} className="space-y-1.5">
                  <Label htmlFor={`${plan.id}-${campo.key}`}>{campo.label}</Label>
                  <Input
                    id={`${plan.id}-${campo.key}`}
                    inputMode="numeric"
                    placeholder="sin límite"
                    value={
                      crudo[`${plan.id}:${campo.key}`] ??
                      valorAVacio(plan[campo.key as CampoKey])
                    }
                    onChange={(e) => {
                      const texto = e.target.value;
                      setCrudo((prev) => ({
                        ...prev,
                        [`${plan.id}:${campo.key}`]: texto,
                      }));
                      setPlanes(
                        planes.map((p) =>
                          p.id === plan.id
                            ? { ...p, [campo.key]: vacioAValor(texto) }
                            : p
                        )
                      );
                    }}
                    onBlur={() => {
                      setCrudo((prev) => {
                        const copia = { ...prev };
                        delete copia[`${plan.id}:${campo.key}`];
                        return copia;
                      });
                      void guardar(plan);
                    }}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
