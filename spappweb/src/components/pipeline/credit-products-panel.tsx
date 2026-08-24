"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  addCompraProductoCredito,
  removeCompraProductoCredito,
  setCompraProductoCreditoPlazo,
} from "@/lib/actions/admin-actions";
import { removePagoAbono } from "@/lib/actions/payment-comprobante-actions";
import {
  abonosProducto,
  conceptoProductoCompleto,
  diasProductoCubiertos,
  faltanteProducto,
  montoEsperadoProducto,
  sumAbonosProducto,
  type ProductoCreditoPagoConcepto,
} from "@/lib/payments/producto-credito-progress";
import type {
  CompraProductoCreditoRow,
  MedioPagoAdmin,
  PagoRow,
  ProductoCreditoRow,
  UserMotoCompraRow,
} from "@/lib/pipeline/types";
import { formatCop, formatDate } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TouchSelect } from "@/components/ui/touch-select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PaymentComprobanteDialog } from "@/components/pipeline/payment-comprobante-dialog";
import { Badge } from "@/components/ui/badge";

interface CreditProductsPanelProps {
  compra: UserMotoCompraRow | null;
  items: CompraProductoCreditoRow[];
  catalogo: ProductoCreditoRow[];
  pagos: PagoRow[];
  userId: number;
  referenciasUsadas?: string[];
  clienteNombre?: string;
  clienteCedula?: string;
}

function totalInicial(items: CompraProductoCreditoRow[]): number {
  return items.reduce(
    (sum, item) => sum + item.cuota_inicial_monto * item.cantidad,
    0,
  );
}

function totalDiario(items: CompraProductoCreditoRow[]): number {
  return items.reduce(
    (sum, item) => sum + item.cuota_diaria_monto * item.cantidad,
    0,
  );
}

function formatPlazoDias(dias: number | null | undefined): string | null {
  if (dias == null || dias <= 0) return null;
  return dias === 1 ? "1 día" : `${dias} días`;
}

function itemCuotaLine(item: CompraProductoCreditoRow): string {
  const diaria = formatCop(item.cuota_diaria_monto * item.cantidad);
  const plazo = formatPlazoDias(item.plazo_dias);
  return plazo ? `${diaria}/día durante ${plazo}` : `${diaria}/día`;
}

