"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cerrarPrimerPago } from "@/lib/actions/payment-comprobante-actions";
import {
  faltanteTotal,
  puedeEditarAcuerdoPrimerPago,
  primerPagoCubierto,
  sumAbonos,
} from "@/lib/payments/primer-pago-progress";
import type { PagoRow, UserMotoCompraRow } from "@/lib/pipeline/types";
import { formatCop } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FrecuenciaPagoEditor } from "@/components/pipeline/frecuencia-pago-editor";
import { AcuerdoTable } from "@/components/pipeline/primer-pago/acuerdo-table";
import { CobroPrimerPagoDialog } from "@/components/pipeline/primer-pago/cobro-dialog";
import { PagoCompletoCard } from "@/components/pipeline/primer-pago/pago-completo-card";
import { PagosRecibidosList } from "@/components/pipeline/primer-pago/pagos-recibidos-list";
import { cn } from "@/lib/utils";

interface PrimerPagoPanelProps {
  compra: UserMotoCompraRow | null;
  pagos: PagoRow[];
  userId: number;
  referenciasUsadas?: string[];
  clienteNombre?: string;
  clienteCedula?: string;
}

export function PrimerPagoPanel({
  compra,
  pagos,
  userId,
  referenciasUsadas = [],
  clienteNombre = "Cliente",
  clienteCedula = "",
}: PrimerPagoPanelProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingClose, startClose] = useTransition();

  if (!compra) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Aún no hay selección de moto.
        </CardContent>
      </Card>
    );
  }

  if (compra.estado !== "pendiente_pago" && compra.estado !== "lista_retiro") {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Pagos confirmados. Estado: {compra.estado.replace("_", " ")}.
        </CardContent>
      </Card>
    );
  }

  const faltante = faltanteTotal(compra, pagos);
  const cubierto = primerPagoCubierto(compra, pagos);
  const canEdit = puedeEditarAcuerdoPrimerPago(compra);
  const completoEstado = compra.estado === "lista_retiro";
  const totalRecibido =
    sumAbonos(pagos, "inicial") +
    sumAbonos(pagos, "cuota_adelantada") +
    sumAbonos(pagos, "visita");

  function handleCerrar() {
    startClose(async () => {
      try {
        await cerrarPrimerPago({ userId, compraId: compra!.id });
        toast.success("Pago completo. Moto lista para retiro.");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo confirmar.");
      }
    });
  }

  return (
    <>
      {completoEstado && (
        <PagoCompletoCard
          totalRecibido={totalRecibido}
          onIrEntrega={() => {
            document
              .getElementById("pipeline-entrega")
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Primer pago · {clienteNombre}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {compra.modelo} · {compra.color}
          </p>
          <p
            className={cn(
              "mt-2 text-lg font-semibold tabular-nums",
              completoEstado || (cubierto && faltante === 0)
                ? "text-emerald-800"
                : "text-amber-950",
            )}
            role="status"
          >
            {completoEstado || (cubierto && compra.estado === "lista_retiro")
              ? "Pago completo"
              : faltante > 0
                ? `Faltan ${formatCop(faltante)}`
                : "Todo cubierto · confirma para avanzar"}
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <AcuerdoTable
            key={`${compra.cuota_inicial_monto}-${compra.monto_cuota_adelantada ?? 0}-${compra.monto_visita_monto}`}
            compra={compra}
            pagos={pagos}
            userId={userId}
            canEdit={canEdit}
          />

          <details className="rounded-lg border border-border">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
              Más opciones
            </summary>
            <div className="border-t border-border p-4">
              <FrecuenciaPagoEditor
                compra={compra}
                userId={userId}
                pagos={pagos}
              />
            </div>
          </details>

          <PagosRecibidosList
            compra={compra}
            pagos={pagos}
            userId={userId}
            canEdit={canEdit}
            clienteNombre={clienteNombre}
            clienteCedula={clienteCedula}
          />

          {!completoEstado && faltante > 0 && (
            <Button
              type="button"
              size="lg"
              className="w-full sm:w-auto"
              onClick={() => setDialogOpen(true)}
            >
              Cobrar {formatCop(faltante)}
            </Button>
          )}

          {!completoEstado && faltante === 0 && (
            <Button
              type="button"
              size="lg"
              className="w-full sm:w-auto"
              disabled={pendingClose}
              onClick={handleCerrar}
            >
              {pendingClose ? "Confirmando…" : "Confirmar pago completo"}
            </Button>
          )}
        </CardContent>
      </Card>

      <CobroPrimerPagoDialog
        key={dialogOpen ? `cobro-${compra.id}-${faltante}` : "cobro-closed"}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        compra={compra}
        pagos={pagos}
        userId={userId}
        referenciasUsadas={referenciasUsadas}
        clienteNombre={clienteNombre}
        clienteCedula={clienteCedula}
        onSuccess={() => router.refresh()}
      />
    </>
  );
}

/** Alias para no romper imports antiguos. */
export { PrimerPagoPanel as PaymentConfirmPanel };
