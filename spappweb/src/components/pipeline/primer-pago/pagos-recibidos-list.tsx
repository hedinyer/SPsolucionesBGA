"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ExternalLink, Pencil, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  removePagoAbono,
  updatePagoAbono,
} from "@/lib/actions/payment-comprobante-actions";
import {
  printCreditoPagoReceipt,
  type CreditoPagoReceiptData,
} from "@/lib/printing/credito-pago-receipt";
import type {
  MedioPagoAdmin,
  PagoRow,
  UserMotoCompraRow,
} from "@/lib/pipeline/types";
import {
  CONTEXTO_PAGO_LABELS,
  MEDIO_PAGO_ADMIN_LABELS,
  MEDIO_PAGO_ADMIN_OPTIONS,
  type ContextoPago,
} from "@/lib/pipeline/types";
import type { PrimerPagoConcepto } from "@/lib/payments/primer-pago-progress";
import { formatCop, formatDate } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
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
import { ConfirmDeleteDialog } from "@/components/pipeline/primer-pago/confirm-delete-dialog";

type CobroGroup = {
  key: string;
  pagos: PagoRow[];
  total: number;
  medio: string;
  referencia: string | null;
  fecha: string | null;
  conceptos: string;
};

function groupPagos(pagos: PagoRow[]): CobroGroup[] {
  const primer = pagos.filter(
    (p) =>
      p.estado === "confirmado" &&
      (p.contexto_pago === "inicial" ||
        p.contexto_pago === "cuota_adelantada" ||
        p.contexto_pago === "visita"),
  );

  const byGroup = new Map<string, PagoRow[]>();
  for (const p of primer) {
    const key = p.cobro_grupo_id ?? p.id;
    const list = byGroup.get(key) ?? [];
    list.push(p);
    byGroup.set(key, list);
  }

  return Array.from(byGroup.entries())
    .map(([key, list]) => {
      const sorted = [...list].sort(
        (a, b) =>
          new Date(b.confirmado_at ?? b.created_at).getTime() -
          new Date(a.confirmado_at ?? a.created_at).getTime(),
      );
      const first = sorted[0]!;
      return {
        key,
        pagos: sorted,
        total: sorted.reduce((s, p) => s + p.monto, 0),
        medio: first.medio_pago_admin
          ? MEDIO_PAGO_ADMIN_LABELS[first.medio_pago_admin]
          : "—",
        referencia: first.referencia,
        fecha: first.confirmado_at ?? first.created_at,
        conceptos: sorted
          .map((p) =>
            p.contexto_pago
              ? CONTEXTO_PAGO_LABELS[p.contexto_pago as ContextoPago]
              : "",
          )
          .filter(Boolean)
          .join(" · "),
      };
    })
    .sort(
      (a, b) =>
        new Date(b.fecha ?? 0).getTime() - new Date(a.fecha ?? 0).getTime(),
    );
}

