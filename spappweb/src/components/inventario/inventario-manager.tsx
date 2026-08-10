"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { usePollingRefresh } from "@/hooks/use-polling-refresh";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  deleteCategoria,
  deleteProducto,
  saveCategoria,
  saveProducto,
} from "@/lib/actions/admin-actions";
import type {
  InventarioCategoriaRow,
  InventarioProductoRow,
} from "@/lib/pipeline/types";
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
  const [pending, startTransition] = useTransition();

  const { secondsAgo } = usePollingRefresh({
    intervalMs: 30_000,
    enabled: !catOpen && !prodOpen && !pending,
  });

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        Stock actualizado hace {secondsAgo}s
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
              <EmptyTitle>Stock vacío</EmptyTitle>
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
                <TableHead>Producto</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Costo</TableHead>
                <TableHead>Precio</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {productos.map((p) => {
                const img = getStoragePublicUrl(
                  STORAGE_BUCKETS.inventarioImagenes,
                  p.imagen_url,
                );
                const lowStock = p.stock <= p.stock_minimo;
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {img ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={img}
                            alt=""
                            className="h-10 w-10 rounded object-cover"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded bg-muted" />
                        )}
                        <span className="font-medium">{p.nombre}</span>
                      </div>
                    </TableCell>
                    <TableCell>{p.sku}</TableCell>
                    <TableCell>
                      {p.inventario_categorias?.nombre ?? "—"}
                    </TableCell>
                    <TableCell>{formatCop(p.precio)}</TableCell>
                    <TableCell>{formatCop(p.costo ?? 0)}</TableCell>
                    <TableCell>
                      <span className={lowStock ? "font-medium text-red-700" : ""}>
                        {p.stock}
                      </span>
                      {lowStock && (
                        <Badge variant="destructive" className="ml-2">
                          Bajo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.activo ? "outline" : "secondary"}>
                        {p.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <PrintPriceLabelButton product={p} />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditingProd(p);
                            setProdOpen(true);
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
                                      await deleteProducto(p.id);
                                      toast.success("Producto eliminado.");
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
            return (
              <div
                key={p.id}
                className="rounded-lg border border-border p-4 text-sm"
              >
                <div className="flex gap-3">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={img}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="h-12 w-12 shrink-0 rounded bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{p.nombre}</p>
                    <p className="text-muted-foreground">{p.sku}</p>
                  </div>
                  <Badge variant={p.activo ? "outline" : "secondary"}>
                    {p.activo ? "Activo" : "Inactivo"}
                  </Badge>
                </div>
                <dl className="mt-3 flex flex-col gap-1.5">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Categoría</dt>
                    <dd>{p.inventario_categorias?.nombre ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Precio</dt>
                    <dd>{formatCop(p.precio)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Costo</dt>
                    <dd>{formatCop(p.costo ?? 0)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Stock</dt>
                    <dd className={lowStock ? "font-medium text-red-700" : ""}>
                      {p.stock}
                      {lowStock && (
                        <Badge variant="destructive" className="ml-2">
                          Bajo
                        </Badge>
                      )}
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 flex gap-2">
                  <PrintPriceLabelButton
                    product={p}
                    variant="outline"
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      setEditingProd(p);
                      setProdOpen(true);
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
                        <AlertDialogTitle>¿Eliminar producto?</AlertDialogTitle>
                        <AlertDialogDescription>{p.nombre}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() =>
                            startTransition(async () => {
                              try {
                                await deleteProducto(p.id);
                                toast.success("Producto eliminado.");
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
                        onClick={() => {
                          setEditingCat(c);
                          setCatOpen(true);
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
                            <AlertDialogTitle>¿Eliminar categoría?</AlertDialogTitle>
                            <AlertDialogDescription>{c.nombre}</AlertDialogDescription>
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
                      <AlertDialogDescription>{c.nombre}</AlertDialogDescription>
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
              toast.success(editingCat ? "Categoría actualizada." : "Categoría creada.");
              router.refresh();
              setCatOpen(false);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Error al guardar.");
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
              toast.success(editingProd ? "Producto actualizado." : "Producto creado.");
              router.refresh();
              setProdOpen(false);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Error al guardar.");
            }
          })
        }
      />
    </Tabs>
    </div>
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
    orden: number;
  }) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [slug, setSlug] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [orden, setOrden] = useState("0");
  const [activo, setActivo] = useState(true);

  function load() {
    setNombre(editing?.nombre ?? "");
    setSlug(editing?.slug ?? "");
    setDescripcion(editing?.descripcion ?? "");
    setOrden(String(editing?.orden ?? 0));
    setActivo(editing?.activo ?? true);
  }

  useEffect(() => {
    if (open) load();
  }, [open, editing]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="bg-background">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar categoría" : "Nueva categoría"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Nombre" value={nombre} onChange={setNombre} />
          <Field label="Slug" value={slug} onChange={setSlug} />
          <Field label="Orden" value={orden} onChange={setOrden} type="number" />
          <div className="flex flex-col gap-2">
            <Label>Descripción</Label>
            <Textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              className="min-h-24 touch-manipulation text-base md:text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={activo} onCheckedChange={setActivo} />
            <Label>Activa</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/80"
            disabled={pending || !nombre.trim() || !slug.trim()}
            onClick={() =>
              onSave({
                id: editing?.id,
                nombre,
                slug,
                descripcion,
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
    imagenUrl: string;
    imageFile: File | null;
    compatibleModelos: string[];
    activo: boolean;
  }) => void;
}) {
  const [categoriaId, setCategoriaId] = useState("");
  const [sku, setSku] = useState("");
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [precio, setPrecio] = useState("0");
  const [costo, setCosto] = useState("0");
  const [stock, setStock] = useState("0");
  const [stockMinimo, setStockMinimo] = useState("0");
  const [imagenUrl, setImagenUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [modelos, setModelos] = useState("");
  const [activo, setActivo] = useState(true);

  function load() {
    setCategoriaId(String(editing?.categoria_id ?? categorias[0]?.id ?? ""));
    setSku(editing?.sku ?? "");
    setNombre(editing?.nombre ?? "");
    setDescripcion(editing?.descripcion ?? "");
    setPrecio(String(editing?.precio ?? 0));
    setCosto(String(editing?.costo ?? 0));
    setStock(String(editing?.stock ?? 0));
    setStockMinimo(String(editing?.stock_minimo ?? 0));
    setImagenUrl(editing?.imagen_url ?? "");
    setImageFile(null);
    setModelos((editing?.compatible_modelos ?? []).join(", "));
    setActivo(editing?.activo ?? true);
  }

  useEffect(() => {
    if (open) load();
  }, [open, editing]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-background">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar producto" : "Nuevo producto"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label>Categoría</Label>
            <TouchSelect
              aria-label="Categoría"
              value={categoriaId}
              onChange={setCategoriaId}
              options={categorias.map((c) => ({
                value: String(c.id),
                label: c.nombre,
              }))}
            />
          </div>
          <Field label="SKU" value={sku} onChange={setSku} />
          <Field label="Nombre" value={nombre} onChange={setNombre} />
          <Field label="Precio" value={precio} onChange={setPrecio} type="number" />
          <Field label="Costo" value={costo} onChange={setCosto} type="number" />
          <Field label="Stock" value={stock} onChange={setStock} type="number" />
          <Field
            label="Stock mínimo"
            value={stockMinimo}
            onChange={setStockMinimo}
            type="number"
          />
          <div className="sm:col-span-2">
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
          </div>
          <div className="sm:col-span-2">
            <Field
              label="Modelos compatibles (separados por coma)"
              value={modelos}
              onChange={setModelos}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Descripción</Label>
            <Textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              className="min-h-24 touch-manipulation text-base md:text-sm"
            />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Switch checked={activo} onCheckedChange={setActivo} />
            <Label>Activo en tienda</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/80"
            disabled={pending || !sku.trim() || !nombre.trim() || !categoriaId}
            onClick={() =>
              onSave({
                id: editing?.id,
                categoriaId: Number(categoriaId),
                sku,
                nombre,
                descripcion,
                precio: Number(precio),
                costo: Number(costo),
                stock: Number(stock),
                stockMinimo: Number(stockMinimo),
                imagenUrl,
                imageFile,
                compatibleModelos: modelos
                  .split(",")
                  .map((m) => m.trim())
                  .filter(Boolean),
                activo,
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
