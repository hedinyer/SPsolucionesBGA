"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { Loader2, ScrollText } from "lucide-react";
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
  return (
    <li className="rounded-lg border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={TIPO_VARIANT[item.tipo]}>{TIPO_LABEL[item.tipo]}</Badge>
        <span className="text-muted-foreground">{formatDate(item.created_at)}</span>
        <span className="font-medium">{item.autor}</span>
      </div>
      <p className="mt-2 whitespace-pre-wrap">{item.contenido}</p>
      {cambios.length > 0 ? (
        <ul className="mt-2 list-inside list-disc text-muted-foreground">
          {cambios.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      ) : null}
    </li>
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
  const [items, setItems] = useState<InventarioProductoNovedadRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [autor, setAutor] = useState("");
  const [contenido, setContenido] = useState("");
  const [errors, setErrors] = useState<{ autor?: string; contenido?: string }>(
    {},
  );
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || !product) return;
    setAutor("");
    setContenido("");
    setErrors({});
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
        toast.success("Anotación guardada.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se guardó la anotación.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden bg-background sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Novedades</DialogTitle>
          <DialogDescription>
            {product
              ? `Historial de ${product.nombre} (ID ${product.id})`
              : "Historial del producto"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-4">
          <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
            <h3 className="text-sm font-medium">Nueva anotación</h3>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={autorId}>Quién escribe</Label>
                <Input
                  id={autorId}
                  value={autor}
                  onChange={(e) => setAutor(e.target.value)}
                  placeholder="Tu nombre"
                  disabled={pending}
                />
                {errors.autor ? (
                  <p className="text-sm text-destructive">{errors.autor}</p>
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
                />
                {errors.contenido ? (
                  <p className="text-sm text-destructive">{errors.contenido}</p>
                ) : null}
              </div>
              <Button
                type="button"
                onClick={handleSave}
                disabled={pending || !product}
                className="self-end"
              >
                {pending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" data-icon="inline-start" />
                    Guardando…
                  </>
                ) : (
                  "Guardar anotación"
                )}
              </Button>
            </div>
          </section>

          <section className="flex min-h-0 flex-col gap-3">
            <h3 className="text-sm font-medium">Historial</h3>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando historial…
              </div>
            ) : items.length === 0 ? (
              <Empty className="border border-dashed border-border py-8">
                <EmptyHeader>
                  <EmptyTitle>Sin novedades aún</EmptyTitle>
                  <EmptyDescription>
                    Las ediciones, eliminaciones y anotaciones aparecerán aquí.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul className="flex flex-col gap-2">
                {items.map((item) => (
                  <NovedadItem key={item.id} item={item} />
                ))}
              </ul>
            )}
          </section>
        </div>

        <DialogFooter className="border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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
      <ScrollText className="h-4 w-4" />
      Novedades
    </Button>
  );
}
