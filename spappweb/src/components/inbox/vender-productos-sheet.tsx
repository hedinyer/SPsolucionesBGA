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
import { createPortal, flushSync } from "react-dom";
import {
  Camera,
  CameraOff,
  Minus,
  Package,
  Plus,
  Printer,
  ScanLine,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  lookupProductoBySku,
  searchProductosVenta,
} from "@/lib/actions/venta-actions";
import { publishVentaCarritoDraft } from "@/lib/actions/venta-carrito-draft-actions";
import { saveVentaProducto } from "@/lib/actions/venta-producto-actions";
import type { InventarioProductoRow } from "@/lib/pipeline/types";
import { printVentaProductoReceipt } from "@/lib/printing/venta-producto-receipt";
import { formatCop } from "@/lib/utils/format";
import {
  cameraErrorMessage,
  isMobileTouchDevice,
  startQrScanner,
} from "@/lib/venta/start-qr-scanner";
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
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const SCAN_COOLDOWN_SEC = 2;
const SCANNER_ID = "venta-productos-scanner";

type CartLine = {
  productoId: number;
  sku: string;
  nombre: string;
  precioUnitario: number;
  cantidad: number;
  stock: number;
};

type CartAction =
  | { type: "add"; producto: InventarioProductoRow }
  | { type: "inc"; productoId: number }
  | { type: "dec"; productoId: number }
  | { type: "remove"; productoId: number }
  | { type: "clear" };

function cartReducer(state: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case "clear":
      return [];
    case "remove":
      return state.filter((l) => l.productoId !== action.productoId);
    case "add": {
      const existing = state.find((l) => l.productoId === action.producto.id);
      if (existing) {
        if (existing.cantidad >= action.producto.stock) {
          return state;
        }
        return state.map((l) =>
          l.productoId === action.producto.id
            ? { ...l, cantidad: l.cantidad + 1 }
            : l,
        );
      }
      if (action.producto.stock <= 0) return state;
      return [
        ...state,
        {
          productoId: action.producto.id,
          sku: action.producto.sku,
          nombre: action.producto.nombre,
          precioUnitario: Math.max(action.producto.precio, action.producto.costo),
          cantidad: 1,
          stock: action.producto.stock,
        },
      ];
    }
    case "inc":
      return state.map((l) => {
        if (l.productoId !== action.productoId) return l;
        if (l.cantidad >= l.stock) return l;
        return { ...l, cantidad: l.cantidad + 1 };
      });
    case "dec":
      return state
        .map((l) =>
          l.productoId === action.productoId
            ? { ...l, cantidad: l.cantidad - 1 }
            : l,
        )
        .filter((l) => l.cantidad > 0);
    default:
      return state;
  }
}

