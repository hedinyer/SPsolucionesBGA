"use client";

import { MoreHorizontal, Pencil, ScrollText, Trash2 } from "lucide-react";
import type {
  InventarioProductoRow,
  InventarioUbicacion,
} from "@/lib/pipeline/types";
import { formatCop } from "@/lib/utils/format";
import { getStoragePublicUrl } from "@/lib/utils/storage-urls";
import { STORAGE_BUCKETS } from "@/lib/supabase/storage-buckets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PrintPriceLabelButton } from "@/components/inventario/print-price-label-button";

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

export type ProductoInventarioCardProps = {
  product: InventarioProductoRow;
  categoriaNombre?: string | null;
  onEdit: () => void;
  onDelete: () => void;
  onNovedades: () => void;
  onPhoto: () => void;
};

export function ProductoInventarioCard({
  product,
  categoriaNombre: categoriaNombreProp,
  onEdit,
  onDelete,
  onNovedades,
  onPhoto,
}: ProductoInventarioCardProps) {
  const img = getStoragePublicUrl(
    STORAGE_BUCKETS.inventarioImagenes,
    product.imagen_url,
  );
  const lowStock = product.stock <= product.stock_minimo;
  const ubicacionLabel = formatUbicacionProducto(
    product.ubicacion,
    product.gaveta,
  );
  const categoriaNombre =
    categoriaNombreProp?.trim() ||
    product.inventario_categorias?.nombre?.trim() ||
    null;

  return (
    <Card className="shadow-none">
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-stretch">
        {img ? (
          <button
            type="button"
            className="size-28 shrink-0 overflow-hidden rounded-md outline outline-1 outline-black/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:size-32"
            aria-label={`Ver foto de ${product.nombre}`}
            onClick={onPhoto}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img}
              alt=""
              className="size-full object-cover"
            />
          </button>
        ) : (
          <div
            className="size-28 shrink-0 rounded-md bg-muted sm:size-32"
            aria-hidden
          />
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-col gap-1">
            {categoriaNombre ? (
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {categoriaNombre}
              </p>
            ) : null}
            <CardTitle className="px-0 text-lg leading-snug font-semibold text-pretty wrap-break-word">
              {product.nombre}
            </CardTitle>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base font-medium">
              <span
                className={
                  lowStock
                    ? "font-medium text-red-700 tabular-nums"
                    : "tabular-nums"
                }
              >
                Hay {product.stock}
              </span>
              <span className="text-muted-foreground" aria-hidden>
                ·
              </span>
              <span className="tabular-nums">
                Se vende a {formatCop(product.precio)}
              </span>
            </div>
            {lowStock ? (
              <Badge variant="destructive" className="w-fit">
                Pocas unidades
              </Badge>
            ) : null}
          </div>

          <div className="flex flex-col gap-1 text-sm text-muted-foreground">
            <p className="tabular-nums">Costo {formatCop(product.costo ?? 0)}</p>
            <p>{ubicacionLabel}</p>
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex flex-wrap gap-3 border-t-0 bg-transparent">
        <Button
          type="button"
          variant="default"
          className="min-h-11 min-w-28 flex-1 sm:flex-none"
          aria-label={`Editar ${product.nombre}`}
          onClick={onEdit}
        >
          <Pencil className="size-4" aria-hidden="true" />
          Editar
        </Button>
        <PrintPriceLabelButton
          product={product}
          variant="outline"
          className="min-h-11 min-w-28 flex-1 sm:flex-none"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 min-w-11 sm:min-w-28"
              aria-label={`Más acciones de ${product.nombre}`}
            >
              <MoreHorizontal className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Más</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto min-w-48">
            <DropdownMenuItem
              className="min-h-11 cursor-pointer"
              aria-label={`Novedades de ${product.nombre}`}
              onSelect={onNovedades}
            >
              <ScrollText className="size-4" aria-hidden="true" />
              Novedades
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              className="min-h-11 cursor-pointer"
              aria-label={`Eliminar ${product.nombre}`}
              onSelect={onDelete}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardFooter>
    </Card>
  );
}
