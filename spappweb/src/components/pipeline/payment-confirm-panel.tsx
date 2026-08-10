"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ExternalLink, Pencil, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  removePagoAbono,
  updateMontoVisitaCompra,
  updatePagoAbono,
} from "@/lib/actions/payment-comprobante-actions";
import {
  printCreditoPagoReceipt,
  type CreditoPagoReceiptData,
} from "@/lib/printing/credito-pago-receipt";
import {
  abonosPorConcepto,
  conceptoCompleto,
  faltanteConcepto,
  montoEsperadoConcepto,
  puedeEditarAbonoConcepto,
  puedeEditarFrecuenciaPago,
  puedeEditarMontoVisita,
  sumAbonos,
  type PrimerPagoConcepto,
} from "@/lib/payments/primer-pago-progress";
import { MONTO_VISITA_DEFAULT } from "@/lib/payments/visita-monto";
import type {
  ContextoPago,
  MedioPagoAdmin,
  PagoRow,
  UserMotoCompraRow,
} from "@/lib/pipeline/types";
import {
  CONTEXTO_PAGO_LABELS,
  MEDIO_PAGO_ADMIN_LABELS,
  MEDIO_PAGO_ADMIN_OPTIONS,
} from "@/lib/pipeline/types";
import { formatCop, formatDate } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TouchSelect } from "@/components/ui/touch-select";
import { PaymentComprobanteDialog } from "@/components/pipeline/payment-comprobante-dialog";
import { FrecuenciaPagoEditor } from "@/components/pipeline/frecuencia-pago-editor";

interface PaymentConfirmPanelProps {
  compra: UserMotoCompraRow | null;
  pagos: PagoRow[];
  userId: number;
  referenciasUsadas?: string[];
  clienteNombre?: string;
  clienteCedula?: string;
}

export function PaymentConfirmPanel({
  compra,
  pagos,
  userId,
  referenciasUsadas = [],
  clienteNombre = "Cliente",
  clienteCedula = "",
}: PaymentConfirmPanelProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogContexto, setDialogContexto] =
    useState<PrimerPagoConcepto>("inicial");
  const [dialogMedio, setDialogMedio] =
    useState<MedioPagoAdmin>("nequi_nicolas");

  if (!compra) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Aún no hay selección de moto.
        </CardContent>
      </Card>
    );
  }

  if (compra.estado !== "pendiente_pago" && compra.estado !== "lista_retiro") {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Pagos confirmados. Estado: {compra.estado.replace("_", " ")}.
        </CardContent>
      </Card>
    );
  }

  const canEditMontoVisita = puedeEditarMontoVisita(compra, pagos);
  const canEditFrecuencia = puedeEditarFrecuenciaPago(compra, pagos);
  const showVisitaSection =
    compra.monto_visita_monto > 0 || canEditMontoVisita;

  function openAbonoDialog(
    contexto: PrimerPagoConcepto,
    medio: MedioPagoAdmin = "nequi_nicolas",
  ) {
    setDialogContexto(contexto);
    setDialogMedio(medio);
    setDialogOpen(true);
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Confirmar pagos</CardTitle>
          <p className="text-sm text-muted-foreground">
            Registra abonos por concepto. Medios: Nequi, Davivienda, efectivo o
            datáfono. Efectivo y datáfono generan recibo para impresora.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="rounded-lg border border-border bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground">Total esperado</p>
            <p className="text-2xl font-semibold">
              {formatCop(compra.monto_total_primer_pago)}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Inicial {formatCop(compra.cuota_inicial_monto)} + adelantada{" "}
              {formatCop(compra.monto_cuota_periodo)}
              {compra.monto_visita_monto > 0 && (
                <> + visita {formatCop(compra.monto_visita_monto)}</>
              )}
            </p>
          </div>

          {canEditFrecuencia && (
            <FrecuenciaPagoEditor
              compra={compra}
              userId={userId}
              pagos={pagos}
            />
          )}

          {canEditMontoVisita && (
            <VisitaMontoEditor
              compra={compra}
              userId={userId}
              onSaved={() => router.refresh()}
            />
          )}

          <ConceptoAbonoSection
            compra={compra}
            pagos={pagos}
            contexto="inicial"
            userId={userId}
            canEdit={puedeEditarAbonoConcepto(compra, pagos, "inicial")}
            clienteNombre={clienteNombre}
            clienteCedula={clienteCedula}
            onAddAbono={() => openAbonoDialog("inicial")}
            onAddEfectivo={() => openAbonoDialog("inicial", "efectivo")}
          />
          <ConceptoAbonoSection
            compra={compra}
            pagos={pagos}
            contexto="cuota_adelantada"
            userId={userId}
            canEdit={puedeEditarAbonoConcepto(compra, pagos, "cuota_adelantada")}
            clienteNombre={clienteNombre}
            clienteCedula={clienteCedula}
            onAddAbono={() => openAbonoDialog("cuota_adelantada")}
            onAddEfectivo={() =>
              openAbonoDialog("cuota_adelantada", "efectivo")
            }
          />
          {showVisitaSection && (
            <ConceptoAbonoSection
              compra={compra}
              pagos={pagos}
              contexto="visita"
              userId={userId}
              canEdit={puedeEditarAbonoConcepto(compra, pagos, "visita")}
              clienteNombre={clienteNombre}
              clienteCedula={clienteCedula}
              onAddAbono={() => openAbonoDialog("visita")}
              onAddEfectivo={() => openAbonoDialog("visita", "efectivo")}
            />
          )}
        </CardContent>
      </Card>

      <PaymentComprobanteDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        contexto={dialogContexto as ContextoPago}
        userId={userId}
        compraId={compra.id}
        montoEsperado={montoEsperadoConcepto(compra, dialogContexto)}
        montoFaltante={faltanteConcepto(compra, pagos, dialogContexto)}
        referenciasUsadas={referenciasUsadas}
        clienteNombre={clienteNombre}
        clienteCedula={clienteCedula}
        motoModelo={compra.modelo}
        motoColor={compra.color}
        initialMedioPago={dialogMedio}
      />
    </>
  );
}

