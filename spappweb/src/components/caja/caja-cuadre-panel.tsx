"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Lock,
  Unlock,
} from "lucide-react";
import { toast } from "sonner";
import {
  abrirCaja,
  cerrarCaja,
  registrarMovimientoCaja,
  type CajaSesionState,
} from "@/lib/actions/caja-actions";
import { CajaInformePanel } from "@/components/caja/caja-informe-panel";
import { CajaPagosPanel } from "@/components/caja/caja-pagos-panel";
import { CajaVisitasPanel } from "@/components/caja/caja-visitas-panel";
import { formatCop, formatDate } from "@/lib/utils/format";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
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

function CuadreEfectivo({ sesion }: { sesion: CajaSesionState }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/50 p-3">
      <div className="flex items-center justify-between text-sm font-semibold">
        <span>Efectivo esperado en caja</span>
        <span className="tabular-nums">{formatCop(sesion.efectivoEsperado)}</span>
      </div>
      {sesion.montoCierre != null && sesion.diferencia != null ? (
        <>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Efectivo contado</span>
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
                ? "Cuadre exacto"
                : sesion.diferencia < 0
                  ? "Faltante"
                  : "Sobrante"}
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

export function CajaCuadrePanel({
  initialSesion,
}: {
  initialSesion: CajaSesionState | null;
}) {
  const [sesion, setSesion] = useState(initialSesion);
  const [montoApertura, setMontoApertura] = useState("");
  const [notasApertura, setNotasApertura] = useState("");
  const [montoCierre, setMontoCierre] = useState("");
  const [notasCierre, setNotasCierre] = useState("");
  const [movTipo, setMovTipo] = useState<"entrada" | "salida">("entrada");
  const [movMonto, setMovMonto] = useState("");
  const [movConcepto, setMovConcepto] = useState("");
  const [informeOpen, setInformeOpen] = useState(false);
  const [confirmAbrirOpen, setConfirmAbrirOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setSesion(initialSesion);
  }, [initialSesion]);

  const montoAperturaNum = useMemo(
    () => parseCopInput(montoApertura),
    [montoApertura],
  );

  const puedeAbrir = montoAperturaNum != null && montoAperturaNum > 0;

  const puedeCerrar = useMemo(
    () => sesion?.abierta && parseCopInput(montoCierre) != null,
    [sesion, montoCierre],
  );

  function requestAbrir() {
    if (montoAperturaNum == null || montoAperturaNum <= 0) {
      toast.error("El efectivo inicial debe ser mayor a 0.");
      return;
    }
    setConfirmAbrirOpen(true);
  }

  function handleAbrir() {
    const monto = parseCopInput(montoApertura);
    if (monto == null || monto <= 0) {
      toast.error("El efectivo inicial debe ser mayor a 0.");
      return;
    }
    startTransition(async () => {
      try {
        const next = await abrirCaja({
          montoApertura: monto,
          notas: notasApertura.trim() || undefined,
        });
        setSesion(next);
        setMontoApertura("");
        setNotasApertura("");
        setConfirmAbrirOpen(false);
        toast.success("Caja abierta.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo abrir la caja.");
      }
    });
  }

  function handleCerrar() {
    if (!sesion) return;
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
        setSesion(state);
        setMontoCierre("");
        setNotasCierre("");
        setInformeOpen(true);
        if (diferencia === 0) {
          toast.success("Caja cerrada. Cuadre exacto.");
        } else if (diferencia < 0) {
          toast.warning(`Caja cerrada. Faltante: ${formatCop(Math.abs(diferencia))}.`);
        } else {
          toast.warning(`Caja cerrada. Sobrante: ${formatCop(diferencia)}.`);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo cerrar la caja.");
      }
    });
  }

  function handleMovimiento() {
    if (!sesion) return;
    const monto = parseCopInput(movMonto);
    if (monto == null || monto <= 0) {
      toast.error("Indica un monto válido.");
      return;
    }
    if (!movConcepto.trim()) {
      toast.error("Indica el concepto del movimiento.");
      return;
    }
    startTransition(async () => {
      try {
        const next = await registrarMovimientoCaja({
          sesionId: sesion.id,
          tipo: movTipo,
          monto,
          concepto: movConcepto.trim(),
        });
        setSesion(next);
        setMovMonto("");
        setMovConcepto("");
        toast.success(movTipo === "entrada" ? "Entrada registrada." : "Salida registrada.");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "No se pudo registrar el movimiento.",
        );
      }
    });
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              Cuadre de caja
              {sesion ? (
                sesion.abierta ? (
                  <Badge variant="outline" className="border-green-300 text-green-700">
                    <Unlock className="mr-1 h-3 w-3" />
                    Abierta
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-border text-muted-foreground">
                    <Lock className="mr-1 h-3 w-3" />
                    Cerrada
                  </Badge>
                )
              ) : (
                <Badge variant="outline" className="border-amber-300 text-amber-700">
                  Sin abrir
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Abre la caja al inicio del día y ciérrala al final para ver el
              informe de ingresos por medio de pago.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {!sesion ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Registra cuánto efectivo hay en caja al comenzar el día. El monto
              debe ser mayor a 0.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="caja-apertura-monto">Efectivo inicial</Label>
                <Input
                  id="caja-apertura-monto"
                  inputMode="numeric"
                  placeholder="Ej. 200000"
                  value={montoApertura}
                  onChange={(e) => setMontoApertura(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="caja-apertura-notas">Notas (opcional)</Label>
                <Textarea
                  id="caja-apertura-notas"
                  rows={2}
                  value={notasApertura}
                  onChange={(e) => setNotasApertura(e.target.value)}
                />
              </div>
            </div>
            <Button
              type="button"
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/80"
              disabled={!puedeAbrir || pending}
              onClick={requestAbrir}
            >
              <Unlock className="h-4 w-4" />
              {pending ? "Abriendo…" : "Abrir caja"}
            </Button>
          </div>
        ) : (
          <>
            <div className="text-xs text-muted-foreground">
              Apertura: {formatDate(sesion.openedAt)}
              {sesion.closedAt ? ` · Cierre: ${formatDate(sesion.closedAt)}` : null}
            </div>

            <CajaInformePanel
              informe={sesion.informe}
              visitasResumen={sesion.visitasResumen}
              title={sesion.abierta ? "Vista previa del informe" : "Informe de cierre"}
            />
            <CajaVisitasPanel sesion={sesion} onUpdated={setSesion} />
            <CuadreEfectivo sesion={sesion} />

            {sesion.abierta ? (
              <CajaPagosPanel sesion={sesion} onUpdated={setSesion} />
            ) : null}

            {!sesion.abierta ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setInformeOpen(true)}
              >
                Ver informe completo
              </Button>
            ) : null}

            {sesion.movimientos.length > 0 ? (
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-muted-foreground">Movimientos</p>
                <ul className="max-h-32 flex flex-col gap-1 overflow-y-auto text-sm">
                  {sesion.movimientos.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-center justify-between rounded border border-border px-2 py-1"
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        {m.tipo === "entrada" ? (
                          <ArrowDownCircle className="h-3.5 w-3.5 shrink-0 text-green-600" />
                        ) : (
                          <ArrowUpCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                        )}
                        {m.concepto}
                      </span>
                      <span className="shrink-0 tabular-nums font-medium">
                        {m.tipo === "salida" ? "−" : "+"}
                        {formatCop(m.monto)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {sesion.abierta ? (
              <>
                <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-3">
                  <p className="text-sm font-medium">Movimiento manual</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={movTipo === "entrada" ? "default" : "outline"}
                      onClick={() => setMovTipo("entrada")}
                    >
                      Entrada
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={movTipo === "salida" ? "default" : "outline"}
                      onClick={() => setMovTipo("salida")}
                    >
                      Salida
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="caja-mov-monto">Monto</Label>
                      <Input
                        id="caja-mov-monto"
                        inputMode="numeric"
                        value={movMonto}
                        onChange={(e) => setMovMonto(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-2 sm:col-span-2">
                      <Label htmlFor="caja-mov-concepto">Concepto</Label>
                      <Input
                        id="caja-mov-concepto"
                        placeholder="Ej. cambio, retiro, gasto menor…"
                        value={movConcepto}
                        onChange={(e) => setMovConcepto(e.target.value)}
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={handleMovimiento}
                  >
                    Registrar {movTipo}
                  </Button>
                </div>

                <div className="flex flex-col gap-3 border-t border-border pt-4">
                  <p className="text-sm font-medium">Cierre del día</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="caja-cierre-monto">Efectivo contado</Label>
                      <Input
                        id="caja-cierre-monto"
                        inputMode="numeric"
                        placeholder={String(sesion.efectivoEsperado)}
                        value={montoCierre}
                        onChange={(e) => setMontoCierre(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-2 sm:col-span-2">
                      <Label htmlFor="caja-cierre-notas">Notas (opcional)</Label>
                      <Textarea
                        id="caja-cierre-notas"
                        rows={2}
                        value={notasCierre}
                        onChange={(e) => setNotasCierre(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setMontoCierre(String(sesion.efectivoEsperado))}
                    >
                      Usar efectivo esperado
                    </Button>
                    <Button
                      type="button"
                      className="gap-2 bg-primary text-primary-foreground hover:bg-primary/80"
                      disabled={!puedeCerrar || pending}
                      onClick={handleCerrar}
                    >
                      <Lock className="h-4 w-4" />
                      {pending ? "Cerrando…" : "Cerrar caja"}
                    </Button>
                  </div>
                </div>
              </>
            ) : sesion.notasCierre ? (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium">Notas de cierre:</span> {sesion.notasCierre}
              </p>
            ) : null}
          </>
        )}
      </CardContent>

      <AlertDialog open={confirmAbrirOpen} onOpenChange={setConfirmAbrirOpen}>
        <AlertDialogContent className="border-2 border-amber-400 bg-amber-50 sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-center text-lg text-amber-950">
              ¿El efectivo inicial es correcto?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-amber-900">
              Mira bien el valor antes de abrir la caja. Si está mal, el cuadre
              del día saldrá errado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2 text-center">
            <p className="caja-monto-blink rounded-xl px-4 py-5 text-3xl font-black tabular-nums tracking-tight sm:text-4xl">
              {formatCop(montoAperturaNum ?? 0)}
            </p>
            <p className="text-xs font-medium uppercase tracking-wide text-amber-800">
              Confirma solo si contaste este efectivo
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Revisar monto</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={(e) => {
                e.preventDefault();
                handleAbrir();
              }}
            >
              {pending ? "Abriendo…" : "Sí, es correcto — abrir caja"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={informeOpen} onOpenChange={setInformeOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto bg-background sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Informe de cierre</DialogTitle>
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
        </DialogContent>
      </Dialog>
    </Card>
  );
}
