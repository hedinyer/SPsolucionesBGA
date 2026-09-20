"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  congelarCuotas,
  saldarCredito,
} from "@/lib/actions/credito-operaciones-actions";
import { transferirTitularidad, markMotoRecogidaByUserId, inactivarMotoCliente, setClienteVigilado } from "@/lib/actions/admin-actions";
import {
  getMoraDisplay,
  getPlazoRecuperacion,
  puedeMarcarMotoRecogida,
} from "@/lib/pipeline/mora-utils";
import { searchClientesAction } from "@/lib/actions/clientes-search-actions";
import { checkReferenciaPagoUsada } from "@/lib/actions/payment-comprobante-actions";
import { isReferenciaDuplicada } from "@/lib/payments/referencia";
import {
  printCreditoPagoReceipt,
  type CreditoPagoReceiptData,
} from "@/lib/printing/credito-pago-receipt";
import type { ClientPipeline, ClientSearchResult } from "@/lib/pipeline/types";
import {
  MEDIO_PAGO_ADMIN_LABELS,
  MEDIO_PAGO_ADMIN_OPTIONS,
  type MedioPagoAdmin,
} from "@/lib/pipeline/types";
import { formatCop } from "@/lib/utils/format";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { TouchSelect } from "@/components/ui/touch-select";
import { ImageFileField } from "@/components/ui/image-file-field";

function isPresencialMedio(medio: MedioPagoAdmin): boolean {
  return medio === "efectivo" || medio === "datafono";
}

function clienteCedula(pipeline: ClientPipeline): string {
  const hoja = pipeline.contract?.hoja_vida_data as
    | Record<string, unknown>
    | undefined;
  const contrato = pipeline.contract?.contrato_data as
    | Record<string, unknown>
    | undefined;
  return (
    (hoja?.numero_identificacion as string | undefined)?.trim() ||
    (contrato?.cedula_contratante as string | undefined)?.trim() ||
    ""
  );
}

