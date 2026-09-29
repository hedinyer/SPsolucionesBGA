"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Package, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import {
  aprobarOrdenRepuesto,
  aprobarTodosRepuestosOrden,
  deshacerDecisionRepuesto,
  rechazarOrdenRepuesto,
} from "@/lib/actions/taller-actions";
import type { OrdenTallerRow } from "@/lib/taller/types";
import { repuestoNombre } from "@/lib/taller/types";
import { zonaMotoLabel } from "@/lib/taller/zonas-moto";
import { TallerRealtimeRefresh } from "@/components/taller/taller-realtime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const MOTIVOS_RAPIDOS = [
  "No hay",
  "Muy caro",
  "No hace falta",
  "Otro",
] as const;

export function SebastianApprovalPanel({
  ordenes,
}: {
  ordenes: OrdenTallerRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rechazoId, setRechazoId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [motivoOtro, setMotivoOtro] = useState("");

  function withUndo(repuestoId: string, msg: string) {
    toast.success(msg, {
      action: {
        label: "Deshacer",
        onClick: () => {
          startTransition(async () => {
            const r = await deshacerDecisionRepuesto({ repuestoId });
            if (!r.ok) toast.error(r.error);
            else {
              toast.message("Deshecho");
              router.refresh();
            }
          });
        },
      },
      duration: 6000,
    });
  }

  if (ordenes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center">
        <TallerRealtimeRefresh />
        <Package className="mx-auto mb-3 size-10 text-muted-foreground" />
        <p className="text-base font-medium">Nada pendiente</p>
        <p className="text-sm text-muted-foreground">
          Cuando un mecánico pida repuestos, aparecen aquí.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <TallerRealtimeRefresh />
      <ul className="flex flex-col gap-4">
        {ordenes.map((orden) => {
          const pendientes = orden.repuestos.filter(
            (r) => r.estado === "solicitado",
          );
          if (pendientes.length === 0) return null;

          return (
            <li
              key={orden.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link
                    href={`/taller/${orden.id}`}
                    className="text-xl font-bold uppercase tracking-wide hover:underline"
                  >
                    {orden.placa || `#${orden.numero}`}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {orden.modelo}
                    {orden.mecanico ? ` · ${orden.mecanico.nombre}` : ""}
                  </p>
                </div>
                <Badge variant="secondary">{pendientes.length} pedidos</Badge>
              </div>

              <ul className="flex flex-col gap-3">
                {pendientes.map((r) => {
                  const stock = r.producto?.stock ?? null;
                  const alcanza =
                    stock == null || r.producto_id == null
                      ? true
                      : stock >= r.cantidad;
                  return (
                    <li
                      key={r.id}
                      className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50/40 p-3 dark:border-amber-900 dark:bg-amber-950/20"
                    >
                      <div className="flex items-start gap-3">
                        {r.producto?.imagen_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={r.producto.imagen_url}
                            alt=""
                            className="size-14 rounded-lg object-cover"
                          />
                        ) : (
                          <span className="flex size-14 items-center justify-center rounded-lg bg-muted">
                            <Package className="size-6 text-muted-foreground" />
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">
                            {repuestoNombre(r)} × {r.cantidad}
                          </p>
                          {r.zona ? (
                            <p className="text-xs text-muted-foreground">
                              Parte: {zonaMotoLabel(r.zona)}
                            </p>
                          ) : null}
                          {r.created_by ? (
                            <p className="text-xs text-muted-foreground">
                              Pidió: {r.created_by}
                            </p>
                          ) : null}
                          {r.producto_id != null && stock != null ? (
                            <p
                              className={cn(
                                "mt-1 text-sm font-medium",
                                alcanza
                                  ? "text-emerald-700 dark:text-emerald-300"
                                  : "text-red-700 dark:text-red-300",
                              )}
                            >
                              {alcanza
                                ? `Hay ${stock}, piden ${r.cantidad}`
                                : `No alcanza: hay ${stock}, piden ${r.cantidad}`}
                            </p>
                          ) : (
                            <p className="mt-1 text-sm text-muted-foreground">
                              Fuera de inventario
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          className="min-h-12 touch-manipulation gap-2 bg-emerald-600 hover:bg-emerald-700"
                          disabled={pending || !alcanza}
                          onClick={() => {
                            startTransition(async () => {
                              const res = await aprobarOrdenRepuesto({
                                repuestoId: r.id,
                              });
                              if (!res.ok) {
                                toast.error(res.error);
                                return;
                              }
                              withUndo(r.id, "Aprobado · descontado");
                              router.refresh();
                            });
                          }}
                        >
                          <Check className="size-4" />
                          Aprobar
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-12 touch-manipulation gap-2 border-red-300 text-red-700"
                          disabled={pending}
                          onClick={() => {
                            setRechazoId(r.id);
                            setMotivo("");
                            setMotivoOtro("");
                          }}
                        >
                          <X className="size-4" />
                          No aprobar
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {pendientes.length > 1 ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11 w-full gap-2"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      const res = await aprobarTodosRepuestosOrden({
                        ordenId: orden.id,
                      });
                      if (!res.ok) {
                        toast.error(res.error);
                        return;
                      }
                      toast.success("Todo aprobado", {
                        icon: <Undo2 className="size-4" />,
                      });
                      router.refresh();
                    });
                  }}
                >
                  Aprobar todo de esta moto
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>

      <Dialog
        open={rechazoId != null}
        onOpenChange={(v) => !v && setRechazoId(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Por qué no?</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {MOTIVOS_RAPIDOS.map((m) => (
              <Button
                key={m}
                type="button"
                variant={motivo === m ? "default" : "outline"}
                className="min-h-12 justify-start"
                onClick={() => setMotivo(m)}
              >
                {m}
              </Button>
            ))}
            {motivo === "Otro" ? (
              <Input
                value={motivoOtro}
                onChange={(e) => setMotivoOtro(e.target.value)}
                placeholder="Escribe el motivo"
                className="min-h-11 text-base"
                autoFocus
              />
            ) : null}
            <Button
              type="button"
              className="min-h-12"
              disabled={
                pending ||
                !motivo ||
                (motivo === "Otro" && !motivoOtro.trim())
              }
              onClick={() => {
                if (!rechazoId) return;
                const text = motivo === "Otro" ? motivoOtro.trim() : motivo;
                startTransition(async () => {
                  const res = await rechazarOrdenRepuesto({
                    repuestoId: rechazoId,
                    motivo: text,
                  });
                  if (!res.ok) {
                    toast.error(res.error);
                    return;
                  }
                  withUndo(rechazoId, "No aprobado");
                  setRechazoId(null);
                  router.refresh();
                });
              }}
            >
              Confirmar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
