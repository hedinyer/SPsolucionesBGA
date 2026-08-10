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
import { Camera, CameraOff, Printer, ScanLine, Send, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { publishVentaCarritoDraft } from "@/lib/actions/venta-carrito-draft-actions";
import { saveVentaProducto } from "@/lib/actions/venta-producto-actions";
import { printVentaProductoReceipt } from "@/lib/printing/venta-producto-receipt";
import {
  lookupProductoBySku,
  searchProductosVenta,
} from "@/lib/actions/venta-actions";
import type { InventarioProductoRow } from "@/lib/pipeline/types";
import { cartTotal, type VentaCartLine } from "@/lib/printing/print-venta-cotizacion-client";
import { formatCop } from "@/lib/utils/format";
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
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  cameraErrorMessage,
  isMobileTouchDevice,
  startQrScanner,
} from "@/lib/venta/start-qr-scanner";

type CartLine = VentaCartLine & { productoId: number };

type CartAction =
  | { type: "add"; producto: InventarioProductoRow }
  | { type: "clear" };

function cartReducer(state: CartLine[], action: CartAction): CartLine[] {
  if (action.type === "clear") return [];
  const existing = state.find((l) => l.productoId === action.producto.id);
  if (existing) {
    return state.map((l) =>
      l.productoId === action.producto.id
        ? { ...l, cantidad: l.cantidad + 1 }
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
    },
  ];
}

const SCAN_COOLDOWN_SEC = 5;
const SCANNER_ID = "venta-scanner";