export function ClientHeaderActions({ pipeline }: { pipeline: ClientPipeline }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [vigiladoOpen, setVigiladoOpen] = useState(false);

  const compra = pipeline.compra;
  const renting = pipeline.rentingResumen;
  const mora = getMoraDisplay(pipeline);
  const cuotasActivas =
    (renting?.cuotasPendientes ?? 0) + (renting?.cuotasVencidas ?? 0);
  const showCreditoOps =
    compra?.estado === "entregada" && cuotasActivas > 0;
  const showTransfer =
    Boolean(compra) && compra?.estado !== "cancelada";

  const showMarcarRecogida = puedeMarcarMotoRecogida({
    compraEstado: compra?.estado,
    diasAtraso: mora.dias,
    montoAdeudado: mora.monto,
    recoger: pipeline.recoger,
    estadoFisico: compra?.estado_fisico,
  });
  const yaRecogida = mora.yaRecogida;
  const plazo = getPlazoRecuperacion(pipeline.recoger?.fecha_recogida);
  const showInactivar = yaRecogida && plazo.plazoVencido;

  function marcarRecogida() {
    startTransition(async () => {
      try {
        await markMotoRecogidaByUserId({ userId: pipeline.user.id });
        toast.success(
          "Moto registrada en Garaje. Completa la foto de placa y ubicación.",
          {
            action: {
              label: "Ir a Garaje",
              onClick: () => {
                window.location.href = "/garaje?fotoPendiente=1";
              },
            },
          },
        );
        router.refresh();
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "No se pudo marcar como recogida.",
        );
      }
    });
  }

  function inactivarMoto() {
    startTransition(async () => {
      try {
        await inactivarMotoCliente({ userId: pipeline.user.id });
        toast.success("Moto inactivada. Liberada para mantenimiento.");
        router.refresh();
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "No se pudo inactivar la moto.",
        );
      }
    });
  }

  function quitarVigilancia() {
    startTransition(async () => {
      try {
        await setClienteVigilado({
          userId: pipeline.user.id,
          vigilado: false,
        });
        toast.success("Vigilancia quitada.");
        router.refresh();
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "No se pudo quitar la vigilancia.",
        );
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" asChild className="min-h-11">
        <Link href="/hojadevida" target="_blank">
          Formulario web
        </Link>
      </Button>
      {pipeline.vigilado ? (
        <>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={pending}
            onClick={() => setVigiladoOpen(true)}
          >
            Editar vigilancia
          </Button>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={pending}
            onClick={quitarVigilancia}
          >
            Quitar vigilancia
          </Button>
        </>
      ) : (
        <Button
          variant="outline"
          className="min-h-11 border-foreground font-semibold text-foreground"
          disabled={pending}
          onClick={() => setVigiladoOpen(true)}
        >
          ! Vigilar cliente
        </Button>
      )}
      {showMarcarRecogida ? (
        <Button
          variant="destructive"
          className="min-h-11"
          disabled={pending}
          onClick={marcarRecogida}
        >
          Moto recogida
        </Button>
      ) : null}
      {showInactivar ? (
        <Button
          variant="outline"
          className="min-h-11 border-foreground text-foreground"
          disabled={pending}
          onClick={inactivarMoto}
        >
          Inactivar moto
        </Button>
      ) : null}
      {yaRecogida && !plazo.plazoVencido ? (
        <Badge variant="outline" className="w-fit text-xs">
          Recuperación: {plazo.diasRestantes} día
          {plazo.diasRestantes === 1 ? "" : "s"} restante
          {plazo.diasRestantes === 1 ? "" : "s"}
        </Badge>
      ) : null}
      {showTransfer && compra && (
        <Button
          variant="outline"
          className="min-h-11"
          onClick={() => setTransferOpen(true)}
        >
          Transferir titularidad
        </Button>
      )}
      {showCreditoOps && compra && (
        <>
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => setFreezeOpen(true)}
          >
            Congelar cuotas
          </Button>
          <Button className="min-h-11" onClick={() => setSettleOpen(true)}>
            Pagar crédito
          </Button>
        </>
      )}
      {pipeline.congelamiento && (
        <Badge className="w-fit bg-sky-100 text-sky-700 hover:bg-sky-100">
          Crédito congelado · {pipeline.congelamiento.diasRestantes} día
          {pipeline.congelamiento.diasRestantes === 1 ? "" : "s"}
        </Badge>
      )}
      {pipeline.currentAdminStep && (
        <Badge className="w-fit">
          Acción requerida
        </Badge>
      )}
      <VigiladoDialog
        open={vigiladoOpen}
        onOpenChange={setVigiladoOpen}
        userId={pipeline.user.id}
        initialNota={pipeline.notaVigilancia ?? ""}
        yaVigilado={pipeline.vigilado}
      />
      {compra && (
        <>
          <CongelarCuotasDialog
            open={freezeOpen}
            onOpenChange={setFreezeOpen}
            userId={pipeline.user.id}
            compraId={compra.id}
            cuotasActivas={cuotasActivas}
          />
          <SaldarCreditoDialog
            open={settleOpen}
            onOpenChange={setSettleOpen}
            pipeline={pipeline}
            compraId={compra.id}
            adeudado={renting?.totalAdeudado ?? 0}
            referenciasUsadas={pipeline.pagosHistorial
              .map((p) => p.referencia)
              .filter((r): r is string => Boolean(r?.trim()))}
          />
          {showTransfer && (
            <TransferirTitularidadDialog
              open={transferOpen}
              onOpenChange={setTransferOpen}
              fromUserId={pipeline.user.id}
              fromLabel={
                pipeline.displayName ||
                clienteCedula(pipeline) ||
                `@${pipeline.user.user}`
              }
              compraId={compra.id}
            />
          )}
        </>
      )}
    </div>
  );
}

