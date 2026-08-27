"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  deleteProductoCredito,
  saveProductoCredito,
} from "@/lib/actions/admin-actions";
import type { ProductoCreditoRow } from "@/lib/pipeline/types";
import { formatCop } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

export function ProductosCreditoManager({
  productos,
}: {
  productos: ProductoCreditoRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProductoCreditoRow | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <div className="flex justify-end">
        <Button
          className="min-h-11"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          Nuevo extra
        </Button>
      </div>

      {productos.length === 0 ? (
        <Empty className="border border-dashed border-border">
          <EmptyHeader>
            <EmptyTitle>No hay extras</EmptyTitle>
            <EmptyDescription>
              Crea el primero para ofrecerlos en el pago del cliente.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border border-border lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Qué es</TableHead>
                  <TableHead>Pago al inicio</TableHead>
                  <TableHead>Cuota diaria</TableHead>
                  <TableHead>Cuántos días</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-28">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productos.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <p className="font-medium">{p.nombre}</p>
                      {p.descripcion ? (
                        <p className="text-sm text-muted-foreground">
                          {p.descripcion}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatCop(p.cuota_inicial)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatCop(p.cuota_diaria)}
                    </TableCell>
                    <TableCell>
                      {p.plazo_dias != null ? `${p.plazo_dias} días` : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.activo ? "outline" : "secondary"}>
                        {p.activo ? "Se ofrece" : "Oculto"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="min-h-11 min-w-11"
                          aria-label={`Editar ${p.nombre}`}
                          onClick={() => {
                            setEditing(p);
                            setOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="min-h-11 min-w-11"
                              aria-label={`Eliminar ${p.nombre}`}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="bg-background">
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                ¿Eliminar este extra?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {p.nombre}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() =>
                                  startTransition(async () => {
                                    try {
                                      await deleteProductoCredito(p.id);
                                      toast.success("Extra eliminado.");
                                      router.refresh();
                                    } catch (e) {
                                      toast.error(
                                        e instanceof Error
                                          ? e.message
                                          : "Error al eliminar.",
                                      );
                                    }
                                  })
                                }
                              >
                                Eliminar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 lg:hidden">
            {productos.map((p) => (
              <div key={p.id} className="rounded-lg border border-border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{p.nombre}</p>
                    {p.descripcion ? (
                      <p className="text-sm text-muted-foreground">
                        {p.descripcion}
                      </p>
                    ) : null}
                  </div>
                  <Badge variant={p.activo ? "outline" : "secondary"}>
                    {p.activo ? "Se ofrece" : "Oculto"}
                  </Badge>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Pago al inicio</dt>
                    <dd className="tabular-nums">
                      {formatCop(p.cuota_inicial)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Cuota diaria</dt>
                    <dd className="tabular-nums">
                      {formatCop(p.cuota_diaria)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Cuántos días</dt>
                    <dd>
                      {p.plazo_dias != null ? `${p.plazo_dias} días` : "—"}
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="outline"
                    className="min-h-11"
                    onClick={() => {
                      setEditing(p);
                      setOpen(true);
                    }}
                  >
                    Editar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <ProductoCreditoDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        pending={pending}
        onSave={(data) =>
          startTransition(async () => {
            try {
              await saveProductoCredito(data);
              toast.success(editing ? "Extra actualizado." : "Extra creado.");
              setOpen(false);
              router.refresh();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Error al guardar.");
            }
          })
        }
      />
    </>
  );
}

function ProductoCreditoDialog({
  open,
  onOpenChange,
  editing,
  pending,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: ProductoCreditoRow | null;
  pending: boolean;
  onSave: (data: {
    id?: number;
    nombre: string;
    descripcion?: string;
    cuotaInicial: number;
    cuotaDiaria: number;
    plazoDias: number;
    activo: boolean;
    orden: number;
  }) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [cuotaInicial, setCuotaInicial] = useState("50000");
  const [cuotaDiaria, setCuotaDiaria] = useState("5000");
  const [plazoDias, setPlazoDias] = useState("20");
  const [activo, setActivo] = useState(true);
  const [orden, setOrden] = useState("0");

  useEffect(() => {
    setNombre(editing?.nombre ?? "");
    setDescripcion(editing?.descripcion ?? "");
    setCuotaInicial(String(editing?.cuota_inicial ?? 50000));
    setCuotaDiaria(String(editing?.cuota_diaria ?? 5000));
    setPlazoDias(String(editing?.plazo_dias ?? 20));
    setActivo(editing?.activo ?? true);
    setOrden(String(editing?.orden ?? 0));
  }, [editing, open]);

  const parsedPlazo = Number(plazoDias);
  const parsedDiaria = Number(cuotaDiaria);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar extra" : "Nuevo extra a cuotas"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="pc-nombre">¿Cómo se llama?</Label>
            <Input
              id="pc-nombre"
              className="min-h-11"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Forro de moto"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pc-desc">Detalle (opcional)</Label>
            <Input
              id="pc-desc"
              className="min-h-11"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="pc-inicial">Pago al inicio</Label>
              <Input
                id="pc-inicial"
                className="min-h-11"
                type="number"
                min={0}
                value={cuotaInicial}
                onChange={(e) => setCuotaInicial(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pc-diaria">Cuota diaria</Label>
              <Input
                id="pc-diaria"
                className="min-h-11"
                type="number"
                min={1}
                value={cuotaDiaria}
                onChange={(e) => setCuotaDiaria(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pc-plazo">¿Cuántos días de cuota?</Label>
            <Input
              id="pc-plazo"
              className="min-h-11"
              type="number"
              min={1}
              value={plazoDias}
              onChange={(e) => setPlazoDias(e.target.value)}
            />
            {Number.isFinite(parsedDiaria) &&
            parsedDiaria > 0 &&
            Number.isFinite(parsedPlazo) &&
            parsedPlazo > 0 ? (
              <p className="text-xs text-muted-foreground">
                {formatCop(parsedDiaria)}/día × {parsedPlazo} días ={" "}
                {formatCop(parsedDiaria * parsedPlazo)}
              </p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="pc-orden">Orden en la lista</Label>
              <Input
                id="pc-orden"
                className="min-h-11"
                type="number"
                min={0}
                value={orden}
                onChange={(e) => setOrden(e.target.value)}
              />
            </div>
            <div className="flex min-h-11 items-center gap-3 self-end pb-1">
              <Switch
                checked={activo}
                onCheckedChange={setActivo}
                id="pc-activo"
              />
              <Label htmlFor="pc-activo">Se ofrece al cliente</Label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            className="min-h-11"
            disabled={
              pending ||
              !nombre.trim() ||
              !Number.isFinite(parsedPlazo) ||
              parsedPlazo <= 0
            }
            onClick={() =>
              onSave({
                id: editing?.id,
                nombre,
                descripcion: descripcion || undefined,
                cuotaInicial: Number(cuotaInicial),
                cuotaDiaria: Number(cuotaDiaria),
                plazoDias: parsedPlazo,
                activo,
                orden: Number(orden),
              })
            }
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
