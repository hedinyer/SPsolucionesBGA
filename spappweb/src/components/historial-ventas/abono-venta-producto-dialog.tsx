"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  addAbonoVentaProducto,
  type VentaProductoRow,
} from "@/lib/actions/venta-producto-actions";
import { printVentaProductoReceipt } from "@/lib/printing/venta-producto-receipt";
import { formatCop } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AbonoVentaProductoDialogProps {
  venta: VentaProductoRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function saldoRestante(venta: VentaProductoRow): number {
  return Math.max(0, venta.total - venta.montoPagado);
}

export function AbonoVentaProductoDialog({
  venta,
  open,
  onOpenChange,
}: AbonoVentaProductoDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [monto, setMonto] = useState("");

  const saldo = venta ? saldoRestante(venta) : 0;
  const titulo =
    venta?.clienteNombreReal ?? venta?.clienteNombre ?? "Cliente";

  useEffect(() => {
    if (open && venta) {
      setMonto(String(saldoRestante(venta)));
    }
  }, [open, venta]);

  function parseMonto(raw: string): number {
    return Number(raw.replace(/\D/g, ""));
  }

  function submit() {
    if (!venta) return;
    const montoNum = parseMonto(monto);
    if (!montoNum || montoNum <= 0) {
      toast.error("Indica un monto válido.");
      return;
    }
    if (montoNum > saldo) {
      toast.error(`El abono no puede superar el saldo (${formatCop(saldo)}).`);
      return;
    }

    startTransition(async () => {
      try {
        const updated = await addAbonoVentaProducto(venta.id, montoNum);
        await printVentaProductoReceipt(updated);
        toast.success(
          saldoRestante(updated) > 0
            ? "Abono registrado e impreso."
            : "Venta saldada e impresa.",
        );
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "No se pudo registrar el abono.",
        );
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Registrar abono</DialogTitle>
          {venta ? (
            <p className="text-sm text-muted-foreground">{titulo}</p>
          ) : null}
        </DialogHeader>

        {venta ? (
          <div className="flex flex-col gap-4">
            <dl className="flex flex-col gap-2 rounded-lg border border-border bg-muted/50 p-3 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Total compra</dt>
                <dd className="font-medium tabular-nums">
                  {formatCop(venta.total)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Ya pagado</dt>
                <dd className="font-medium tabular-nums">
                  {formatCop(venta.montoPagado)}
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-t border-border pt-2">
                <dt className="font-medium text-foreground">Falta</dt>
                <dd className="font-semibold tabular-nums text-amber-700">
                  {formatCop(saldo)}
                </dd>
              </div>
            </dl>

            <div className="flex flex-col gap-2">
              <Label htmlFor="abono-producto-monto">Monto del abono</Label>
              <Input
                id="abono-producto-monto"
                inputMode="numeric"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0"
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-9"
                  disabled={pending || saldo <= 0}
                  onClick={() => setMonto(String(saldo))}
                >
                  Todo ({formatCop(saldo)})
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="bg-primary text-primary-foreground hover:bg-primary/80"
            onClick={submit}
            disabled={pending || !venta || saldo <= 0}
          >
            {pending ? "Guardando…" : "Registrar e imprimir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
