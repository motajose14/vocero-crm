"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UsoCliente, type Uso } from "@/components/admin/uso-cliente";

type PlanResumen = {
  id: string;
  name: string;
  isFree: boolean;
  limits: {
    maxContacts: number | null;
    maxMembers: number | null;
    maxChannels: number | null;
    maxConversationsMonth: number | null;
  };
};

type Cliente = {
  id: string;
  name: string;
  slug: string | null;
  createdAt: string;
  plan: PlanResumen | null;
  usage: Uso;
};

/** 031 — Lista de clientes del SaaS: plan asignado y uso contra el tope. */
export function ClientesClient() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [nombre, setNombre] = useState("");
  const [dueno, setDueno] = useState("");
  const [correo, setCorreo] = useState("");
  const [creando, setCreando] = useState(false);
  const [nuevo, setNuevo] = useState<{ email: string; password: string } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/admin/organizations").catch(() => null);
    setCargando(false);
    if (!res?.ok) return;
    const data = (await res.json()) as { organizations: Cliente[] };
    setClientes(data.organizations);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function crear() {
    setCreando(true);
    setError(null);
    setNuevo(null);
    const res = await fetch("/api/admin/organizations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: nombre, ownerName: dueno, ownerEmail: correo }),
    }).catch(() => null);
    setCreando(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "No se pudo crear el cliente");
      return;
    }
    const data = (await res.json()) as {
      owner: { email: string };
      password: string;
    };
    setNuevo({ email: data.owner.email, password: data.password });
    setNombre("");
    setDueno("");
    setCorreo("");
    void refetch();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Crear cliente</CardTitle>
          <CardDescription>
            Organización nueva con su pipeline sembrado y plan Free. La
            contraseña del dueño se genera aquí y se muestra UNA sola vez.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="cliente-nombre">Nombre del negocio</Label>
              <Input
                id="cliente-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cliente-dueno">Nombre del dueño</Label>
              <Input
                id="cliente-dueno"
                value={dueno}
                onChange={(e) => setDueno(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cliente-correo">Correo del dueño</Label>
              <Input
                id="cliente-correo"
                type="email"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
              />
            </div>
          </div>
          {error && <p className="text-sm text-danger-text">{error}</p>}
          {nuevo && (
            <div className="rounded-md border border-success-soft bg-success-tint p-3 text-sm">
              <p className="font-medium text-success-text">
                Cliente creado. Entrega esta contraseña al dueño: no vuelve a
                verse.
              </p>
              <p className="mt-1 font-mono text-foreground">
                {nuevo.email} · {nuevo.password}
              </p>
            </div>
          )}
          <Button
            onClick={crear}
            disabled={creando || !nombre || !dueno || !correo}
          >
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            {creando ? "Creando…" : "Crear cliente"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clientes</CardTitle>
          <CardDescription>
            Cada organización con su plan y el uso actual de los cuatro límites.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cargando && (
            <p className="text-sm text-text-3">Cargando…</p>
          )}
          {!cargando && clientes.length === 0 && (
            <EmptyState
              icon={Building2}
              title="Aún no hay clientes"
              description="Crea el primero arriba: su dueño recibe correo y contraseña para entrar."
            />
          )}
          <ul className="divide-y divide-border">
            {clientes.map((cliente) => (
              <li key={cliente.id} className="py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/admin/clientes/${cliente.id}`}
                    className="text-sm font-semibold text-foreground underline-offset-4 hover:underline"
                  >
                    {cliente.name}
                  </Link>
                  {cliente.plan ? (
                    <Badge variant={cliente.plan.isFree ? "secondary" : "default"}>
                      {cliente.plan.name}
                    </Badge>
                  ) : (
                    <Badge variant="outline">sin plan</Badge>
                  )}
                </div>
                <div className="mt-2">
                  <UsoCliente uso={cliente.usage} limites={cliente.plan?.limits ?? null} />
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
