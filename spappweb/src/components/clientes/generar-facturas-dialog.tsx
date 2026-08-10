"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { fetchClienteFacturacion } from "@/lib/actions/cliente-facturacion-actions";
import {
  printCreditoFacturaReceipt,
  type FacturaConcepto,
} from "@/lib/printing/credito-factura-receipt";
import type { ClienteFacturacion } from "@/lib/pipeline/types";
import { CONTEXTO_PAGO_LABELS } from "@/lib/pipeline/types";
import { formatCop } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const CONCEPTOS: FacturaConcepto[] = [
  "inicial",
  "cuota_adelantada",
  "visita",
];

function montoConcepto(
  data: ClienteFacturacion,
  concepto: FacturaConcepto,
): number | null {
  if (concepto === "inicial") return data.cuotaInicial;
  if (concepto === "cuota_adelantada") return data.cuotaAdelantada;
  return data.montoVisita;
}

export function GenerarFacturasDialog({
  userId,
  displayName,
  open,
  onOpenChange,
}: {
  userId: number;
  displayName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ClienteFacturacion | null>(null);

  useEffect(() => {
    if (!open) {
      setData(null);
      return;
    }

    setLoading(true);
    fetchClienteFacturacion(userId)
      .then(setData)
      .catch((e) => {
        toast.error(
          e instanceof Error ? e.message : "No se pudieron cargar los montos.",
        );
        onOpenChange(false);
      })
      .finally(() => setLoading(false));
  }, [open, userId, onOpenChange]);

  function handlePrint(concepto: FacturaConcepto) {
    if (!data) return;
    const monto = montoConcepto(data, concepto);
    if (monto == null || monto <= 0) {
      toast.error("No hay monto registrado para este concepto.");
      return;
    }

    startTransition(async () => {
      try {
        await printCreditoFacturaReceipt({
          facturaId: crypto.randomUUID(),
          clienteNombre: data.clienteNombre,
          clienteCedula: data.clienteCedula,
          motoModelo: data.motoModelo,
          motoColor: data.motoColor,
          concepto,
          monto,
          emitidaAt: new Date().toISOString(),
        });
      } catch {
        toast.error("No se pudo abrir la impresión de la factura.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generar facturas</DialogTitle>
          <DialogDescription>
            {displayName} · montos desde la compra de moto asignada
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Cargando montos…
          </div>
        ) : !data?.compraId ? (
          <p className="py-4 text-sm text-muted-foreground">
            Este cliente aún no tiene moto asignada. Asigna la moto primero para
            obtener los valores de cuota inicial, adelantada y visita.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100 rounded-lg border border-border">
            {CONCEPTOS.map((concepto) => {
              const monto = montoConcepto(data, concepto);
              const disponible = monto != null && monto > 0;
              return (
                <li
                  key={concepto}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {CONTEXTO_PAGO_LABELS[concepto]}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {disponible ? formatCop(monto) : "Sin monto"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!disponible || pending}
                    onClick={() => handlePrint(concepto)}
                  >
                    <Printer className="mr-1.5 h-4 w-4" />
                    Imprimir
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        {data?.totalPrimerPago != null && data.totalPrimerPago > 0 && (
          <p className="text-sm text-muted-foreground">
            Total primer pago:{" "}
            <span className="font-medium">
              {formatCop(data.totalPrimerPago)}
            </span>
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