export function PagosRecibidosList({
  compra,
  pagos,
  userId,
  canEdit,
  clienteNombre,
  clienteCedula,
}: {
  compra: UserMotoCompraRow;
  pagos: PagoRow[];
  userId: number;
  canEdit: boolean;
  clienteNombre: string;
  clienteCedula: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<PagoRow | null>(null);
  const [deleting, setDeleting] = useState<PagoRow | null>(null);
  const groups = useMemo(() => groupPagos(pagos), [pagos]);

  function handleReprint(group: CobroGroup) {
    const first = group.pagos[0]!;
    const recibo: CreditoPagoReceiptData = {
      pagoId: first.id,
      clienteNombre,
      clienteCedula,
      motoModelo: compra.modelo,
      motoColor: compra.color,
      concepto: (first.contexto_pago as ContextoPago) ?? "inicial",
      monto: group.total,
      items: group.pagos.map((p) => ({
        concepto: p.contexto_pago as ContextoPago,
        monto: p.monto,
      })),
      medioPago: first.medio_pago_admin ?? "efectivo",
      referencia: first.referencia,
      confirmadoAt: first.confirmado_at ?? first.created_at,
    };
    printCreditoPagoReceipt(recibo).catch(() => {
      toast.error("No se pudo abrir la impresión del recibo.");
    });
  }

  function handleRemove(pago: PagoRow) {
    startTransition(async () => {
      try {
        await removePagoAbono(pago.id, userId);
        toast.success("Pago eliminado.");
        setDeleting(null);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al eliminar.");
      }
    });
  }

  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aún no hay pagos registrados.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">Pagos recibidos</h3>
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {groups.map((group) => (
          <li key={group.key} className="px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium tabular-nums">
                  {formatCop(group.total)}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {group.conceptos}
                  {" · "}
                  {group.medio}
                  {group.referencia ? ` · Ref. ${group.referencia}` : ""}
                  {group.fecha ? ` · ${formatDate(group.fecha)}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleReprint(group)}
                  aria-label="Imprimir recibo"
                >
                  <Printer className="h-4 w-4" aria-hidden />
                </Button>
                {group.pagos.some((p) => p.comprobante_url) && (
                  <a
                    href={
                      group.pagos.find((p) => p.comprobante_url)?.comprobante_url ??
                      "#"
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex rounded p-1.5 text-muted-foreground hover:bg-muted"
                    aria-label="Ver comprobante"
                  >
                    <ExternalLink className="h-4 w-4" aria-hidden />
                  </a>
                )}
              </div>
            </div>
            {canEdit && (
              <ul className="mt-2 space-y-1 border-t border-border/60 pt-2">
                {group.pagos.map((abono) => (
                  <li
                    key={abono.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="text-muted-foreground">
                      {abono.contexto_pago
                        ? CONTEXTO_PAGO_LABELS[
                            abono.contexto_pago as ContextoPago
                          ]
                        : "—"}{" "}
                      · {formatCop(abono.monto)}
                    </span>
                    <span className="flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={pending}
                        onClick={() => setEditing(abono)}
                        aria-label="Editar pago"
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={pending}
                        onClick={() => setDeleting(abono)}
                        aria-label="Eliminar pago"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      {editing ? (
        <EditAbonoDialog
          key={editing.id}
          abono={editing}
          userId={userId}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      ) : null}
      <ConfirmDeleteDialog
        open={deleting != null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        pending={pending}
        description={
          deleting
            ? `Se eliminará el registro de ${formatCop(deleting.monto)}. Esta acción no se puede deshacer.`
            : undefined
        }
        onConfirm={() => {
          if (deleting) handleRemove(deleting);
        }}
      />
    </div>
  );
}

function EditAbonoDialog({
  abono,
  userId,
  open,
  onOpenChange,
  onSaved,
}: {
  abono: PagoRow;
  userId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const stored = abono.medio_pago_admin;
  const [monto, setMonto] = useState<number | null>(abono.monto);
  const [referencia, setReferencia] = useState(abono.referencia ?? "");
  const [medio, setMedio] = useState<MedioPagoAdmin>(
    stored &&
      (MEDIO_PAGO_ADMIN_OPTIONS as readonly string[]).includes(stored)
      ? (stored as MedioPagoAdmin)
      : "efectivo",
  );
  const [contexto, setContexto] = useState<PrimerPagoConcepto>(
    abono.contexto_pago === "inicial" ||
      abono.contexto_pago === "cuota_adelantada" ||
      abono.contexto_pago === "visita"
      ? abono.contexto_pago
      : "inicial",
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    if (monto == null || monto <= 0) {
      setError("Indica un monto válido.");
      return;
    }
    if (!referencia.trim()) {
      setError("Ingresa la referencia.");
      return;
    }

    startTransition(async () => {
      try {
        await updatePagoAbono({
          pagoId: abono.id,
          userId,
          monto,
          referencia: referencia.trim(),
          medioPagoAdmin: medio,
          contexto,
        });
        toast.success("Pago actualizado.");
        onSaved();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "No se pudo guardar.";
        setError(msg);
        toast.error(msg);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar pago</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-abono-monto">Monto</Label>
            <CurrencyInput
              id="edit-abono-monto"
              value={monto}
              onValueChange={setMonto}
              min={1}
              aria-invalid={Boolean(error)}
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
            <Label htmlFor="edit-abono-medio">Medio</Label>
            <TouchSelect
              id="edit-abono-medio"
              aria-label="Medio de pago"
              value={medio}
              onChange={(v) => setMedio(v as MedioPagoAdmin)}
              options={MEDIO_PAGO_ADMIN_OPTIONS.map((m) => ({
                value: m,
                label: MEDIO_PAGO_ADMIN_LABELS[m],
              }))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-abono-concepto">Concepto</Label>
            <TouchSelect
              id="edit-abono-concepto"
              aria-label="Concepto"
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
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
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
