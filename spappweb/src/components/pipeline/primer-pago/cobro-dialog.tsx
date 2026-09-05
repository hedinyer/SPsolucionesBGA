"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  checkReferenciaPagoUsada,
  registrarCobroPrimerPago,
} from "@/lib/actions/payment-comprobante-actions";
import { ocrReceiptFile } from "@/lib/payments/receipt-ocr-client";
import type { BancoDetectado } from "@/lib/payments/receipt-parser";
import {
  allocateCobroPrimerPago,
  faltanteConcepto,
  faltanteTotal,
  type PrimerPagoConcepto,
} from "@/lib/payments/primer-pago-progress";
import { isReferenciaDuplicada } from "@/lib/payments/referencia";
import {
  printCreditoPagoReceipt,
  type CreditoPagoReceiptData,
} from "@/lib/printing/credito-pago-receipt";
import {
  BANCO_ORIGEN_LABELS,
  CONTEXTO_PAGO_LABELS,
  MEDIO_PAGO_ADMIN_LABELS,
  type BancoOrigen,
  type MedioPagoAdmin,
  type PagoRow,
  type UserMotoCompraRow,
} from "@/lib/pipeline/types";
import { formatCop } from "@/lib/utils/format";
import { ImageFileField } from "@/components/ui/image-file-field";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TouchSelect } from "@/components/ui/touch-select";
import { cn } from "@/lib/utils";

const MEDIOS: { value: MedioPagoAdmin; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "datafono", label: "Datáfono" },
  { value: "nequi_nicolas", label: MEDIO_PAGO_ADMIN_LABELS.nequi_nicolas },
  { value: "davivienda", label: MEDIO_PAGO_ADMIN_LABELS.davivienda },
];

function isPresencialMedio(medio: MedioPagoAdmin): boolean {
  return medio === "efectivo" || medio === "datafono";
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function datetimeLocalToIso(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error("Fecha inválida.");
  }
  return d.toISOString();
}

function nowDatetimeLocal(): string {
  return toDatetimeLocal(new Date().toISOString());
}

function bancoFromDetectado(detected: BancoDetectado): BancoOrigen | null {
  if (!detected || detected === "otro") return null;
  return detected;
}

type FieldErrors = {
  medio?: string;
  monto?: string;
  file?: string;
  referencia?: string;
  fecha?: string;
};

