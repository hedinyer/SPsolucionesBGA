"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  addAbonoVentaMoto,
  type VentaMotoRow,
} from "@/lib/actions/venta-moto-actions";
import { printVentaMotoReceipt } from "@/lib/printing/venta-moto-receipt";
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

interface AbonoVentaDialogProps {
  venta: VentaMotoRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

function saldoRestante(venta: VentaMotoRow): number {
  if (venta.valorVenta == null) return 0;
  return Math.max(0, venta.valorVenta - venta.montoPagado);
}

export function AbonoVentaDialog({
  venta,
  open,
  onOpenChange,
  onSuccess,
}: AbonoVentaDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [monto, setMonto] = useState("");

  const saldo = venta ? saldoRestante(venta) : 0;

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
        const updated = await addAbonoVentaMoto(venta.id, montoNum);
        await printVentaMotoReceipt(updated);
        toast.success("Abono registrado e impreso.");
        onOpenChange(false);
        onSuccess?.();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo registrar.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Registrar abono</DialogTitle>
          {venta ? (
            <p className="text-sm text-muted-foreground">{venta.clienteNombre}</p>
          ) : null}
        </DialogHeader>

        {venta ? (
          <div className="flex flex-col gap-4">
            <dl className="flex flex-col gap-2 rounded-lg border border-border bg-muted/50 p-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Precio</dt>
                <dd className="font-medium">
                  {venta.valorVenta != null ? formatCop(venta.valorVenta) : "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Pagado</dt>
                <dd className="font-medium">{formatCop(venta.montoPagado)}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-2">
                <dt className="font-medium text-foreground">Saldo</dt>
                <dd className="font-semibold text-amber-700">{formatCop(saldo)}</dd>
              </div>
            </dl>

            <div className="flex flex-col gap-2">
              <Label htmlFor="abono-monto">Monto del abono</Label>
              <Input
                id="abono-monto"
                inputMode="numeric"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0"
              />
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
            disabled={pending || !venta}
          >
            {pending ? "Guardando…" : "Registrar e imprimir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
