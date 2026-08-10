"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  addCompraProductoCredito,
  removeCompraProductoCredito,
} from "@/lib/actions/admin-actions";
import type {
  CompraProductoCreditoRow,
  ProductoCreditoRow,
  UserMotoCompraRow,
} from "@/lib/pipeline/types";
import { formatCop } from "@/lib/utils/format";
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

interface CreditProductsPanelProps {
  compra: UserMotoCompraRow | null;
  items: CompraProductoCreditoRow[];
  catalogo: ProductoCreditoRow[];
  userId: number;
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

export function CreditProductsPanel({
  compra,
  items,
  catalogo,
  userId,
}: CreditProductsPanelProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

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

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Productos a crédito</CardTitle>
          <p className="text-sm text-muted-foreground">
            Accesorios u otros ítems que el cliente lleva a cuotas, ligados a
            esta moto.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {items.length > 0 ? (
            <ul className="divide-y divide-neutral-100 rounded-lg border border-border">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {item.nombre}
                      {item.cantidad > 1 ? ` × ${item.cantidad}` : ""}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Inicial {formatCop(item.cuota_inicial_monto * item.cantidad)}{" "}
                      · {formatCop(item.cuota_diaria_monto * item.cantidad)}/día
                    </p>
                    {item.notas && (
                      <p className="mt-1 text-xs text-muted-foreground">{item.notas}</p>
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
                </li>
              ))}
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
    </>
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
    cantidad: number;
    notas?: string;
  }) => void;
}) {
  const [modo, setModo] = useState<"catalogo" | "custom">("catalogo");
  const [productoId, setProductoId] = useState("");
  const [nombre, setNombre] = useState("");
  const [cuotaInicial, setCuotaInicial] = useState("");
  const [cuotaDiaria, setCuotaDiaria] = useState("");
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
    setCantidad("1");
    setNotas("");
  }, [open, catalogo]);

  useEffect(() => {
    if (modo === "catalogo" && selected) {
      setCuotaInicial(String(selected.cuota_inicial));
      setCuotaDiaria(String(selected.cuota_diaria));
      setNombre(selected.nombre);
    }
  }, [modo, selected]);

  const parsedCantidad = Number(cantidad);
  const parsedInicial = Number(cuotaInicial);
  const parsedDiaria = Number(cuotaDiaria);

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
                className={modo === "catalogo" ? "bg-primary text-primary-foreground" : ""}
                onClick={() => setModo("catalogo")}
              >
                Del catálogo
              </Button>
              <Button
                type="button"
                variant={modo === "custom" ? "default" : "outline"}
                size="sm"
                className={modo === "custom" ? "bg-primary text-primary-foreground" : ""}
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
                  label: `${p.nombre} · ini. ${formatCop(p.cuota_inicial)} · ${formatCop(p.cuota_diaria)}/día`,
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
