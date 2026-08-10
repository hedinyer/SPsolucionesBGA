"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  checkReferenciaPagoUsada,
  confirmPagoConComprobante,
} from "@/lib/actions/payment-comprobante-actions";
import { ocrReceiptFile } from "@/lib/payments/receipt-ocr-client";
import type { BancoDetectado } from "@/lib/payments/receipt-parser";
import { isReferenciaDuplicada } from "@/lib/payments/referencia";
import {
  printCreditoPagoReceipt,
  type CreditoPagoReceiptData,
} from "@/lib/printing/credito-pago-receipt";
import {
  BANCO_ORIGEN_LABELS,
  CONTEXTO_PAGO_LABELS,
  MEDIO_PAGO_ADMIN_LABELS,
  MEDIO_PAGO_ADMIN_OPTIONS,
  type BancoOrigen,
  type ContextoPago,
  type MedioPagoAdmin,
} from "@/lib/pipeline/types";
import { formatCop } from "@/lib/utils/format";
import { ImageFileField } from "@/components/ui/image-file-field";
import { Button } from "@/components/ui/button";
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

interface PaymentComprobanteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contexto: ContextoPago;
  userId: number;
  compraId: string;
  tarifaId?: string;
  montoEsperado?: number;
  montoFaltante?: number;
  referenciasUsadas?: string[];
  clienteNombre?: string;
  clienteCedula?: string;
  motoModelo?: string;
  motoColor?: string;
  /** Medio preseleccionado al abrir (p. ej. efectivo sin foto). */
  initialMedioPago?: MedioPagoAdmin;
  onSuccess?: () => void;
}

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

