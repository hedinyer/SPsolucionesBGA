"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Copy, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { markMotoRecogida, resolveMoroso } from "@/lib/actions/admin-actions";
import {
  CONTEXTO_PAGO_LABELS,
  FRECUENCIA_LABELS,
  TARIFA_ESTADO_LABELS,
  type ClientPipeline,
  type TarifaPagadaRow,
} from "@/lib/pipeline/types";
import { getMoraDisplay } from "@/lib/pipeline/mora-utils";
import { cuotaFraction } from "@/lib/payments/payment-metrics";
import { formatCop, formatCuotas, formatDate, formatDateOnly } from "@/lib/utils/format";
import {
  captureElementAsPng,
  copyImageBlobToClipboard,
  downloadImageBlob,
} from "@/lib/utils/capture-element-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PaymentComprobanteDialog } from "@/components/pipeline/payment-comprobante-dialog";

interface RentingPanelProps {
  pipeline: ClientPipeline;
  userId: number;
}

function tarifaBadgeVariant(estado: TarifaPagadaRow["estado"]) {
  switch (estado) {
    case "pagada":
      return "default" as const;
    case "vencida":
      return "destructive" as const;
    default:
      return "secondary" as const;
  }
}

function tarifaEstadoLabel(tarifa: TarifaPagadaRow): string {
  const pagado = tarifa.monto_pagado ?? 0;
  if (
    tarifa.estado !== "pagada" &&
    pagado > 0 &&
    pagado < tarifa.monto_esperado
  ) {
    return "Parcial";
  }
  return TARIFA_ESTADO_LABELS[tarifa.estado];
}

function tarifaTieneAbono(tarifa: TarifaPagadaRow): boolean {
  return (tarifa.monto_pagado ?? 0) > 0;
}

