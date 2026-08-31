"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { Loader2, Plus, ScrollText, X } from "lucide-react";
import { toast } from "sonner";
import {
  addProductoNovedad,
  fetchProductoNovedades,
} from "@/lib/actions/admin-actions";
import type {
  InventarioProductoNovedadRow,
  InventarioProductoNovedadTipo,
  InventarioProductoRow,
} from "@/lib/pipeline/types";
import { formatDate } from "@/lib/utils/format";
import { getStoragePublicUrl } from "@/lib/utils/storage-urls";
import { STORAGE_BUCKETS } from "@/lib/supabase/storage-buckets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

const TIPO_LABEL: Record<InventarioProductoNovedadTipo, string> = {
  anotacion: "Anotación",
  edicion: "Edición",
  eliminacion: "Eliminación",
  creacion: "Creación",
};

const TIPO_VARIANT: Record<
  InventarioProductoNovedadTipo,
  "default" | "secondary" | "destructive" | "outline"
> = {
  anotacion: "outline",
  edicion: "secondary",
  eliminacion: "destructive",
  creacion: "default",
};

function NovedadItem({ item }: { item: InventarioProductoNovedadRow }) {
  const cambios = item.detalle?.cambios?.filter(Boolean) ?? [];
  const motivo = item.contenido.trim();
  const isEdicionConCambios = item.tipo === "edicion" && cambios.length > 0;

  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={TIPO_VARIANT[item.tipo]}>{TIPO_LABEL[item.tipo]}</Badge>
        <span className="text-sm text-foreground/80">
          {formatDate(item.created_at)}
        </span>
        <span className="font-medium">{item.autor}</span>
      </div>

      {isEdicionConCambios ? (
        <>
          <ul className="flex flex-col gap-1 pl-1">
            {cambios.map((c) => (
              <li key={c} className="flex gap-2">
                <span className="text-muted-foreground" aria-hidden>
                  ·
                </span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
          {motivo ? (
            <p className="text-sm text-muted-foreground">
              Motivo:{" "}
              <span className="whitespace-pre-wrap text-foreground">
                {motivo}
              </span>
            </p>
          ) : null}
        </>
      ) : motivo ? (
        <p className="whitespace-pre-wrap">{motivo}</p>
      ) : cambios.length > 0 ? (
        <ul className="flex flex-col gap-1 pl-1">
          {cambios.map((c) => (
            <li key={c} className="flex gap-2">
              <span className="text-muted-foreground" aria-hidden>
                ·
              </span>
              <span>{c}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function ProductoNovedadesDialog({
  product,
  open,
  onOpenChange,
}: {
  product: InventarioProductoRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const formId = useId();
  const autorId = `${formId}-autor`;
  const contenidoId = `${formId}-contenido`;
  const autorErrorId = `${formId}-autor-error`;
  const contenidoErrorId = `${formId}-contenido-error`;
  const [items, setItems] = useState<InventarioProductoNovedadRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [autor, setAutor] = useState("");
  const [contenido, setContenido] = useState("");
  const [errors, setErrors] = useState<{ autor?: string; contenido?: string }>(
    {},
  );
  const [formOpen, setFormOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [pending, startTransition] = useTransition();

  const img = product
    ? getStoragePublicUrl(
        STORAGE_BUCKETS.inventarioImagenes,
        product.imagen_url,
      )
    : null;

  useEffect(() => {
    if (!open || !product) return;
    setAutor("");
    setContenido("");
    setErrors({});
    setFormOpen(false);
    setStatusMessage("");
    setLoading(true);
    fetchProductoNovedades(product.id)
      .then(setItems)
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "No se cargó el historial.");
        setItems([]);
      })
      .finally(() => setLoading(false));
  }, [open, product?.id]);

  function handleSave() {
    if (!product) return;
    const next: { autor?: string; contenido?: string } = {};
    if (!autor.trim()) next.autor = "Escribe quién registra la anotación.";
    if (!contenido.trim()) next.contenido = "Escribe la anotación.";
    setErrors(next);
    if (Object.keys(next).length > 0) {
      if (next.autor) document.getElementById(autorId)?.focus();
      else document.getElementById(contenidoId)?.focus();
      return;
    }
    startTransition(async () => {
      try {
        await addProductoNovedad({
          productoId: product.id,
          autor: autor.trim(),
          contenido: contenido.trim(),
        });
        const fresh = await fetchProductoNovedades(product.id);
        setItems(fresh);
        setAutor("");
        setContenido("");
        setErrors({});
        setFormOpen(false);
        setStatusMessage("Anotación guardada.");
        toast.success("Anotación guardada.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se guardó la anotación.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden bg-background sm:max-w-2xl">
        <DialogHeader className="gap-4 sm:flex-row sm:items-start sm:gap-4">
          {img ? (
            <div className="size-20 shrink-0 overflow-hidden rounded-md outline outline-1 outline-black/10 sm:size-24">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img}
                alt={`Foto de ${product?.nombre ?? "producto"}`}
                className="size-full object-cover"
              />
            </div>
          ) : (
            <div
              className="size-20 shrink-0 rounded-md bg-muted sm:size-24"
              aria-hidden
            />
          )}
          <div className="flex min-w-0 flex-col gap-1.5 text-left">
            <DialogTitle className="text-pretty">
              {product?.nombre ?? "Producto"}
            </DialogTitle>
            <DialogDescription>Qué pasó con este producto</DialogDescription>
            {product ? (
              <span className="sr-only">ID {product.id}</span>
            ) : null}
          </div>
        </DialogHeader>

        <p className="sr-only" role="status" aria-live="polite">
          {statusMessage}
        </p>

        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto py-4">
          <section className="flex flex-col gap-4" aria-labelledby={`${formId}-historial`}>
            <h3 id={`${formId}-historial`} className="text-sm font-medium">
              Historial
            </h3>
            {loading ? (
              <div
                className="flex items-center gap-2 text-sm text-muted-foreground"
                role="status"
              >
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Cargando…
              </div>
            ) : items.length === 0 ? (
              <Empty className="border border-dashed border-border py-8">
                <EmptyHeader>
                  <EmptyTitle>Todavía no hay nada aquí</EmptyTitle>
                  <EmptyDescription>
                    Cuando edites o anotes, saldrá en esta lista.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul className="flex flex-col gap-4">
                {items.map((item, index) => (
                  <li key={item.id} className="flex flex-col gap-4">
                    {index > 0 ? <Separator /> : null}
                    <NovedadItem item={item} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Separator />

          <section
            className="flex flex-col gap-3"
            aria-label="Escribir anotación"
          >
            {!formOpen ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-11 w-full sm:w-auto sm:self-start"
                disabled={!product}
                onClick={() => {
                  setFormOpen(true);
                  setStatusMessage("");
                }}
              >
                <Plus className="size-4" aria-hidden="true" />
                Escribir anotación
              </Button>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">Escribir anotación</h3>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="min-h-11 min-w-11"
                    aria-label="Cerrar formulario de anotación"
                    disabled={pending}
                    onClick={() => {
                      setFormOpen(false);
                      setErrors({});
                    }}
                  >
                    <X className="size-4" aria-hidden="true" />
                  </Button>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={autorId}>Quién escribe</Label>
                  <Input
                    id={autorId}
                    value={autor}
                    onChange={(e) => setAutor(e.target.value)}
                    placeholder="Tu nombre"
                    disabled={pending}
                    className="min-h-11"
                    autoComplete="name"
                    aria-invalid={!!errors.autor}
                    aria-describedby={
                      errors.autor ? autorErrorId : undefined
                    }
                  />
                  {errors.autor ? (
                    <p
                      id={autorErrorId}
                      className="text-sm text-destructive"
                    >
                      {errors.autor}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={contenidoId}>Anotación</Label>
                  <Textarea
                    id={contenidoId}
                    value={contenido}
                    onChange={(e) => setContenido(e.target.value)}
                    placeholder="Ej.: llegó mercancía, cambió de gaveta, daño en empaque…"
                    rows={3}
                    disabled={pending}
                    aria-invalid={!!errors.contenido}
                    aria-describedby={
                      errors.contenido ? contenidoErrorId : undefined
                    }
                  />
                  {errors.contenido ? (
                    <p
                      id={contenidoErrorId}
                      className="text-sm text-destructive"
                    >
                      {errors.contenido}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={pending || !product}
                  className="min-h-11 w-full sm:w-auto sm:self-end"
                >
                  {pending ? (
                    <>
                      <Loader2
                        className="size-4 animate-spin"
                        aria-hidden="true"
                      />
                      Guardando…
                    </>
                  ) : (
                    "Guardar anotación"
                  )}
                </Button>
              </div>
            )}
          </section>
        </div>

        <DialogFooter className="border-t border-border pt-4">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => onOpenChange(false)}
          >
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProductoNovedadesButton({
  product,
  onClick,
  className,
  variant = "ghost",
}: {
  product: InventarioProductoRow;
  onClick: () => void;
  className?: string;
  variant?: "ghost" | "outline";
}) {
  return (
    <Button
      variant={variant}
      size="sm"
      className={className}
      aria-label={`Novedades de ${product.nombre}`}
      onClick={onClick}
    >
      <ScrollText className="size-4" aria-hidden="true" />
      Novedades
    </Button>
  );
}
