"use client";

import { Eye, EyeOff } from "lucide-react";
import { formatCop } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";

export const COSTO_OCULTO_PLACEHOLDER = "••••";

export function CostoMonto({
  amount,
  visible,
}: {
  amount: number;
  visible: boolean;
}) {
  if (visible) {
    return <span className="tabular-nums">{formatCop(amount)}</span>;
  }
  return (
    <span className="tabular-nums tracking-wider" aria-label="oculto">
      {COSTO_OCULTO_PLACEHOLDER}
    </span>
  );
}

export function CostoRevealToggle({
  visible,
  onToggle,
}: {
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="min-h-11 min-w-11"
      aria-pressed={visible}
      aria-label={visible ? "Ocultar costos" : "Mostrar costos"}
      onClick={onToggle}
    >
      {visible ? (
        <EyeOff className="size-5" aria-hidden="true" />
      ) : (
        <Eye className="size-5" aria-hidden="true" />
      )}
    </Button>
  );
}
