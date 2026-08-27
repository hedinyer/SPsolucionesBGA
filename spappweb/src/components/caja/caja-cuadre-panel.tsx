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
        toast.error(
          err instanceof Error ? err.message : "No se pudo abrir la caja.",
        );
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
        toast.success(
          movTipo === "entrada" ? "Entrada registrada." : "Salida registrada.",
        );
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : "No se pudo registrar el movimiento.",
        );
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold text-foreground">
            Dinero del día
            {sesion ? (
              sesion.abierta ? (
                <Badge
                  variant="outline"
                  className="border-green-300 text-green-700"
                >
                  <Unlock className="mr-1 h-3 w-3" aria-hidden="true" />
                  Abierta
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-border text-muted-foreground"
                >
                  <Lock className="mr-1 h-3 w-3" aria-hidden="true" />
                  Cerrada
                </Badge>
              )
            ) : (
              <Badge
                variant="outline"
                className="border-amber-300 text-amber-700"
              >
                Sin abrir
              </Badge>
            )}
          </h2>
          <p className="text-sm text-muted-foreground">
            {sesion
              ? `Apertura: ${formatDate(sesion.openedAt)}${
                  sesion.closedAt
                    ? ` · Cierre: ${formatDate(sesion.closedAt)}`
                    : ""
                }`
              : "Cuenta el efectivo y abre la caja para empezar el día."}
          </p>
        </div>

        {!sesion ? (
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="caja-apertura-monto">
                  ¿Cuánto efectivo hay ahora?
                </Label>
                <Input
                  id="caja-apertura-monto"
                  className="min-h-11"
                  inputMode="numeric"
                  placeholder="Ej. 200.000"
                  value={montoApertura}
                  onChange={(e) => setMontoApertura(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="caja-apertura-notas">Nota (opcional)</Label>
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
              className="min-h-11 gap-2"
              disabled={!puedeAbrir || pending}
              onClick={requestAbrir}
            >
              <Unlock className="h-4 w-4" aria-hidden="true" />
              {pending ? "Abriendo…" : "Abrir caja"}
            </Button>
          </div>
        ) : (
          <CuadreEfectivo sesion={sesion} />
        )}
      </div>

      {sesion ? (
        <>
          <section
            className="flex flex-col gap-3"
            aria-labelledby="caja-resumen-titulo"
          >
            <div>
              <h3
                id="caja-resumen-titulo"
                className="text-sm font-semibold text-foreground"
              >
                Resumen
              </h3>
              <p className="text-sm text-muted-foreground">
                Cómo va el dinero del día.
              </p>
            </div>
            <CajaInformePanel
              informe={sesion.informe}
              visitasResumen={sesion.visitasResumen}
              title={sesion.abierta ? "Vista previa" : "Informe de cierre"}
            />
            {!sesion.abierta ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-11 w-fit"
                onClick={() => setInformeOpen(true)}
              >
                Ver informe completo
              </Button>
            ) : null}
          </section>

          <section
            className="flex flex-col gap-3"
            aria-labelledby="caja-visitas-titulo"
          >
            <div>
              <h3
                id="caja-visitas-titulo"
                className="text-sm font-semibold text-foreground"
              >
                Cobros de visitas
              </h3>
              <p className="text-sm text-muted-foreground">
                Pagos que llegan por visitadores.
              </p>
            </div>
            <CajaVisitasPanel sesion={sesion} onUpdated={setSesion} />
          </section>

          {sesion.abierta ? (
            <section
              className="flex flex-col gap-3"
              aria-labelledby="caja-egresos-titulo"
            >
              <div>
                <h3
                  id="caja-egresos-titulo"
                  className="text-sm font-semibold text-foreground"
                >
                  Otros egresos
                </h3>
                <p className="text-sm text-muted-foreground">
                  Gastos registrados fuera del cuadre manual.
                </p>
              </div>
              <CajaPagosPanel sesion={sesion} onUpdated={setSesion} />
            </section>
          ) : null}

          {sesion.movimientos.length > 0 ? (
            <section
              className="flex flex-col gap-2"
              aria-labelledby="caja-movs-titulo"
            >
              <h3
                id="caja-movs-titulo"
                className="text-sm font-semibold text-foreground"
              >
                Movimientos del día
              </h3>
              <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto text-sm">
                {sesion.movimientos.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                  >
                    <span className="flex min-w-0 items-center gap-1.5 truncate">
                      {m.tipo === "entrada" ? (
                        <ArrowDownCircle
                          className="h-3.5 w-3.5 shrink-0 text-green-600"
                          aria-hidden="true"
                        />
                      ) : (
                        <ArrowUpCircle
                          className="h-3.5 w-3.5 shrink-0 text-destructive"
                          aria-hidden="true"
                        />
                      )}
                      {m.concepto}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">
                      {m.tipo === "salida" ? "−" : "+"}
                      {formatCop(m.monto)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {sesion.abierta ? (
            <>
              <section
                className="flex flex-col gap-3 rounded-xl border border-dashed border-border p-4"
                aria-labelledby="caja-meter-sacar-titulo"
              >
                <div>
                  <h3
                    id="caja-meter-sacar-titulo"
                    className="text-sm font-semibold text-foreground"
                  >
                    Meter o sacar plata
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Solo movimientos manuales (cambio, retiro, gasto menor).
                  </p>
                </div>
                <div
                  role="group"
                  aria-label="Tipo de movimiento"
                  className="flex flex-wrap gap-2"
                >
                  <Button
                    type="button"
                    className="min-h-11"
                    variant={movTipo === "entrada" ? "default" : "outline"}
                    aria-pressed={movTipo === "entrada"}
                    onClick={() => setMovTipo("entrada")}
                  >
                    Meter plata
                  </Button>
                  <Button
                    type="button"
                    className="min-h-11"
                    variant={movTipo === "salida" ? "default" : "outline"}
                    aria-pressed={movTipo === "salida"}
                    onClick={() => setMovTipo("salida")}
                  >
                    Sacar plata
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="caja-mov-monto">¿Cuánto?</Label>
                    <Input
                      id="caja-mov-monto"
                      className="min-h-11"
                      inputMode="numeric"
                      value={movMonto}
                      onChange={(e) => setMovMonto(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-2 sm:col-span-2">
                    <Label htmlFor="caja-mov-concepto">¿Para qué?</Label>
                    <Input
                      id="caja-mov-concepto"
                      className="min-h-11"
                      placeholder="Ej. cambio, retiro, gasto menor…"
                      value={movConcepto}
                      onChange={(e) => setMovConcepto(e.target.value)}
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 w-fit"
                  disabled={pending}
                  onClick={handleMovimiento}
                >
                  {movTipo === "entrada"
                    ? "Registrar entrada"
                    : "Registrar salida"}
                </Button>
              </section>

              <section
                className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4"
                aria-labelledby="caja-cierre-titulo"
              >
                <div>
                  <h3
                    id="caja-cierre-titulo"
                    className="text-sm font-semibold text-foreground"
                  >
                    Cerrar el día
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Cuenta el efectivo y ciérralo al final.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="caja-cierre-monto">
                      ¿Cuánto efectivo hay ahora?
                    </Label>
                    <Input
                      id="caja-cierre-monto"
                      className="min-h-11"
                      inputMode="numeric"
                      placeholder={String(sesion.efectivoEsperado)}
                      value={montoCierre}
                      onChange={(e) => setMontoCierre(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-2 sm:col-span-2">
                    <Label htmlFor="caja-cierre-notas">Nota (opcional)</Label>
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
                    className="min-h-11"
                    onClick={() =>
                      setMontoCierre(String(sesion.efectivoEsperado))
                    }
                  >
                    Usar lo esperado
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
                </div>
              </section>
            </>
          ) : sesion.notasCierre ? (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                Notas de cierre:
              </span>{" "}
              {sesion.notasCierre}
            </p>
          ) : null}
        </>
      ) : null}

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
            <AlertDialogCancel disabled={pending}>
              Revisar monto
            </AlertDialogCancel>
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
    </div>
  );
}
