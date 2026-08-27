"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Bike, Printer, Search, User } from "lucide-react";
import { toast } from "sonner";
import type { VentaProductoRow } from "@/lib/actions/venta-producto-actions";
import type { HistorialMotoVentaRow } from "@/lib/actions/historial-motos-actions";
import { printVentaProductoReceipt } from "@/lib/printing/venta-producto-receipt";
import { formatCop, formatDate } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function searchableText(venta: VentaProductoRow): string {
  return normalize(
    [
      venta.clienteNombre,
      venta.clienteNombreReal ?? "",
      venta.clienteCedula ?? "",
      venta.clienteCelular,
      venta.motoPlaca ?? "",
      venta.motoModelo ?? "",
      venta.notas ?? "",
      ...venta.items.flatMap((i) => [i.nombre, i.sku]),
    ].join(" "),
  );
}

function searchableMoto(venta: HistorialMotoVentaRow): string {
  return normalize(
    [
      venta.clienteNombre,
      venta.clienteCedula ?? "",
      venta.placa ?? "",
      venta.modelo,
      venta.color,
      venta.origen,
    ].join(" "),
  );
}

export function HistorialVentasClient({
  ventas,
  ventasMotos = [],
}: {
  ventas: VentaProductoRow[];
  ventasMotos?: HistorialMotoVentaRow[];
}) {
  const [query, setQuery] = useState("");

  const filteredProductos = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return ventas;
    const terms = q.split(/\s+/);
    return ventas.filter((venta) => {
      const haystack = searchableText(venta);
      return terms.every((term) => haystack.includes(term));
    });
  }, [ventas, query]);

  const filteredMotos = useMemo(() => {
    const q = normalize(query.trim());
    const sorted = [...ventasMotos].sort(
      (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
    );
    if (!q) return sorted;
    const terms = q.split(/\s+/);
    return sorted.filter((venta) => {
      const haystack = searchableMoto(venta);
      return terms.every((term) => haystack.includes(term));
    });
  }, [ventasMotos, query]);

  const totalVendido = filteredProductos.reduce((sum, v) => sum + v.total, 0);
  const totalUnidades = filteredProductos.reduce(
    (sum, v) => sum + v.items.reduce((s, i) => s + i.cantidad, 0),
    0,
  );
  const totalMotos = filteredMotos.reduce((sum, v) => sum + v.monto, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="relative" role="search">
        <label htmlFor="historial-buscar" className="sr-only">
          Buscar en el historial
        </label>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id="historial-buscar"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por cliente, placa, producto…"
          className="min-h-11 pl-9"
          inputMode="search"
          autoComplete="off"
        />
      </div>

      <Tabs defaultValue="productos">
        <TabsList className="h-auto w-full max-w-full gap-1 overflow-x-auto p-1">
          <TabsTrigger
            value="productos"
            className="min-h-11 flex-1 touch-manipulation"
          >
            Productos de tienda ({filteredProductos.length})
          </TabsTrigger>
          <TabsTrigger
            value="motos"
            className="min-h-11 flex-1 touch-manipulation"
          >
            Motos ({filteredMotos.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="productos" className="flex flex-col gap-4">
          {ventas.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Ventas" value={String(filteredProductos.length)} />
              <Stat label="Unidades" value={String(totalUnidades)} />
              <Stat label="Total" value={formatCop(totalVendido)} />
            </div>
          ) : null}
          <p className="text-sm text-muted-foreground" role="status">
            {query.trim()
              ? `Quedan ${filteredProductos.length} de ${ventas.length} ventas`
              : `${ventas.length} ventas`}
          </p>

          {filteredProductos.length === 0 ? (
            <Empty className="border border-dashed border-border">
              <EmptyHeader>
                <EmptyTitle>
                  {ventas.length === 0 ? "Aún no hay ventas" : "No aparece nada"}
                </EmptyTitle>
                <EmptyDescription>
                  {ventas.length === 0
                    ? "Cuando vendas en Caja, aparecen aquí."
                    : "Prueba otra búsqueda o bórrala."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {filteredProductos.map((venta) => (
                <VentaCard key={venta.id} venta={venta} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="motos" className="flex flex-col gap-4">
          {ventasMotos.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Stat label="Motos" value={String(filteredMotos.length)} />
              <Stat label="Total" value={formatCop(totalMotos)} />
            </div>
          ) : null}
          <p className="text-sm text-muted-foreground" role="status">
            {query.trim()
              ? `Quedan ${filteredMotos.length} de ${ventasMotos.length} motos`
              : `${ventasMotos.length} motos`}
          </p>

          {filteredMotos.length === 0 ? (
            <Empty className="border border-dashed border-border">
              <EmptyHeader>
                <EmptyTitle>
                  {ventasMotos.length === 0
                    ? "Aún no hay motos aquí"
                    : "No aparece nada"}
                </EmptyTitle>
                <EmptyDescription>
                  {ventasMotos.length === 0
                    ? "Aquí salen motos de contado o crédito ya pagado."
                    : "Prueba otra búsqueda o bórrala."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filteredMotos.map((venta) => (
                <Card
                  key={`${venta.origen}-${venta.id}`}
                  className="border-border shadow-none"
                >
                  <CardContent className="flex flex-col gap-2 p-4 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        {venta.userId ? (
                          <Link
                            href={`/clientes/${venta.userId}`}
                            className="font-medium hover:underline"
                          >
                            {venta.clienteNombre}
                          </Link>
                        ) : (
                          <p className="font-medium">{venta.clienteNombre}</p>
                        )}
                        <p className="text-muted-foreground">
                          {venta.modelo} · {venta.color}
                        </p>
                        {venta.placa ? (
                          <p className="text-muted-foreground">
                            Placa {venta.placa}
                          </p>
                        ) : null}
                      </div>
                      <Badge variant="outline" className="shrink-0 font-normal">
                        {venta.origen === "contado"
                          ? "Contado"
                          : "Crédito liquidado"}
                      </Badge>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>{formatDate(venta.fecha)}</span>
                      <span className="font-medium tabular-nums text-foreground">
                        {formatCop(venta.monto)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-border shadow-none">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-lg font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function PhotoThumb({
  src,
  alt,
  fallback,
}: {
  src: string | null;
  alt: string;
  fallback: "user" | "bike";
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className="h-full w-full object-cover"
      />
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
      {fallback === "user" ? (
        <User className="h-8 w-8" />
      ) : (
        <Bike className="h-8 w-8" />
      )}
    </div>
  );
}

function VentaCard({ venta }: { venta: VentaProductoRow }) {
  const [printing, startPrint] = useTransition();
  const saldo = venta.total - venta.montoPagado;
  const titulo =
    venta.clienteNombreReal ??
    (venta.motoPlaca && venta.clienteNombre.toUpperCase() === venta.motoPlaca
      ? venta.motoPlaca
      : venta.clienteNombre);
  const subtituloParts = [
    venta.motoPlaca && venta.clienteNombreReal
      ? `Placa ${venta.motoPlaca}`
      : null,
    venta.motoModelo
      ? `${venta.motoModelo}${venta.motoColor ? ` · ${venta.motoColor}` : ""}`
      : null,
    venta.clienteCelular,
    venta.clienteCedula ? `CC ${venta.clienteCedula}` : null,
  ].filter(Boolean);

  function handlePrint() {
    startPrint(async () => {
      try {
        await printVentaProductoReceipt(venta);
      } catch {
        toast.error("No se pudo abrir la impresión de la factura.");
      }
    });
  }

  return (
    <Card className="border-border shadow-none">
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border">
            <PhotoThumb
              src={venta.clienteSelfieUrl}
              alt={`Foto de ${titulo}`}
              fallback="user"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium">{titulo}</p>
            {subtituloParts.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                {subtituloParts.join(" · ")}
              </p>
            ) : null}
            <p className="mt-1 text-xs text-muted-foreground">
              {formatDate(venta.createdAt)}
            </p>
          </div>
          <p className="shrink-0 text-base font-semibold tabular-nums">
            {formatCop(venta.total)}
          </p>
        </div>
        <ul className="flex flex-col gap-1 border-t border-border pt-3 text-sm">
          {venta.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-2">
              <span className="truncate">
                {item.cantidad}× {item.nombre}
              </span>
              <span className="shrink-0 tabular-nums">
                {formatCop(item.precioUnitario * item.cantidad)}
              </span>
            </li>
          ))}
        </ul>
        {saldo > 0 ? (
          <p className="text-xs text-amber-700">
            Falta por pagar {formatCop(saldo)}
          </p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full"
          disabled={printing}
          onClick={handlePrint}
        >
          <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
          {printing ? "Imprimiendo…" : "Reimprimir"}
        </Button>
      </CardContent>
    </Card>
  );
}
