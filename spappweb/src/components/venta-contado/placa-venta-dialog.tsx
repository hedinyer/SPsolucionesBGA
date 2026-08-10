"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  setPlacaVentaMoto,
  type VentaMotoRow,
} from "@/lib/actions/venta-moto-actions";
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

interface PlacaVentaDialogProps {
  venta: VentaMotoRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function PlacaVentaDialog({
  venta,
  open,
  onOpenChange,
  onSuccess,
}: PlacaVentaDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [placa, setPlaca] = useState("");

  useEffect(() => {
    if (open) setPlaca("");
  }, [open, venta]);

  function submit() {
    if (!venta) return;
    const trimmed = placa.trim().toUpperCase();
    if (trimmed.length < 5) {
      toast.error("Indica una placa válida.");
      return;
    }

    startTransition(async () => {
      try {
        await setPlacaVentaMoto(venta.id, trimmed);
        toast.success("Placa registrada.");
        onOpenChange(false);
        onSuccess?.();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo guardar.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Agregar placa</DialogTitle>
          {venta ? (
            <p className="text-sm text-muted-foreground">
              {venta.clienteNombre} · {venta.modelo} {venta.color}
            </p>
          ) : null}
        </DialogHeader>

        {venta ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="venta-placa">Placa</Label>
            <Input
              id="venta-placa"
              value={placa}
              onChange={(e) => setPlaca(e.target.value.toUpperCase())}
              placeholder="ABC123"
              autoComplete="off"
              className="uppercase"
            />
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
            {pending ? "Guardando…" : "Guardar placa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
