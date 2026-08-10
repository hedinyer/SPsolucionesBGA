"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { updateFrecuenciaPagoCompra } from "@/lib/actions/payment-comprobante-actions";
import {
  calcMotoPayment,
  cuotaDiariaFromPeriodo,
  FRECUENCIA_PERIOD,
} from "@/lib/moto-payment";
import { puedeEditarFrecuenciaPago } from "@/lib/payments/primer-pago-progress";
import type {
  FrecuenciaPago,
  PagoRow,
  UserMotoCompraRow,
} from "@/lib/pipeline/types";
import { FRECUENCIA_LABELS } from "@/lib/pipeline/types";
import { formatCop } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TouchSelect } from "@/components/ui/touch-select";

const FRECUENCIAS: FrecuenciaPago[] = [
  "diario",
  "semanal",
  "quincenal",
  "mensual",
];

interface FrecuenciaPagoEditorProps {
  compra: UserMotoCompraRow;
  userId: number;
  pagos?: PagoRow[];
  compact?: boolean;
}

export function FrecuenciaPagoEditor({
  compra,
  userId,
  pagos = [],
  compact = false,
}: FrecuenciaPagoEditorProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [frecuencia, setFrecuencia] = useState<FrecuenciaPago>(
    compra.frecuencia_pago,
  );

  useEffect(() => {
    setFrecuencia(compra.frecuencia_pago);
  }, [compra.frecuencia_pago]);

  if (!puedeEditarFrecuenciaPago(compra, pagos)) {
    return (
      <p className="text-sm font-medium">
        {FRECUENCIA_LABELS[compra.frecuencia_pago]}
      </p>
    );
  }

  const cuotaDiaria = cuotaDiariaFromPeriodo(
    compra.monto_cuota_periodo,
    compra.frecuencia_pago,
  );
  const preview =
    frecuencia !== compra.frecuencia_pago
      ? calcMotoPayment(
          {
            cuota_inicial: compra.cuota_inicial_monto,
            cuota_diaria: cuotaDiaria,
            monto_visita: compra.monto_visita_monto,
          },
          frecuencia,
        )
      : null;

  function handleSave() {
    if (frecuencia === compra.frecuencia_pago) return;

    startTransition(async () => {
      try {
        await updateFrecuenciaPagoCompra({
          userId,
          compraId: compra.id,
          frecuencia,
        });
        toast.success("Frecuencia de pago actualizada.");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
      }
    });
  }

  if (compact) {
    return (
      <div className="flex flex-col gap-2">
        <TouchSelect
          aria-label="Frecuencia de pago"
          value={frecuencia}
          onChange={(v) => setFrecuencia(v as FrecuenciaPago)}
          options={FRECUENCIAS.map((f) => ({
            value: f,
            label: FRECUENCIA_LABELS[f],
          }))}
        />
        {preview && (
          <p className="text-xs text-muted-foreground">
            Nueva cuota adelantada: {formatCop(preview.monto_cuota_periodo)} ·
            total primer pago: {formatCop(preview.monto_total_primer_pago)}
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || frecuencia === compra.frecuencia_pago}
          onClick={handleSave}
        >
          {pending ? "Guardando…" : "Guardar frecuencia"}
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
      <p className="text-sm font-medium text-amber-950">Frecuencia de pago</p>
      <p className="mt-1 text-xs text-amber-900/80">
        Corrige si se registró mal. Se mantiene la cuota diaria acordada (
        {formatCop(cuotaDiaria)}/día) y se recalcula la cuota adelantada.
      </p>
      <div className="mt-3 flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="frecuencia-pago-compra">Modalidad</Label>
          <TouchSelect
            aria-label="Frecuencia de pago"
            value={frecuencia}
            onChange={(v) => setFrecuencia(v as FrecuenciaPago)}
            options={FRECUENCIAS.map((f) => ({
              value: f,
              label: `${FRECUENCIA_LABELS[f]} · ${FRECUENCIA_PERIOD[f]}`,
            }))}
          />
        </div>
        {preview && (
          <p className="text-sm text-amber-900">
            Cuota adelantada: {formatCop(compra.monto_cuota_periodo)} →{" "}
            <span className="font-medium">
              {formatCop(preview.monto_cuota_periodo)}
            </span>
            {" · "}
            Total primer pago: {formatCop(compra.monto_total_primer_pago)} →{" "}
            <span className="font-semibold">
              {formatCop(preview.monto_total_primer_pago)}
            </span>
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || frecuencia === compra.frecuencia_pago}
          onClick={handleSave}
        >
          {pending ? "Guardando…" : "Guardar frecuencia"}
        </Button>
      </div>
    </div>
  );
}
