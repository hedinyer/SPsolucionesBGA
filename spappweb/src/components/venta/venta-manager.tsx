"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useTransition,
} from "react";
import { Minus, Package, Plus, Printer, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { saveVentaProducto } from "@/lib/actions/venta-producto-actions";
import { printVentaProductoReceipt } from "@/lib/printing/venta-producto-receipt";
import {
  lookupProductoBySku,
  searchProductosVenta,
} from "@/lib/actions/venta-actions";
import type { InventarioProductoRow } from "@/lib/pipeline/types";
import {
  cartTotal,
  type VentaCartLine,
} from "@/lib/printing/print-venta-cotizacion-client";
import { formatCop } from "@/lib/utils/format";
import { getStoragePublicUrl } from "@/lib/utils/storage-urls";
import { STORAGE_BUCKETS } from "@/lib/supabase/storage-buckets";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type CartLine = VentaCartLine & {
  productoId: number;
  stockDisponible: number;
};

type CartAction =
  | { type: "add"; producto: InventarioProductoRow }
  | { type: "setQty"; productoId: number; cantidad: number }
  | { type: "remove"; productoId: number }
  | { type: "clear" };

function cartReducer(state: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case "clear":
      return [];
    case "remove":
      return state.filter((l) => l.productoId !== action.productoId);
    case "setQty": {
      if (action.cantidad <= 0) {
        return state.filter((l) => l.productoId !== action.productoId);
      }
      return state.map((l) => {
        if (l.productoId !== action.productoId) return l;
        const qty = Math.min(action.cantidad, l.stockDisponible);
        return { ...l, cantidad: qty };
      });
    }
    case "add": {
      if (action.producto.stock <= 0) return state;
      const existing = state.find((l) => l.productoId === action.producto.id);
      if (existing) {
        if (existing.cantidad >= existing.stockDisponible) return state;
        return state.map((l) =>
          l.productoId === action.producto.id
            ? {
                ...l,
                cantidad: Math.min(l.cantidad + 1, l.stockDisponible),
                stockDisponible: action.producto.stock,
              }
            : l,
        );
      }
      return [
        ...state,
        {
          productoId: action.producto.id,
          sku: action.producto.sku,
          nombre: action.producto.nombre,
          precioUnitario: Math.max(action.producto.precio, action.producto.costo),
          cantidad: 1,
          stockDisponible: action.producto.stock,
        },
      ];
    }
    default:
      return state;
  }
}

