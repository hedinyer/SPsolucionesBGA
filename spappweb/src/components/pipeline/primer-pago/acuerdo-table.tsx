"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateAcuerdoPrimerPago } from "@/lib/actions/payment-comprobante-actions";
import {
  conceptoCompleto,
  faltanteConcepto,
  montoEsperadoConcepto,
  sumAbonos,
  type PrimerPagoConcepto,
} from "@/lib/payments/primer-pago-progress";
import type { PagoRow, UserMotoCompraRow } from "@/lib/pipeline/types";
import { CONTEXTO_PAGO_LABELS } from "@/lib/pipeline/types";
import { formatCop } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";

const CONCEPTOS: PrimerPagoConcepto[] = [
  "inicial",
  "cuota_adelantada",
  "visita",
];

export function AcuerdoTable({
  compra,
  pagos,
  userId,
  canEdit,
}: {
  compra: UserMotoCompraRow;
  pagos: PagoRow[];
  userId: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<PrimerPagoConcepto | null>(null);
  const [draftInicial, setDraftInicial] = useState<number | null>(
    compra.cuota_inicial_monto,
  );
  const [draftAdelantada, setDraftAdelantada] = useState<number | null>(
    compra.monto_cuota_adelantada ?? 0,
  );
  const [draftVisita, setDraftVisita] = useState<number | null>(
    compra.monto_visita_monto ?? 0,
  );
  const [error, setError] = useState<string | null>(null);

  function draftFor(contexto: PrimerPagoConcepto): number | null {
    if (contexto === "inicial") return draftInicial;
    if (contexto === "cuota_adelantada") return draftAdelantada;
    return draftVisita;
  }

  function setDraft(contexto: PrimerPagoConcepto, value: number | null) {
    if (contexto === "inicial") setDraftInicial(value);
    else if (contexto === "cuota_adelantada") setDraftAdelantada(value);
    else setDraftVisita(value);
  }

  function cancelEdit() {
    setDraftInicial(compra.cuota_inicial_monto);
    setDraftAdelantada(compra.monto_cuota_adelantada ?? 0);
    setDraftVisita(compra.monto_visita_monto ?? 0);
    setEditing(null);
    setError(null);
  }

  function save() {
    const cuotaInicial = draftInicial ?? 0;
    const montoCuotaAdelantada = draftAdelantada ?? 0;
    const montoVisita = draftVisita ?? 0;

    if (cuotaInicial < 0 || montoCuotaAdelantada < 0 || montoVisita < 0) {
      setError("Los montos no pueden ser negativos.");
      return;
    }

    startTransition(async () => {
      try {
        await updateAcuerdoPrimerPago({
          userId,
          compraId: compra.id,
          cuotaInicial,
          montoCuotaAdelantada,
          montoVisita,
        });
        toast.success("Acuerdo actualizado.");
        setEditing(null);
        setError(null);
        router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "No se pudo guardar.";
        setError(msg);
        toast.error(msg);
      }
    });
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="border-b border-border bg-muted/40 px-4 py-3">
        <h3 className="text-sm font-medium">Acuerdo con el cliente</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Montos desde $0. Cámbialos si negociaron otro valor.
        </p>
      </div>
      <ul className="divide-y divide-border">
        {CONCEPTOS.map((contexto) => {
          const esperado = montoEsperadoConcepto(compra, contexto);
          const recibido = sumAbonos(pagos, contexto);
          const faltante = faltanteConcepto(compra, pagos, contexto);
          const completo = conceptoCompleto(compra, pagos, contexto);
          const isEditing = editing === contexto;

          return (
            <li key={contexto} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{CONTEXTO_PAGO_LABELS[contexto]}</p>
                {isEditing ? (
                  <div className="mt-2 flex max-w-xs flex-col gap-1.5">
                    <Label htmlFor={`acuerdo-${contexto}`}>Acordado (COP)</Label>
                    <CurrencyInput
                      id={`acuerdo-${contexto}`}
                      value={draftFor(contexto)}
                      onValueChange={(v) => setDraft(contexto, v)}
                      min={0}
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? "acuerdo-error" : undefined}
                      disabled={pending}
                    />
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Acordado {formatCop(esperado)}
                    {" · "}
                    recibido {formatCop(recibido)}
                    {!completo && faltante > 0
                      ? ` · faltan ${formatCop(faltante)}`
                      : ""}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {completo ? (
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-900">
                    {esperado > 0 ? "Cubierto" : "Sin cobro"}
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-950">
                    Pendiente
                  </span>
                )}
                {canEdit &&
                  (isEditing ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={cancelEdit}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={pending}
                        onClick={save}
                      >
                        {pending ? "Guardando…" : "Guardar"}
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending || editing != null}
                      onClick={() => setEditing(contexto)}
                    >
                      Cambiar
                    </Button>
                  ))}
              </div>
            </li>
          );
        })}
      </ul>
      {error && (
        <p id="acuerdo-error" className="border-t border-border px-4 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
