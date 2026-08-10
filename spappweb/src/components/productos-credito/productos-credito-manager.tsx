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
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
          className="bg-primary text-primary-foreground hover:bg-primary/80"
        >
          <Plus className="mr-2 h-4 w-4" />
          Nuevo producto
        </Button>
      </div>

      <div className="hidden overflow-x-auto rounded-lg border border-border lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead>Cuota inicial</TableHead>
              <TableHead>Cuota diaria</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {productos.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <p className="font-medium">{p.nombre}</p>
                  {p.descripcion && (
                    <p className="text-sm text-muted-foreground">{p.descripcion}</p>
                  )}
                </TableCell>
                <TableCell>{formatCop(p.cuota_inicial)}</TableCell>
                <TableCell>{formatCop(p.cuota_diaria)}</TableCell>
                <TableCell>
                  <Badge variant={p.activo ? "outline" : "secondary"}>
                    {p.activo ? "Activo" : "Inactivo"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditing(p);
                        setOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="bg-background">
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Eliminar producto?</AlertDialogTitle>
                          <AlertDialogDescription>{p.nombre}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() =>
                              startTransition(async () => {
                                try {
                                  await deleteProductoCredito(p.id);
                                  toast.success("Producto eliminado.");
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
            {productos.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No hay productos a crédito. Crea el primero (ej. forro de moto).
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 lg:hidden">
        {productos.map((p) => (
          <div
            key={p.id}
            className="rounded-lg border border-border p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{p.nombre}</p>
                {p.descripcion && (
                  <p className="text-sm text-muted-foreground">{p.descripcion}</p>
                )}
              </div>
              <Badge variant={p.activo ? "outline" : "secondary"}>
                {p.activo ? "Activo" : "Inactivo"}
              </Badge>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-muted-foreground">Inicial</dt>
                <dd>{formatCop(p.cuota_inicial)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Cuota diaria</dt>
                <dd>{formatCop(p.cuota_diaria)}</dd>
              </div>
            </dl>
            <div className="mt-3 flex gap-2">
              <Button
                variant="outline"
                size="sm"
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

      <ProductoCreditoDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        pending={pending}
        onSave={(data) =>
          startTransition(async () => {
            try {
              await saveProductoCredito(data);
              toast.success(editing ? "Producto actualizado." : "Producto creado.");
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
    activo: boolean;
    orden: number;
  }) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [cuotaInicial, setCuotaInicial] = useState("50000");
  const [cuotaDiaria, setCuotaDiaria] = useState("5000");
  const [activo, setActivo] = useState(true);
  const [orden, setOrden] = useState("0");

  useEffect(() => {
    setNombre(editing?.nombre ?? "");
    setDescripcion(editing?.descripcion ?? "");
    setCuotaInicial(String(editing?.cuota_inicial ?? 50000));
    setCuotaDiaria(String(editing?.cuota_diaria ?? 5000));
    setActivo(editing?.activo ?? true);
    setOrden(String(editing?.orden ?? 0));
  }, [editing, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar producto" : "Nuevo producto a crédito"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="pc-nombre">Nombre</Label>
            <Input
              id="pc-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Forro de moto"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pc-desc">Descripción (opcional)</Label>
            <Input
              id="pc-desc"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="pc-inicial">Cuota inicial</Label>
              <Input
                id="pc-inicial"
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
                type="number"
                min={1}
                value={cuotaDiaria}
                onChange={(e) => setCuotaDiaria(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="pc-orden">Orden</Label>
              <Input
                id="pc-orden"
                type="number"
                min={0}
                value={orden}
                onChange={(e) => setOrden(e.target.value)}
              />
            </div>
            <div className="flex items-end gap-2 pb-1">
              <Switch checked={activo} onCheckedChange={setActivo} id="pc-activo" />
              <Label htmlFor="pc-activo">Activo</Label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            className="bg-primary text-primary-foreground hover:bg-primary/80"
            disabled={pending || !nombre.trim()}
            onClick={() =>
              onSave({
                id: editing?.id,
                nombre,
                descripcion: descripcion || undefined,
                cuotaInicial: Number(cuotaInicial),
                cuotaDiaria: Number(cuotaDiaria),
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
