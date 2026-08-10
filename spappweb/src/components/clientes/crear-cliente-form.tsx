"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { createClientUser } from "@/lib/actions/admin-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CrearClienteForm() {
  const [cedula, setCedula] = useState("");
  const [createdUserId, setCreatedUserId] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit() {
    const trimmed = cedula.trim();
    if (!trimmed) {
      toast.error("Ingresa la cédula del cliente.");
      return;
    }

    startTransition(async () => {
      try {
        const result = await createClientUser({ cedula: trimmed });
        setCreatedUserId(result.userId);
        setCedula("");
        toast.success(`Cliente creado. Usuario y contraseña: ${result.username}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo crear el cliente.");
      }
    });
  }

  return (
    <div className="max-w-md flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="cedula">Cédula del cliente</Label>
        <Input
          id="cedula"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="Ej. 1234567890"
          value={cedula}
          onChange={(e) => setCedula(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmit();
          }}
          disabled={pending}
        />
        <p className="text-sm text-muted-foreground">
          Se creará un usuario con esa cédula como usuario y contraseña, con
          estado normal.
        </p>
      </div>

      <Button
        className="min-h-11 w-full sm:w-auto"
        disabled={pending || cedula.trim().length < 5}
        onClick={onSubmit}
      >
        {pending ? "Creando…" : "Crear cliente"}
      </Button>

      {createdUserId && (
        <p className="text-sm text-muted-foreground">
          Último cliente creado:{" "}
          <Link
            href={`/clientes/${createdUserId}`}
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            Ver ficha
          </Link>
        </p>
      )}
    </div>
  );
}
