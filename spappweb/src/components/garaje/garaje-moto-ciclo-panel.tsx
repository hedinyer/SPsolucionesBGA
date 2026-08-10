"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import {
  addGarajeMantenimientoItem,
  devolverGarajeMotoAlCliente,
  liberarGarajeMotoParaVenta,
  removeGarajeMantenimientoItem,
  terminarGarajeMantenimiento,
} from "@/lib/actions/admin-actions";
import {
  DIAS_RECUPERACION_CLIENTE,
  getPlazoRecuperacion,
} from "@/lib/pipeline/mora-utils";
import type {
  GarajeMantenimientoItemRow,
  GarajeMotoRow,
  InventarioProductoRow,
} from "@/lib/pipeline/types";
import { formatCop } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TouchSelect } from "@/components/ui/touch-select";

export function GarajeMotoCicloPanel({
  moto,
  productos,
  items,
}: {
  moto: GarajeMotoRow;
  productos: InventarioProductoRow[];
  items: GarajeMantenimientoItemRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [productoId, setProductoId] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [cuotaInicial, setCuotaInicial] = useState(
    moto.cuota_inicial != null ? String(moto.cuota_inicial) : "",
  );
  const [cuotaDiaria, setCuotaDiaria] = useState(
    moto.cuota_diaria != null ? String(moto.cuota_diaria) : "",
  );
  const [busquedaProd, setBusquedaProd] = useState("");

  const plazo = getPlazoRecuperacion(moto.fecha_recogida);
  const costoTotal = items.reduce(
    (sum, i) => sum + i.cantidad * i.costo_unitario,
    0,
  );

  const productosFiltrados = useMemo(() => {
    const q = busquedaProd.trim().toLowerCase();
    const activos = productos.filter((p) => p.activo && p.stock > 0);
    if (!q) return activos.slice(0, 40);
    return activos
      .filter(
        (p) =>
          p.nombre.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q),
      )
      .slice(0, 40);
  }, [productos, busquedaProd]);

  if (
    moto.estado !== "retenida" &&
    moto.estado !== "en_mantenimiento" &&
    moto.estado !== "disponible"
  ) {
    return null;
  }

  return (
    <div className="mb-4 flex flex-col gap-4 rounded-lg border border-border bg-muted/50 p-3">
      {moto.estado === "retenida" ? (
        <div className="flex flex-col gap-3">
          <div
            className={
              plazo.plazoVencido
                ? "rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
                : "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
            }
          >
            {plazo.plazoVencido ? (
              <>
                Plazo de {DIAS_RECUPERACION_CLIENTE} días vencido. Puedes liberar
                la moto para mantenimiento y reventa.
              </>
            ) : (
              <>
                Quedan <strong>{plazo.diasRestantes}</strong> día
                {plazo.diasRestantes === 1 ? "" : "s"} para que el cliente
                recupere la moto (plazo de {DIAS_RECUPERACION_CLIENTE} días tras
                la recogida).
              </>
            )}
          </div>
          {moto.origen_user_id ? (
            <Link
              href={`/clientes/${moto.origen_user_id}`}
              className="block text-sm font-medium text-foreground underline"
            >
              Ver cliente de origen
            </Link>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 flex-1"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  try {
                    await devolverGarajeMotoAlCliente({
                      garajeMotoId: moto.id,
                    });
                    toast.success("Moto marcada como devuelta al cliente.");
                    router.refresh();
                  } catch (e) {
                    toast.error(
                      e instanceof Error ? e.message : "No se pudo devolver.",
                    );
                  }
                })
              }
            >
              Devuelta al cliente
            </Button>
            <Button
              type="button"
              className="min-h-11 flex-1 bg-primary text-primary-foreground hover:bg-primary/80"
              disabled={pending || !plazo.plazoVencido}
              onClick={() =>
                startTransition(async () => {
                  try {
                    await liberarGarajeMotoParaVenta({
                      garajeMotoId: moto.id,
                    });
                    toast.success("Moto liberada para mantenimiento.");
                    router.refresh();
                  } catch (e) {
                    toast.error(
                      e instanceof Error ? e.message : "No se pudo liberar.",
                    );
                  }
                })
              }
            >
              Liberar para venta
            </Button>
          </div>
        </div>
      ) : null}

      {(moto.estado === "en_mantenimiento" || moto.estado === "disponible") && (
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-sm font-medium">Mantenimiento</p>
            <p className="text-xs text-muted-foreground">
              Repuestos del inventario usados en esta moto. Costo acumulado:{" "}
              <strong>{formatCop(costoTotal)}</strong>
            </p>
          </div>

          {items.length > 0 ? (
            <ul className="flex flex-col gap-2 text-sm">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-2 py-2"
                >
                  <div>
                    <p className="font-medium">
                      {item.producto_nombre ?? `Producto #${item.producto_id}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.cantidad} × {formatCop(item.costo_unitario)}
                      {item.producto_sku ? ` · ${item.producto_sku}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-destructive hover:bg-red-50"
                    disabled={pending}
                    aria-label="Quitar ítem"
                    onClick={() =>
                      startTransition(async () => {
                        try {
                          await removeGarajeMantenimientoItem(item.id);
                          toast.success("Ítem eliminado y stock repuesto.");
                          router.refresh();
                        } catch (e) {
                          toast.error(
                            e instanceof Error
                              ? e.message
                              : "No se pudo eliminar.",
                          );
                        }
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Sin repuestos cargados.</p>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex flex-col gap-1 sm:col-span-2">
              <Label>Buscar producto</Label>
              <Input
                value={busquedaProd}
                onChange={(e) => setBusquedaProd(e.target.value)}
                placeholder="Nombre o SKU…"
                className="min-h-11"
              />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <Label>Producto</Label>
              <TouchSelect
                value={productoId || "none"}
                onChange={(v) => setProductoId(v === "none" ? "" : v)}
                options={[
                  { value: "none", label: "Seleccionar…" },
                  ...productosFiltrados.map((p) => ({
                    value: String(p.id),
                    label: `${p.nombre} (stock ${p.stock})`,
                  })),
                ]}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Cantidad</Label>
              <Input
                type="number"
                min={1}
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                className="min-h-11"
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                className="min-h-11 w-full"
                disabled={pending || !productoId || Number(cantidad) < 1}
                onClick={() =>
                  startTransition(async () => {
                    try {
                      await addGarajeMantenimientoItem({
                        garajeMotoId: moto.id,
                        productoId: Number(productoId),
                        cantidad: Number(cantidad),
                      });
                      toast.success("Repuesto agregado.");
                      setProductoId("");
                      setCantidad("1");
                      router.refresh();
                    } catch (e) {
                      toast.error(
                        e instanceof Error ? e.message : "No se pudo agregar.",
                      );
                    }
                  })
                }
              >
                Agregar
              </Button>
            </div>
          </div>

          {moto.estado === "en_mantenimiento" ? (
            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <p className="text-sm font-medium">Mantenimiento terminado</p>
              <p className="text-xs text-muted-foreground">
                Define las cuotas para ofrecerla a crédito.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <Label>Cuota inicial</Label>
                  <Input
                    type="number"
                    min={1}
                    value={cuotaInicial}
                    onChange={(e) => setCuotaInicial(e.target.value)}
                    className="min-h-11"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label>Cuota diaria</Label>
                  <Input
                    type="number"
                    min={1}
                    value={cuotaDiaria}
                    onChange={(e) => setCuotaDiaria(e.target.value)}
                    className="min-h-11"
                  />
                </div>
              </div>
              <Button
                type="button"
                className="min-h-11 w-full bg-primary text-primary-foreground hover:bg-primary/80"
                disabled={
                  pending ||
                  !Number(cuotaInicial) ||
                  !Number(cuotaDiaria)
                }
                onClick={() =>
                  startTransition(async () => {
                    try {
                      await terminarGarajeMantenimiento({
                        garajeMotoId: moto.id,
                        cuotaInicial: Number(cuotaInicial),
                        cuotaDiaria: Number(cuotaDiaria),
                      });
                      toast.success("Moto disponible para venta a crédito.");
                      router.refresh();
                    } catch (e) {
                      toast.error(
                        e instanceof Error
                          ? e.message
                          : "No se pudo terminar el mantenimiento.",
                      );
                    }
                  })
                }
              >
                Marcar disponible
              </Button>
            </div>
          ) : (
            <p className="text-sm text-emerald-800">
              Disponible a crédito · Inicial {formatCop(moto.cuota_inicial ?? 0)}{" "}
              · Diaria {formatCop(moto.cuota_diaria ?? 0)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function plazoBadgeLabel(moto: GarajeMotoRow): string | null {
  if (moto.estado !== "retenida") return null;
  const plazo = getPlazoRecuperacion(moto.fecha_recogida);
  if (plazo.plazoVencido) return "Plazo vencido";
  return `${plazo.diasRestantes}d restantes`;
}
