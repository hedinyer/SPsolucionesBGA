"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import type { InventarioProductoRow } from "@/lib/pipeline/types";
import {
  DEFAULT_PRINT_OPTIONS,
  syncRowPageSize,
} from "@/lib/printing/price-label-print-options";
import { printPriceLabelInBrowser } from "@/lib/printing/print-price-label-client";
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

interface PrintPriceLabelDialogProps {
  product: InventarioProductoRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LABELS_PER_ROW = 3;

/** Redondea hacia arriba al múltiplo de 3 (se imprimen de a 3 por fila). */
export function labelsToPrint(needed: number): number {
  const n = Math.max(1, Math.floor(needed));
  return Math.ceil(n / LABELS_PER_ROW) * LABELS_PER_ROW;
}

export function PrintPriceLabelDialog({
  product,
  open,
  onOpenChange,
}: PrintPriceLabelDialogProps) {
  const [needed, setNeeded] = useState("1");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (open) setNeeded("1");
  }, [open]);

  const neededCount = Math.max(1, Math.min(99, Number(needed) || 1));
  const printCount = labelsToPrint(neededCount);
  const extra = printCount - neededCount;

  function run() {
    if (!product) return;
    startTransition(async () => {
      try {
        const options = syncRowPageSize({
          ...DEFAULT_PRINT_OPTIONS,
          copies: printCount,
        });
        await printPriceLabelInBrowser(product, options, "print");
        toast.success(
          extra > 0
            ? `Imprimiendo ${printCount} etiquetas (${neededCount} solicitadas + ${extra} de relleno).`
            : `Imprimiendo ${printCount} etiqueta${printCount === 1 ? "" : "s"}.`,
        );
        onOpenChange(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo imprimir.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Imprimir etiquetas</DialogTitle>
          {product ? (
            <p className="text-sm text-muted-foreground">
              {product.nombre} · SKU {product.sku}
            </p>
          ) : null}
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor="label-qty">¿Cuántas etiquetas necesitas?</Label>
          <Input
            id="label-qty"
            type="number"
            min={1}
            max={99}
            autoFocus
            value={needed}
            onChange={(e) => setNeeded(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") run();
            }}
          />
          {extra > 0 ? (
            <p className="text-sm text-muted-foreground">
              Se imprimirán {printCount} (de a 3 por fila: {neededCount} +
              {extra} de relleno).
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Se imprimirán {printCount} etiqueta{printCount === 1 ? "" : "s"}.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="bg-primary text-primary-foreground hover:bg-primary/80"
            disabled={pending || !product}
            onClick={run}
          >
            Imprimir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