function VisitaMontoEditor({
  compra,
  userId,
  onSaved,
}: {
  compra: UserMotoCompraRow;
  userId: number;
  onSaved: () => void;
}) {
  const [montoVisita, setMontoVisita] = useState(
    String(compra.monto_visita_monto || MONTO_VISITA_DEFAULT),
  );
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setMontoVisita(
      String(compra.monto_visita_monto || MONTO_VISITA_DEFAULT),
    );
  }, [compra.monto_visita_monto]);

  function handleSave() {
    const parsed = Number(montoVisita.replace(/\D/g, ""));
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error("Indica un monto de visita válido.");
      return;
    }

    startTransition(async () => {
      try {
        await updateMontoVisitaCompra({
          userId,
          compraId: compra.id,
          montoVisita: parsed,
        });
        toast.success("Monto de visita actualizado.");
        onSaved();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
      }
    });
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
      <p className="text-sm font-medium text-amber-950">
        Visita domiciliaria · monto según zona
      </p>
      <p className="mt-1 text-xs text-amber-900/80">
        Ajusta el valor antes de cobrar. Referencia catálogo:{" "}
        {formatCop(MONTO_VISITA_DEFAULT)}.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 flex flex-col gap-2">
          <Label htmlFor="monto-visita-compra">Monto acordado</Label>
          <Input
            id="monto-visita-compra"
            inputMode="numeric"
            value={montoVisita}
            onChange={(e) => setMontoVisita(e.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={handleSave}
        >
          {pending ? "Guardando…" : "Guardar monto"}
        </Button>
      </div>
    </div>
  );
}

