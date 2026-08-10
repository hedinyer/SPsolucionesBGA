"use client";

import { useEffect, useState, useTransition } from "react";
import { Bike, Printer } from "lucide-react";
import { toast } from "sonner";
import { saveVentaMoto } from "@/lib/actions/venta-moto-actions";
import { printVentaMotoReceipt } from "@/lib/printing/venta-moto-receipt";
import type { BikeRow } from "@/lib/pipeline/types";
import { formatCop } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TouchSelect } from "@/components/ui/touch-select";

interface VenderMotoSheetProps {
  bikes: BikeRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
  /** Prefill from deep link (?bikeId= / match modelo+color). */
  initialBikeId?: string;
}

export function VenderMotoSheet({
  bikes,
  open,
  onOpenChange,
  onSaved,
  initialBikeId,
}: VenderMotoSheetProps) {
  const [pending, startTransition] = useTransition();
  const [bikeId, setBikeId] = useState("");
  const [valorVenta, setValorVenta] = useState("");
  const [montoPagado, setMontoPagado] = useState("");
  const activeBikes = bikes.filter((b) => b.activo && b.stock > 0);
  const selected = activeBikes.find((b) => String(b.id) === bikeId);

  useEffect(() => {
    if (!open || !initialBikeId) return;
    const ok = bikes.some(
      (b) => b.activo && b.stock > 0 && String(b.id) === initialBikeId,
    );
    if (ok) setBikeId(initialBikeId);
  }, [open, initialBikeId, bikes]);

  const valorNum = Number(valorVenta.replace(/\D/g, ""));
  const pagadoNum = Number(montoPagado.replace(/\D/g, ""));
  const saldo =
    valorNum > 0 && pagadoNum >= 0 ? Math.max(0, valorNum - pagadoNum) : null;

  useEffect(() => {
    if (selected?.precio_venta != null && selected.precio_venta > 0) {
      setValorVenta(String(selected.precio_venta));
    } else if (selected) {
      setValorVenta("");
    }
  }, [selected]);

  function resetForm() {
    setBikeId("");
    setValorVenta("");
    setMontoPagado("");
  }

  function parseCopInput(raw: string): number | undefined {
    const n = Number(raw.replace(/\D/g, ""));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }

  function onBikeChange(id: string) {
    setBikeId(id);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) resetForm();
        onOpenChange(next);
      }}
    >
      <SheetContent side="right" className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Bike className="h-5 w-5" />
            Vender moto
          </SheetTitle>
        </SheetHeader>

        <form
          id="vender-moto-form"
          className="mt-6 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!bikeId || !selected) {
              toast.error("Selecciona una moto del catálogo.");
              return;
            }
            const fd = new FormData(e.currentTarget);

            startTransition(async () => {
              try {
                const venta = await saveVentaMoto({
                  bikeId: Number(bikeId),
                  modelo: selected.modelo,
                  color: selected.color,
                  clienteNombre: String(fd.get("clienteNombre")),
                  clienteCedula: String(fd.get("clienteCedula")),
                  clienteCelular: String(fd.get("clienteCelular")),
                  chasis: String(fd.get("chasis") || "") || undefined,
                  cuotaInicial: selected?.cuota_inicial,
                  valorVenta: parseCopInput(valorVenta),
                  montoPagado: parseCopInput(montoPagado) ?? 0,
                  notas: String(fd.get("notas") || "") || undefined,
                });
                printVentaMotoReceipt(venta).catch(() => {});
                onSaved?.();
                toast.success(
                  "Venta guardada. Si no ves impresión, permite ventanas emergentes o usa Ctrl+P en la pestaña del recibo.",
                );
                resetForm();
                onOpenChange(false);
              } catch (err) {
                toast.error(
                  err instanceof Error ? err.message : "No se pudo guardar.",
                );
              }
            });
          }}
        >
          <div className="flex flex-col gap-2">
            <Label>Moto del catálogo</Label>
            <TouchSelect
              value={bikeId}
              onChange={onBikeChange}
              placeholder="Selecciona modelo y color"
              options={activeBikes.map((b) => ({
                value: String(b.id),
                label: `${b.modelo} — ${b.color} (stock ${b.stock})`,
              }))}
            />
            {activeBikes.length === 0 ? (
              <p className="text-sm text-amber-700">
                No hay motos con stock en catálogo.
              </p>
            ) : null}
            {selected && (
              <p className="text-sm text-muted-foreground">
                {selected.precio_venta != null && selected.precio_venta > 0
                  ? `Precio de la moto: ${formatCop(selected.precio_venta)}`
                  : "Sin precio de venta en catálogo — ingrésalo abajo o configúralo en Catálogo."}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/50 p-3">
            <p className="text-sm font-medium">Pago</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="valorVenta">Precio total de la moto</Label>
                <Input
                  id="valorVenta"
                  inputMode="numeric"
                  placeholder="0"
                  value={valorVenta}
                  onChange={(e) => setValorVenta(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="montoPagado">Pagado hoy</Label>
                <Input
                  id="montoPagado"
                  inputMode="numeric"
                  placeholder="0"
                  value={montoPagado}
                  onChange={(e) => setMontoPagado(e.target.value)}
                />
              </div>
            </div>
            {saldo != null && valorNum > 0 && (
              <p className="text-sm text-muted-foreground">
                {pagadoNum >= valorNum
                  ? "Pago de contado."
                  : pagadoNum > 0
                    ? `Abono parcial. Saldo: ${formatCop(saldo)}`
                    : `Sin pago hoy. Saldo: ${formatCop(valorNum)}`}
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                if (valorNum > 0) setMontoPagado(String(valorNum));
              }}
              disabled={valorNum <= 0}
            >
              Marcar pago de contado
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="clienteNombre">Nombre del cliente</Label>
            <Input id="clienteNombre" name="clienteNombre" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="clienteCedula">Cédula</Label>
              <Input
                id="clienteCedula"
                name="clienteCedula"
                inputMode="numeric"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="clienteCelular">Celular</Label>
              <Input
                id="clienteCelular"
                name="clienteCelular"
                inputMode="tel"
                required
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="chasis">Chasis</Label>
            <Input id="chasis" name="chasis" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="notas">Notas</Label>
            <Input id="notas" name="notas" />
          </div>
        </form>

        <SheetFooter className="mt-6">
          <Button
            type="submit"
            form="vender-moto-form"
            disabled={pending || !bikeId || activeBikes.length === 0}
            className="w-full gap-2"
          >
            <Printer className="h-4 w-4" />
            {pending ? "Guardando…" : "Guardar e imprimir"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