export function PaymentComprobanteDialog({
  open,
  onOpenChange,
  contexto,
  userId,
  compraId,
  tarifaId,
  montoEsperado,
  montoFaltante,
  referenciasUsadas = [],
  clienteNombre = "Cliente",
  clienteCedula = "",
  motoModelo = "",
  motoColor = "",
  initialMedioPago = "nequi_nicolas",
  onSuccess,
}: PaymentComprobanteDialogProps) {
  const sugeridoMonto = montoFaltante ?? montoEsperado;

  const [pending, startTransition] = useTransition();
  const [ocrPending, startOcrTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [bancoOrigen, setBancoOrigen] = useState<BancoOrigen>("nequi");
  const [medioPagoAdmin, setMedioPagoAdmin] =
    useState<MedioPagoAdmin>(initialMedioPago);
  const [referencia, setReferencia] = useState("");
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState("");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [entradaManual, setEntradaManual] = useState(false);
  const [referenciaDuplicada, setReferenciaDuplicada] = useState(false);
  const [checkingReferencia, setCheckingReferencia] = useState(false);
  const ocrFileKeyRef = useRef<string | null>(null);

  const presencial = isPresencialMedio(medioPagoAdmin);
  const esEfectivo = medioPagoAdmin === "efectivo";

  const referenciaDuplicadaLocal = useMemo(
    () => isReferenciaDuplicada(referencia, referenciasUsadas),
    [referencia, referenciasUsadas],
  );

  useEffect(() => {
    if (!open) return;
    setReferenciaDuplicada(false);
    setCheckingReferencia(false);
  }, [open]);

  useEffect(() => {
    const value = referencia.trim();
    if (!value || presencial) {
      setReferenciaDuplicada(false);
      setCheckingReferencia(false);
      return;
    }

    if (referenciaDuplicadaLocal) {
      setReferenciaDuplicada(true);
      setCheckingReferencia(false);
      return;
    }

    setCheckingReferencia(true);
    const timer = window.setTimeout(() => {
      checkReferenciaPagoUsada({ userId, referencia: value })
        .then((result) => setReferenciaDuplicada(result.duplicada))
        .catch(() => setReferenciaDuplicada(false))
        .finally(() => setCheckingReferencia(false));
    }, 350);

    return () => window.clearTimeout(timer);
  }, [referencia, referenciaDuplicadaLocal, presencial, userId]);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setBancoOrigen("nequi");
    setMedioPagoAdmin(initialMedioPago);
    setReferencia("");
    setMonto(sugeridoMonto ? String(sugeridoMonto) : "");
    setFecha(
      isPresencialMedio(initialMedioPago) ? nowDatetimeLocal() : "",
    );
    setConfidence(null);
    setEntradaManual(isPresencialMedio(initialMedioPago));
    ocrFileKeyRef.current = null;
  }, [open, sugeridoMonto, initialMedioPago]);

  useEffect(() => {
    if (!open || !presencial) return;
    if (!fecha) setFecha(nowDatetimeLocal());
  }, [open, presencial, fecha]);

  function handleBancoChange(value: BancoOrigen) {
    setBancoOrigen(value);
    if (value === "otro") {
      setEntradaManual(true);
    }
  }

  function handleMedioChange(value: MedioPagoAdmin) {
    setMedioPagoAdmin(value);
    if (isPresencialMedio(value)) {
      setFile(null);
      setBancoOrigen("nequi");
      setConfidence(null);
      ocrFileKeyRef.current = null;
      if (!fecha) setFecha(nowDatetimeLocal());
    }
  }

  function applyOcrResult(
    result: Awaited<ReturnType<typeof ocrReceiptFile>>,
    currentMonto: string,
  ) {
    setConfidence(result.confidence);
    if (result.referencia) setReferencia(result.referencia);
    if (result.monto) setMonto(String(result.monto));
    else if (montoEsperado && !currentMonto) setMonto(String(montoEsperado));
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

  function submit() {
    if (!presencial && !file) {
      toast.error("Sube el comprobante de pago.");
      return;
    }
    if (!presencial && !referencia.trim()) {
      toast.error("Ingresa la referencia.");
      return;
    }
    if (!presencial && referencia.trim() && referenciaDuplicada) {
      toast.error("Esta referencia ya fue usada en otro pago de este cliente.");
      return;
    }
    const montoNum = parseInt(monto.replace(/\D/g, ""), 10);
    if (!montoNum || montoNum <= 0) {
      toast.error("Ingresa un monto válido.");
      return;
    }
    if (!presencial && !fecha) {
      toast.error("Ingresa la fecha del comprobante.");
      return;
    }

    startTransition(async () => {
      try {
        const formData = new FormData();
        if (file) formData.set("file", file);
        formData.set("userId", String(userId));
        formData.set("compraId", compraId);
        formData.set("contexto", contexto);
        if (tarifaId) formData.set("tarifaId", tarifaId);
        if (referencia.trim()) formData.set("referencia", referencia.trim());
        formData.set("monto", String(montoNum));
        if (fecha) formData.set("fechaComprobante", datetimeLocalToIso(fecha));
        formData.set("medioPagoAdmin", medioPagoAdmin);
        formData.set("bancoOrigen", bancoOrigen);
        formData.set(
          "entradaManual",
          String(entradaManual || bancoOrigen === "otro" || presencial),
        );

        const result = await confirmPagoConComprobante(formData);
        toast.success("Abono registrado.");
        onOpenChange(false);
        onSuccess?.();

        if (presencial) {
          const recibo: CreditoPagoReceiptData = {
            pagoId: result.pagoId,
            clienteNombre,
            clienteCedula,
            motoModelo,
            motoColor,
            concepto: contexto,
            monto: montoNum,
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
        toast.error(e instanceof Error ? e.message : "Error al confirmar.");
      }
    });
  }

  const showOcrWarning =
    !presencial && confidence !== null && confidence < 3;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar abono</DialogTitle>
          <DialogDescription>
            {CONTEXTO_PAGO_LABELS[contexto]}
            {sugeridoMonto != null && sugeridoMonto > 0
              ? ` · Faltan ${formatCop(sugeridoMonto)}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Medio de pago</Label>
            <TouchSelect
              aria-label="Medio de pago"
              value={medioPagoAdmin}
              disabled={pending || ocrPending}
              onChange={(v) => handleMedioChange(v as MedioPagoAdmin)}
              options={MEDIO_PAGO_ADMIN_OPTIONS.map((key) => ({
                value: key,
                label: MEDIO_PAGO_ADMIN_LABELS[key],
              }))}
            />
          </div>

          {presencial ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              Pago presencial ({MEDIO_PAGO_ADMIN_LABELS[medioPagoAdmin]}). No
              requiere foto ni referencia
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
                fileInputId="pago-comprobante-file"
                cameraInputId="pago-comprobante-camera"
              />

              <div className="flex flex-col gap-2">
                <Label>Banco de origen</Label>
                <TouchSelect
                  aria-label="Banco de origen"
                  value={bancoOrigen}
                  disabled={pending || ocrPending}
                  onChange={(v) => handleBancoChange(v as BancoOrigen)}
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
            </>
          )}

          {showOcrWarning && (
            <p className="text-sm text-amber-700">
              Revisa los datos extraídos. Algunos campos no se detectaron con
              claridad.
            </p>
          )}

          {!esEfectivo && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="referencia">
              {presencial ? "Referencia (opcional)" : "Referencia"}
            </Label>
            <Input
              id="referencia"
              value={referencia}
              onChange={(e) => {
                setReferencia(e.target.value);
                setEntradaManual(true);
              }}
              placeholder={
                presencial
                  ? "Voucher datáfono (opcional)"
                  : "Ej. M12636825"
              }
              disabled={pending || ocrPending}
              aria-invalid={referenciaDuplicada}
              className={
                referenciaDuplicada
                  ? "border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500/30"
                  : undefined
              }
            />
            {checkingReferencia &&
              referencia.trim() &&
              !referenciaDuplicadaLocal &&
              !presencial && (
                <p className="text-xs text-muted-foreground">
                  Verificando referencia…
                </p>
              )}
            {referenciaDuplicada && !presencial && (
              <p className="text-xs font-medium text-destructive">
                Esta referencia ya fue usada en otro pago de este cliente.
              </p>
            )}
          </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="monto">Monto (COP)</Label>
            <Input
              id="monto"
              type="number"
              min={1}
              value={monto}
              onChange={(e) => {
                setMonto(e.target.value);
                setEntradaManual(true);
              }}
              placeholder={sugeridoMonto ? String(sugeridoMonto) : "8000"}
              disabled={pending || ocrPending}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="fecha">
              {presencial ? "Fecha del pago" : "Fecha del comprobante"}
            </Label>
            <Input
              id="fecha"
              type="datetime-local"
              value={fecha}
              onChange={(e) => {
                setFecha(e.target.value);
                setEntradaManual(true);
              }}
              disabled={pending || ocrPending}
            />
          </div>
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
            disabled={
              pending ||
              ocrPending ||
              (!presencial && referenciaDuplicada) ||
              (!presencial && checkingReferencia)
            }
            onClick={submit}
          >
            {pending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando…
              </>
            ) : presencial ? (
              "Registrar e imprimir recibo"
            ) : (
              "Registrar abono"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