function ConceptoAbonoSection({
  compra,
  pagos,
  contexto,
  userId,
  canEdit,
  clienteNombre,
  clienteCedula,
  onAddAbono,
  onAddEfectivo,
}: {
  compra: UserMotoCompraRow;
  pagos: PagoRow[];
  contexto: PrimerPagoConcepto;
  userId: number;
  canEdit: boolean;
  clienteNombre: string;
  clienteCedula: string;
  onAddAbono: () => void;
  onAddEfectivo: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<PagoRow | null>(null);
  const esperado = montoEsperadoConcepto(compra, contexto);
  const recibido = sumAbonos(pagos, contexto);
  const faltante = faltanteConcepto(compra, pagos, contexto);
  const completo = conceptoCompleto(compra, pagos, contexto);
  const abonos = abonosPorConcepto(pagos, contexto);
  const pct = esperado > 0 ? Math.min(100, (recibido / esperado) * 100) : 0;

  function handleReprint(abono: PagoRow) {
    if (
      abono.contexto_pago !== "inicial" &&
      abono.contexto_pago !== "cuota_adelantada" &&
      abono.contexto_pago !== "visita"
    ) {
      return;
    }
    const recibo: CreditoPagoReceiptData = {
      pagoId: abono.id,
      clienteNombre,
      clienteCedula,
      motoModelo: compra.modelo,
      motoColor: compra.color,
      concepto: abono.contexto_pago,
      monto: abono.monto,
      medioPago: abono.medio_pago_admin ?? "efectivo",
      referencia: abono.referencia,
      confirmadoAt: abono.confirmado_at ?? abono.created_at,
    };
    printCreditoPagoReceipt(recibo).catch(() => {
      toast.error("No se pudo abrir la impresión del recibo.");
    });
  }

  function handleRemove(pagoId: string) {
    startTransition(async () => {
      try {
        await removePagoAbono(pagoId, userId);
        toast.success("Abono eliminado.");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al eliminar.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <p className="font-medium">{CONTEXTO_PAGO_LABELS[contexto]}</p>
          <p className="text-sm text-muted-foreground">
            {formatCop(recibido)} de {formatCop(esperado)}
            {!completo && faltante > 0 && ` · faltan ${formatCop(faltante)}`}
          </p>
        </div>
        {completo ? (
          <span className="w-fit rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
            {esperado > 0 ? "Confirmado" : "Sin cobro"}
          </span>
        ) : (
          <span className="w-fit rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">
            Pendiente
          </span>
        )}
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-black transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      {abonos.length > 0 && (
        <ul className="divide-y divide-neutral-100 rounded-lg border border-border">
          {abonos.map((abono) => (
            <li
              key={abono.id}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">{formatCop(abono.monto)}</p>
                <p className="truncate text-muted-foreground">
                  {abono.medio_pago_admin
                    ? MEDIO_PAGO_ADMIN_LABELS[abono.medio_pago_admin]
                    : "—"}
                  {abono.referencia ? ` · Ref. ${abono.referencia}` : ""}
                  {abono.confirmado_at
                    ? ` · ${formatDate(abono.confirmado_at)}`
                    : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleReprint(abono)}
                  title="Imprimir recibo"
                >
                  <Printer className="h-4 w-4" />
                </Button>
                {abono.comprobante_url && (
                  <a
                    href={abono.comprobante_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex rounded p-1.5 text-muted-foreground hover:bg-muted"
                    title="Ver comprobante"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
                {canEdit && (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={pending}
                      onClick={() => setEditing(abono)}
                      title="Editar abono"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={pending}
                      onClick={() => handleRemove(abono.id)}
                      title="Eliminar abono"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canEdit && !completo && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAddAbono}
          >
            Agregar abono
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onAddEfectivo}
          >
            Efectivo
          </Button>
        </div>
      )}

      <EditAbonoDialog
        abono={editing}
        userId={userId}
        defaultContexto={contexto}
        open={editing != null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onSaved={() => {
          setEditing(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function EditAbonoDialog({
  abono,
  userId,
  defaultContexto,
  open,
  onOpenChange,
  onSaved,
}: {
  abono: PagoRow | null;
  userId: number;
  defaultContexto: PrimerPagoConcepto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [monto, setMonto] = useState("");
  const [referencia, setReferencia] = useState("");
  const [medio, setMedio] = useState<MedioPagoAdmin>("nequi_nicolas");
  const [contexto, setContexto] =
    useState<PrimerPagoConcepto>(defaultContexto);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!abono || !open) return;
    setMonto(String(abono.monto));
    setReferencia(abono.referencia ?? "");
    const stored = abono.medio_pago_admin;
    setMedio(
      stored &&
        (MEDIO_PAGO_ADMIN_OPTIONS as readonly string[]).includes(stored)
        ? (stored as MedioPagoAdmin)
        : "nequi_nicolas",
    );
    setContexto(
      abono.contexto_pago === "inicial" ||
        abono.contexto_pago === "cuota_adelantada" ||
        abono.contexto_pago === "visita"
        ? abono.contexto_pago
        : defaultContexto,
    );
  }, [abono, open, defaultContexto]);

  function handleSave() {
    if (!abono) return;
    const parsed = Number(monto.replace(/\D/g, ""));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Indica un monto válido.");
      return;
    }
    if (!referencia.trim()) {
      toast.error("Ingresa la referencia.");
      return;
    }

    startTransition(async () => {
      try {
        await updatePagoAbono({
          pagoId: abono.id,
          userId,
          monto: parsed,
          referencia: referencia.trim(),
          medioPagoAdmin: medio,
          contexto,
        });
        toast.success("Abono actualizado.");
        onSaved();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar abono</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-abono-monto">Monto</Label>
            <Input
              id="edit-abono-monto"
              inputMode="numeric"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-abono-ref">Referencia</Label>
            <Input
              id="edit-abono-ref"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Medio</Label>
            <TouchSelect
              value={medio}
              onChange={(v) => setMedio(v as MedioPagoAdmin)}
              options={MEDIO_PAGO_ADMIN_OPTIONS.map((m) => ({
                value: m,
                label: MEDIO_PAGO_ADMIN_LABELS[m],
              }))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Concepto</Label>
            <TouchSelect
              value={contexto}
              onChange={(v) => setContexto(v as PrimerPagoConcepto)}
              options={(
                ["inicial", "cuota_adelantada", "visita"] as const
              ).map((c) => ({
                value: c,
                label: CONTEXTO_PAGO_LABELS[c],
              }))}
            />
          </div>
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
          <Button type="button" disabled={pending} onClick={handleSave}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