export function VentaManager() {
  const [lines, dispatch] = useReducer(cartReducer, []);
  const [cartOpen, setCartOpen] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<InventarioProductoRow[]>([]);
  const [listaAbierta, setListaAbierta] = useState(false);
  const [cooldownSec, setCooldownSec] = useState(0);
  const [cajaCode, setCajaCode] = useState<string | null>(null);
  const [isPc, setIsPc] = useState(false);
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteCedula, setClienteCedula] = useState("");
  const [clienteCelular, setClienteCelular] = useState("");
  const [montoPagado, setMontoPagado] = useState("");
  const [notas, setNotas] = useState("");
  const [pending, startTransition] = useTransition();
  const [searchPending, startSearchTransition] = useTransition();
  const [publishPending, startPublishTransition] = useTransition();
  const [facturarPending, startFacturarTransition] = useTransition();

  const [scanPending, setScanPending] = useState(false);
  const scannerContainerRef = useRef<HTMLDivElement>(null);
  const scanLockRef = useRef(false);
  const stopScannerRef = useRef<(() => void) | null>(null);
  const scanOnceRef = useRef<(() => Promise<string | null>) | null>(null);
  const onCodeRef = useRef<(code: string) => void>(() => {});
  const cooldownTimerRef = useRef<number | null>(null);

  const total = useMemo(() => cartTotal(lines), [lines]);
  const itemCount = useMemo(
    () => lines.reduce((n, l) => n + l.cantidad, 0),
    [lines],
  );

  const busquedaRef = useRef<HTMLInputElement>(null);

  const addProduct = useCallback((producto: InventarioProductoRow) => {
    dispatch({ type: "add", producto });
    toast.success(`${producto.nombre} agregado`);
    setBusqueda("");
    setResultados([]);
    setListaAbierta(false);
    busquedaRef.current?.focus();
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
          addProduct(producto);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Producto no encontrado.");
        }
      });
    },
    [addProduct],
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

  const stopCamera = useCallback(() => {
    stopScannerRef.current?.();
    stopScannerRef.current = null;
    scanOnceRef.current = null;
    setCameraOn(false);
    setScanPending(false);
  }, []);

  const startCamera = useCallback(async () => {
    if (stopScannerRef.current) return;

    busquedaRef.current?.blur();
    setCameraOn(true);

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

  const resolverBusqueda = useCallback(() => {
    const trimmed = busqueda.trim();
    if (!trimmed) return;

    startTransition(async () => {
      try {
        const producto = await lookupProductoBySku(trimmed);
        addProduct(producto);
        return;
      } catch {
        // no es SKU exacto
      }

      try {
        const items = await searchProductosVenta(trimmed);
        if (items.length === 1) {
          addProduct(items[0]);
          return;
        }
        if (items.length > 1) {
          setResultados(items);
          setListaAbierta(true);
          toast.error("Selecciona un producto de la lista.");
          return;
        }
      } catch {
        // sigue sin resultados
      }

      toast.error("Sin resultados.");
    });
  }, [busqueda, addProduct]);

  useEffect(() => {
    setIsPc(!isMobileTouchDevice());
    return () => {
      if (cooldownTimerRef.current) {
        window.clearInterval(cooldownTimerRef.current);
      }
      stopScannerRef.current?.();
    };
  }, []);

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

  function formatCajaCode(code: string): string {
    return `${code.slice(0, 3)} ${code.slice(3)}`;
  }

  function sendToPc() {
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
        setCajaCode(code);
        setCartOpen(false);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "No se pudo enviar a PC.",
        );
      }
    });
  }

  function facturarEnPc() {
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
    const pagado = montoPagado.trim()
      ? Number(montoPagado.replace(/\D/g, ""))
      : total;
    if (pagado > total) {
      toast.error("El pago no puede superar el total.");
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
        toast.success("Venta facturada e impresa.");
        dispatch({ type: "clear" });
        setClienteNombre("");
        setClienteCedula("");
        setClienteCelular("");
        setMontoPagado("");
        setNotas("");
        setCartOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo facturar.");
      }
    });
  }

  function closeCajaDialog() {
    setCajaCode(null);
    dispatch({ type: "clear" });
  }

  return (
    <div className="flex flex-col pb-24">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Escanea el QR de la etiqueta, busca por nombre o ingresa el SKU.
        </p>
        <Button
          type="button"
          variant={cameraOn ? "default" : "outline"}
          size="sm"
          onClick={() => void toggleCamera()}
        >
          {cameraOn ? (
            <>
              <CameraOff className="mr-1.5 h-4 w-4" />
              Apagar cámara
            </>
          ) : (
            <>
              <Camera className="mr-1.5 h-4 w-4" />
              Cámara
            </>
          )}
        </Button>
      </div>

      <div className="relative mx-auto mt-4 w-full max-w-[320px]">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-border bg-black">
          <div
            id={SCANNER_ID}
            ref={scannerContainerRef}
            className="absolute inset-0 [&_#qr-shaded-region]:hidden [&_video]:!absolute [&_video]:!inset-0 [&_video]:!h-full [&_video]:!w-full [&_video]:!object-cover"
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
            </button>
          ) : null}
          {cooldownSec > 0 && (
            <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 text-white">
              <span className="text-5xl font-bold tabular-nums">{cooldownSec}</span>
              <span className="mt-1 text-sm">Espera para escanear de nuevo</span>
            </div>
          )}
          {pending && cooldownSec === 0 && cameraOn && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/30 text-xs text-white">
              Buscando producto…
            </div>
          )}
          {scanPending && cooldownSec === 0 && cameraOn && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/30 text-xs text-white">
              Escaneando…
            </div>
          )}
        </div>
        {cameraOn && isMobileTouchDevice() ? (
          <Button
            type="button"
            className="mt-3 w-full gap-2 bg-background text-foreground hover:bg-muted"
            size="lg"
            disabled={scanPending || cooldownSec > 0 || pending}
            onClick={() => void triggerScan()}
          >
            <ScanLine className="h-5 w-5" />
            Escanear
          </Button>
        ) : null}
        {cameraOn && !isMobileTouchDevice() ? (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Apunta al QR desde cualquier ángulo o distancia; no hace falta centrarlo perfecto.
          </p>
        ) : null}
        {cameraOn && isMobileTouchDevice() ? (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Apunta al QR y pulsa Escanear.
          </p>
        ) : null}
      </div>

      <div className="relative mt-3">
        <div className="flex gap-2">
          <Input
            ref={busquedaRef}
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="SKU, nombre o pistola lectora"
            autoComplete="off"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                resolverBusqueda();
              }
              if (e.key === "Escape") {
                setListaAbierta(false);
              }
            }}
            onFocus={() => {
              if (cameraOn) stopCamera();
              if (resultados.length > 0) setListaAbierta(true);
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
              <p className="px-3 py-2 text-sm text-muted-foreground">Buscando…</p>
            ) : null}
            {!searchPending && resultados.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</p>
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
                onClick={() => addProduct(p)}
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

      <div className="mt-6 flex-1 flex flex-col gap-2">
        {lines.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            El carrito está vacío. Busca por nombre, escanea QR o ingresa el SKU.
          </p>
        ) : (
          lines.map((line) => (
            <div
              key={line.productoId}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">
                  {line.nombre}
                </p>
                <p className="text-xs text-muted-foreground">
                  {line.cantidad} × {formatCop(line.precioUnitario)}
                </p>
              </div>
              <p className="shrink-0 font-semibold text-foreground">
                {formatCop(line.precioUnitario * line.cantidad)}
              </p>
            </div>
          ))
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-xl font-bold text-foreground">
              {formatCop(total)}
            </p>
          </div>
          <Button
            type="button"
            size="lg"
            className="relative"
            onClick={() => setCartOpen(true)}
          >
            <ShoppingCart className="mr-2 h-5 w-5" />
            Carrito
            {itemCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold text-white">
                {itemCount}
              </span>
            )}
          </Button>
        </div>
      </div>

      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Detalle del carrito</SheetTitle>
          </SheetHeader>

          {lines.length === 0 ? (
            <p className="px-4 text-sm text-muted-foreground">Sin productos.</p>
          ) : (
            <>
              <div className="hidden px-4 sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-center">Cant.</TableHead>
                      <TableHead className="text-right">P. unit.</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line) => (
                      <TableRow key={line.productoId}>
                        <TableCell>{line.nombre}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {line.sku}
                        </TableCell>
                        <TableCell className="text-center">
                          {line.cantidad}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCop(line.precioUnitario)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCop(line.precioUnitario * line.cantidad)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col gap-3 px-4 sm:hidden">
                {lines.map((line) => (
                  <div
                    key={line.productoId}
                    className="rounded-lg border border-border p-3 text-sm"
                  >
                    <p className="font-medium">{line.nombre}</p>
                    <p className="text-xs text-muted-foreground">{line.sku}</p>
                    <p className="mt-1">
                      {line.cantidad} × {formatCop(line.precioUnitario)} ={" "}
                      {formatCop(line.precioUnitario * line.cantidad)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="px-4 text-right">
                <p className="text-lg font-bold">Total: {formatCop(total)}</p>
              </div>
            </>
          )}

          {isPc && lines.length > 0 ? (
            <div className="grid gap-3 px-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="venta-cliente-nombre">Nombre</Label>
                <Input
                  id="venta-cliente-nombre"
                  value={clienteNombre}
                  onChange={(e) => setClienteNombre(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="venta-cliente-cedula">Cédula</Label>
                <Input
                  id="venta-cliente-cedula"
                  inputMode="numeric"
                  value={clienteCedula}
                  onChange={(e) => setClienteCedula(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="venta-cliente-celular">Celular</Label>
                <Input
                  id="venta-cliente-celular"
                  inputMode="tel"
                  value={clienteCelular}
                  onChange={(e) => setClienteCelular(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="venta-monto-pagado">Pagado hoy</Label>
                <Input
                  id="venta-monto-pagado"
                  inputMode="numeric"
                  placeholder={String(total)}
                  value={montoPagado}
                  onChange={(e) => setMontoPagado(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="venta-notas">Notas</Label>
                <Input
                  id="venta-notas"
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                />
              </div>
            </div>
          ) : null}

          <SheetFooter>
            {isPc ? (
              <Button
                type="button"
                className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/80"
                disabled={lines.length === 0 || facturarPending}
                onClick={facturarEnPc}
              >
                <Printer className="h-4 w-4" />
                {facturarPending ? "Facturando…" : "Facturar e imprimir"}
              </Button>
            ) : (
              <Button
                type="button"
                className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/80"
                disabled={lines.length === 0 || publishPending}
                onClick={sendToPc}
              >
                <Send className="h-4 w-4" />
                {publishPending ? "Enviando…" : "Enviar a PC"}
              </Button>
            )}
          </SheetFooter>
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
              Ingresa este código en el escritorio (/caja) para facturar.
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
    </div>
  );
}
