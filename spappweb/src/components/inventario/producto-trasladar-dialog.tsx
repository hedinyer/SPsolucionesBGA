"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { ArrowRight, Loader2, Minus, Plus, Warehouse } from "lucide-react";
import { toast } from "sonner";
import {
  fetchProductoTraslados,
  trasladarInventario,
} from "@/lib/actions/inventario-traslado-actions";
import type {
  InventarioProductoRow,
  InventarioTrasladoRow,
  InventarioUbicacion,
} from "@/lib/pipeline/types";
import {
  INVENTARIO_UBICACIONES,
  formatUbicacionConGaveta,
  labelUbicacion,
  normalizeProductoStocks,
} from "@/lib/pipeline/types";
import { formatDate } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
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

export function ProductoTrasladarDialog({
  product,
  open,
  onOpenChange,
  onDone,
}: {
  product: InventarioProductoRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && product ? (
        <ProductoTrasladarForm
          key={product.id}
          product={product}
          onOpenChange={onOpenChange}
          onDone={onDone}
        />
      ) : null}
    </Dialog>
  );
}

function ProductoTrasladarForm({
  product,
  onOpenChange,
  onDone,
}: {
  product: InventarioProductoRow;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}) {
  const formId = useId();
  const [pending, startTransition] = useTransition();
  const stocks = useMemo(() => normalizeProductoStocks(product), [product]);
  const origenes = useMemo(
    () => stocks.filter((s) => s.cantidad > 0),
    [stocks],
  );
  const initialDesde = origenes[0]?.ubicacion ?? "";
  const initialHacia =
    INVENTARIO_UBICACIONES.find((u) => u !== initialDesde) ?? "";

  const [desde, setDesde] = useState<InventarioUbicacion | "">(initialDesde);
  const [hacia, setHacia] = useState<InventarioUbicacion | "">(initialHacia);
  const [cantidad, setCantidad] = useState("1");
  const [autor, setAutor] = useState("");
  const [nota, setNota] = useState("");
  const [gavetaDestino, setGavetaDestino] = useState(
    () => stocks.find((s) => s.ubicacion === "Bodega")?.gaveta?.trim() || "",
  );
  const [statusMsg, setStatusMsg] = useState("");
  const [historial, setHistorial] = useState<InventarioTrasladoRow[]>([]);

  const haciaEfectivo =
    desde && hacia === desde
      ? (INVENTARIO_UBICACIONES.find((u) => u !== desde) ?? "")
      : hacia;

  const stockDesde = useMemo(() => {
    if (!desde) return 0;
    return stocks.find((s) => s.ubicacion === desde)?.cantidad ?? 0;
  }, [stocks, desde]);

  useEffect(() => {
    let cancelled = false;
    void fetchProductoTraslados(product.id)
      .then((rows) => {
        if (!cancelled) setHistorial(rows);
      })
      .catch(() => {
        if (!cancelled) setHistorial([]);
      });
    return () => {
      cancelled = true;
    };
  }, [product.id]);

  function handleDesdeChange(next: InventarioUbicacion) {
    setDesde(next);
    setHacia((prev) =>
      prev === next
        ? (INVENTARIO_UBICACIONES.find((u) => u !== next) ?? "")
        : prev,
    );
  }

  function submit() {
    if (!desde || !haciaEfectivo) return;
    const qty = Number(cantidad.replace(/\D/g, ""));
    if (!Number.isFinite(qty) || qty < 1) {
      toast.error("Indica cuántas unidades traspasar.");
      return;
    }
    if (qty > stockDesde) {
      toast.error(`Solo hay ${stockDesde} en ${labelUbicacion(desde)}.`);
      return;
    }
    if (!autor.trim()) {
      toast.error("Indica quién traslada.");
      return;
    }

    startTransition(async () => {
      const result = await trasladarInventario({
        productoId: product.id,
        desde,
        hacia: haciaEfectivo,
        cantidad: qty,
        autor: autor.trim(),
        nota: nota.trim() || undefined,
        gavetaDestino:
          haciaEfectivo === "Bodega"
            ? gavetaDestino.trim() || undefined
            : undefined,
      });
      if (!result.ok) {
        toast.error(result.error);
        setStatusMsg(result.error);
        return;
      }
      const msg = `Trasladaste ${qty} de ${labelUbicacion(desde)} a ${labelUbicacion(haciaEfectivo)}.`;
      setStatusMsg(msg);
      toast.success(msg);
      onOpenChange(false);
      onDone?.();
    });
  }

  return (
    <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
      <DialogHeader className="shrink-0 border-b px-6 py-4">
        <DialogTitle>Trasladar inventario</DialogTitle>
        <DialogDescription className="text-pretty">
          Mueve unidades de {product.nombre} entre sedes. Queda constancia.
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-4">
        <div
          className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between"
          aria-label="Flujo del traslado"
        >
          <UbicacionNodo
            label={desde ? labelUbicacion(desde) : "Origen"}
            qty={desde ? stockDesde : null}
            active={Boolean(desde)}
          />
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <ArrowRight
              className="size-5 shrink-0 motion-safe:animate-pulse"
              aria-hidden
            />
            <span className="tabular-nums text-sm font-medium text-foreground">
              {cantidad || "0"} und
            </span>
          </div>
          <UbicacionNodo
            label={haciaEfectivo ? labelUbicacion(haciaEfectivo) : "Destino"}
            qty={null}
            active={Boolean(haciaEfectivo)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${formId}-desde`}>Desde</Label>
            <select
              id={`${formId}-desde`}
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={desde}
              onChange={(e) =>
                handleDesdeChange(e.target.value as InventarioUbicacion)
              }
            >
              {origenes.length === 0 ? (
                <option value="">Sin stock</option>
              ) : (
                origenes.map((s) => (
                  <option key={s.ubicacion} value={s.ubicacion}>
                    {formatUbicacionConGaveta(s.ubicacion, s.gaveta)} (
                    {s.cantidad})
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${formId}-hacia`}>Hacia</Label>
            <select
              id={`${formId}-hacia`}
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={haciaEfectivo}
              onChange={(e) =>
                setHacia(e.target.value as InventarioUbicacion)
              }
            >
              {INVENTARIO_UBICACIONES.filter((u) => u !== desde).map((u) => (
                <option key={u} value={u}>
                  {labelUbicacion(u)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-qty`}>Unidades</Label>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-11 shrink-0"
              aria-label="Quitar una unidad"
              disabled={Number(cantidad) <= 1 || pending}
              onClick={() =>
                setCantidad(String(Math.max(1, Number(cantidad) - 1)))
              }
            >
              <Minus className="size-4" aria-hidden />
            </Button>
            <Input
              id={`${formId}-qty`}
              inputMode="numeric"
              className="h-11 text-center tabular-nums"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value.replace(/\D/g, ""))}
              aria-describedby={`${formId}-qty-hint`}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-11 shrink-0"
              aria-label="Agregar una unidad"
              disabled={Number(cantidad) >= stockDesde || pending}
              onClick={() =>
                setCantidad(
                  String(Math.min(stockDesde, Number(cantidad || 0) + 1)),
                )
              }
            >
              <Plus className="size-4" aria-hidden />
            </Button>
          </div>
          <p id={`${formId}-qty-hint`} className="text-xs text-muted-foreground">
            Máximo {stockDesde} en origen
          </p>
        </div>

        {haciaEfectivo === "Bodega" ? (
          <div className="space-y-2">
            <Label htmlFor={`${formId}-gaveta`}>Gaveta en Bodega (opcional)</Label>
            <Input
              id={`${formId}-gaveta`}
              className="h-11"
              value={gavetaDestino}
              onChange={(e) => setGavetaDestino(e.target.value)}
              placeholder="Ej. 12"
            />
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor={`${formId}-autor`}>Quién traslada</Label>
          <Input
            id={`${formId}-autor`}
            className="h-11"
            value={autor}
            onChange={(e) => setAutor(e.target.value)}
            autoComplete="off"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-nota`}>Nota (opcional)</Label>
          <Textarea
            id={`${formId}-nota`}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={2}
          />
        </div>

        {historial.length > 0 ? (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Últimos traslados</h3>
            <ol className="space-y-2 border-l-2 border-border pl-3">
              {historial.slice(0, 5).map((t) => (
                <li key={t.id} className="text-sm">
                  <p className="font-medium tabular-nums">
                    {t.cantidad} · {labelUbicacion(t.desde)} →{" "}
                    {labelUbicacion(t.hacia)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(t.created_at)} · {t.autor}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        <p className="sr-only" role="status" aria-live="polite">
          {statusMsg}
        </p>
      </div>

      <DialogFooter className="shrink-0 border-t px-6 py-4">
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => onOpenChange(false)}
          disabled={pending}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          className="min-h-11"
          onClick={submit}
          disabled={
            pending || origenes.length === 0 || !desde || !haciaEfectivo
          }
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : null}
          Confirmar traslado
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function UbicacionNodo({
  label,
  qty,
  active,
}: {
  label: string;
  qty: number | null;
  active: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-h-20 flex-1 flex-col items-center justify-center gap-1 rounded-xl border px-3 py-3 text-center",
        active
          ? "border-foreground/20 bg-background"
          : "border-dashed border-muted-foreground/30 bg-muted/40",
      )}
    >
      <Warehouse className="size-4 text-muted-foreground" aria-hidden />
      <span className="text-sm font-semibold text-pretty">{label}</span>
      {qty != null ? (
        <span className="text-xs tabular-nums text-muted-foreground">
          Hay {qty}
        </span>
      ) : null}
    </div>
  );
}
