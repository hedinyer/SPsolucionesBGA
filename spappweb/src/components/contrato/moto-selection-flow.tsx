"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  FlowProgress,
  PrimaryAction,
  SecondaryAction,
  StepCard,
  StickyActions,
} from "@/components/hojadevida/flow-shell";
import { selectMotoFromContract } from "@/lib/actions/moto-compra-actions";
import {
  calcMotoPayment,
  FRECUENCIA_PERIOD,
  montoCuotaPeriodo,
} from "@/lib/moto-payment";
import type {
  BikeRow,
  FrecuenciaPago,
  GarajeMotoRow,
} from "@/lib/pipeline/types";
import { FRECUENCIA_LABELS, GARAJE_CONDICION_LABELS } from "@/lib/pipeline/types";
import { formatCop } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

const STEPS = ["Catálogo", "Frecuencia", "Confirmar"];
const FRECUENCIAS: FrecuenciaPago[] = [
  "diario",
  "semanal",
  "quincenal",
  "mensual",
];

type CatalogPick =
  | { kind: "bike"; bike: BikeRow }
  | { kind: "garaje"; moto: GarajeMotoRow };

function pickPayment(pick: CatalogPick, frecuencia: FrecuenciaPago) {
  if (pick.kind === "bike") return calcMotoPayment(pick.bike, frecuencia);
  return calcMotoPayment(
    {
      cuota_inicial: pick.moto.cuota_inicial!,
      cuota_diaria: pick.moto.cuota_diaria!,
      monto_visita: pick.moto.monto_visita ?? 0,
    },
    frecuencia,
  );
}

function pickLabel(pick: CatalogPick) {
  if (pick.kind === "bike") {
    return { modelo: pick.bike.modelo, color: pick.bike.color };
  }
  return { modelo: pick.moto.modelo, color: pick.moto.color };
}

interface MotoSelectionFlowProps {
  contractId: string;
  bikes: BikeRow[];
  garajeMotos?: GarajeMotoRow[];
}