export function RentingPanel({ pipeline, userId }: RentingPanelProps) {
  const [pending, startTransition] = useTransition();
  const [capturingExtract, setCapturingExtract] = useState(false);
  const extractRef = useRef<HTMLDivElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTarifa, setSelectedTarifa] = useState<TarifaPagadaRow | null>(
    null,
  );
  const [comprobanteUrl, setComprobanteUrl] = useState<string | null>(null);
  const { compra, rentingResumen, tarifas, moroso, recoger, pagosHistorial, atraso, comprobanteByTarifaId } =
    pipeline;

  const mora = getMoraDisplay({ atraso, moroso, recoger, rentingResumen });
  const moraResumen = mora.tieneDeuda && !mora.paraRecoger;

  const referenciasUsadas = useMemo(
    () =>
      pagosHistorial
        .map((p) => p.referencia)
        .filter((r): r is string => Boolean(r?.trim())),
    [pagosHistorial],
  );

  /** Ventana: 10 pagadas hacia atrás + 10 pendientes/vencidas hacia adelante. */
  const visibleTarifas = useMemo(() => {
    const unpaid = tarifas.filter((t) => t.estado !== "pagada");
    const recentPaid = tarifas
      .filter((t) => t.estado === "pagada")
      .slice(-10);
    return [...recentPaid, ...unpaid.slice(0, 10)].sort(
      (a, b) => a.numero_periodo - b.numero_periodo,
    );
  }, [tarifas]);

  const currentTarifaId = useMemo(() => {
    const current = tarifas.find((t) => t.estado !== "pagada");
    return current?.id ?? null;
  }, [tarifas]);

  useEffect(() => {
    if (!currentTarifaId) return;
    const desktop = document.getElementById(
      `tarifa-desktop-${currentTarifaId}`,
    );
    const mobile = document.getElementById(`tarifa-mobile-${currentTarifaId}`);
    const el =
      [desktop, mobile].find((node) => node && node.offsetParent !== null) ??
      desktop ??
      mobile;
    el?.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "instant",
    });
  }, [currentTarifaId, visibleTarifas]);

  if (!compra || (compra.estado !== "entregada" && compra.estado !== "saldada")) {
    return null;
  }

  const creditoSaldado = compra.estado === "saldada";

  function openConfirmDialog(tarifa: TarifaPagadaRow) {
    setSelectedTarifa(tarifa);
    setDialogOpen(true);
  }

  function regularizarMoroso() {
    if (!moroso) return;
    startTransition(async () => {
      try {
        await resolveMoroso({ morosoId: moroso.id, userId });
        toast.success("Cliente regularizado.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al regularizar.");
      }
    });
  }

  function marcarMotoRecogida() {
    if (!recoger) return;
    startTransition(async () => {
      try {
        await markMotoRecogida({ recogerId: recoger.id, userId });
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
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "No se pudo marcar como recogida.",
        );
      }
    });
  }

  async function copiarExtractoPagos() {
    const element = extractRef.current;
    if (!element) return;

    setCapturingExtract(true);
    try {
      const blob = await captureElementAsPng(element, {
        hideSelector: "[data-export-hide]",
      });

      try {
        await copyImageBlobToClipboard(blob);
        toast.success("Extracto copiado al portapapeles.");
      } catch {
        const slug = `${compra!.modelo}-${compra!.placa ?? userId}`
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-");
        downloadImageBlob(blob, `extracto-pagos-${slug}.png`);
        toast.success("Extracto descargado como imagen.");
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "No se pudo generar el extracto.",
      );
    } finally {
      setCapturingExtract(false);
    }
  }

  return (
    <>
      <Card
        ref={extractRef}
        data-renting-extract
       
      >
        <CardHeader className="flex flex-col gap-3">
          <CardTitle>
            Cartera de renting
            {creditoSaldado && (
              <Badge className="ml-2 bg-green-700 text-white hover:bg-green-700">
                Crédito saldado
              </Badge>
            )}
          </CardTitle>
          <CardAction data-export-hide className="col-start-1 row-start-auto w-full sm:col-start-2 sm:w-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              disabled={capturingExtract || pending}
              onClick={copiarExtractoPagos}
            >
              {capturingExtract ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              Copiar extracto de pagos
            </Button>
          </CardAction>
          <p className="text-sm text-muted-foreground">
            {compra.modelo} · {compra.color}
            {compra.placa ? ` · Placa ${compra.placa}` : ""}
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {rentingResumen && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Total pagado" value={formatCop(rentingResumen.totalPagado)} />
              <Stat
                label="Adeudado"
                value={formatCop(rentingResumen.totalAdeudado)}
                highlight={rentingResumen.totalAdeudado > 0}
              />
              <Stat
                label="Cuotas pagadas"
                value={formatCuotas(rentingResumen.cuotasPagadas)}
              />
              <Stat
                label="Cuotas pendientes"
                value={String(
                  rentingResumen.cuotasPendientes + rentingResumen.cuotasVencidas,
                )}
              />
            </div>
          )}

          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <p>
              <span className="text-muted-foreground">Frecuencia: </span>
              {FRECUENCIA_LABELS[compra.frecuencia_pago]}
            </p>
            <p>
              <span className="text-muted-foreground">Cuota por periodo: </span>
              {formatCop(compra.monto_cuota_periodo)}
            </p>
            {rentingResumen?.proximoVencimiento && (
              <p>
                <span className="text-muted-foreground">Próximo vencimiento: </span>
                {formatDateOnly(rentingResumen.proximoVencimiento)}
              </p>
            )}
            {rentingResumen?.diasAtraso != null && rentingResumen.diasAtraso > 0 && (
              <p className="font-medium text-red-700">
                Días de atraso: {rentingResumen.diasAtraso}
              </p>
            )}
          </div>

          {moraResumen && !creditoSaldado && (
            <div
              className={`rounded-lg border p-4 text-sm ${
                mora.enMoraBandeja
                  ? "border-amber-200 bg-amber-50"
                  : "border-border bg-muted/50"
              }`}
            >
              <p
                className={`font-medium ${
                  mora.enMoraBandeja ? "text-amber-900" : "text-foreground"
                }`}
              >
                {mora.enMoraBandeja ? "Cliente en mora" : "Saldo pendiente"}
              </p>
              <p
                className={`mt-1 ${
                  mora.enMoraBandeja ? "text-amber-800" : "text-foreground"
                }`}
              >
                {mora.dias > 0 ? `${mora.dias} días de atraso · ` : ""}
                Adeudado {formatCop(mora.monto)}
              </p>
              {moroso && mora.enMoraBandeja ? (
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                disabled={pending}
                data-export-hide
                onClick={regularizarMoroso}
              >
                Marcar regularizado
              </Button>
              ) : null}
            </div>
          )}

          {mora.paraRecoger && !creditoSaldado && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm">
              <p className="font-medium text-red-900">Moto para recoger</p>
              <p className="mt-1 text-red-800">
                {mora.dias} días de mora · Adeudado {formatCop(mora.monto)}
              </p>
              {recoger && recoger.estado !== "recogida" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={pending}
                    onClick={marcarMotoRecogida}
                  >
                    Marcar como recogida
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/garaje?fotoPendiente=1">Ver Garaje</Link>
                  </Button>
                </div>
              )}
            </div>
          )}

          {tarifas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aún no hay calendario de tarifas. Se genera al marcar la moto como
              entregada.
            </p>
          ) : (
            <>
              <div className="hidden max-h-[28rem] overflow-auto rounded-lg border border-border lg:block">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background shadow-[0_1px_0_0_rgb(229_229_229)]">
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Vencimiento</TableHead>
                      <TableHead>Monto</TableHead>
                      <TableHead>Pagado</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right" data-export-hide>
                        Acción
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleTarifas.map((tarifa) => (
                      <TableRow
                        key={tarifa.id}
                        id={`tarifa-desktop-${tarifa.id}`}
                        className={
                          tarifa.id === currentTarifaId
                            ? "bg-amber-50/80"
                            : undefined
                        }
                      >
                        <TableCell>{tarifa.numero_periodo}</TableCell>
                        <TableCell>
                          {formatDateOnly(tarifa.fecha_vencimiento)}
                        </TableCell>
                        <TableCell>{formatCop(tarifa.monto_esperado)}</TableCell>
                        <TableCell>
                          {tarifaTieneAbono(tarifa) ? (
                            <TarifaPagadoCell tarifa={tarifa} />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              tarifaEstadoLabel(tarifa) === "Parcial"
                                ? "outline"
                                : tarifaBadgeVariant(tarifa.estado)
                            }
                          >
                            {tarifaEstadoLabel(tarifa)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right" data-export-hide>
                          <div className="flex items-center justify-end gap-1">
                            {comprobanteByTarifaId[tarifa.id] ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                title="Ver comprobante"
                                onClick={() =>
                                  setComprobanteUrl(
                                    comprobanteByTarifaId[tarifa.id],
                                  )
                                }
                              >
                                <FileText className="h-4 w-4" />
                              </Button>
                            ) : null}
                            {!creditoSaldado && tarifa.estado !== "pagada" ? (
                              <Button
                                size="sm"
                                disabled={pending}
                                onClick={() => openConfirmDialog(tarifa)}
                              >
                                Confirmar pago
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {tarifa.pagada_at
                                  ? formatDateOnly(tarifa.pagada_at)
                                  : "—"}
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="max-h-[28rem] flex flex-col gap-3 overflow-y-auto lg:hidden">
                {visibleTarifas.map((tarifa) => (
                  <div
                    key={tarifa.id}
                    id={`tarifa-mobile-${tarifa.id}`}
                    className={`rounded-lg border border-border p-4 text-sm ${
                      tarifa.id === currentTarifaId
                        ? "border-amber-300 bg-amber-50/80"
                        : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium">
                        Periodo #{tarifa.numero_periodo}
                      </p>
                      <Badge
                        variant={
                          tarifaEstadoLabel(tarifa) === "Parcial"
                            ? "outline"
                            : tarifaBadgeVariant(tarifa.estado)
                        }
                      >
                        {tarifaEstadoLabel(tarifa)}
                      </Badge>
                    </div>
                    <dl className="mt-3 flex flex-col gap-1.5">
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">Vencimiento</dt>
                        <dd>{formatDateOnly(tarifa.fecha_vencimiento)}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">Monto</dt>
                        <dd>{formatCop(tarifa.monto_esperado)}</dd>
                      </div>
                      {tarifaTieneAbono(tarifa) && (
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">Pagado</dt>
                          <dd>
                            <TarifaPagadoCell tarifa={tarifa} />
                          </dd>
                        </div>
                      )}
                    </dl>
                    {!creditoSaldado && tarifa.estado !== "pagada" ? (
                      <Button
                        size="sm"
                        className="mt-3 w-full"
                        disabled={pending}
                        data-export-hide
                        onClick={() => openConfirmDialog(tarifa)}
                      >
                        Confirmar pago
                      </Button>
                    ) : (
                      <div
                        className="mt-3 flex items-center justify-between gap-2"
                        data-export-hide
                      >
                        {tarifa.pagada_at ? (
                          <p className="text-xs text-muted-foreground">
                            Pagada el {formatDateOnly(tarifa.pagada_at)}
                          </p>
                        ) : (
                          <span />
                        )}
                        {comprobanteByTarifaId[tarifa.id] ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setComprobanteUrl(comprobanteByTarifaId[tarifa.id])
                            }
                          >
                            <FileText className="h-4 w-4" />
                            Comprobante
                          </Button>
                        ) : null}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {pagosHistorial.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-medium">Historial de pagos</h3>
              <div className="hidden overflow-x-auto rounded-lg border border-border lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Contexto</TableHead>
                      <TableHead>Monto</TableHead>
                      <TableHead>Esperado</TableHead>
                      <TableHead>Variación</TableHead>
                      <TableHead>Cuotas</TableHead>
                      <TableHead>Referencia</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagosHistorial.map((pago) => (
                      <TableRow key={pago.id}>
                        <TableCell>{formatDate(pago.fecha)}</TableCell>
                        <TableCell>
                          {pago.contexto_pago
                            ? pago.numeroPeriodo
                              ? `${CONTEXTO_PAGO_LABELS[pago.contexto_pago]} #${pago.numeroPeriodo}`
                              : CONTEXTO_PAGO_LABELS[pago.contexto_pago]
                            : "—"}
                        </TableCell>
                        <TableCell>{formatCop(pago.monto)}</TableCell>
                        <TableCell>
                          {pago.montoEsperado != null
                            ? formatCop(pago.montoEsperado)
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <VariacionBadge
                            label={pago.variacionLabel}
                            tone={pago.variacionTone}
                          />
                        </TableCell>
                        <TableCell>
                          {pago.cuotasCubiertas > 0
                            ? formatCuotas(pago.cuotasCubiertas)
                            : "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {pago.referencia ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex flex-col gap-3 lg:hidden">
                {pagosHistorial.map((pago) => (
                  <div
                    key={pago.id}
                    className="rounded-lg border border-border p-4 text-sm"
                  >
                    <p className="font-medium">{formatDate(pago.fecha)}</p>
                    <p className="mt-1 text-muted-foreground">
                      {pago.contexto_pago
                        ? pago.numeroPeriodo
                          ? `${CONTEXTO_PAGO_LABELS[pago.contexto_pago]} #${pago.numeroPeriodo}`
                          : CONTEXTO_PAGO_LABELS[pago.contexto_pago]
                        : "—"}
                    </p>
                    <dl className="mt-3 flex flex-col gap-1.5">
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">Monto</dt>
                        <dd className="font-medium">{formatCop(pago.monto)}</dd>
                      </div>
                      {pago.montoEsperado != null && (
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">Esperado</dt>
                          <dd>{formatCop(pago.montoEsperado)}</dd>
                        </div>
                      )}
                      {pago.variacionLabel !== "—" && (
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">Variación</dt>
                          <dd>
                            <VariacionBadge
                              label={pago.variacionLabel}
                              tone={pago.variacionTone}
                            />
                          </dd>
                        </div>
                      )}
                      {pago.cuotasCubiertas > 0 && (
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">Cuotas</dt>
                          <dd>{formatCuotas(pago.cuotasCubiertas)}</dd>
                        </div>
                      )}
                      {pago.referencia && (
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">Referencia</dt>
                          <dd className="font-mono text-xs">{pago.referencia}</dd>
                        </div>
                      )}
                    </dl>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedTarifa && (
        <PaymentComprobanteDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          contexto="tarifa"
          userId={userId}
          compraId={compra.id}
          tarifaId={selectedTarifa.id}
          montoEsperado={Math.max(
            0,
            selectedTarifa.monto_esperado -
              (selectedTarifa.monto_pagado ?? 0),
          )}
          referenciasUsadas={referenciasUsadas}
        />
      )}

      <Dialog
        open={Boolean(comprobanteUrl)}
        onOpenChange={(open) => {
          if (!open) setComprobanteUrl(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Comprobante de pago</DialogTitle>
          </DialogHeader>
          {comprobanteUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={comprobanteUrl}
              alt="Comprobante de pago de la cuota"
              className="max-h-[70dvh] w-full rounded-lg object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function TarifaPagadoCell({ tarifa }: { tarifa: TarifaPagadaRow }) {
  const pagado = tarifa.monto_pagado ?? tarifa.monto_esperado;
  const fraccion = cuotaFraction(pagado, tarifa.monto_esperado);
  const esParcial = pagado < tarifa.monto_esperado;
  const esMayor = pagado > tarifa.monto_esperado;

  return (
    <div className="text-sm">
      <p className="font-medium">{formatCop(pagado)}</p>
      <p
        className={`text-xs ${
          esParcial
            ? "text-amber-700"
            : esMayor
              ? "text-blue-700"
              : "text-muted-foreground"
        }`}
      >
        {formatCuotas(fraccion)} cuota{fraccion === 1 ? "" : "s"}
        {esParcial ? " · parcial" : esMayor ? " · mayor" : ""}
      </p>
    </div>
  );
}

function VariacionBadge({
  label,
  tone,
}: {
  label: string;
  tone: "menor" | "mayor" | "exacto";
}) {
  if (label === "—") {
    return <span className="text-muted-foreground">—</span>;
  }

  const className =
    tone === "menor"
      ? "text-amber-800"
      : tone === "mayor"
        ? "text-blue-800"
        : "text-muted-foreground";

  return <span className={`text-xs ${className}`}>{label}</span>;
}

function Stat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-lg font-semibold ${highlight ? "text-red-700" : "text-foreground"}`}
      >
        {value}
      </p>
    </div>
  );
}
