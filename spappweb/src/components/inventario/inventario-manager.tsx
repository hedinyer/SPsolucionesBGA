"use client";

import { useState, useTransition, useEffect, useId } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { usePollingRefresh } from "@/hooks/use-polling-refresh";
import { ChevronDown, Eye, Pencil, Plus, Trash2 } from "lucide-react";
import {
  deleteCategoria,
  deleteProducto,
  saveCategoria,
  saveProducto,
} from "@/lib/actions/admin-actions";
import type {
  InventarioCategoriaRow,
  InventarioProductoRow,
  InventarioUbicacion,
} from "@/lib/pipeline/types";
import { INVENTARIO_UBICACIONES } from "@/lib/pipeline/types";
import { formatCop } from "@/lib/utils/format";
import { getStoragePublicUrl } from "@/lib/utils/storage-urls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
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
  ImageFileField,
  productoUploadFolder,
  uploadImageFile,
} from "@/components/ui/image-file-field";
import { STORAGE_BUCKETS } from "@/lib/supabase/storage-buckets";
import { Textarea } from "@/components/ui/textarea";
import { TouchSelect } from "@/components/ui/touch-select";
import { PrintPriceLabelButton } from "@/components/inventario/print-price-label-button";

function skuFromNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function formatMilesInput(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("es-CO");
}

function parseMilesInput(raw: string): number {
  return Number(raw.replace(/\D/g, ""));
}

function formatMilesFromNumber(n: number): string {
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("es-CO");
}

function formatUbicacionProducto(
  ubicacion: InventarioUbicacion | undefined,
  gaveta?: string | null,
): string {
  const base = ubicacion ?? "Soluciones";
  if (base === "Bodega" && gaveta?.trim()) {
    return `Bodega · Gaveta ${gaveta.trim()}`;
  }
  return base;
}

