"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import type { InventarioProductoRow } from "@/lib/pipeline/types";
import { PrintPriceLabelDialog } from "@/components/inventario/print-price-label-dialog";
import { Button } from "@/components/ui/button";

interface PrintPriceLabelButtonProps {
  product: InventarioProductoRow;
  variant?: "icon" | "outline";
  className?: string;
}

export function PrintPriceLabelButton({
  product,
  variant = "icon",
  className,
}: PrintPriceLabelButtonProps) {
  const [open, setOpen] = useState(false);

  if (variant === "outline") {
    return (
      <>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={className}
          onClick={() => setOpen(true)}
        >
          <Printer className="mr-1 h-4 w-4" />
          Imprimir
        </Button>
        <PrintPriceLabelDialog
          product={product}
          open={open}
          onOpenChange={setOpen}
        />
      </>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={className}
        aria-label="Imprimir etiqueta de precio"
        onClick={() => setOpen(true)}
      >
        <Printer className="h-4 w-4" />
      </Button>
      <PrintPriceLabelDialog
        product={product}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
