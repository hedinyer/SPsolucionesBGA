"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { Bike, Banknote, Pencil, Plus, Trash2, Warehouse } from "lucide-react";
import { deleteBike, saveBike } from "@/lib/actions/admin-actions";
import { MONTO_VISITA_DEFAULT } from "@/lib/payments/visita-monto";
import type { BikeRow } from "@/lib/pipeline/types";
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
  bikeUploadFolder,
  ImageFileField,
  uploadImageFile,
} from "@/components/ui/image-file-field";
import { STORAGE_BUCKETS } from "@/lib/supabase/storage-buckets";
import { bikeStockKey } from "@/lib/garaje/stock-segunda";

function BikePhoto({ bike }: { bike: BikeRow }) {
  return (
    <div className="h-12 w-16 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/50">
      {bike.imagen_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={bike.imagen_url}
          alt={`${bike.modelo} ${bike.color}`}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          <Bike className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}

export function CatalogoManager({
  bikes,
  stockSegunda = {},
}: {
  bikes: BikeRow[];
  /** Unidades segunda_mano en patio, clave modelo|color. */
  stockSegunda?: Record<string, number>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BikeRow | null>(null);
  const [pending, startTransition] = useTransition();

  const catalogKeys = useMemo(
    () => new Set(bikes.map((b) => bikeStockKey(b.modelo, b.color))),
    [bikes],
  );
  const segundaSinModelo = useMemo(
    () =>
      Object.entries(stockSegunda)
        .filter(([key, n]) => n > 0 && !catalogKeys.has(key))
        .map(([key, n]) => {
          const [modelo, color] = key.split("|");
          return { modelo: modelo ?? key, color: color ?? "", n };
        })
        .sort((a, b) => a.modelo.localeCompare(b.modelo)),
    [stockSegunda, catalogKeys],
  );

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
          Nueva moto
        </Button>
      </div>

      <div className="hidden overflow-x-auto rounded-lg border border-border lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[72px]">Foto</TableHead>
              <TableHead>Modelo</TableHead>
              <TableHead>Color</TableHead>
              <TableHead>Stock nuevo</TableHead>
              <TableHead>2ª mano</TableHead>
              <TableHead>Precio venta</TableHead>
              <TableHead>Cuota inicial</TableHead>
              <TableHead>Cuota diaria</TableHead>
              <TableHead>Visita</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {bikes.map((bike) => (
              <TableRow key={bike.id}>
                <TableCell>
                  <BikePhoto bike={bike} />
                </TableCell>
                <TableCell className="font-medium">{bike.modelo}</TableCell>
                <TableCell>{bike.color}</TableCell>
                <TableCell>{bike.stock}</TableCell>
                <TableCell>
                  {stockSegunda[bikeStockKey(bike.modelo, bike.color)] ?? 0}
                </TableCell>
                <TableCell>
                  {bike.precio_venta != null
                    ? formatCop(bike.precio_venta)
                    : "—"}
                </TableCell>
                <TableCell>{formatCop(bike.cuota_inicial)}</TableCell>
                <TableCell>{formatCop(bike.cuota_diaria)}</TableCell>
                <TableCell>{formatCop(bike.monto_visita ?? MONTO_VISITA_DEFAULT)}</TableCell>
                <TableCell>
                  <Badge variant={bike.activo ? "outline" : "secondary"}>
                    {bike.activo ? "Activo" : "Inactivo"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      asChild
                    >
                      <Link
                        href={`/garaje/nueva?${new URLSearchParams({
                          modelo: bike.modelo,
                          color: bike.color,
                        })}`}
                        aria-label={`Registrar ${bike.modelo} ${bike.color} en garaje`}
                        title="Registrar en garaje"
                      >
                        <Warehouse className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </Button>
                    {bike.activo && bike.stock > 0 ? (
                      <Button variant="ghost" size="icon" asChild>
                        <Link
                          href={`/venta-contado?${new URLSearchParams({
                            nuevo: "1",
                            bikeId: String(bike.id),
                          })}`}
                          aria-label={`Vender ${bike.modelo} ${bike.color} al contado`}
                          title="Vender contado"
                        >
                          <Banknote className="h-4 w-4" aria-hidden="true" />
                        </Link>
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Editar ${bike.modelo} ${bike.color}`}
                      onClick={() => {
                        setEditing(bike);
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
                          aria-label={`Eliminar ${bike.modelo} ${bike.color}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="bg-background">
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Eliminar moto?</AlertDialogTitle>
                          <AlertDialogDescription>
                            {bike.modelo} · {bike.color}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() =>
                              startTransition(async () => {
                                try {
                                  await deleteBike(bike.id);
                                  toast.success("Moto eliminada.");
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
        {bikes.map((bike) => (
          <div
            key={bike.id}
            className="rounded-lg border border-border p-4 text-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-start gap-3">
                <BikePhoto bike={bike} />
                <div className="min-w-0">
                  <p className="font-medium">{bike.modelo}</p>
                  <p className="text-muted-foreground">{bike.color}</p>
                </div>
              </div>
              <Badge variant={bike.activo ? "outline" : "secondary"}>
                {bike.activo ? "Activo" : "Inactivo"}
              </Badge>
            </div>
            <dl className="mt-3 flex flex-col gap-1.5">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Stock nuevo</dt>
                <dd>{bike.stock}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">2ª mano</dt>
                <dd>
                  {stockSegunda[bikeStockKey(bike.modelo, bike.color)] ?? 0}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Precio venta</dt>
                <dd>
                  {bike.precio_venta != null
                    ? formatCop(bike.precio_venta)
                    : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Cuota inicial</dt>
                <dd>{formatCop(bike.cuota_inicial)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Cuota diaria</dt>
                <dd>{formatCop(bike.cuota_diaria)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Visita</dt>
                <dd>{formatCop(bike.monto_visita ?? MONTO_VISITA_DEFAULT)}</dd>
              </div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="min-h-11 flex-1" asChild>
                <Link
                  href={`/garaje/nueva?${new URLSearchParams({
                    modelo: bike.modelo,
                    color: bike.color,
                  })}`}
                >
                  <Warehouse className="mr-1 h-4 w-4" aria-hidden="true" />
                  En garaje
                </Link>
              </Button>
              {bike.activo && bike.stock > 0 ? (
                <Button variant="outline" size="sm" className="min-h-11 flex-1" asChild>
                  <Link
                    href={`/venta-contado?${new URLSearchParams({
                      nuevo: "1",
                      bikeId: String(bike.id),
                    })}`}
                  >
                    <Banknote className="mr-1 h-4 w-4" aria-hidden="true" />
                    Contado
                  </Link>
                </Button>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                className="min-h-11 flex-1"
                onClick={() => {
                  setEditing(bike);
                  setOpen(true);
                }}
              >
                <Pencil className="mr-1 h-4 w-4" aria-hidden="true" />
                Editar
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="min-h-11 flex-1">
                    <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />
                    Eliminar
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-background">
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Eliminar moto?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {bike.modelo} · {bike.color}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() =>
                        startTransition(async () => {
                          try {
                            await deleteBike(bike.id);
                            toast.success("Moto eliminada.");
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
                      Eliminar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ))}
      </div>

      {segundaSinModelo.length > 0 ? (
        <section
          className="rounded-lg border border-dashed border-border p-4"
          aria-labelledby="segunda-sin-modelo-title"
        >
          <h2
            id="segunda-sin-modelo-title"
            className="text-sm font-semibold text-foreground"
          >
            Segunda mano sin modelo en catálogo
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Unidades en patio cuyo modelo/color no coincide con una fila de
            arriba. Créalas en catálogo o corrige el texto en garaje.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {segundaSinModelo.map((row) => (
              <li
                key={`${row.modelo}|${row.color}`}
                className="flex min-h-11 flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span>
                  {row.modelo}
                  {row.color ? ` · ${row.color}` : ""}
                </span>
                <Badge variant="secondary" className="font-normal">
                  {row.n} en patio
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <BikeDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        pending={pending}
        onSave={(form) =>
          startTransition(async () => {
            try {
              let imagenUrl = form.imagenUrl;

              if (form.imageFile) {
                imagenUrl = await uploadImageFile(
                  STORAGE_BUCKETS.bikeImages,
                  bikeUploadFolder(form.modelo, form.color),
                  form.imageFile,
                );
              }

              await saveBike({ ...form, imagenUrl });
              if (editing) {
                toast.success("Moto actualizada.");
              } else {
                const garajeQs = new URLSearchParams({
                  modelo: form.modelo,
                  color: form.color,
                });
                toast.success("Moto creada.", {
                  duration: 8000,
                  action: {
                    label: "Registrar en garaje",
                    onClick: () =>
                      router.push(`/garaje/nueva?${garajeQs}`),
                  },
                });
              }
              router.refresh();
              setOpen(false);
            } catch (e) {
              toast.error(
                e instanceof Error ? e.message : "Error al guardar.",
              );
            }
          })
        }
      />
    </>
  );
}

function BikeDialog({
  open,
  onOpenChange,
  editing,
  pending,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: BikeRow | null;
  pending: boolean;
  onSave: (form: {
    id?: number;
    modelo: string;
    color: string;
    imagenUrl: string;
    imageFile: File | null;
    stock: number;
    cuotaInicial: number;
    cuotaDiaria: number;
    montoVisita: number;
    precioVenta: number | null;
    descripcion: string;
    activo: boolean;
  }) => void;
}) {
  const [modelo, setModelo] = useState("");
  const [color, setColor] = useState("");
  const [imagenUrl, setImagenUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [stock, setStock] = useState("0");
  const [cuotaInicial, setCuotaInicial] = useState("0");
  const [cuotaDiaria, setCuotaDiaria] = useState("38000");
  const [montoVisita, setMontoVisita] = useState(String(MONTO_VISITA_DEFAULT));
  const [precioVenta, setPrecioVenta] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [activo, setActivo] = useState(true);

  useEffect(() => {
    if (!open) return;

    if (editing) {
      setModelo(editing.modelo);
      setColor(editing.color);
      setImagenUrl(editing.imagen_url ?? "");
      setImageFile(null);
      setStock(String(editing.stock));
      setCuotaInicial(String(editing.cuota_inicial));
      setCuotaDiaria(String(editing.cuota_diaria));
      setMontoVisita(String(editing.monto_visita ?? MONTO_VISITA_DEFAULT));
      setPrecioVenta(
        editing.precio_venta != null ? String(editing.precio_venta) : "",
      );
      setDescripcion(editing.descripcion ?? "");
      setActivo(editing.activo);
      return;
    }

    setModelo("");
    setColor("");
    setImagenUrl("");
    setImageFile(null);
    setStock("");
    setCuotaInicial("");
    setCuotaDiaria("");
    setMontoVisita(String(MONTO_VISITA_DEFAULT));
    setPrecioVenta("");
    setDescripcion("");
    setActivo(true);
  }, [open, editing]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-background">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar moto" : "Nueva moto"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Modelo" value={modelo} onChange={setModelo} />
          <Field label="Color" value={color} onChange={setColor} />
          <Field
            label="Stock"
            value={stock}
            onChange={setStock}
            type="number"
          />
          <Field
            label="Precio de venta (total moto)"
            value={precioVenta}
            onChange={setPrecioVenta}
            type="number"
          />
          <Field
            label="Cuota inicial"
            value={cuotaInicial}
            onChange={setCuotaInicial}
            type="number"
          />
          <Field
            label="Cuota diaria"
            value={cuotaDiaria}
            onChange={setCuotaDiaria}
            type="number"
          />
          <Field
            label="Monto visita domiciliaria"
            value={montoVisita}
            onChange={setMontoVisita}
            type="number"
          />
          <div className="sm:col-span-2">
            <ImageFileField
              label="Foto de la moto"
              existingUrl={imagenUrl}
              file={imageFile}
              onFileChange={setImageFile}
              disabled={pending}
              enableCamera
              fileInputId="catalogo-bike-file"
              cameraInputId="catalogo-bike-camera"
            />
          </div>
          <div className="sm:col-span-2">
            <Field
              label="Descripción"
              value={descripcion}
              onChange={setDescripcion}
            />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Switch checked={activo} onCheckedChange={setActivo} />
            <Label>Activo en catálogo</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/80"
            disabled={pending || !modelo.trim() || !color.trim()}
            onClick={() =>
              onSave({
                id: editing?.id,
                modelo,
                color,
                imagenUrl,
                imageFile,
                stock: Number(stock),
                cuotaInicial: Number(cuotaInicial),
                cuotaDiaria: Number(cuotaDiaria),
                montoVisita: Number(montoVisita),
                precioVenta: precioVenta.trim()
                  ? Number(precioVenta)
                  : null,
                descripcion,
                activo,
              })
            }
          >
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 touch-manipulation text-base md:text-sm"
      />
    </div>
  );
}