export function InventarioManager({
  categorias,
  productos,
}: {
  categorias: InventarioCategoriaRow[];
  productos: InventarioProductoRow[];
}) {
  const router = useRouter();
  const [catOpen, setCatOpen] = useState(false);
  const [prodOpen, setProdOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<InventarioCategoriaRow | null>(
    null,
  );
  const [editingProd, setEditingProd] = useState<InventarioProductoRow | null>(
    null,
  );
  const [photoPreview, setPhotoPreview] = useState<{
    url: string;
    nombre: string;
  } | null>(null);
  const [deletingProd, setDeletingProd] =
    useState<InventarioProductoRow | null>(null);
  const [pending, startTransition] = useTransition();

  const { secondsAgo } = usePollingRefresh({
    intervalMs: 30_000,
    enabled:
      !catOpen && !prodOpen && !photoPreview && !deletingProd && !pending,
  });

  function openPhoto(p: InventarioProductoRow) {
    const img = getStoragePublicUrl(
      STORAGE_BUCKETS.inventarioImagenes,
      p.imagen_url,
    );
    if (!img) {
      toast.message("Este producto no tiene foto.");
      return;
    }
    setPhotoPreview({ url: img, nombre: p.nombre });
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        Inventario actualizado hace {secondsAgo}s
      </p>
      <Tabs defaultValue="productos">
        <TabsList className="w-full max-w-full overflow-x-auto">
          <TabsTrigger value="productos">Productos</TabsTrigger>
          <TabsTrigger value="categorias">Categorías</TabsTrigger>
        </TabsList>

        <TabsContent value="productos" className="flex flex-col gap-4">
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setEditingProd(null);
                setProdOpen(true);
              }}
            >
              <Plus data-icon="inline-start" />
              Nuevo producto
            </Button>
          </div>
          {productos.length === 0 ? (
            <Empty className="border border-dashed border-border">
              <EmptyHeader>
                <EmptyTitle>Inventario vacío</EmptyTitle>
                <EmptyDescription>
                  Aún no hay productos. Crea el primero con Nuevo producto.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <div className="hidden overflow-x-auto rounded-lg border border-border lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Cantidad</TableHead>
                      <TableHead>Costo</TableHead>
                      <TableHead>Precio venta</TableHead>
                      <TableHead>Foto</TableHead>
                      <TableHead>Ubicación</TableHead>
                      <TableHead className="min-w-[22rem]">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productos.map((p) => {
                      const img = getStoragePublicUrl(
                        STORAGE_BUCKETS.inventarioImagenes,
                        p.imagen_url,
                      );
                      const lowStock = p.stock <= p.stock_minimo;
                      const ubicacionLabel = formatUbicacionProducto(
                        p.ubicacion,
                        p.gaveta,
                      );
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="text-muted-foreground">
                            {p.id}
                          </TableCell>
                          <TableCell className="font-medium">{p.nombre}</TableCell>
                          <TableCell>
                            <span
                              className={
                                lowStock ? "font-medium text-red-700" : ""
                              }
                            >
                              {p.stock}
                            </span>
                            {lowStock && (
                              <Badge variant="destructive" className="ml-2">
                                Bajo
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>{formatCop(p.costo ?? 0)}</TableCell>
                          <TableCell>{formatCop(p.precio)}</TableCell>
                          <TableCell>
                            {img ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={img}
                                alt={`Foto de ${p.nombre}`}
                                className="h-10 w-10 rounded object-cover"
                              />
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>{ubicacionLabel}</TableCell>
                          <TableCell>
                            <div className="flex flex-nowrap items-center gap-1 whitespace-nowrap">
                              <PrintPriceLabelButton product={p} />
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label={`Editar ${p.nombre}`}
                                onClick={() => {
                                  setEditingProd(p);
                                  setProdOpen(true);
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                                Editar
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label={
                                  img
                                    ? `Ver foto de ${p.nombre}`
                                    : `${p.nombre} no tiene foto`
                                }
                                disabled={!img}
                                onClick={() => openPhoto(p)}
                              >
                                <Eye className="h-4 w-4" />
                                Ver foto
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label={`Eliminar ${p.nombre}`}
                                onClick={() => setDeletingProd(p)}
                              >
                                <Trash2 className="h-4 w-4" />
                                Eliminar
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col gap-3 lg:hidden">
                {productos.map((p) => {
                  const img = getStoragePublicUrl(
                    STORAGE_BUCKETS.inventarioImagenes,
                    p.imagen_url,
                  );
                  const lowStock = p.stock <= p.stock_minimo;
                  const ubicacionLabel = formatUbicacionProducto(
                    p.ubicacion,
                    p.gaveta,
                  );
                  return (
                    <div
                      key={p.id}
                      className="rounded-lg border border-border p-4 text-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground">
                            ID {p.id}
                          </p>
                          <p className="font-medium">{p.nombre}</p>
                        </div>
                        {img ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={img}
                            alt={`Foto de ${p.nombre}`}
                            className="h-12 w-12 shrink-0 rounded object-cover"
                          />
                        ) : (
                          <div
                            className="h-12 w-12 shrink-0 rounded bg-muted"
                            aria-hidden
                          />
                        )}
                      </div>
                      <dl className="mt-3 flex flex-col gap-1.5">
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">Cantidad</dt>
                          <dd
                            className={
                              lowStock ? "font-medium text-red-700" : ""
                            }
                          >
                            {p.stock}
                            {lowStock && (
                              <Badge variant="destructive" className="ml-2">
                                Bajo
                              </Badge>
                            )}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">Costo</dt>
                          <dd>{formatCop(p.costo ?? 0)}</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">Precio venta</dt>
                          <dd>{formatCop(p.precio)}</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">Ubicación</dt>
                          <dd>{ubicacionLabel}</dd>
                        </div>
                      </dl>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <PrintPriceLabelButton
                          product={p}
                          variant="outline"
                          className="flex-1"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          aria-label={`Editar ${p.nombre}`}
                          onClick={() => {
                            setEditingProd(p);
                            setProdOpen(true);
                          }}
                        >
                          <Pencil className="mr-1 h-4 w-4" />
                          Editar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          aria-label={
                            img
                              ? `Ver foto de ${p.nombre}`
                              : `${p.nombre} no tiene foto`
                          }
                          disabled={!img}
                          onClick={() => openPhoto(p)}
                        >
                          <Eye className="mr-1 h-4 w-4" />
                          Ver foto
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          aria-label={`Eliminar ${p.nombre}`}
                          onClick={() => setDeletingProd(p)}
                        >
                          <Trash2 className="mr-1 h-4 w-4" />
                          Eliminar
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="categorias" className="flex flex-col gap-4">
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setEditingCat(null);
                setCatOpen(true);
              }}
            >
              <Plus data-icon="inline-start" />
              Nueva categoría
            </Button>
          </div>
          <div className="hidden overflow-x-auto rounded-lg border border-border lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Orden</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {categorias.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.nombre}</TableCell>
                    <TableCell>{c.slug}</TableCell>
                    <TableCell>{c.orden}</TableCell>
                    <TableCell>
                      <Badge variant={c.activo ? "outline" : "secondary"}>
                        {c.activo ? "Activa" : "Inactiva"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Editar categoría ${c.nombre}`}
                          onClick={() => {
                            setEditingCat(c);
                            setCatOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Eliminar categoría ${c.nombre}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="bg-background">
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                ¿Eliminar categoría?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {c.nombre}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() =>
                                  startTransition(async () => {
                                    try {
                                      await deleteCategoria(c.id);
                                      toast.success("Categoría eliminada.");
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
            {categorias.map((c) => (
              <div
                key={c.id}
                className="rounded-lg border border-border p-4 text-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{c.nombre}</p>
                  <Badge variant={c.activo ? "outline" : "secondary"}>
                    {c.activo ? "Activa" : "Inactiva"}
                  </Badge>
                </div>
                <dl className="mt-3 flex flex-col gap-1.5">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Slug</dt>
                    <dd>{c.slug}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Orden</dt>
                    <dd>{c.orden}</dd>
                  </div>
                </dl>
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      setEditingCat(c);
                      setCatOpen(true);
                    }}
                  >
                    <Pencil className="mr-1 h-4 w-4" />
                    Editar
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="flex-1">
                        <Trash2 className="mr-1 h-4 w-4" />
                        Eliminar
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="bg-background">
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar categoría?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {c.nombre}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() =>
                            startTransition(async () => {
                              try {
                                await deleteCategoria(c.id);
                                toast.success("Categoría eliminada.");
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
        </TabsContent>

        <CategoriaDialog
          open={catOpen}
          onOpenChange={setCatOpen}
          editing={editingCat}
          pending={pending}
          onSave={(form) =>
            startTransition(async () => {
              try {
                await saveCategoria(form);
                toast.success(
                  editingCat ? "Categoría actualizada." : "Categoría creada.",
                );
                router.refresh();
                setCatOpen(false);
              } catch (e) {
                toast.error(
                  e instanceof Error ? e.message : "Error al guardar.",
                );
              }
            })
          }
        />

        <ProductoDialog
          open={prodOpen}
          onOpenChange={setProdOpen}
          editing={editingProd}
          categorias={categorias}
          pending={pending}
          onSave={(form) =>
            startTransition(async () => {
              try {
                let imagenUrl = form.imagenUrl;
                if (form.imageFile) {
                  imagenUrl = await uploadImageFile(
                    STORAGE_BUCKETS.inventarioImagenes,
                    productoUploadFolder(form.sku, form.nombre),
                    form.imageFile,
                  );
                }
                await saveProducto({ ...form, imagenUrl });
                toast.success(
                  editingProd ? "Producto actualizado." : "Producto creado.",
                );
                router.refresh();
                setProdOpen(false);
              } catch (e) {
                toast.error(
                  e instanceof Error ? e.message : "Error al guardar.",
                );
              }
            })
          }
        />

        <Dialog
          open={!!photoPreview}
          onOpenChange={(open) => {
            if (!open) setPhotoPreview(null);
          }}
        >
          <DialogContent className="max-w-lg bg-background">
            <DialogHeader>
              <DialogTitle>{photoPreview?.nombre ?? "Foto"}</DialogTitle>
              <DialogDescription>Vista de la foto del producto</DialogDescription>
            </DialogHeader>
            {photoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoPreview.url}
                alt={`Foto de ${photoPreview.nombre}`}
                className="max-h-[70vh] w-full rounded object-contain"
              />
            ) : null}
          </DialogContent>
        </Dialog>

        <DeleteProductoDialog
          product={deletingProd}
          open={!!deletingProd}
          pending={pending}
          onOpenChange={(open) => {
            if (!open) setDeletingProd(null);
          }}
          onConfirm={(form) =>
            startTransition(async () => {
              try {
                await deleteProducto(form);
                toast.success("Producto eliminado.");
                setDeletingProd(null);
                router.refresh();
              } catch (e) {
                toast.error(
                  e instanceof Error ? e.message : "No se pudo eliminar.",
                );
              }
            })
          }
        />
      </Tabs>
    </div>
  );
}

function slugFromNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function DeleteProductoDialog({
  product,
  open,
  pending,
  onOpenChange,
  onConfirm,
}: {
  product: InventarioProductoRow | null;
  open: boolean;
  pending: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (form: {
    id: number;
    eliminadoPor: string;
    motivoEliminacion: string;
  }) => void;
}) {
  const formId = useId();
  const porId = `${formId}-eliminado-por`;
  const motivoId = `${formId}-motivo`;
  const [eliminadoPor, setEliminadoPor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [errors, setErrors] = useState<{
    eliminadoPor?: string;
    motivo?: string;
  }>({});

  useEffect(() => {
    if (open) {
      setEliminadoPor("");
      setMotivo("");
      setErrors({});
    }
  }, [open, product?.id]);

  function handleSubmit() {
    if (!product) return;
    const next: { eliminadoPor?: string; motivo?: string } = {};
    if (!eliminadoPor.trim()) {
      next.eliminadoPor = "Escribe quién elimina el producto.";
    }
    if (!motivo.trim()) {
      next.motivo = "Explica por qué lo eliminas.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) {
      if (next.eliminadoPor) document.getElementById(porId)?.focus();
      else document.getElementById(motivoId)?.focus();
      return;
    }
    onConfirm({
      id: product.id,
      eliminadoPor: eliminadoPor.trim(),
      motivoEliminacion: motivo.trim(),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Eliminar producto</DialogTitle>
          <DialogDescription>
            {product
              ? `Vas a eliminar “${product.nombre}”. Indica quién lo elimina y por qué.`
              : "Indica quién elimina y por qué."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field
            id={porId}
            label="Quién lo elimina"
            value={eliminadoPor}
            onChange={setEliminadoPor}
            error={errors.eliminadoPor}
            autoComplete="name"
          />
          <div className="flex flex-col gap-2">
            <Label htmlFor={motivoId}>Por qué lo eliminas</Label>
            <Textarea
              id={motivoId}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              aria-invalid={!!errors.motivo}
              aria-describedby={
                errors.motivo ? `${motivoId}-error` : undefined
              }
              className="min-h-20 touch-manipulation text-base md:text-sm"
            />
            {errors.motivo ? (
              <p
                id={`${motivoId}-error`}
                className="text-sm text-destructive"
                role="alert"
              >
                {errors.motivo}
              </p>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={handleSubmit}
          >
            Eliminar producto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategoriaDialog({
  open,
  onOpenChange,
  editing,
  pending,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: InventarioCategoriaRow | null;
  pending: boolean;
  onSave: (form: {
    id?: number;
    nombre: string;
    slug: string;
    descripcion: string;
    activo: boolean;
    orden?: number;
  }) => void;
}) {
  const formId = useId();
  const nombreId = `${formId}-nombre`;
  const slugId = `${formId}-slug`;
  const descId = `${formId}-desc`;
  const activoId = `${formId}-activo`;

  const [nombre, setNombre] = useState("");
  const [slug, setSlug] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [activo, setActivo] = useState(true);
  const [slugTouched, setSlugTouched] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [errors, setErrors] = useState<{ nombre?: string; slug?: string }>({});

  function load() {
    setNombre(editing?.nombre ?? "");
    setSlug(editing?.slug ?? "");
    setDescripcion(editing?.descripcion ?? "");
    setActivo(editing?.activo ?? true);
    setSlugTouched(!!editing?.slug);
    setMoreOpen(false);
    setErrors({});
  }

  useEffect(() => {
    if (open) load();
  }, [open, editing]);

  function handleNombreChange(value: string) {
    setNombre(value);
    if (!slugTouched) {
      setSlug(slugFromNombre(value));
    }
  }

  function focusField(id: string) {
    document.getElementById(id)?.focus();
  }

  function handleSubmit() {
    const next: { nombre?: string; slug?: string } = {};
    if (!nombre.trim()) {
      next.nombre = "Escribe el nombre de la categoría.";
    }
    let resolvedSlug = slug.trim() || slugFromNombre(nombre);
    if (!resolvedSlug) {
      next.slug = "El código se genera del nombre; revísalo en Más opciones.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) {
      if (next.nombre) focusField(nombreId);
      else if (next.slug) {
        setMoreOpen(true);
        queueMicrotask(() => focusField(slugId));
      }
      return;
    }

    onSave({
      id: editing?.id,
      nombre,
      slug: resolvedSlug,
      descripcion,
      activo,
      ...(editing ? { orden: editing.orden } : {}),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar categoría" : "Nueva categoría"}
          </DialogTitle>
          <DialogDescription>
            Ponle un nombre a la categoría.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field
            id={nombreId}
            label="Nombre"
            value={nombre}
            onChange={handleNombreChange}
            error={errors.nombre}
          />

          <div>
            <Button
              type="button"
              variant="ghost"
              className="h-auto w-full justify-between px-0 py-2 font-medium"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((v) => !v)}
            >
              Más opciones
              <ChevronDown
                className={`h-4 w-4 transition-transform ${moreOpen ? "rotate-180" : ""}`}
              />
            </Button>
            {moreOpen ? (
              <div className="mt-2 grid gap-4">
                <Field
                  id={slugId}
                  label="Código (slug)"
                  value={slug}
                  onChange={(v) => {
                    setSlugTouched(true);
                    setSlug(v);
                  }}
                  error={errors.slug}
                />
                <div className="flex flex-col gap-2">
                  <Label htmlFor={descId}>Descripción</Label>
                  <Textarea
                    id={descId}
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    className="min-h-24 touch-manipulation text-base md:text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id={activoId}
                    checked={activo}
                    onCheckedChange={setActivo}
                  />
                  <Label htmlFor={activoId}>Categoría activa</Label>
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/80"
            disabled={pending}
            onClick={handleSubmit}
          >
            Guardar categoría
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ProductoFormErrors = {
  nombre?: string;
  stock?: string;
  costo?: string;
  precio?: string;
  ubicacion?: string;
  gaveta?: string;
  categoriaId?: string;
  sku?: string;
  editadoPor?: string;
  motivoEdicion?: string;
};

function ProductoDialog({
  open,
  onOpenChange,
  editing,
  categorias,
  pending,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: InventarioProductoRow | null;
  categorias: InventarioCategoriaRow[];
  pending: boolean;
  onSave: (form: {
    id?: number;
    categoriaId: number;
    sku: string;
    nombre: string;
    descripcion: string;
    precio: number;
    costo: number;
    stock: number;
    stockMinimo: number;
    ubicacion: InventarioUbicacion;
    gaveta?: string;
    editadoPor?: string;
    motivoEdicion?: string;
    imagenUrl: string;
    imageFile: File | null;
    compatibleModelos: string[];
    activo: boolean;
  }) => void;
}) {
  const formId = useId();
  const isEditing = editing != null;

  const [categoriaId, setCategoriaId] = useState("");
  const [sku, setSku] = useState("");
  const [skuTouched, setSkuTouched] = useState(false);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [precio, setPrecio] = useState("");
  const [costo, setCosto] = useState("");
  const [stock, setStock] = useState("");
  const [stockMinimo, setStockMinimo] = useState("0");
  const [ubicacion, setUbicacion] = useState<InventarioUbicacion>("Soluciones");
  const [gaveta, setGaveta] = useState("");
  const [editadoPor, setEditadoPor] = useState("");
  const [motivoEdicion, setMotivoEdicion] = useState("");
  const [imagenUrl, setImagenUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [modelos, setModelos] = useState("");
  const [activo, setActivo] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const [errors, setErrors] = useState<ProductoFormErrors>({});

  const nombreId = `${formId}-nombre`;
  const stockId = `${formId}-stock`;
  const costoId = `${formId}-costo`;
  const precioId = `${formId}-precio`;
  const skuId = `${formId}-sku`;
  const ubicacionId = `${formId}-ubicacion`;
  const gavetaId = `${formId}-gaveta`;
  const categoriaFieldId = `${formId}-categoria`;
  const editadoPorId = `${formId}-editado-por`;
  const motivoEdicionId = `${formId}-motivo-edicion`;

  function focusField(id: string) {
    document.getElementById(id)?.focus();
  }

  function load() {
    setCategoriaId(String(editing?.categoria_id ?? categorias[0]?.id ?? ""));
    setSku(editing?.sku ?? "");
    setSkuTouched(!!editing?.sku);
    setNombre(editing?.nombre ?? "");
    setDescripcion(editing?.descripcion ?? "");
    setPrecio(editing ? formatMilesFromNumber(editing.precio) : "");
    setCosto(editing ? formatMilesFromNumber(editing.costo ?? 0) : "");
    setStock(editing ? String(editing.stock) : "");
    setStockMinimo(String(editing?.stock_minimo ?? 0));
    setUbicacion(editing?.ubicacion ?? "Soluciones");
    setGaveta(editing?.gaveta ?? "");
    setEditadoPor("");
    setMotivoEdicion("");
    setImagenUrl(editing?.imagen_url ?? "");
    setImageFile(null);
    setModelos((editing?.compatible_modelos ?? []).join(", "));
    setActivo(editing?.activo ?? true);
    setMoreOpen(false);
    setErrors({});
  }

  useEffect(() => {
    if (open) load();
  }, [open, editing]);

  function handleNombreChange(value: string) {
    setNombre(value);
    if (!skuTouched) {
      setSku(skuFromNombre(value));
    }
  }

  function validate(): ProductoFormErrors {
    const next: ProductoFormErrors = {};
    if (!nombre.trim()) next.nombre = "Escribe el nombre del producto.";
    const stockNum = Number(stock.replace(/\D/g, ""));
    if (stock.trim() === "" || !Number.isFinite(stockNum) || stockNum < 0) {
      next.stock = "Indica cuántas unidades hay (0 o más).";
    }
    const costoNum = parseMilesInput(costo);
    if (costo.trim() === "" || !Number.isFinite(costoNum) || costoNum < 0) {
      next.costo = "Indica cuánto te costó (0 o más).";
    }
    const precioNum = parseMilesInput(precio);
    if (precio.trim() === "" || !Number.isFinite(precioNum) || precioNum < 0) {
      next.precio = "Indica a cuánto lo vendes (0 o más).";
    }
    if (!ubicacion) next.ubicacion = "Elige dónde está el producto.";
    if (ubicacion === "Bodega" && !gaveta.trim()) {
      next.gaveta = "Indica el número de gaveta.";
    }
    if (!categoriaId) next.categoriaId = "Elige una categoría.";
    if (isEditing) {
      if (!editadoPor.trim()) {
        next.editadoPor = "Escribe quién hace la edición.";
      }
      if (!motivoEdicion.trim()) {
        next.motivoEdicion = "Explica por qué editas este producto.";
      }
    }
    const resolvedSku = sku.trim() || skuFromNombre(nombre);
    if (!resolvedSku) next.sku = "El SKU se genera del nombre; revísalo en Más opciones.";
    return next;
  }

  function handleSubmit() {
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) {
      if (next.editadoPor) focusField(editadoPorId);
      else if (next.motivoEdicion) focusField(motivoEdicionId);
      else if (next.nombre) focusField(nombreId);
      else if (next.stock) focusField(stockId);
      else if (next.costo) focusField(costoId);
      else if (next.precio) focusField(precioId);
      else if (next.gaveta) focusField(gavetaId);
      else if (next.ubicacion) focusField(ubicacionId);
      else if (next.categoriaId) focusField(categoriaFieldId);
      else if (next.sku) {
        setMoreOpen(true);
        queueMicrotask(() => focusField(skuId));
      }
      return;
    }

    const resolvedSku = (sku.trim() || skuFromNombre(nombre)).toUpperCase();
    onSave({
      id: editing?.id,
      categoriaId: Number(categoriaId),
      sku: resolvedSku,
      nombre,
      descripcion,
      precio: parseMilesInput(precio),
      costo: parseMilesInput(costo),
      stock: Number(stock.replace(/\D/g, "")),
      stockMinimo: Number(stockMinimo) || 0,
      ubicacion,
      gaveta: ubicacion === "Bodega" ? gaveta.trim() : undefined,
      editadoPor: isEditing ? editadoPor.trim() : undefined,
      motivoEdicion: isEditing ? motivoEdicion.trim() : undefined,
      imagenUrl,
      imageFile,
      compatibleModelos: modelos
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean),
      activo,
    });
  }

  const basicosCompletos =
    nombre.trim().length > 0 &&
    stock.trim() !== "" &&
    costo.trim() !== "" &&
    precio.trim() !== "" &&
    Boolean(categoriaId) &&
    Boolean(ubicacion) &&
    (ubicacion !== "Bodega" || gaveta.trim().length > 0) &&
    (!isEditing ||
      (editadoPor.trim().length > 0 && motivoEdicion.trim().length > 0));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto bg-background sm:max-w-2xl md:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar producto" : "Nuevo producto"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Indica quién edita, por qué y los datos del producto."
              : "Escribe el nombre, cuántas hay, cuánto costó y a cuánto se vende."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-6">
          {isEditing ? (
            <section
              aria-labelledby={`${formId}-sec-edicion`}
              className="grid gap-3 sm:grid-cols-2"
            >
              <h3
                id={`${formId}-sec-edicion`}
                className="text-sm font-medium text-foreground sm:col-span-2"
              >
                Motivo de la edición
              </h3>
              <Field
                id={editadoPorId}
                label="Quién lo edita"
                value={editadoPor}
                onChange={setEditadoPor}
                error={errors.editadoPor}
                autoComplete="name"
              />
              <div className="flex flex-col gap-2">
                <Label htmlFor={motivoEdicionId}>Por qué lo editas</Label>
                <Textarea
                  id={motivoEdicionId}
                  value={motivoEdicion}
                  onChange={(e) => setMotivoEdicion(e.target.value)}
                  aria-invalid={!!errors.motivoEdicion}
                  aria-describedby={
                    errors.motivoEdicion
                      ? `${motivoEdicionId}-error`
                      : undefined
                  }
                  className="min-h-11 touch-manipulation text-base md:text-sm"
                />
                {errors.motivoEdicion ? (
                  <p
                    id={`${motivoEdicionId}-error`}
                    className="text-sm text-destructive"
                    role="alert"
                  >
                    {errors.motivoEdicion}
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}

          <section
            aria-labelledby={`${formId}-sec-datos`}
            className="grid gap-3 sm:grid-cols-2 md:grid-cols-3"
          >
            <h3
              id={`${formId}-sec-datos`}
              className="text-sm font-medium text-foreground sm:col-span-2 md:col-span-3"
            >
              Datos del producto
            </h3>
            <Field
              id={nombreId}
              label="Nombre"
              value={nombre}
              onChange={handleNombreChange}
              error={errors.nombre}
              className="sm:col-span-2 md:col-span-3"
            />
            <Field
              id={stockId}
              label="Cuántas hay"
              value={stock}
              onChange={(v) => setStock(v.replace(/\D/g, ""))}
              inputMode="numeric"
              placeholder="Ej. 5"
              error={errors.stock}
            />
            <Field
              id={costoId}
              label="Cuánto te costó"
              value={costo}
              onChange={(v) => setCosto(formatMilesInput(v))}
              inputMode="numeric"
              placeholder="Ej. 50.000"
              error={errors.costo}
            />
            <Field
              id={precioId}
              label="A cuánto lo vendes"
              value={precio}
              onChange={(v) => setPrecio(formatMilesInput(v))}
              inputMode="numeric"
              placeholder="Ej. 80.000"
              error={errors.precio}
            />
          </section>

          <section
            aria-labelledby={`${formId}-sec-lugar`}
            className="grid gap-3 sm:grid-cols-2 md:grid-cols-3"
          >
            <h3
              id={`${formId}-sec-lugar`}
              className="text-sm font-medium text-foreground sm:col-span-2 md:col-span-3"
            >
              Dónde está
            </h3>
            <div className="flex flex-col gap-2">
              <Label htmlFor={ubicacionId}>Ubicación</Label>
              <TouchSelect
                id={ubicacionId}
                aria-label="Ubicación"
                aria-invalid={!!errors.ubicacion}
                value={ubicacion}
                onChange={(v) => {
                  const next = v as InventarioUbicacion;
                  setUbicacion(next);
                  if (next !== "Bodega") setGaveta("");
                }}
                options={INVENTARIO_UBICACIONES.map((u) => ({
                  value: u,
                  label: u,
                }))}
              />
              {errors.ubicacion ? (
                <p className="text-sm text-destructive" role="alert">
                  {errors.ubicacion}
                </p>
              ) : null}
            </div>
            {ubicacion === "Bodega" ? (
              <Field
                id={gavetaId}
                label="Gaveta número"
                value={gaveta}
                onChange={(v) => setGaveta(v.replace(/\D/g, ""))}
                inputMode="numeric"
                placeholder="Ej. 12"
                error={errors.gaveta}
              />
            ) : null}
            <div className="flex flex-col gap-2">
              <Label htmlFor={categoriaFieldId}>Categoría</Label>
              <TouchSelect
                id={categoriaFieldId}
                aria-label="Categoría"
                aria-invalid={!!errors.categoriaId}
                value={categoriaId}
                onChange={setCategoriaId}
                options={categorias.map((c) => ({
                  value: String(c.id),
                  label: c.nombre,
                }))}
              />
              {errors.categoriaId ? (
                <p className="text-sm text-destructive" role="alert">
                  {errors.categoriaId}
                </p>
              ) : null}
            </div>
          </section>

          <section aria-labelledby={`${formId}-sec-foto`} className="grid gap-3">
            <h3
              id={`${formId}-sec-foto`}
              className="text-sm font-medium text-foreground"
            >
              Foto
            </h3>
            <ImageFileField
              label="Foto del producto"
              existingUrl={imagenUrl}
              file={imageFile}
              onFileChange={setImageFile}
              disabled={pending}
              enableCamera
              fileInputId="inventario-producto-file"
              cameraInputId="inventario-producto-camera"
            />
          </section>

          <section className="grid gap-2">
            <Button
              type="button"
              variant="ghost"
              className="h-auto w-full justify-between px-0 py-2 font-medium"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((v) => !v)}
            >
              Más opciones
              <ChevronDown
                className={`h-4 w-4 transition-transform ${moreOpen ? "rotate-180" : ""}`}
                aria-hidden
              />
            </Button>
            {moreOpen ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  id={skuId}
                  label="SKU"
                  value={sku}
                  onChange={(v) => {
                    setSkuTouched(true);
                    setSku(v);
                  }}
                  error={errors.sku}
                />
                <Field
                  id={`${formId}-minimo`}
                  label="Aviso cuando queden pocas"
                  value={stockMinimo}
                  onChange={setStockMinimo}
                  type="number"
                />
                <div className="sm:col-span-2">
                  <Field
                    id={`${formId}-modelos`}
                    label="Modelos compatibles (separados por coma)"
                    value={modelos}
                    onChange={setModelos}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor={`${formId}-desc`}>Descripción</Label>
                  <Textarea
                    id={`${formId}-desc`}
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    className="mt-2 min-h-24 touch-manipulation text-base md:text-sm"
                  />
                </div>
                <div className="flex items-center gap-2 sm:col-span-2">
                  <Switch
                    id={`${formId}-activo`}
                    checked={activo}
                    onCheckedChange={setActivo}
                  />
                  <Label htmlFor={`${formId}-activo`}>Activo en tienda</Label>
                </div>
              </div>
            ) : null}
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/80"
            disabled={pending || !basicosCompletos}
            title={
              basicosCompletos
                ? undefined
                : "Completa los campos obligatorios del formulario"
            }
            onClick={handleSubmit}
          >
            {isEditing ? "Guardar cambios" : "Guardar producto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  placeholder,
  autoComplete,
  error,
  className,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  inputMode?: "numeric" | "text" | "decimal" | "tel";
  placeholder?: string;
  autoComplete?: string;
  error?: string;
  className?: string;
}) {
  const errorId = id && error ? `${id}-error` : undefined;
  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={errorId}
        className="min-h-11 touch-manipulation text-base md:text-sm"
      />
      {error ? (
        <p id={errorId} className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