interface VenderProductosSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function VenderProductosSheet({
  open,
  onOpenChange,
  onSaved,
}: VenderProductosSheetProps) {
  const [pending, startTransition] = useTransition();
  const [publishPending, startPublishTransition] = useTransition();
  const [searchPending, startSearchTransition] = useTransition();
  const [lines, dispatch] = useReducer(cartReducer, []);
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<InventarioProductoRow[]>([]);
  const [listaAbierta, setListaAbierta] = useState(false);
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteCedula, setClienteCedula] = useState("");
  const [clienteCelular, setClienteCelular] = useState("");
  const [montoPagado, setMontoPagado] = useState("");
  const [notas, setNotas] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [scanPending, setScanPending] = useState(false);
  const [cooldownSec, setCooldownSec] = useState(0);
  const [mobileLayout, setMobileLayout] = useState(false);
  const sheetSide = mobileLayout ? "bottom" : "right";
  const [cajaCode, setCajaCode] = useState<string | null>(null);
  const busquedaRef = useRef<HTMLInputElement>(null);
  const scannerInputRef = useRef<HTMLInputElement>(null);
  const scannerContainerRef = useRef<HTMLDivElement>(null);
  const scanLockRef = useRef(false);
  const stopScannerRef = useRef<(() => void) | null>(null);
  const scanOnceRef = useRef<(() => Promise<string | null>) | null>(null);
  const onCodeRef = useRef<(code: string) => void>(() => {});
  const cooldownTimerRef = useRef<number | null>(null);
  const linesRef = useRef(lines);
  linesRef.current = lines;

  const total = useMemo(
    () => lines.reduce((sum, l) => sum + l.precioUnitario * l.cantidad, 0),
    [lines],
  );

  function resetForm() {
    stopCamera();
    dispatch({ type: "clear" });
    setBusqueda("");
    setResultados([]);
    setListaAbierta(false);
    setClienteNombre("");
    setClienteCedula("");
    setClienteCelular("");
    setMontoPagado("");
    setNotas("");
    setCajaCode(null);
  }

  const stopCamera = useCallback(() => {
    stopScannerRef.current?.();
    stopScannerRef.current = null;
    scanOnceRef.current = null;
    setCameraOn(false);
    setScanPending(false);
  }, []);

  const startCooldown = useCallback(() => {
    if (cooldownTimerRef.current) {
      window.clearInterval(cooldownTimerRef.current);
    }
    scanLockRef.current = true;
    setCooldownSec(SCAN_COOLDOWN_SEC);
    cooldownTimerRef.current = window.setInterval(() => {
      setCooldownSec((prev) => {
        if (prev <= 1) {
          if (cooldownTimerRef.current) {
            window.clearInterval(cooldownTimerRef.current);
            cooldownTimerRef.current = null;
          }
          scanLockRef.current = false;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const lookupAndAdd = useCallback(
    (sku: string) => {
      startTransition(async () => {
        try {
          const producto = await lookupProductoBySku(sku);
          if (!producto.activo) {
            toast.error("Producto inactivo.");
            return;
          }
          if (producto.stock <= 0) {
            toast.error("Sin stock disponible.");
            return;
          }
          const inCart = linesRef.current.find((l) => l.productoId === producto.id);
          if (inCart && inCart.cantidad >= producto.stock) {
            toast.error("Ya agregaste todo el stock disponible.");
            return;
          }
          dispatch({ type: "add", producto });
          toast.success(`${producto.nombre} agregado`);
          setBusqueda("");
          setResultados([]);
          setListaAbierta(false);
        } catch (e) {
          toast.error(
            e instanceof Error ? e.message : "Producto no encontrado.",
          );
        }
      });
    },
    [],
  );

  const resolveSkuFromCamera = useCallback(
    (raw: string) => {
      const sku = raw.trim();
      if (!sku || scanLockRef.current) return;
      startCooldown();
      lookupAndAdd(sku);
    },
    [lookupAndAdd, startCooldown],
  );
  onCodeRef.current = resolveSkuFromCamera;

  const startCamera = useCallback(async () => {
    if (stopScannerRef.current) return;

    scannerInputRef.current?.blur();
    busquedaRef.current?.blur();

    if (isMobileTouchDevice()) {
      flushSync(() => setCameraOn(true));
    } else {
      setCameraOn(true);
    }

    const container = scannerContainerRef.current;
    if (!container) {
      toast.error("No se pudo acceder a la cámara.");
      setCameraOn(false);
      return;
    }

    try {
      const handle = await startQrScanner(
        container,
        (code) => onCodeRef.current(code),
        () => scanLockRef.current,
      );
      stopScannerRef.current = handle.stop;
      scanOnceRef.current = handle.scanOnce;
    } catch (err) {
      toast.error(cameraErrorMessage(err));
      setCameraOn(false);
    }
  }, []);

  const toggleCamera = useCallback(async () => {
    if (cameraOn) {
      stopCamera();
      return;
    }
    await startCamera();
  }, [cameraOn, startCamera, stopCamera]);

  const triggerScan = useCallback(async () => {
    if (!cameraOn || scanLockRef.current || scanPending) return;
    const scanOnce = scanOnceRef.current;
    if (!scanOnce) return;

    setScanPending(true);
    try {
      const code = await scanOnce();
      if (code) {
        resolveSkuFromCamera(code);
      } else {
        toast.error("No se detectó QR. Acerca el código y vuelve a intentar.");
      }
    } finally {
      setScanPending(false);
    }
  }, [cameraOn, scanPending, resolveSkuFromCamera]);

  function parseCopInput(raw: string): number | undefined {
    const n = Number(raw.replace(/\D/g, ""));
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  }

  function addProducto(producto: InventarioProductoRow) {
    if (!producto.activo) {
      toast.error("Producto inactivo.");
      return;
    }
    if (producto.stock <= 0) {
      toast.error("Sin stock disponible.");
      return;
    }
    const inCart = lines.find((l) => l.productoId === producto.id);
    if (inCart && inCart.cantidad >= producto.stock) {
      toast.error("Ya agregaste todo el stock disponible.");
      return;
    }
    dispatch({ type: "add", producto });
    toast.success(`${producto.nombre} agregado`);
    setBusqueda("");
    setResultados([]);
    setListaAbierta(false);
    busquedaRef.current?.focus();
  }

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setMobileLayout(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) {
        window.clearInterval(cooldownTimerRef.current);
      }
      stopScannerRef.current?.();
    };
  }, []);

  useEffect(() => {
    if (!open) {
      stopCamera();
      return;
    }
    if (!isMobileTouchDevice()) {
      scannerInputRef.current?.focus();
    }
  }, [open, stopCamera]);

  useEffect(() => {
    const q = busqueda.trim();
    if (q.length < 2) {
      setResultados([]);
      setListaAbierta(false);
      return;
    }

    const timer = window.setTimeout(() => {
      startSearchTransition(async () => {
        try {
          const items = await searchProductosVenta(q);
          setResultados(items);
          setListaAbierta(true);
        } catch {
          setResultados([]);
        }
      });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [busqueda]);

  function resolverBusqueda() {
    const trimmed = busqueda.trim();
    if (!trimmed) return;

    startTransition(async () => {
      try {
        const producto = await lookupProductoBySku(trimmed);
        addProducto(producto);
        return;
      } catch {
        // no es SKU exacto; sigue con sugerencias
      }

      if (resultados.length === 1) {
        addProducto(resultados[0]);
        return;
      }

      if (resultados.length > 1) {
        setListaAbierta(true);
        toast.error("Selecciona un producto de la lista.");
        return;
      }

      toast.error("Sin resultados.");
    });
  }

  function submit() {
    if (lines.length === 0) {
      toast.error("Agrega al menos un producto.");
      return;
    }
    if (!clienteNombre.trim()) {
      toast.error("Indica el nombre del cliente.");
      return;
    }
    if (clienteCelular.trim().length < 10) {
      toast.error("Indica un celular válido.");
      return;
    }

    const pagado = parseCopInput(montoPagado) ?? total;
    if (pagado > total) {
      toast.error("El pago no puede superar el total.");
      return;
    }

    startTransition(async () => {
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
        toast.success(
          "Venta guardada. Si no ves impresión, permite ventanas emergentes o usa Ctrl+P en la pestaña del recibo.",
        );
        resetForm();
        onOpenChange(false);
        onSaved?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo guardar.");
      }
    });
  }

  function formatCajaCode(code: string): string {
    return `${code.slice(0, 3)} ${code.slice(3)}`;
  }

  function sendToCaja() {
    if (lines.length === 0) {
      toast.error("Agrega al menos un producto.");
      return;
    }
    startPublishTransition(async () => {
      try {
        const { code } = await publishVentaCarritoDraft(
          lines.map((l) => ({
            productoId: l.productoId,
            cantidad: l.cantidad,
          })),
        );
        stopCamera();
        setCajaCode(code);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "No se pudo enviar a caja.",
        );
      }
    });
  }

  function closeCajaDialog() {
    setCajaCode(null);
    dispatch({ type: "clear" });
  }

  function renderScannerOverlays() {
    return (
      <>
        {cooldownSec > 0 && (
          <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/60 text-white">
            <span className="text-4xl font-bold tabular-nums">
              {cooldownSec}
            </span>
            <span className="mt-1 text-xs">Listo para otro scan</span>
          </div>
        )}
        {pending && cooldownSec === 0 && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/30 text-xs text-white">
            Agregando…
          </div>
        )}
        {scanPending && cooldownSec === 0 && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/30 text-xs text-white">
            Escaneando…
          </div>
        )}
      </>
    );
  }

  return (
    <>
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) resetForm();
        onOpenChange(next);
      }}
    >
      <SheetContent
        side={sheetSide}
        className={cn(
          "flex flex-col gap-0 p-0 sm:max-w-md",
          sheetSide === "bottom" && "h-[92dvh] max-h-[92dvh] rounded-t-2xl",
        )}
      >
        <input
          ref={scannerInputRef}
          type="text"
          autoComplete="off"
          inputMode="none"
          tabIndex={-1}
          aria-label="Escaneo con pistola lectora"
          className="pointer-events-none absolute h-0 w-0 opacity-0"
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            const input = e.currentTarget;
            const sku = input.value.trim();
            if (sku) lookupAndAdd(sku);
            input.value = "";
            if (!isMobileTouchDevice()) input.focus();
          }}
        />

        <SheetHeader className="border-b border-border px-4 pb-3 pt-4">
          <SheetTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Venta productos
          </SheetTitle>
        </SheetHeader>

        <div
          className={cn(
            "min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]",
            mobileLayout && "pb-28",
          )}
        >
        <div className="flex flex-col gap-4 px-4 py-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">
                Escanear etiqueta
              </p>
              <Button
                type="button"
                variant={cameraOn ? "default" : "outline"}
                size="sm"
                className="gap-1.5"
                onClick={() => void toggleCamera()}
              >
                {cameraOn ? (
                  <>
                    <CameraOff className="h-4 w-4" />
                    Apagar
                  </>
                ) : (
                  <>
                    <Camera className="h-4 w-4" />
                    Cámara
                  </>
                )}
              </Button>
            </div>

            {mobileLayout && !cameraOn ? (
              <button
                type="button"
                className="flex min-h-[12rem] w-full flex-col items-center justify-center gap-2 rounded-xl border border-border bg-muted p-4 text-muted-foreground active:bg-neutral-200/80"
                onClick={() => void startCamera()}
              >
                <Camera className="h-10 w-10" />
                <span className="text-sm font-medium">
                  Toca para activar la cámara
                </span>
                <span className="text-xs text-muted-foreground">
                  Apunta al QR de la etiqueta
                </span>
              </button>
            ) : !mobileLayout ? (
              <>
                <div className="relative aspect-[4/3] w-full max-h-[min(45dvh,320px)] overflow-hidden rounded-xl border border-border bg-black">
                  <div
                    id={SCANNER_ID}
                    ref={scannerContainerRef}
                    className={cn(
                      "absolute inset-0",
                      !cameraOn && "pointer-events-none opacity-0",
                    )}
                  />
                  {!cameraOn ? (
                    <button
                      type="button"
                      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-muted p-4 text-muted-foreground active:bg-neutral-200/80"
                      onClick={() => void startCamera()}
                    >
                      <Camera className="h-10 w-10" />
                      <span className="text-sm font-medium">
                        Toca para activar la cámara
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Apunta al QR de la etiqueta
                      </span>
                    </button>
                  ) : null}
                  {cameraOn ? renderScannerOverlays() : null}
                </div>
                {cameraOn && isMobileTouchDevice() ? (
                  <Button
                    type="button"
                    className="w-full gap-2"
                    size="lg"
                    disabled={scanPending || cooldownSec > 0 || pending}
                    onClick={() => void triggerScan()}
                  >
                    <ScanLine className="h-5 w-5" />
                    Escanear
                  </Button>
                ) : null}
              </>
            ) : null}

            {cameraOn && !mobileLayout ? (
              <p className="text-center text-xs text-muted-foreground">
                Apunta al QR desde cualquier ángulo o distancia; no hace falta centrarlo perfecto.
              </p>
            ) : null}
          </div>

          <div className="relative">
            <div className="flex gap-2">
              <Input
                ref={busquedaRef}
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre o SKU…"
                autoComplete="off"
                onFocus={() => {
                  if (resultados.length > 0) setListaAbierta(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    resolverBusqueda();
                  }
                  if (e.key === "Escape") {
                    setListaAbierta(false);
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={resolverBusqueda}
                disabled={pending || searchPending}
              >
                Agregar
              </Button>
            </div>

            {listaAbierta && busqueda.trim().length >= 2 ? (
              <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-background shadow-lg">
                {searchPending && resultados.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-muted-foreground">
                    Buscando…
                  </p>
                ) : null}
                {!searchPending && resultados.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-muted-foreground">
                    Sin resultados
                  </p>
                ) : null}
                {resultados.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={cn(
                      "flex w-full flex-col gap-0.5 border-b border-border px-3 py-2.5 text-left last:border-0 hover:bg-muted/50",
                      p.stock <= 0 && "opacity-50",
                    )}
                    disabled={p.stock <= 0}
                    onClick={() => addProducto(p)}
                  >
                    <span className="text-sm font-medium">{p.nombre}</span>
                    <span className="text-xs text-muted-foreground">
                      {p.sku} · {formatCop(Math.max(p.precio, p.costo))} · stock{" "}
                      {p.stock}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {lines.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
              Busca por nombre, escanea QR o ingresa el SKU.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {lines.map((line) => (
                <div
                  key={line.productoId}
                  className="rounded-lg border border-border p-3 text-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{line.nombre}</p>
                      <p className="text-xs text-muted-foreground">{line.sku}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      aria-label="Quitar"
                      onClick={() =>
                        dispatch({ type: "remove", productoId: line.productoId })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() =>
                          dispatch({ type: "dec", productoId: line.productoId })
                        }
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <span className="w-8 text-center font-medium">
                        {line.cantidad}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        disabled={line.cantidad >= line.stock}
                        onClick={() =>
                          dispatch({ type: "inc", productoId: line.productoId })
                        }
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <span className="font-semibold">
                      {formatCop(line.precioUnitario * line.cantidad)}
                    </span>
                  </div>
                </div>
              ))}
              <p className="text-right text-base font-bold">
                Total: {formatCop(total)}
              </p>
            </div>
          )}

          {!mobileLayout ? (
            <>
              <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/50 p-3">
                <p className="text-sm font-medium">Cliente</p>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="prod-cliente-nombre">Nombre</Label>
                  <Input
                    id="prod-cliente-nombre"
                    value={clienteNombre}
                    onChange={(e) => setClienteNombre(e.target.value)}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="prod-cliente-cedula">Cédula</Label>
                    <Input
                      id="prod-cliente-cedula"
                      inputMode="numeric"
                      value={clienteCedula}
                      onChange={(e) => setClienteCedula(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="prod-cliente-celular">Celular</Label>
                    <Input
                      id="prod-cliente-celular"
                      inputMode="tel"
                      value={clienteCelular}
                      onChange={(e) => setClienteCelular(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/50 p-3">
                <p className="text-sm font-medium">Pago</p>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="prod-monto-pagado">Pagado hoy</Label>
                  <Input
                    id="prod-monto-pagado"
                    inputMode="numeric"
                    placeholder={total > 0 ? String(total) : "0"}
                    value={montoPagado}
                    onChange={(e) => setMontoPagado(e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={total <= 0}
                  onClick={() => setMontoPagado(String(total))}
                >
                  Marcar pago de contado
                </Button>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="prod-notas">Notas</Label>
                <Input
                  id="prod-notas"
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                />
              </div>
            </>
          ) : lines.length > 0 ? (
            <div className="rounded-lg border border-border bg-muted/50 p-3 text-center text-sm text-muted-foreground">
              {lines.length} producto{lines.length === 1 ? "" : "s"} ·{" "}
              <span className="font-semibold text-foreground">
                {formatCop(total)}
              </span>
              <p className="mt-1 text-xs text-muted-foreground">
                Usa &quot;Enviar a PC&quot; abajo para facturar en el
                escritorio.
              </p>
            </div>
          ) : null}
        </div>
        </div>

        {!mobileLayout ? (
        <SheetFooter className="shrink-0 border-t border-border bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
          <div className="flex w-full flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            disabled={publishPending || pending || lines.length === 0}
            onClick={sendToCaja}
          >
            <Send className="h-4 w-4" />
            {publishPending ? "Enviando…" : "Enviar a PC"}
          </Button>
          <Button
            type="button"
            className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/80"
            disabled={pending || publishPending || lines.length === 0}
            onClick={submit}
          >
            <Printer className="h-4 w-4" />
            {pending ? "Guardando…" : "Guardar e imprimir"}
          </Button>
          </div>
        </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>

    <Dialog
      open={cajaCode !== null}
      onOpenChange={(next) => {
        if (!next) closeCajaDialog();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Código para caja</DialogTitle>
          <DialogDescription>
            Dicta este código en el escritorio para facturar.
          </DialogDescription>
        </DialogHeader>
        {cajaCode ? (
          <p className="py-4 text-center text-5xl font-bold tracking-widest tabular-nums">
            {formatCajaCode(cajaCode)}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" className="w-full" onClick={closeCajaDialog}>
            Listo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {mobileLayout &&
      cameraOn &&
      typeof document !== "undefined" &&
      createPortal(
        <div className="fixed inset-0 z-[200] flex flex-col bg-black">
          <div className="flex shrink-0 items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
            <span className="font-medium">Escanear etiqueta</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-white/30 bg-transparent text-white hover:bg-background/10"
              onClick={stopCamera}
            >
              <CameraOff className="mr-1.5 h-4 w-4" />
              Cerrar
            </Button>
          </div>
          <div className="relative min-h-0 flex-1">
            <div
              id={SCANNER_ID}
              ref={scannerContainerRef}
              className="absolute inset-0"
            />
            {renderScannerOverlays()}
          </div>
          <div className="shrink-0 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
            <Button
              type="button"
              className="w-full gap-2 bg-background text-foreground hover:bg-muted"
              size="lg"
              disabled={scanPending || cooldownSec > 0 || pending}
              onClick={() => void triggerScan()}
            >
              <ScanLine className="h-5 w-5" />
              {scanPending ? "Escaneando…" : "Escanear"}
            </Button>
            <p className="mt-2 text-center text-xs text-white/70">
              Apunta al QR y pulsa Escanear.
            </p>
          </div>
        </div>,
        document.body,
      )}

    {open &&
      mobileLayout &&
      typeof document !== "undefined" &&
      createPortal(
        <div className="fixed inset-x-0 bottom-0 z-[300] border-t border-border bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.18)]">
          {lines.length > 0 ? (
            <p className="mb-2 text-center text-sm text-muted-foreground">
              {lines.length} producto{lines.length === 1 ? "" : "s"} ·{" "}
              <span className="font-semibold text-foreground">
                {formatCop(total)}
              </span>
            </p>
          ) : (
            <p className="mb-2 text-center text-xs text-muted-foreground">
              Escanea productos para habilitar el envío
            </p>
          )}
          <Button
            type="button"
            className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/80"
            disabled={publishPending || pending || lines.length === 0}
            onClick={sendToCaja}
          >
            <Send className="h-4 w-4" />
            {publishPending ? "Enviando…" : "Enviar a PC"}
          </Button>
        </div>,
        document.body,
      )}
    </>
  );
}
