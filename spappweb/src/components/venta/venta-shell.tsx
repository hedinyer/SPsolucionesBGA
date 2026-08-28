"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, Unlock } from "lucide-react";
import type { CajaSesionState } from "@/lib/actions/caja-actions";
import {
  CajaArqueoDialog,
  CajaCerrarDialog,
} from "@/components/caja/caja-cerrar-dialog";
import { VentaManager } from "@/components/venta/venta-manager";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function VentaShell({
  initialSesion,
}: {
  initialSesion: CajaSesionState | null;
}) {
  const router = useRouter();
  const [sesion, setSesion] = useState(initialSesion);
  const [cerrarOpen, setCerrarOpen] = useState(false);
  const [arqueoOpen, setArqueoOpen] = useState(false);

  useEffect(() => {
    setSesion(initialSesion);
  }, [initialSesion]);

  const cajaAbierta = Boolean(sesion?.abierta);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Vender"
        description="Busca el producto, arma el carrito y cobra."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {cajaAbierta ? (
              <Badge
                variant="outline"
                className="min-h-9 border-green-300 px-3 text-green-700"
              >
                <Unlock className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Caja abierta
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="min-h-9 border-amber-300 px-3 text-amber-800"
              >
                <Lock className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Caja cerrada
              </Badge>
            )}
            {cajaAbierta ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-11 gap-2"
                onClick={() => setCerrarOpen(true)}
              >
                <Lock className="h-4 w-4" aria-hidden="true" />
                Cerrar caja
              </Button>
            ) : null}
          </div>
        }
      />

      {!cajaAbierta ? (
        <div
          role="status"
          className="flex flex-col gap-3 rounded-xl border border-amber-300/80 bg-amber-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="text-base font-semibold text-amber-950">
              Caja aún no abierta
            </p>
            <p className="text-sm text-amber-900/90 text-pretty">
              Abre la caja con el efectivo inicial para poder cobrar ventas.
            </p>
          </div>
          <Button
            asChild
            className="min-h-11 shrink-0 bg-amber-600 text-white hover:bg-amber-700"
          >
            <Link href="/caja">Abrir caja</Link>
          </Button>
        </div>
      ) : null}

      <VentaManager cajaAbierta={cajaAbierta} />

      <CajaCerrarDialog
        open={cerrarOpen}
        onOpenChange={setCerrarOpen}
        sesion={sesion}
        onClosed={(state) => {
          setSesion(state);
          setArqueoOpen(true);
          router.refresh();
        }}
      />
      <CajaArqueoDialog
        open={arqueoOpen}
        onOpenChange={setArqueoOpen}
        sesion={sesion}
      />
    </div>
  );
}