function parseCopInput(raw: string): number | undefined {
  const n = Number(raw.replace(/\D/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function VentaManager({
  cajaAbierta,
}: {
  cajaAbierta: boolean;
}) {
  const [lines, dispatch] = useReducer(cartReducer, []);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<InventarioProductoRow[]>([]);
  const [listaAbierta, setListaAbierta] = useState(false);
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteCedula, setClienteCedula] = useState("");
  const [clienteCelular, setClienteCelular] = useState("");
  const [montoPagado, setMontoPagado] = useState("");
  const [notas, setNotas] = useState("");
  const [searchPending, startSearchTransition] = useTransition();
  const [facturarPending, startFacturarTransition] = useTransition();

  const busquedaRef = useRef<HTMLInputElement>(null);
  const searchSeqRef = useRef(0);

  const total = useMemo(() => cartTotal(lines), [lines]);
  const itemCount = useMemo(
    () => lines.reduce((n, l) => n + l.cantidad, 0),
    [lines],
  );

  const addProduct = useCallback((producto: InventarioProductoRow) => {
    if (producto.stock <= 0) {
      toast.error("No hay unidades de ese producto.");
      return;
    }
    const existing = lines.find((l) => l.productoId === producto.id);
    if (existing && existing.cantidad >= producto.stock) {
      toast.error(`Solo hay ${producto.stock} en inventario.`);
      return;
    }
    dispatch({ type: "add", producto });
    toast.success(`${producto.nombre} agregado`);
    setBusqueda("");
    setResultados([]);
    setListaAbierta(false);
    busquedaRef.current?.focus();
  }, [lines]);

  const runSearch = useCallback((q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setResultados([]);
      setListaAbierta(false);
      return;
    }
    const seq = ++searchSeqRef.current;
    startSearchTransition(async () => {
      try {
        const rows = await searchProductosVenta(trimmed);
        if (seq !== searchSeqRef.current) return;
        setResultados(rows);
        setListaAbierta(true);
      } catch {
        if (seq !== searchSeqRef.current) return;
        setResultados([]);
        setListaAbierta(true);
      }
    });
  }, []);

  useEffect(() => {
    const q = busqueda.trim();
    if (q.length < 2) {
      setResultados([]);
      setListaAbierta(false);
      return;
    }
    const t = window.setTimeout(() => runSearch(q), 250);
    return () => window.clearTimeout(t);
  }, [busqueda, runSearch]);

  async function resolverBusqueda() {
    const q = busqueda.trim();
    if (!q) {
      toast.message("Escribe el nombre o el código del producto.");
      return;
    }

    startSearchTransition(async () => {
      try {
        try {
          const bySku = await lookupProductoBySku(q);
          addProduct(bySku);
          return;
        } catch {
          /* fall through to search */
        }
        const rows = await searchProductosVenta(q);
        if (rows.length === 0) {
          toast.error("No encontramos ese producto.");
          setResultados([]);
          setListaAbierta(false);
          return;
        }
        if (rows.length === 1) {
          addProduct(rows[0]);
          return;
        }
        setResultados(rows);
        setListaAbierta(true);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "No se pudo buscar.",
        );
      }
    });
  }

  function facturar() {
    if (!cajaAbierta) {
      toast.error("Abre la caja para cobrar.");
      return;
    }
    if (lines.length === 0) {
      toast.error("Agrega al menos un producto.");
      return;
    }
    if (!clienteNombre.trim()) {
      toast.error("Escribe el nombre del cliente.");
      return;
    }
    if (clienteCelular.trim().length < 10) {
      toast.error("Escribe un celular válido (10 dígitos o más).");
      return;
    }
    const pagado = parseCopInput(montoPagado) ?? total;
    if (pagado > total) {
      toast.error("El pago no puede ser mayor que el total.");
      return;
    }

    startFacturarTransition(async () => {
      try {
        const venta = await saveVentaProducto({
          clienteNombre: clienteNombre.trim(),
          clienteCedula: clienteCedula.trim() || undefined,
          clienteCelular: clienteCelular.trim(),
          montoPagado: pagado,
          notas: notas.trim() || undefined,
          items: lines.map((l) => ({
            productoId: l.productoId,
            cantidad: l.cantidad,
          })),
        });
        await printVentaProductoReceipt(venta);
        toast.success("Venta hecha. Inventario actualizado.");
        dispatch({ type: "clear" });
        setClienteNombre("");
        setClienteCedula("");
        setClienteCelular("");
        setMontoPagado("");
        setNotas("");
        setCheckoutOpen(false);
        busquedaRef.current?.focus();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "No se pudo facturar.",
        );
      }
    });
  }

  return (
    <div className="flex flex-col gap-6 pb-28">
      <section
        className="flex flex-col gap-3 rounded-2xl border border-border bg-background p-4 shadow-sm sm:p-5"
        aria-labelledby="venta-buscar-titulo"
      >
        <div>
          <h2
            id="venta-buscar-titulo"
            className="text-base font-semibold text-foreground"
          >
            ¿Qué vas a vender?
          </h2>
          <p className="text-sm text-muted-foreground text-pretty">
            Escribe el nombre o el código. Elige en la lista o pulsa Agregar.
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="venta-buscar-producto"
              ref={busquedaRef}
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Ej. aceite, bombillo, SKU…"
              className="min-h-11 pl-9 pr-9"
              autoComplete="off"
              spellCheck={false}
              aria-labelledby="venta-buscar-titulo"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void resolverBusqueda();
                }
                if (e.key === "Escape") {
                  setListaAbierta(false);
                  setBusqueda("");
                  setResultados([]);
                }
              }}
              onFocus={() => {
                if (resultados.length > 0) setListaAbierta(true);
              }}
            />
            {busqueda ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute right-1.5 top-1/2 -translate-y-1/2"
                aria-label="Borrar búsqueda"
                onClick={() => {
                  setBusqueda("");
                  setResultados([]);
                  setListaAbierta(false);
                  busquedaRef.current?.focus();
                }}
              >
                <X aria-hidden="true" />
              </Button>
            ) : null}
          </div>
          <Button
            type="button"
            className="min-h-11 shrink-0 active:scale-[0.96] motion-reduce:active:scale-100"
            onClick={() => void resolverBusqueda()}
            disabled={searchPending}
          >
            Agregar
          </Button>
        </div>

        {listaAbierta && busqueda.trim().length >= 2 ? (
          <ul
            className="max-h-[min(28rem,55dvh)] overflow-y-auto rounded-xl border border-border bg-muted/20"
            role="listbox"
            aria-label="Resultados de búsqueda"
          >
            {searchPending && resultados.length === 0 ? (
              <li className="px-4 py-3 text-sm text-muted-foreground">
                Buscando…
              </li>
            ) : null}
            {!searchPending && resultados.length === 0 ? (
              <li className="px-4 py-3 text-sm text-muted-foreground">
                No hay productos con ese nombre. Prueba otro término.
              </li>
            ) : null}
            {resultados.map((p) => {
              const sinStock = p.stock <= 0;
              const precio = Math.max(p.precio, p.costo);
              const img = getStoragePublicUrl(
                STORAGE_BUCKETS.inventarioImagenes,
                p.imagen_url,
              );
              return (
                <li key={p.id} role="option" aria-selected={false}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-4 border-b border-border px-3 py-3 text-left last:border-0 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      sinStock
                        ? "cursor-not-allowed opacity-50"
                        : "hover:bg-background",
                    )}
                    disabled={sinStock}
                    onClick={() => addProduct(p)}
                  >
                    <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-lg bg-muted outline outline-1 outline-black/10 sm:h-32 sm:w-32">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={img}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div
                          className="flex h-full w-full items-center justify-center text-muted-foreground"
                          aria-hidden="true"
                        >
                          <Package className="h-10 w-10" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="block text-base font-medium">
                        {p.nombre}
                      </span>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        {formatCop(precio)}
                        {" · "}
                        {sinStock ? "Sin existencias" : `Hay ${p.stock}`}
                        {p.sku ? ` · ${p.sku}` : null}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      <section
        className="flex flex-col gap-3 rounded-2xl border border-border bg-background p-4 shadow-sm sm:p-5"
        aria-labelledby="venta-carrito-titulo"
      >
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2
              id="venta-carrito-titulo"
              className="text-base font-semibold text-foreground"
            >
              Carrito
            </h2>
            <p className="text-sm text-muted-foreground" role="status">
              {itemCount === 0
                ? "Vacío — busca un producto arriba"
                : `${itemCount} ${itemCount === 1 ? "unidad" : "unidades"} · ${formatCop(total)}`}
            </p>
          </div>
          {lines.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={() => dispatch({ type: "clear" })}
            >
              Vaciar
            </Button>
          ) : null}
        </div>

        {lines.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground text-pretty">
            Aún no hay nada. Busca el nombre del producto para empezar.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {lines.map((line) => (
              <li
                key={line.productoId}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/15 px-3 py-3 sm:flex-nowrap"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{line.nombre}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatCop(line.precioUnitario)} c/u
                  </p>
                </div>
                <div
                  className="flex items-center gap-1"
                  role="group"
                  aria-label={`Cantidad de ${line.nombre}`}
                >
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="min-h-11 min-w-11"
                    aria-label={`Quitar una de ${line.nombre}`}
                    onClick={() =>
                      dispatch({
                        type: "setQty",
                        productoId: line.productoId,
                        cantidad: line.cantidad - 1,
                      })
                    }
                  >
                    <Minus className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <span
                    className="min-w-10 text-center text-base font-semibold tabular-nums"
                    aria-live="polite"
                  >
                    {line.cantidad}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="min-h-11 min-w-11"
                    aria-label={`Agregar una de ${line.nombre}`}
                    disabled={line.cantidad >= line.stockDisponible}
                    onClick={() =>
                      dispatch({
                        type: "setQty",
                        productoId: line.productoId,
                        cantidad: line.cantidad + 1,
                      })
                    }
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
                <p className="w-24 shrink-0 text-right font-semibold tabular-nums">
                  {formatCop(line.precioUnitario * line.cantidad)}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="min-h-11 min-w-11"
                  aria-label={`Quitar ${line.nombre} del carrito`}
                  onClick={() =>
                    dispatch({ type: "remove", productoId: line.productoId })
                  }
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm supports-[backdrop-filter]:bg-background/85">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-3xl font-bold tracking-tight tabular-nums text-foreground">
              {formatCop(total)}
            </p>
            {!cajaAbierta ? (
              <p className="mt-0.5 text-xs text-amber-800" role="status">
                Abre la caja para cobrar.
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            size="lg"
            className="min-h-12 min-w-36 active:scale-[0.96] motion-reduce:active:scale-100"
            disabled={lines.length === 0 || !cajaAbierta}
            aria-disabled={lines.length === 0 || !cajaAbierta}
            title={
              !cajaAbierta
                ? "Abre la caja para cobrar"
                : lines.length === 0
                  ? "Agrega productos al carrito"
                  : undefined
            }
            onClick={() => {
              if (!cajaAbierta) {
                toast.error("Abre la caja para cobrar.");
                return;
              }
              setCheckoutOpen(true);
            }}
          >
            Cobrar
          </Button>
        </div>
      </div>

      <Sheet
        open={checkoutOpen && cajaAbierta}
        onOpenChange={(open) => {
          if (!cajaAbierta && open) return;
          setCheckoutOpen(open);
        }}
      >
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Cobrar {formatCop(total)}</SheetTitle>
          </SheetHeader>

          <div className="grid gap-3 px-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="venta-cliente-nombre">Nombre del cliente</Label>
              <Input
                id="venta-cliente-nombre"
                className="min-h-11"
                value={clienteNombre}
                onChange={(e) => setClienteNombre(e.target.value)}
                autoComplete="name"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="venta-cliente-celular">Celular</Label>
              <Input
                id="venta-cliente-celular"
                className="min-h-11"
                inputMode="tel"
                value={clienteCelular}
                onChange={(e) => setClienteCelular(e.target.value)}
                autoComplete="tel"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="venta-cliente-cedula">Cédula (opcional)</Label>
              <Input
                id="venta-cliente-cedula"
                className="min-h-11"
                inputMode="numeric"
                value={clienteCedula}
                onChange={(e) => setClienteCedula(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="venta-monto-pagado">¿Cuánto pagó?</Label>
              <Input
                id="venta-monto-pagado"
                className="min-h-11"
                inputMode="numeric"
                placeholder={String(total)}
                value={montoPagado}
                onChange={(e) => setMontoPagado(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11 w-fit"
                disabled={total <= 0}
                onClick={() => setMontoPagado(String(total))}
              >
                Pagó todo
              </Button>
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="venta-notas">Nota (opcional)</Label>
              <Input
                id="venta-notas"
                className="min-h-11"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
              />
            </div>
          </div>

          <SheetFooter>
            <Button
              type="button"
              className="min-h-12 w-full gap-2 active:scale-[0.96] motion-reduce:active:scale-100"
              disabled={facturarPending || lines.length === 0 || !cajaAbierta}
              onClick={facturar}
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              {facturarPending ? "Facturando…" : "Facturar e imprimir"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
