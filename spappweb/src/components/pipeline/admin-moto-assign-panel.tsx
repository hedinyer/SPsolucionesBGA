"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { assignMotoByAdmin } from "@/lib/actions/admin-actions";
import {
  calcMotoPayment,
  cuotaDiariaFromPeriodo,
  MIN_CUOTA_INICIAL,
} from "@/lib/moto-payment";
import { MONTO_VISITA_DEFAULT } from "@/lib/payments/visita-monto";
import type { BikeRow, FrecuenciaPago, UserMotoCompraRow } from "@/lib/pipeline/types";
import { FRECUENCIA_LABELS } from "@/lib/pipeline/types";
import { formatCop } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TouchSelect } from "@/components/ui/touch-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AdminMotoAssignPanelProps {
  compra: UserMotoCompraRow | null;
  bikes: BikeRow[];
  userId: number;
  documentId: number;
}

const FRECUENCIAS: FrecuenciaPago[] = [
  "diario",
  "semanal",
  "quincenal",
  "mensual",
];

export function AdminMotoAssignPanel({
  compra,
  bikes,
  userId,
  documentId,
}: AdminMotoAssignPanelProps) {
  const [pending, startTransition] = useTransition();
  const [bikeId, setBikeId] = useState(
    compra?.bike_id ? String(compra.bike_id) : "",
  );
  const [frecuencia, setFrecuencia] = useState<FrecuenciaPago>(
    compra?.frecuencia_pago ?? "semanal",
  );
  const [cuotaInicial, setCuotaInicial] = useState("");
  const [cuotaDiaria, setCuotaDiaria] = useState("");
  const [montoVisita, setMontoVisita] = useState("");

  const activeBikes = bikes.filter((b) => b.activo);
  const selectedBike = activeBikes.find((b) => String(b.id) === bikeId);

  useEffect(() => {
    if (!selectedBike) return;
    if (compra && String(compra.bike_id) === bikeId) {
      setCuotaInicial(String(compra.cuota_inicial_monto));
      setCuotaDiaria(
        String(
          cuotaDiariaFromPeriodo(
            compra.monto_cuota_periodo,
            compra.frecuencia_pago,
          ),
        ),
      );
      setMontoVisita(String(compra.monto_visita_monto));
      return;
    }
    setCuotaInicial(String(selectedBike.cuota_inicial));
    setCuotaDiaria(String(selectedBike.cuota_diaria));
    setMontoVisita(String(selectedBike.monto_visita ?? MONTO_VISITA_DEFAULT));
  }, [bikeId, selectedBike, compra]);

  const parsedInicial = Number(cuotaInicial);
  const parsedDiaria = Number(cuotaDiaria);
  const parsedVisita = Number(montoVisita);
  const paymentPreview =
    selectedBike &&
    Number.isFinite(parsedInicial) &&
    Number.isFinite(parsedDiaria) &&
    Number.isFinite(parsedVisita) &&
    parsedDiaria > 0 &&
    parsedVisita >= 0
      ? calcMotoPayment(selectedBike, frecuencia, {
          cuotaInicial: parsedInicial,
          cuotaDiaria: parsedDiaria,
          montoVisita: parsedVisita,
        })
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Asignar moto y placa</CardTitle>
        <p className="text-sm text-muted-foreground">
          Elige la moto, negocia cuotas si el cliente paga más inicial o acordaron
          otra cuota diaria, y registra el chasis.
        </p>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const parsedBikeId = Number(bikeId);
            if (!Number.isFinite(parsedBikeId) || parsedBikeId <= 0) {
              toast.error("Selecciona una moto.");
              return;
            }
            if (!Number.isFinite(parsedInicial) || parsedInicial < MIN_CUOTA_INICIAL) {
              toast.error(
                `La cuota inicial mínima es ${formatCop(MIN_CUOTA_INICIAL)}.`,
              );
              return;
            }
            if (!Number.isFinite(parsedDiaria) || parsedDiaria <= 0) {
              toast.error("Indica una cuota diaria válida.");
              return;
            }
            if (!Number.isFinite(parsedVisita) || parsedVisita < 0) {
              toast.error("Indica un monto de visita válido.");
              return;
            }
            startTransition(async () => {
              try {
                await assignMotoByAdmin({
                  userId,
                  documentId,
                  bikeId: parsedBikeId,
                  frecuencia,
                  placa: String(fd.get("placa") || "").trim() || undefined,
                  chasis: String(fd.get("chasis")),
                  referencia: String(fd.get("referencia") || "") || undefined,
                  cuotaInicial: parsedInicial,
                  cuotaDiaria: parsedDiaria,
                  montoVisita: parsedVisita,
                });
                toast.success("Moto asignada. Envía el link de contrato al cliente.");
              } catch (err) {
                toast.error(
                  err instanceof Error ? err.message : "Error al guardar.",
                );
              }
            });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label>Moto (modelo · color)</Label>
              <TouchSelect
                aria-label="Moto"
                value={bikeId}
                onChange={setBikeId}
                placeholder="Seleccionar moto"
                options={activeBikes.map((b) => ({
                  value: String(b.id),
                  label: `${b.modelo} · ${b.color} (stock ${b.stock})`,
                }))}
              />
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label>Frecuencia de pago</Label>
              <TouchSelect
                aria-label="Frecuencia"
                value={frecuencia}
                onChange={(v) => setFrecuencia(v as FrecuenciaPago)}
                options={FRECUENCIAS.map((f) => ({
                  value: f,
                  label: FRECUENCIA_LABELS[f],
                }))}
              />
            </div>
            {selectedBike && (
              <>
                <div className="sm:col-span-2 rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
                  Catálogo: inicial {formatCop(selectedBike.cuota_inicial)} ·{" "}
                  {formatCop(selectedBike.cuota_diaria)}/día · visita{" "}
                  {formatCop(selectedBike.monto_visita ?? MONTO_VISITA_DEFAULT)}
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="cuota-inicial">Cuota inicial negociada</Label>
                  <Input
                    id="cuota-inicial"
                    inputMode="numeric"
                    value={cuotaInicial}
                    onChange={(e) => setCuotaInicial(e.target.value)}
                    placeholder={String(selectedBike.cuota_inicial)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Mínimo {formatCop(MIN_CUOTA_INICIAL)}. Puede ser mayor si el
                    cliente aporta más inicial.
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="cuota-diaria">Cuota diaria negociada</Label>
                  <Input
                    id="cuota-diaria"
                    inputMode="numeric"
                    value={cuotaDiaria}
                    onChange={(e) => setCuotaDiaria(e.target.value)}
                    placeholder={String(selectedBike.cuota_diaria)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Base diaria acordada en persona (afecta la cuota adelantada
                    según frecuencia).
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="monto-visita">Monto visita domiciliaria</Label>
                  <Input
                    id="monto-visita"
                    inputMode="numeric"
                    value={montoVisita}
                    onChange={(e) => setMontoVisita(e.target.value)}
                    placeholder={String(selectedBike.monto_visita ?? MONTO_VISITA_DEFAULT)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Valor de la visita al domicilio (catálogo o negociado).
                  </p>
                </div>
                {paymentPreview && (
                  <div className="sm:col-span-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
                    <p className="font-medium text-emerald-900">
                      Primer pago acordado
                    </p>
                    <p className="mt-1 text-emerald-800">
                      Inicial {formatCop(paymentPreview.cuota_inicial_monto)} +{" "}
                      adelantada {formatCop(paymentPreview.monto_cuota_periodo)}
                      {paymentPreview.monto_visita_monto > 0 && (
                        <> + visita {formatCop(paymentPreview.monto_visita_monto)}</>
                      )}{" "}
                      ({formatCop(parsedDiaria)}/día ×{" "}
                      {FRECUENCIA_LABELS[frecuencia].toLowerCase()}) ={" "}
                      <span className="font-semibold">
                        {formatCop(paymentPreview.monto_total_primer_pago)}
                      </span>
                    </p>
                  </div>
                )}
              </>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="placa">Placa (opcional)</Label>
              <Input
                id="placa"
                name="placa"
                defaultValue={compra?.placa ?? ""}
                placeholder="ABC123"
                className="uppercase"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="chasis">Chasis</Label>
              <Input
                id="chasis"
                name="chasis"
                required
                defaultValue={compra?.chasis ?? ""}
              />
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="referencia">Referencia (opcional)</Label>
              <Input
                id="referencia"
                name="referencia"
                defaultValue={compra?.referencia ?? ""}
              />
            </div>
          </div>
          <Button
            type="submit"
            size="lg"
            className="mt-2 w-full bg-primary text-primary-foreground hover:bg-primary/80 sm:w-auto"
            disabled={pending}
          >
            Guardar moto y generar contrato
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
