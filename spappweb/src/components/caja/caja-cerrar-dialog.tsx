"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { Lock, Printer } from "lucide-react";
import { toast } from "sonner";
import {
  cerrarCaja,
  type CajaSesionState,
} from "@/lib/actions/caja-actions";
import { CajaInformePanel } from "@/components/caja/caja-informe-panel";
import { printCajaArqueoReceipt } from "@/lib/printing/caja-arqueo-receipt";
import { formatCop, formatDate } from "@/lib/utils/format";
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
import { Textarea } from "@/components/ui/textarea";

function parseCopInput(raw: string): number | undefined {
  const n = Number(raw.replace(/\D/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function CuadreEfectivo({ sesion }: { sesion: CajaSesionState }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/50 p-3">
      <div className="flex items-center justify-between text-sm font-semibold">
        <span>¿Cuánto debería haber?</span>
        <span className="tabular-nums">{formatCop(sesion.efectivoEsperado)}</span>
      </div>
      {sesion.montoCierre != null && sesion.diferencia != null ? (
        <>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Lo que contaste</span>
            <span className="font-medium tabular-nums">
              {formatCop(sesion.montoCierre)}
            </span>
          </div>
          <div
            className={`flex items-center justify-between text-sm font-semibold ${
              sesion.diferencia === 0
                ? "text-green-700"
                : sesion.diferencia < 0
                  ? "text-destructive"
                  : "text-amber-700"
            }`}
          >
            <span>
              {sesion.diferencia === 0
                ? "Cuadra exacto"
                : sesion.diferencia < 0
                  ? "Falta"
                  : "Sobra"}
            </span>
            <span className="tabular-nums">
              {formatCop(Math.abs(sesion.diferencia))}
            </span>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function CajaArqueoDialog({
  open,
  onOpenChange,
  sesion,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sesion: CajaSesionState | null;
}) {
  const [printPending, startPrint] = useTransition();

  function handlePrint() {
    if (!sesion) return;
    startPrint(async () => {
      try {
        await printCajaArqueoReceipt(sesion);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "No se pudo imprimir el arqueo.",
        );
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-background sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Arqueo de caja</DialogTitle>
        </DialogHeader>
        {sesion ? (
          <>
            <p className="text-sm text-muted-foreground">
              {formatDate(sesion.openedAt)}
              {sesion.closedAt ? ` — ${formatDate(sesion.closedAt)}` : null}
            </p>
            <CajaInformePanel
              informe={sesion.informe}
              visitasResumen={sesion.visitasResumen}
              title=""
            />
            <CuadreEfectivo sesion={sesion} />
          </>
        ) : null}
        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => onOpenChange(false)}
          >
            Cerrar
          </Button>
          <Button
            type="button"
            className="min-h-11 gap-2"
            disabled={!sesion || printPending}
            onClick={handlePrint}
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            {printPending ? "Preparando…" : "Imprimir arqueo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CajaCerrarDialog({
  open,
  onOpenChange,
  sesion,
  onClosed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sesion: CajaSesionState | null;
  onClosed: (state: CajaSesionState) => void;
}) {
  const formId = useId();
  const montoId = `${formId}-monto`;
  const notasId = `${formId}-notas`;
  const [montoCierre, setMontoCierre] = useState("");
  const [notasCierre, setNotasCierre] = useState("");
  const [pending, startTransition] = useTransition();

  const montoNum = useMemo(() => parseCopInput(montoCierre), [montoCierre]);
  const puedeCerrar = Boolean(sesion?.abierta && montoNum != null);

  function handleCerrar() {
    if (!sesion?.abierta) return;
    const monto = parseCopInput(montoCierre);
    if (monto == null) {
      toast.error("Indica cuánto efectivo hay en caja.");
      return;
    }
    startTransition(async () => {
      try {
        const { state, diferencia } = await cerrarCaja({
          sesionId: sesion.id,
          montoCierre: monto,
          notas: notasCierre.trim() || undefined,
        });
        if (!state) {
          throw new Error("No se pudo cargar el cierre.");
        }
        setMontoCierre("");
        setNotasCierre("");
        onOpenChange(false);
        onClosed(state);
        if (diferencia === 0) {
          toast.success("Caja cerrada. Cuadre exacto.");
        } else if (diferencia < 0) {
          toast.warning(
            `Caja cerrada. Faltante: ${formatCop(Math.abs(diferencia))}.`,
          );
        } else {
          toast.warning(`Caja cerrada. Sobrante: ${formatCop(diferencia)}.`);
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "No se pudo cerrar la caja.",
        );
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent className="bg-background sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cerrar caja</DialogTitle>
        </DialogHeader>
        {sesion ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Efectivo esperado:{" "}
              <span className="font-semibold tabular-nums text-foreground">
                {formatCop(sesion.efectivoEsperado)}
              </span>
            </p>
            <div className="flex flex-col gap-2">
              <Label htmlFor={montoId}>¿Cuánto efectivo hay ahora?</Label>
              <Input
                id={montoId}
                className="min-h-11"
                inputMode="numeric"
                placeholder={String(sesion.efectivoEsperado)}
                value={montoCierre}
                onChange={(e) => setMontoCierre(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={notasId}>Nota (opcional)</Label>
              <Textarea
                id={notasId}
                rows={2}
                value={notasCierre}
                onChange={(e) => setNotasCierre(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-fit"
              onClick={() => setMontoCierre(String(sesion.efectivoEsperado))}
            >
              Usar lo esperado
            </Button>
          </div>
        ) : null}
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="min-h-11 gap-2"
            disabled={!puedeCerrar || pending}
            onClick={handleCerrar}
          >
            <Lock className="h-4 w-4" aria-hidden="true" />
            {pending ? "Cerrando…" : "Cerrar caja"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