export function CreditProductsPanel({
  compra,
  items,
  catalogo,
  pagos,
  userId,
  referenciasUsadas = [],
  clienteNombre = "Cliente",
  clienteCedula = "",
}: CreditProductsPanelProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [pagoDialog, setPagoDialog] = useState<{
    item: CompraProductoCreditoRow;
    concepto: ProductoCreditoPagoConcepto;
    medio: MedioPagoAdmin;
  } | null>(null);

  if (!compra) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Asigna una moto antes de agregar productos a crédito.
        </CardContent>
      </Card>
    );
  }

  const canEdit = compra.estado === "pendiente_pago";
  const canRegisterPagos = compra.estado !== "cancelada";
  const activos = catalogo.filter((p) => p.activo);

  function handleRemove(itemId: string) {
    startTransition(async () => {
      try {
        await removeCompraProductoCredito(itemId, userId);
        toast.success("Producto quitado.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al quitar.");
      }
    });
  }

  function handleSetPlazo(itemId: string, plazoDias: number) {
    startTransition(async () => {
      try {
        await setCompraProductoCreditoPlazo({ itemId, userId, plazoDias });
        toast.success("Plazo guardado.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al guardar plazo.");
      }
    });
  }

  function handleRemoveAbono(pagoId: string) {
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
    <>
      <Card>
        <CardHeader>
          <CardTitle>Productos a crédito</CardTitle>
          <p className="text-sm text-muted-foreground">
            Accesorios u otros ítems que el cliente lleva a cuotas, ligados a
            esta moto. Registra aquí la inicial y las cuotas diarias con
            comprobante; salen en el extracto de pagos.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {items.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {items.map((item) => {
                const inicialEsperado = montoEsperadoProducto(
                  item,
                  "producto_inicial",
                );
                const cuotaEsperado = montoEsperadoProducto(
                  item,
                  "producto_cuota",
                );
                const inicialPagado = sumAbonosProducto(
                  pagos,
                  item.id,
                  "producto_inicial",
                );
                const cuotaPagado = sumAbonosProducto(
                  pagos,
                  item.id,
                  "producto_cuota",
                );
                const inicialOk = conceptoProductoCompleto(
                  item,
                  pagos,
                  "producto_inicial",
                );
                const cuotaOk = conceptoProductoCompleto(
                  item,
                  pagos,
                  "producto_cuota",
                );
                const diasCubiertos = diasProductoCubiertos(item, pagos);
                const abonosInicial = abonosProducto(
                  pagos,
                  item.id,
                  "producto_inicial",
                );
                const abonosCuota = abonosProducto(
                  pagos,
                  item.id,
                  "producto_cuota",
                );

                return (
                  <li
                    key={item.id}
                    className="rounded-lg border border-border p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {item.nombre}
                          {item.cantidad > 1 ? ` × ${item.cantidad}` : ""}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Inicial{" "}
                          {formatCop(item.cuota_inicial_monto * item.cantidad)} ·{" "}
                          {itemCuotaLine(item)}
                        </p>
                        {item.plazo_dias != null && item.plazo_dias > 0 ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Total cuotas diarias{" "}
                            {formatCop(
                              item.cuota_diaria_monto *
                                item.cantidad *
                                item.plazo_dias,
                            )}
                          </p>
                        ) : (
                          <SetPlazoInline
                            disabled={pending}
                            onSave={(dias) => handleSetPlazo(item.id, dias)}
                          />
                        )}
                        {item.notas && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.notas}
                          </p>
                        )}
                      </div>
                      {canEdit && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={pending}
                          onClick={() => handleRemove(item.id)}
                          title="Quitar producto"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>

                    {canRegisterPagos && (
                      <div className="mt-4 flex flex-col gap-3">
                        <ProductoConceptoPagos
                          titulo="Inicial del producto"
                          esperado={inicialEsperado}
                          pagado={inicialPagado}
                          completo={inicialOk}
                          faltante={faltanteProducto(
                            item,
                            pagos,
                            "producto_inicial",
                          )}
                          abonos={abonosInicial}
                          pending={pending}
                          onAdd={() =>
                            setPagoDialog({
                              item,
                              concepto: "producto_inicial",
                              medio: "nequi_nicolas",
                            })
                          }
                          onAddEfectivo={() =>
                            setPagoDialog({
                              item,
                              concepto: "producto_inicial",
                              medio: "efectivo",
                            })
                          }
                          onRemoveAbono={handleRemoveAbono}
                        />
                        <ProductoConceptoPagos
                          titulo="Cuotas diarias del producto"
                          esperado={cuotaEsperado}
                          pagado={cuotaPagado}
                          completo={cuotaOk}
                          faltante={faltanteProducto(
                            item,
                            pagos,
                            "producto_cuota",
                          )}
                          abonos={abonosCuota}
                          pending={pending}
                          detalleExtra={
                            item.plazo_dias != null && item.plazo_dias > 0
                              ? `${diasCubiertos} de ${item.plazo_dias} días cubiertos`
                              : undefined
                          }
                          disabledAdd={
                            !(item.plazo_dias != null && item.plazo_dias > 0)
                          }
                          onAdd={() =>
                            setPagoDialog({
                              item,
                              concepto: "producto_cuota",
                              medio: "nequi_nicolas",
                            })
                          }
                          onAddEfectivo={() =>
                            setPagoDialog({
                              item,
                              concepto: "producto_cuota",
                              medio: "efectivo",
                            })
                          }
                          onRemoveAbono={handleRemoveAbono}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
              Sin productos a crédito agregados.
            </p>
          )}

          {(items.length > 0 || !canEdit) && (
            <div className="rounded-lg border border-border bg-muted/50 p-3 text-sm">
              <p className="text-muted-foreground">Totales productos a crédito</p>
              <p>
                Inicial {formatCop(totalInicial(items))} · Cuota diaria{" "}
                {formatCop(totalDiario(items))}
              </p>
            </div>
          )}

          {canEdit && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(true)}
              disabled={pending}
            >
              <Plus className="mr-2 h-4 w-4" />
              Agregar producto
            </Button>
          )}
        </CardContent>
      </Card>

      <AddCreditProductDialog
        open={open}
        onOpenChange={setOpen}
        catalogo={activos}
        compraId={compra.id}
        userId={userId}
        pending={pending}
        onAdd={(input) =>
          startTransition(async () => {
            try {
              await addCompraProductoCredito(input);
              toast.success("Producto agregado.");
              setOpen(false);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Error al agregar.");
            }
          })
        }
      />

      {pagoDialog && (
        <PaymentComprobanteDialog
          open={!!pagoDialog}
          onOpenChange={(next) => {
            if (!next) setPagoDialog(null);
          }}
          contexto={pagoDialog.concepto}
          compraProductoCreditoId={pagoDialog.item.id}
          contextoTitulo={pagoDialog.item.nombre}
          userId={userId}
          compraId={compra.id}
          montoEsperado={montoEsperadoProducto(
            pagoDialog.item,
            pagoDialog.concepto,
          )}
          montoFaltante={faltanteProducto(
            pagoDialog.item,
            pagos,
            pagoDialog.concepto,
          )}
          referenciasUsadas={referenciasUsadas}
          clienteNombre={clienteNombre}
          clienteCedula={clienteCedula}
          initialMedioPago={pagoDialog.medio}
          onSuccess={() => {
            setPagoDialog(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function ProductoConceptoPagos({
  titulo,
  esperado,
  pagado,
  completo,
  faltante,
  abonos,
  pending,
  detalleExtra,
  disabledAdd,
  onAdd,
  onAddEfectivo,
  onRemoveAbono,
}: {
  titulo: string;
  esperado: number;
  pagado: number;
  completo: boolean;
  faltante: number;
  abonos: PagoRow[];
  pending: boolean;
  detalleExtra?: string;
  disabledAdd?: boolean;
  onAdd: () => void;
  onAddEfectivo: () => void;
  onRemoveAbono: (pagoId: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{titulo}</p>
          <p className="text-xs text-muted-foreground">
            {formatCop(pagado)} de {formatCop(esperado)}
            {faltante > 0 ? ` · faltan ${formatCop(faltante)}` : ""}
            {detalleExtra ? ` · ${detalleExtra}` : ""}
          </p>
        </div>
        <Badge variant={completo ? "outline" : "secondary"}>
          {completo ? "Cubierto" : "Pendiente"}
        </Badge>
      </div>

      {abonos.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {abonos.map((abono) => (
            <li
              key={abono.id}
              className="flex flex-wrap items-center justify-between gap-2 text-xs"
            >
              <span>
                {formatCop(abono.monto)}
                {abono.fecha_comprobante || abono.confirmado_at
                  ? ` · ${formatDate(abono.fecha_comprobante ?? abono.confirmado_at)}`
                  : ""}
                {abono.referencia ? ` · ${abono.referencia}` : ""}
              </span>
              <span className="flex items-center gap-1">
                {abono.comprobante_url ? (
                  <a
                    href={abono.comprobante_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Ver
                  </a>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={pending}
                  onClick={() => onRemoveAbono(abono.id)}
                  title="Eliminar abono"
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {!completo && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending || disabledAdd || esperado <= 0}
            onClick={onAdd}
          >
            Agregar abono
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending || disabledAdd || esperado <= 0}
            onClick={onAddEfectivo}
          >
            Efectivo
          </Button>
        </div>
      )}
    </div>
  );
}

function SetPlazoInline({
  disabled,
  onSave,
}: {
  disabled: boolean;
  onSave: (dias: number) => void;
}) {
  const [dias, setDias] = useState("");
  const parsed = Number(dias);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Label htmlFor="plazo-inline" className="text-xs text-muted-foreground">
        ¿Cuántos días se paga?
      </Label>
      <Input
        id="plazo-inline"
        type="number"
        min={1}
        className="h-8 w-20"
        value={dias}
        disabled={disabled}
        onChange={(e) => setDias(e.target.value)}
        placeholder="días"
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled || !Number.isFinite(parsed) || parsed <= 0}
        onClick={() => onSave(parsed)}
      >
        Guardar plazo
      </Button>
    </div>
  );
}

function AddCreditProductDialog({
  open,
  onOpenChange,
  catalogo,
  compraId,
  userId,
  pending,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalogo: ProductoCreditoRow[];
  compraId: string;
  userId: number;
  pending: boolean;
  onAdd: (input: {
    compraId: string;
    userId: number;
    productoCreditoId?: number;
    nombre?: string;
    cuotaInicial?: number;
    cuotaDiaria?: number;
    plazoDias?: number;
    cantidad: number;
    notas?: string;
  }) => void;
}) {
  const [modo, setModo] = useState<"catalogo" | "custom">("catalogo");
  const [productoId, setProductoId] = useState("");
  const [nombre, setNombre] = useState("");
  const [cuotaInicial, setCuotaInicial] = useState("");
  const [cuotaDiaria, setCuotaDiaria] = useState("");
  const [plazoDias, setPlazoDias] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [notas, setNotas] = useState("");

  const selected = catalogo.find((p) => String(p.id) === productoId);

  useEffect(() => {
    if (!open) return;
    setModo(catalogo.length > 0 ? "catalogo" : "custom");
    setProductoId(catalogo[0] ? String(catalogo[0].id) : "");
    setNombre("");
    setCuotaInicial("");
    setCuotaDiaria("");
    setPlazoDias("");
    setCantidad("1");
    setNotas("");
  }, [open, catalogo]);

  useEffect(() => {
    if (modo === "catalogo" && selected) {
      setCuotaInicial(String(selected.cuota_inicial));
      setCuotaDiaria(String(selected.cuota_diaria));
      setPlazoDias(
        selected.plazo_dias != null ? String(selected.plazo_dias) : "",
      );
      setNombre(selected.nombre);
    }
  }, [modo, selected]);

  const parsedCantidad = Number(cantidad);
  const parsedInicial = Number(cuotaInicial);
  const parsedDiaria = Number(cuotaDiaria);
  const parsedPlazo = Number(plazoDias);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Agregar producto a crédito</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {catalogo.length > 0 && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant={modo === "catalogo" ? "default" : "outline"}
                size="sm"
                className={
                  modo === "catalogo" ? "bg-primary text-primary-foreground" : ""
                }
                onClick={() => setModo("catalogo")}
              >
                Del catálogo
              </Button>
              <Button
                type="button"
                variant={modo === "custom" ? "default" : "outline"}
                size="sm"
                className={
                  modo === "custom" ? "bg-primary text-primary-foreground" : ""
                }
                onClick={() => setModo("custom")}
              >
                Personalizado
              </Button>
            </div>
          )}

          {modo === "catalogo" && catalogo.length > 0 ? (
            <div className="flex flex-col gap-2">
              <Label>Producto</Label>
              <TouchSelect
                aria-label="Producto a crédito"
                value={productoId}
                onChange={setProductoId}
                placeholder="Seleccionar"
                options={catalogo.map((p) => ({
                  value: String(p.id),
                  label: `${p.nombre} · ini. ${formatCop(p.cuota_inicial)} · ${formatCop(p.cuota_diaria)}/día${
                    p.plazo_dias != null ? ` × ${p.plazo_dias} días` : ""
                  }`,
                }))}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="cp-nombre">Nombre</Label>
              <Input
                id="cp-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Forro, casco, etc."
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="cp-inicial">Cuota inicial</Label>
              <Input
                id="cp-inicial"
                type="number"
                min={0}
                value={cuotaInicial}
                onChange={(e) => setCuotaInicial(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="cp-diaria">Cuota diaria</Label>
              <Input
                id="cp-diaria"
                type="number"
                min={1}
                value={cuotaDiaria}
                onChange={(e) => setCuotaDiaria(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="cp-plazo">Días de cuota</Label>
              <Input
                id="cp-plazo"
                type="number"
                min={1}
                value={plazoDias}
                onChange={(e) => setPlazoDias(e.target.value)}
                placeholder="Ej. 20"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="cp-cantidad">Cantidad</Label>
              <Input
                id="cp-cantidad"
                type="number"
                min={1}
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
              />
            </div>
          </div>

          {Number.isFinite(parsedDiaria) &&
          parsedDiaria > 0 &&
          Number.isFinite(parsedPlazo) &&
          parsedPlazo > 0 ? (
            <p className="text-xs text-muted-foreground">
              Paga {formatCop(parsedDiaria)}/día durante {parsedPlazo} día
              {parsedPlazo === 1 ? "" : "s"} (
              {formatCop(parsedDiaria * parsedPlazo)} en cuotas diarias)
              {Number.isFinite(parsedInicial) && parsedInicial >= 0
                ? ` · total con inicial ${formatCop(parsedInicial + parsedDiaria * parsedPlazo)}`
                : ""}
              .
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="cp-notas">Notas (opcional)</Label>
            <Input
              id="cp-notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            className="bg-primary text-primary-foreground hover:bg-primary/80"
            disabled={
              pending ||
              !Number.isFinite(parsedCantidad) ||
              parsedCantidad <= 0 ||
              !Number.isFinite(parsedDiaria) ||
              parsedDiaria <= 0 ||
              !Number.isFinite(parsedPlazo) ||
              parsedPlazo <= 0 ||
              (modo === "custom" && !nombre.trim())
            }
            onClick={() =>
              onAdd({
                compraId,
                userId,
                ...(modo === "catalogo" && productoId
                  ? { productoCreditoId: Number(productoId) }
                  : { nombre: nombre.trim() }),
                cuotaInicial: parsedInicial,
                cuotaDiaria: parsedDiaria,
                plazoDias: parsedPlazo,
                cantidad: parsedCantidad,
                notas: notas.trim() || undefined,
              })
            }
          >
            Agregar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