function VigiladoDialog({
  open,
  onOpenChange,
  userId,
  initialNota,
  yaVigilado,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: number;
  initialNota: string;
  yaVigilado: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [nota, setNota] = useState(initialNota);

  useEffect(() => {
    if (open) setNota(initialNota);
  }, [open, initialNota]);

  function guardar() {
    const trimmed = nota.trim();
    if (!trimmed) {
      toast.error("Indica el motivo de la vigilancia.");
      return;
    }
    startTransition(async () => {
      try {
        await setClienteVigilado({
          userId,
          vigilado: true,
          nota: trimmed,
        });
        toast.success(
          yaVigilado ? "Nota de vigilancia actualizada." : "Cliente vigilado.",
        );
        onOpenChange(false);
        router.refresh();
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "No se pudo guardar la vigilancia.",
        );
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {yaVigilado ? "Editar vigilancia" : "Vigilar cliente"}
          </DialogTitle>
          <DialogDescription>
            Explica por qué hay que vigilarlo: que no se atrase, recoger rápido,
            etc. Esta nota se ve en la lista de clientes.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="nota-vigilancia">Motivo de la vigilancia</Label>
          <Textarea
            id="nota-vigilancia"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={4}
            placeholder="Ej.: Ya lo recogimos una vez; no dejar que suba la deuda."
            className="min-h-24"
          />
        </div>
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
            disabled={pending || !nota.trim()}
            onClick={guardar}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : yaVigilado ? (
              "Guardar nota"
            ) : (
              "Marcar vigilado"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransferirTitularidadDialog({
  open,
  onOpenChange,
  fromUserId,
  fromLabel,
  compraId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fromUserId: number;
  fromLabel: string;
  compraId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<ClientSearchResult | null>(null);
  const [motivo, setMotivo] = useState("");
  const reqId = useRef(0);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setSelected(null);
      setMotivo("");
      setSearching(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    const id = ++reqId.current;
    setSearching(true);
    const t = setTimeout(() => {
      void searchClientesAction(q).then((data) => {
        if (id !== reqId.current) return;
        setResults(
          data.filter(
            (c) => c.userId !== fromUserId && c.compraEstado == null,
          ),
        );
        setSearching(false);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [query, open, fromUserId]);

  function handleSubmit() {
    if (!selected) {
      toast.error("Elige el nuevo titular.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await transferirTitularidad({
          compraId,
          fromUserId,
          toUserId: selected.userId,
          motivo: motivo.trim() || undefined,
        });
        toast.success("Titularidad transferida.", {
          action: {
            label: "Ver ficha",
            onClick: () => router.push(`/clientes/${result.toUserId}`),
          },
        });
        onOpenChange(false);
        router.push(`/clientes/${result.toUserId}`);
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "No se pudo transferir.",
        );
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Transferir titularidad</DialogTitle>
          <DialogDescription>
            La moto y el crédito pasan al nuevo titular. Crea al cliente antes
            si aún no existe. Origen: {fromLabel}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="titularidad-buscar">Nuevo titular</Label>
            <Input
              id="titularidad-buscar"
              placeholder="Cédula o nombre (mín. 2 caracteres)"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(null);
              }}
            />
            {searching && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Buscando…
              </p>
            )}
            {!searching && query.trim().length >= 2 && results.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Sin candidatos sin moto. Regístralo en Clientes primero.
              </p>
            )}
            {results.length > 0 && !selected && (
              <ul className="max-h-40 overflow-auto rounded-md border border-border">
                {results.map((c) => (
                  <li key={c.userId}>
                    <button
                      type="button"
                      className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => {
                        setSelected(c);
                        setQuery(c.displayName || c.cedula || c.username);
                      }}
                    >
                      <span className="font-medium">
                        {c.displayName || c.username}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {[c.cedula, `@${c.username}`].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {selected && (
              <p className="rounded-md bg-muted/60 px-3 py-2 text-sm">
                Destino:{" "}
                <span className="font-medium">
                  {selected.displayName || selected.username}
                </span>
                {selected.cedula ? ` · ${selected.cedula}` : ""}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="titularidad-motivo">Motivo (opcional)</Label>
            <Textarea
              id="titularidad-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              maxLength={500}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={pending || !selected} onClick={handleSubmit}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Transferir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CongelarCuotasDialog({
  open,
  onOpenChange,
  userId,
  compraId,
  cuotasActivas,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: number;
  compraId: string;
  cuotasActivas: number;
}) {
  const [pending, startTransition] = useTransition();
  const [dias, setDias] = useState("7");
  const [observaciones, setObservaciones] = useState("");

  const diasNum = Number(dias);

  function handleSubmit() {
    if (!Number.isFinite(diasNum) || diasNum < 1) {
      toast.error("Ingresa un número de días válido.");
      return;
    }

    startTransition(async () => {
      try {
        const { cuotasAfectadas } = await congelarCuotas({
          userId,
          compraId,
          dias: diasNum,
          observaciones: observaciones.trim() || undefined,
        });
        toast.success(
          `Congeladas ${cuotasAfectadas} cuota${cuotasAfectadas === 1 ? "" : "s"} por ${diasNum} días.`,
        );
        onOpenChange(false);
        setObservaciones("");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al congelar.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Congelar cuotas</DialogTitle>
          <DialogDescription>
            Las {cuotasActivas} cuota{cuotasActivas === 1 ? "" : "s"} pendiente
            {cuotasActivas === 1 ? "" : "s"} o vencida
            {cuotasActivas === 1 ? "" : "s"} se corren al día en que termina el
            congelamiento ({diasNum > 0 ? diasNum : "X"} días). No se cobra mora
            mientras esté congelado.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="congelar-dias">Días</Label>
            <Input
              id="congelar-dias"
              type="number"
              min={1}
              max={365}
              value={dias}
              onChange={(e) => setDias(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="congelar-notas">Observaciones (opcional)</Label>
            <Textarea
              id="congelar-notas"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={pending} onClick={handleSubmit}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Congelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SaldarCreditoDialog({
  open,
  onOpenChange,
  pipeline,
  compraId,
  adeudado,
  referenciasUsadas,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipeline: ClientPipeline;
  compraId: string;
  adeudado: number;
  referenciasUsadas: string[];
}) {
  const [pending, startTransition] = useTransition();
  const [monto, setMonto] = useState("");
  const [medio, setMedio] = useState<MedioPagoAdmin>("efectivo");
  const [referencia, setReferencia] = useState("");
  const [notas, setNotas] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const presencial = isPresencialMedio(medio);
  const referenciaDuplicada = useMemo(
    () => isReferenciaDuplicada(referencia, referenciasUsadas),
    [referencia, referenciasUsadas],
  );

  function resetForm() {
    setMonto("");
    setMedio("efectivo");
    setReferencia("");
    setNotas("");
    setFile(null);
  }

  function handleSubmit() {
    const montoNum = Number(monto.replace(/\D/g, ""));
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      toast.error("Ingresa el monto negociado.");
      return;
    }
    if (!presencial && !file) {
      toast.error("Sube el comprobante de pago.");
      return;
    }
    if (!presencial && !referencia.trim()) {
      toast.error("Ingresa la referencia.");
      return;
    }
    if (referenciaDuplicada) {
      toast.error("Esa referencia ya está registrada.");
      return;
    }

    startTransition(async () => {
      try {
        if (referencia.trim()) {
          const dup = await checkReferenciaPagoUsada({
            userId: pipeline.user.id,
            referencia: referencia.trim(),
          });
          if (dup.duplicada) {
            toast.error("Esa referencia ya está registrada.");
            return;
          }
        }

        const fd = new FormData();
        fd.set("userId", String(pipeline.user.id));
        fd.set("compraId", compraId);
        fd.set("monto", String(montoNum));
        fd.set("medioPagoAdmin", medio);
        if (referencia.trim()) fd.set("referencia", referencia.trim());
        if (notas.trim()) fd.set("notas", notas.trim());
        if (file) fd.set("file", file);

        const { pagoId, confirmadoAt } = await saldarCredito(fd);

        const recibo: CreditoPagoReceiptData = {
          pagoId,
          clienteNombre: pipeline.displayName,
          clienteCedula: clienteCedula(pipeline),
          motoModelo: pipeline.compra?.modelo ?? "",
          motoColor: pipeline.compra?.color ?? "",
          concepto: "liquidacion",
          monto: montoNum,
          medioPago: medio,
          referencia: referencia.trim() || null,
          confirmadoAt,
        };

        printCreditoPagoReceipt(recibo).catch(() => {
          toast.message("Pago registrado; no se pudo imprimir el recibo.");
        });

        toast.success("Crédito saldado.");
        resetForm();
        onOpenChange(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al saldar crédito.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetForm();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pagar crédito</DialogTitle>
          <DialogDescription>
            Liquidación negociada. Se marcarán todas las cuotas como pagadas y el
            crédito quedará saldado
            {adeudado > 0
              ? ` (adeudado teórico: ${formatCop(adeudado)}).`
              : "."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="saldar-monto">Monto negociado</Label>
            <Input
              id="saldar-monto"
              inputMode="numeric"
              placeholder="0"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Medio de pago</Label>
            <TouchSelect
              aria-label="Medio de pago"
              value={medio}
              onChange={(v) => setMedio(v as MedioPagoAdmin)}
              options={MEDIO_PAGO_ADMIN_OPTIONS.map((m) => ({
                value: m,
                label: MEDIO_PAGO_ADMIN_LABELS[m],
              }))}
            />
          </div>
          {!presencial && (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="saldar-ref">Referencia</Label>
                <Input
                  id="saldar-ref"
                  value={referencia}
                  onChange={(e) => setReferencia(e.target.value)}
                  aria-invalid={referenciaDuplicada}
                />
                {referenciaDuplicada && (
                  <p className="text-sm text-destructive">
                    Referencia ya usada por este cliente.
                  </p>
                )}
              </div>
              <ImageFileField
                label="Comprobante"
                file={file}
                onFileChange={setFile}
                disabled={pending}
                enableDialogPaste
                enableCamera
              />
            </>
          )}
          {presencial && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="saldar-ref-opc">Referencia (opcional)</Label>
              <Input
                id="saldar-ref-opc"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder="Se genera automáticamente si queda vacía"
              />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="saldar-notas">Notas (opcional)</Label>
            <Textarea
              id="saldar-notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={pending || referenciaDuplicada} onClick={handleSubmit}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirmar liquidación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