export function MotoSelectionFlow({
  contractId,
  bikes,
  garajeMotos = [],
}: MotoSelectionFlowProps) {
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<CatalogPick | null>(null);
  const [frecuencia, setFrecuencia] = useState<FrecuenciaPago>("semanal");
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const payment =
    selected != null ? pickPayment(selected, frecuencia) : null;
  const label = selected ? pickLabel(selected) : null;
  const cuotaDiaria =
    selected?.kind === "bike"
      ? selected.bike.cuota_diaria
      : selected?.moto.cuota_diaria ?? 0;

  function next() {
    if (step === 0 && !selected) {
      toast.error("Selecciona una moto para continuar.");
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function back() {
    setStep((s) => Math.max(s - 1, 0));
  }

  function submit() {
    if (!selected) return;
    startTransition(async () => {
      try {
        await selectMotoFromContract({
          contractId,
          frecuencia,
          ...(selected.kind === "bike"
            ? { bikeId: selected.bike.id }
            : { garajeMotoId: selected.moto.id }),
        });
        setDone(true);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo confirmar.");
      }
    });
  }

  if (done && selected && payment && label) {
    return (
      <div className="flex flex-col items-center rounded-2xl border-2 border-green-500 bg-green-50 p-8 text-center">
        <CheckCircle2 className="h-16 w-16 text-green-600" strokeWidth={1.5} />
        <h2 className="mt-4 text-2xl font-bold text-foreground">¡Moto elegida!</h2>
        <p className="mt-3 text-base leading-relaxed text-foreground">
          {label.modelo} · {label.color}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Frecuencia {FRECUENCIA_LABELS[frecuencia].toLowerCase()} · Total primer
          pago: {formatCop(payment.monto_total_primer_pago)}
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          Tu asesor te indicará cómo realizar el pago.
        </p>
      </div>
    );
  }

  const grouped = bikes.reduce<Record<string, BikeRow[]>>((acc, bike) => {
    (acc[bike.modelo] ??= []).push(bike);
    return acc;
  }, {});

  const hasAny = bikes.length > 0 || garajeMotos.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <FlowProgress step={step + 1} total={STEPS.length} title="Elige tu moto" />

      {step === 0 && (
        <StepCard
          title="Selecciona modelo y color"
          instruction="Catálogo nuevo y motos recuperadas disponibles a crédito."
        >
          {!hasAny ? (
            <p className="text-center text-sm text-muted-foreground">
              No hay motos disponibles en este momento.
            </p>
          ) : (
            <>
              {Object.entries(grouped).map(([modelo, variants]) => (
                <div key={modelo}>
                  <p className="mb-2 text-sm font-semibold">{modelo}</p>
                  <div className="flex flex-wrap gap-2">
                    {variants.map((bike) => (
                      <button
                        key={bike.id}
                        type="button"
                        onClick={() =>
                          setSelected({ kind: "bike", bike })
                        }
                        className={cn(
                          "w-[calc(50%-0.25rem)] min-w-[140px] rounded-xl border p-2 text-left transition-colors",
                          selected?.kind === "bike" &&
                            selected.bike.id === bike.id
                            ? "border-primary ring-2 ring-primary/15"
                            : "border-border",
                        )}
                      >
                        <div className="relative mb-2 h-20 w-full overflow-hidden rounded-lg bg-muted">
                          {bike.imagen_url ? (
                            <Image
                              src={bike.imagen_url}
                              alt={`${bike.modelo} ${bike.color}`}
                              fill
                              className="object-cover"
                              sizes="160px"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                              Sin foto
                            </div>
                          )}
                        </div>
                        <p className="text-sm font-semibold">{bike.color}</p>
                        <p className="text-xs text-muted-foreground">
                          Stock: {bike.stock}
                        </p>
                        <p className="text-xs font-medium text-foreground">
                          Inicial {formatCop(bike.cuota_inicial)}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {garajeMotos.length > 0 ? (
                <div className="mt-4">
                  <p className="mb-2 text-sm font-semibold">
                    Recuperadas / segunda mano
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {garajeMotos.map((moto) => (
                      <button
                        key={moto.id}
                        type="button"
                        onClick={() =>
                          setSelected({ kind: "garaje", moto })
                        }
                        className={cn(
                          "w-[calc(50%-0.25rem)] min-w-[140px] rounded-xl border p-2 text-left transition-colors",
                          selected?.kind === "garaje" &&
                            selected.moto.id === moto.id
                            ? "border-primary ring-2 ring-primary/15"
                            : "border-border",
                        )}
                      >
                        <div className="mb-2 flex h-20 w-full items-center justify-center rounded-lg bg-amber-50 text-xs text-amber-800">
                          {GARAJE_CONDICION_LABELS[moto.condicion]}
                        </div>
                        <p className="text-sm font-semibold">{moto.modelo}</p>
                        <p className="text-xs text-muted-foreground">{moto.color}</p>
                        {moto.placa ? (
                          <p className="text-xs text-muted-foreground">
                            Placa {moto.placa}
                          </p>
                        ) : null}
                        <p className="text-xs font-medium text-foreground">
                          Inicial {formatCop(moto.cuota_inicial ?? 0)}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </StepCard>
      )}

      {step === 1 && selected && label && (
        <StepCard
          title="Frecuencia de pago"
          instruction={`${label.modelo} · ${label.color}`}
          help="Los pagos semanal, quincenal y mensual se cancelan por adelantado. Tu primer pago incluye la cuota inicial más el periodo adelantado que elijas."
        >
          {FRECUENCIAS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFrecuencia(f)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left",
                frecuencia === f
                  ? "border-primary bg-muted/50"
                  : "border-border",
              )}
            >
              <span
                className={cn(
                  "size-4 shrink-0 rounded-full border-2",
                  frecuencia === f
                    ? "border-primary bg-primary"
                    : "border-border",
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{FRECUENCIA_LABELS[f]}</p>
                <p className="text-sm text-muted-foreground">{FRECUENCIA_PERIOD[f]}</p>
              </div>
              <p className="shrink-0 font-semibold">
                {formatCop(montoCuotaPeriodo(cuotaDiaria, f))}
              </p>
            </button>
          ))}
        </StepCard>
      )}

      {step === 2 && selected && payment && label && (
        <StepCard title="Resumen de tu selección">
          <SummaryRow label="Modelo" value={label.modelo} />
          <SummaryRow label="Color" value={label.color} />
          {selected.kind === "garaje" ? (
            <SummaryRow
              label="Origen"
              value={GARAJE_CONDICION_LABELS[selected.moto.condicion]}
            />
          ) : null}
          <SummaryRow label="Frecuencia" value={FRECUENCIA_LABELS[frecuencia]} />
          <SummaryRow
            label="Cuota inicial"
            value={formatCop(payment.cuota_inicial_monto)}
          />
          <SummaryRow
            label={`Cuota ${FRECUENCIA_LABELS[frecuencia].toLowerCase()} (adelantada)`}
            value={formatCop(payment.monto_cuota_periodo)}
          />
          <div className="rounded-xl bg-primary px-4 py-4 text-primary-foreground">
            <p className="text-sm opacity-85">Total a pagar ahora</p>
            <p className="text-2xl font-bold">
              {formatCop(payment.monto_total_primer_pago)}
            </p>
          </div>
        </StepCard>
      )}

      <StickyActions
        primary={
          step === STEPS.length - 1 ? (
            <PrimaryAction onClick={submit} disabled={pending}>
              {pending ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" /> Confirmando…
                </span>
              ) : (
                "Confirmar selección"
              )}
            </PrimaryAction>
          ) : (
            <PrimaryAction onClick={next} disabled={step === 0 && !hasAny}>
              Continuar
            </PrimaryAction>
          )
        }
        secondary={
          step > 0 && !pending ? (
            <SecondaryAction onClick={back}>Atrás</SecondaryAction>
          ) : undefined
        }
      />
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
