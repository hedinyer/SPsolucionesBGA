"use client";

import { useState, useTransition } from "react";
import { ArrowUpCircle } from "lucide-react";
import { toast } from "sonner";
import {
  registrarEgresoCaja,
  type CajaSesionState,
} from "@/lib/actions/caja-actions";
import type { CajaEgresoRow } from "@/lib/caja/caja-informe";
import {
  CAJA_MEDIO_EGRESO_LABELS,
  CAJA_MEDIO_EGRESO_VALUES,
  type CajaMedioEgreso,
} from "@/lib/caja/caja-medios";
import { formatCop } from "@/lib/utils/format";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

function parseCopInput(raw: string): number | undefined {
  const n = Number(raw.replace(/\D/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function CajaPagosPanel({
  sesion,
  onUpdated,
}: {
  sesion: CajaSesionState;
  onUpdated: (next: CajaSesionState) => void;
}) {
  const [concepto, setConcepto] = useState("");
  const [beneficiario, setBeneficiario] = useState("");
  const [monto, setMonto] = useState("");
  const [medioPago, setMedioPago] = useState<CajaMedioEgreso>("efectivo");
  const [notas, setNotas] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit() {
    const parsedMonto = parseCopInput(monto);
    if (!concepto.trim()) {
      toast.error("Indica el concepto del pago.");
      return;
    }
    if (parsedMonto == null) {
      toast.error("Indica un monto válido.");
      return;
    }

    startTransition(async () => {
      try {
        const next = await registrarEgresoCaja({
          sesionId: sesion.id,
          concepto: concepto.trim(),
          beneficiario: beneficiario.trim() || undefined,
          monto: parsedMonto,
          medioPago,
          notas: notas.trim() || undefined,
        });
        if (!next) return;
        onUpdated(next);
        setConcepto("");
        setBeneficiario("");
        setMonto("");
        setNotas("");
        toast.success("Pago registrado.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo registrar el pago.");
      }
    });
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ArrowUpCircle className="h-4 w-4 text-destructive" />
          Pagos (salidas)
        </CardTitle>
        <CardDescription>
          Registra gastos, proveedores y pagos del día. Se incluyen en el informe
          de cierre.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {sesion.egresos.length > 0 ? (
          <ul className="max-h-40 flex flex-col gap-1 overflow-y-auto text-sm">
            {sesion.egresos.map((e: CajaEgresoRow) => (
              <li
                key={e.id}
                className="flex items-center justify-between rounded border border-border px-2 py-1.5"
              >
                <span className="truncate">
                  {e.concepto}
                  {e.beneficiario ? ` · ${e.beneficiario}` : ""}
                  <span className="ml-1 text-muted-foreground">({e.medioLabel})</span>
                </span>
                <span className="shrink-0 tabular-nums font-medium text-destructive">
                  −{formatCop(e.monto)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No hay pagos registrados hoy.</p>
        )}

        {sesion.abierta ? (
          <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-3">
            <p className="text-sm font-medium">Registrar pago</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="caja-pago-concepto">Concepto</Label>
                <Input
                  id="caja-pago-concepto"
                  placeholder="Ej. proveedor repuestos, nómina, servicios…"
                  value={concepto}
                  onChange={(e) => setConcepto(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="caja-pago-beneficiario">Beneficiario (opcional)</Label>
                <Input
                  id="caja-pago-beneficiario"
                  value={beneficiario}
                  onChange={(e) => setBeneficiario(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="caja-pago-monto">Monto</Label>
                <Input
                  id="caja-pago-monto"
                  inputMode="numeric"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="caja-pago-medio">Medio de pago</Label>
                <Select
                  value={medioPago}
                  onValueChange={(v) => setMedioPago(v as CajaMedioEgreso)}
                >
                  <SelectTrigger id="caja-pago-medio">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CAJA_MEDIO_EGRESO_VALUES.map((medio) => (
                      <SelectItem key={medio} value={medio}>
                        {CAJA_MEDIO_EGRESO_LABELS[medio]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="caja-pago-notas">Notas (opcional)</Label>
                <Textarea
                  id="caja-pago-notas"
                  rows={2}
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                />
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={handleSubmit}
            >
              {pending ? "Registrando…" : "Registrar pago"}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