export function CobroPrimerPagoDialog({
  open,
  onOpenChange,
  compra,
  pagos,
  userId,
  referenciasUsadas = [],
  clienteNombre = "Cliente",
  clienteCedula = "",
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  compra: UserMotoCompraRow;
  pagos: PagoRow[];
  userId: number;
  referenciasUsadas?: string[];
  clienteNombre?: string;
  clienteCedula?: string;
  onSuccess?: () => void;
}) {
  const faltante = faltanteTotal(compra, pagos);
  const [pending, startTransition] = useTransition();
  const [ocrPending, startOcrTransition] = useTransition();
  const [medioPagoAdmin, setMedioPagoAdmin] =
    useState<MedioPagoAdmin>("efectivo");
  const [monto, setMonto] = useState<number | null>(
    faltante > 0 ? faltante : null,
  );
  const [file, setFile] = useState<File | null>(null);
  const [bancoOrigen, setBancoOrigen] = useState<BancoOrigen>("nequi");
  const [referencia, setReferencia] = useState("");
  const [fecha, setFecha] = useState(nowDatetimeLocal);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [entradaManual, setEntradaManual] = useState(true);
  const [referenciaDuplicada, setReferenciaDuplicada] = useState(false);
  const [checkingReferencia, setCheckingReferencia] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const ocrFileKeyRef = useRef<string | null>(null);
  const refInputRef = useRef<HTMLInputElement>(null);
  const fechaRef = useRef<HTMLInputElement>(null);

  const presencial = isPresencialMedio(medioPagoAdmin);
  const esEfectivo = medioPagoAdmin === "efectivo";

  const allocation = useMemo(
    () =>
      monto != null && monto > 0
        ? allocateCobroPrimerPago(compra, pagos, monto)
        : [],
    [compra, pagos, monto],
  );

  const restanteTrasCobro =
    monto != null && monto > 0 ? Math.max(0, faltante - monto) : faltante;

  const referenciaDuplicadaLocal = useMemo(
    () => isReferenciaDuplicada(referencia, referenciasUsadas),
    [referencia, referenciasUsadas],
  );

  const referenciaDuplicadaFinal =
    presencial || !referencia.trim()
      ? false
      : referenciaDuplicadaLocal || referenciaDuplicada;

  useEffect(() => {
    const value = referencia.trim();
    if (!value || presencial || referenciaDuplicadaLocal) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setCheckingReferencia(true);
      checkReferenciaPagoUsada({ userId, referencia: value })
        .then((result) => {
          if (!cancelled) setReferenciaDuplicada(result.duplicada);
        })
        .catch(() => {
          if (!cancelled) setReferenciaDuplicada(false);
        })
        .finally(() => {
          if (!cancelled) setCheckingReferencia(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [referencia, referenciaDuplicadaLocal, presencial, userId]);

  function applyOcrResult(
    result: Awaited<ReturnType<typeof ocrReceiptFile>>,
    currentMonto: number | null,
  ) {
    setConfidence(result.confidence);
    if (result.referencia) setReferencia(result.referencia);
    if (result.monto) setMonto(result.monto);
    else if (faltante > 0 && currentMonto == null) setMonto(faltante);
    if (result.fechaComprobante) {
      setFecha(toDatetimeLocal(result.fechaComprobante));
    }
    const mapped = bancoFromDetectado(result.bancoDetectado);
    if (mapped) setBancoOrigen(mapped);
    else if (result.bancoDetectado === null && result.confidence > 0) {
      setBancoOrigen("otro");
    }
    if (result.confidence < 3) {
      toast.warning(
        "OCR incompleto. Revisa y completa los datos manualmente.",
      );
    } else {
      toast.success("Comprobante analizado. Revisa los datos.");
    }
  }

  function analyzeComprobante(targetFile?: File | null) {
    const image = targetFile ?? file;
    if (!image) {
      toast.error("Selecciona una imagen primero.");
      return;
    }
    const fileKey = `${image.name}:${image.size}:${image.lastModified}`;
    ocrFileKeyRef.current = fileKey;
    startOcrTransition(async () => {
      try {
        const result = await ocrReceiptFile(image);
        if (ocrFileKeyRef.current !== fileKey) return;
        applyOcrResult(result, monto);
      } catch (e) {
        if (ocrFileKeyRef.current !== fileKey) return;
        toast.error(e instanceof Error ? e.message : "Error al analizar.");
      }
    });
  }

  function handleFileChange(next: File | null) {
    setFile(next);
    setConfidence(null);
    if (!next) {
      ocrFileKeyRef.current = null;
      return;
    }
    analyzeComprobante(next);
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (!medioPagoAdmin) next.medio = "Elige cómo pagó el cliente.";
    if (monto == null || monto <= 0) next.monto = "Ingresa cuánto recibió.";
    else if (monto > faltante) {
      next.monto = `No puede superar lo que falta (${formatCop(faltante)}).`;
    }
    if (!presencial && !file) next.file = "Sube el comprobante de pago.";
    if (!presencial && !referencia.trim()) {
      next.referencia = "Ingresa la referencia.";
    }
    if (!presencial && referencia.trim() && referenciaDuplicadaFinal) {
      next.referencia =
        "Esta referencia ya fue usada en otro pago de este cliente.";
    }
    if (!presencial && !fecha) {
      next.fecha = "Ingresa la fecha del comprobante.";
    }
    return next;
  }

  function focusFirstError(next: FieldErrors) {
    if (next.monto) {
      document.getElementById("cobro-monto")?.focus();
      return;
    }
    if (next.referencia) {
      refInputRef.current?.focus();
      return;
    }
    if (next.fecha) {
      fechaRef.current?.focus();
    }
  }

  function submit() {
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) {
      focusFirstError(next);
      return;
    }

    startTransition(async () => {
      try {
        const formData = new FormData();
        if (file) formData.set("file", file);
        formData.set("userId", String(userId));
        formData.set("compraId", compra.id);
        if (referencia.trim()) formData.set("referencia", referencia.trim());
        formData.set("monto", String(monto));
        if (fecha) formData.set("fechaComprobante", datetimeLocalToIso(fecha));
        formData.set("medioPagoAdmin", medioPagoAdmin);
        formData.set("bancoOrigen", bancoOrigen);
        formData.set(
          "entradaManual",
          String(entradaManual || bancoOrigen === "otro" || presencial),
        );

        const result = await registrarCobroPrimerPago(formData);
        toast.success("Cobro registrado.");
        onOpenChange(false);
        onSuccess?.();

        if (presencial) {
          const recibo: CreditoPagoReceiptData = {
            pagoId: result.pagoId,
            clienteNombre,
            clienteCedula,
            motoModelo: compra.modelo,
            motoColor: compra.color,
            concepto: result.items[0]!.contexto,
            monto: result.total,
            items: result.items.map((i) => ({
              concepto: i.contexto,
              monto: i.monto,
            })),
            medioPago: medioPagoAdmin,
            referencia: result.referencia,
            confirmadoAt: result.confirmadoAt,
          };
          try {
            await printCreditoPagoReceipt(recibo);
          } catch {
            toast.message(
              "Pago guardado. Si no ves impresión, permite ventanas emergentes o usa Ctrl+P en la pestaña del recibo.",
            );
          }
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al registrar.");
      }
    });
  }

  const chipConceptos: { contexto: PrimerPagoConcepto; label: string; value: number }[] =
    (
      [
        ["inicial", "Inicial"],
        ["cuota_adelantada", "Adelantada"],
        ["visita", "Visita"],
      ] as const
    )
      .map(([contexto, label]) => ({
        contexto,
        label,
        value: faltanteConcepto(compra, pagos, contexto),
      }))
      .filter((c) => c.value > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cobrar primer pago</DialogTitle>
          <DialogDescription>
            Faltan {formatCop(faltante)}. El sistema reparte el dinero en orden:
            inicial, adelantada y visita.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">¿Cómo pagó?</legend>
            <div
              className="grid grid-cols-2 gap-2"
              role="radiogroup"
              aria-label="Medio de pago"
            >
              {MEDIOS.map((m) => {
                const selected = medioPagoAdmin === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={pending || ocrPending}
                    onClick={() => {
                      setMedioPagoAdmin(m.value);
                      if (isPresencialMedio(m.value)) {
                        setFile(null);
                        if (!fecha) setFecha(nowDatetimeLocal());
                      }
                    }}
                    className={cn(
                      "min-h-12 rounded-lg border px-3 py-2 text-left text-sm font-medium touch-manipulation outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      selected
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border bg-background text-muted-foreground hover:bg-muted/50",
                    )}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
            {errors.medio && (
              <p className="text-sm text-destructive" role="alert">
                {errors.medio}
              </p>
            )}
          </fieldset>

          <div className="flex flex-col gap-2">
            <Label htmlFor="cobro-monto">¿Cuánto recibió? (COP)</Label>
            <CurrencyInput
              id="cobro-monto"
              value={monto}
              onValueChange={(v) => {
                setMonto(v);
                setEntradaManual(true);
                setErrors((e) => ({ ...e, monto: undefined }));
              }}
              min={1}
              max={faltante}
              disabled={pending || ocrPending}
              aria-invalid={Boolean(errors.monto)}
              aria-describedby={
                errors.monto ? "cobro-monto-error" : "cobro-reparto"
              }
              className="min-h-12 text-lg font-semibold"
            />
            {errors.monto && (
              <p
                id="cobro-monto-error"
                className="text-sm text-destructive"
                role="alert"
              >
                {errors.monto}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={pending || faltante <= 0}
                onClick={() => setMonto(faltante)}
              >
                Todo ({formatCop(faltante)})
              </Button>
              {chipConceptos.map((c) => (
                <Button
                  key={c.contexto}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => setMonto(c.value)}
                >
                  {c.label} ({formatCop(c.value)})
                </Button>
              ))}
            </div>
            <p id="cobro-reparto" className="text-sm text-muted-foreground" role="status">
              {allocation.length === 0
                ? "Indica un monto para ver cómo se aplica."
                : `Se aplica a: ${allocation
                    .map(
                      (a) =>
                        `${CONTEXTO_PAGO_LABELS[a.contexto]} ${formatCop(a.monto)}`,
                    )
                    .join(" · ")}`}
              {monto != null &&
                monto > 0 &&
                restanteTrasCobro > 0 &&
                ` · Quedarán pendientes ${formatCop(restanteTrasCobro)}.`}
            </p>
          </div>

          {presencial ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              Pago presencial ({MEDIO_PAGO_ADMIN_LABELS[medioPagoAdmin]}). No
              requiere foto
              {esEfectivo ? "" : " (voucher datáfono opcional)"}
              ; al guardar se imprime el recibo.
            </div>
          ) : (
            <>
              <ImageFileField
                label="Comprobante de pago"
                file={file}
                onFileChange={handleFileChange}
                disabled={pending || ocrPending}
                enableDialogPaste
                enableCamera
                fileInputId="cobro-comprobante-file"
                cameraInputId="cobro-comprobante-camera"
              />
              {errors.file && (
                <p className="text-sm text-destructive" role="alert">
                  {errors.file}
                </p>
              )}

              <div className="flex flex-col gap-2">
                <Label htmlFor="cobro-banco">Banco de origen</Label>
                <TouchSelect
                  id="cobro-banco"
                  aria-label="Banco de origen"
                  value={bancoOrigen}
                  disabled={pending || ocrPending}
                  onChange={(v) => {
                    setBancoOrigen(v as BancoOrigen);
                    if (v === "otro") setEntradaManual(true);
                  }}
                  options={(
                    Object.keys(BANCO_ORIGEN_LABELS) as BancoOrigen[]
                  ).map((key) => ({
                    value: key,
                    label: BANCO_ORIGEN_LABELS[key],
                  }))}
                />
              </div>

              {file && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending || ocrPending}
                  onClick={() => analyzeComprobante()}
                >
                  {ocrPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analizando…
                    </>
                  ) : (
                    "Analizar comprobante"
                  )}
                </Button>
              )}

              {confidence !== null && confidence < 3 && (
                <p className="text-sm text-amber-700">
                  Revisa los datos extraídos. Algunos campos no se detectaron
                  con claridad.
                </p>
              )}

              <div className="flex flex-col gap-2">
                <Label htmlFor="cobro-referencia">Referencia</Label>
                <Input
                  ref={refInputRef}
                  id="cobro-referencia"
                  value={referencia}
                  onChange={(e) => {
                    setReferencia(e.target.value);
                    setEntradaManual(true);
                    setReferenciaDuplicada(false);
                    setCheckingReferencia(false);
                    setErrors((er) => ({ ...er, referencia: undefined }));
                  }}
                  placeholder="Ej. M12636825"
                  disabled={pending || ocrPending}
                  aria-invalid={
                    Boolean(errors.referencia) || referenciaDuplicadaFinal
                  }
                  aria-describedby={
                    errors.referencia || referenciaDuplicadaFinal
                      ? "cobro-ref-error"
                      : undefined
                  }
                />
                {(errors.referencia || referenciaDuplicadaFinal) && (
                  <p
                    id="cobro-ref-error"
                    className="text-sm text-destructive"
                    role="alert"
                  >
                    {errors.referencia ||
                      "Esta referencia ya fue usada en otro pago de este cliente."}
                  </p>
                )}
                {checkingReferencia &&
                  referencia.trim() &&
                  !referenciaDuplicadaFinal && (
                    <p className="text-xs text-muted-foreground">
                      Verificando referencia…
                    </p>
                  )}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="cobro-fecha">Fecha del comprobante</Label>
                <Input
                  ref={fechaRef}
                  id="cobro-fecha"
                  type="datetime-local"
                  value={fecha}
                  onChange={(e) => {
                    setFecha(e.target.value);
                    setEntradaManual(true);
                    setErrors((er) => ({ ...er, fecha: undefined }));
                  }}
                  disabled={pending || ocrPending}
                  aria-invalid={Boolean(errors.fecha)}
                  aria-describedby={errors.fecha ? "cobro-fecha-error" : undefined}
                />
                {errors.fecha && (
                  <p
                    id="cobro-fecha-error"
                    className="text-sm text-destructive"
                    role="alert"
                  >
                    {errors.fecha}
                  </p>
                )}
              </div>
            </>
          )}

          {!esEfectivo && presencial && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="cobro-ref-opcional">Referencia (opcional)</Label>
              <Input
                id="cobro-ref-opcional"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder="Voucher datáfono (opcional)"
                disabled={pending}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            disabled={pending || ocrPending || checkingReferencia}
            onClick={submit}
          >
            {pending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando…
              </>
            ) : presencial ? (
              `Registrar ${monto != null ? formatCop(monto) : ""} e imprimir`
            ) : (
              `Registrar ${monto != null ? formatCop(monto) : "cobro"}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
