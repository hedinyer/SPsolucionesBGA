"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Printer, Search } from "lucide-react";
import { toast } from "sonner";
import {
  deleteVentaCarritoDraft,
  loadVentaCarritoDraft,
  type VentaCarritoDraftLoaded,
} from "@/lib/actions/venta-carrito-draft-actions";
import { saveVentaProducto } from "@/lib/actions/venta-producto-actions";
import { printVentaProductoReceipt } from "@/lib/printing/venta-producto-receipt";
import { formatCop } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function parseCopInput(raw: string): number | undefined {
  const n = Number(raw.replace(/\D/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function CajaProductosManager() {
  const router = useRouter();
  const [codeInput, setCodeInput] = useState("");
  const [draft, setDraft] = useState<VentaCarritoDraftLoaded | null>(null);
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteCedula, setClienteCedula] = useState("");
  const [clienteCelular, setClienteCelular] = useState("");
  const [montoPagado, setMontoPagado] = useState("");
  const [notas, setNotas] = useState("");
  const [loadPending, startLoad] = useTransition();
  const [savePending, startSave] = useTransition();

  const total = draft?.total ?? 0;

  const canFacturar = useMemo(() => {
    if (!draft || draft.hasErrors) return false;
    if (clienteNombre.trim().length === 0) return false;
    if (clienteCelular.trim().length < 10) return false;
    return true;
  }, [draft, clienteNombre, clienteCelular]);

  function clearDraft() {
    setDraft(null);
    setCodeInput("");
    setClienteNombre("");
    setClienteCedula("");
    setClienteCelular("");
    setMontoPagado("");
    setNotas("");
  }

  function loadCart() {
    startLoad(async () => {
      try {
        const loaded = await loadVentaCarritoDraft(codeInput);
        setDraft(loaded);
        setCodeInput(loaded.code);
        if (loaded.hasErrors) {
          toast.error("Hay productos con problemas de stock o inactivos.");
        } else {
          toast.success("Carrito cargado.");
        }
      } catch (err) {
        setDraft(null);
        toast.error(
          err instanceof Error ? err.message : "No se pudo cargar el carrito.",
        );
      }
    });
  }

  function submit() {
    if (!draft || draft.hasErrors) {
      toast.error("Corrige el carrito antes de facturar.");
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

    startSave(async () => {
      try {
        const venta = await saveVentaProducto({
          clienteNombre: clienteNombre.trim(),
          clienteCedula: clienteCedula.trim() || undefined,
          clienteCelular: clienteCelular.trim(),
          montoPagado: pagado,
          notas: notas.trim() || undefined,
          items: draft.lines.map((l) => ({
            productoId: l.productoId,
            cantidad: l.cantidad,
          })),
        });
        await deleteVentaCarritoDraft(draft.code);
        await printVentaProductoReceipt(venta);
        toast.success("Venta facturada e impresa.");
        clearDraft();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo facturar.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-border bg-background p-4">
        <p className="text-sm font-semibold text-foreground">
          Cobrar un carrito
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Escribe el código de 6 dígitos que sale en el celular.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <label htmlFor="caja-codigo-carrito" className="sr-only">
            Código del carrito
          </label>
          <Input
            id="caja-codigo-carrito"
            inputMode="numeric"
            maxLength={6}
            placeholder="Código de 6 dígitos"
            value={codeInput}
            onChange={(e) =>
              setCodeInput(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                loadCart();
              }
            }}
            className="min-h-11 max-w-xs font-mono text-lg tracking-widest"
            autoComplete="off"
          />
          <Button
            type="button"
            variant="outline"
            className="min-h-11 gap-2"
            disabled={loadPending || codeInput.length !== 6}
            onClick={loadCart}
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            {loadPending ? "Cargando…" : "Cargar carrito"}
          </Button>
          {draft ? (
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={clearDraft}
            >
              Cancelar
            </Button>
          ) : null}
        </div>
      </div>

      {!draft ? (
        <p className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          Aún no hay carrito. En Vender, arma el pedido y envíalo a la PC.
        </p>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Cant.</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {draft.lines.map((line) => (
                  <TableRow
                    key={line.productoId}
                    className={line.error ? "bg-red-50" : undefined}
                  >
                    <TableCell>
                      <div>
                        <p className="font-medium">{line.nombre}</p>
                        {line.error ? (
                          <p className="text-xs text-destructive">{line.error}</p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{line.sku}</TableCell>
                    <TableCell className="text-right">{line.cantidad}</TableCell>
                    <TableCell className="text-right">
                      {formatCop(line.subtotal)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="border-t border-border px-4 py-3 text-right text-base font-bold">
              Total: {formatCop(total)}
            </p>
          </div>

          <div className="flex flex-col gap-4 rounded-xl border border-border bg-muted/50 p-4">
            <p className="text-sm font-semibold">Datos del cliente</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="caja-cliente-nombre">Nombre</Label>
                <Input
                  id="caja-cliente-nombre"
                  className="min-h-11"
                  value={clienteNombre}
                  onChange={(e) => setClienteNombre(e.target.value)}
                  autoComplete="name"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="caja-cliente-cedula">Cédula</Label>
                <Input
                  id="caja-cliente-cedula"
                  className="min-h-11"
                  inputMode="numeric"
                  value={clienteCedula}
                  onChange={(e) => setClienteCedula(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="caja-cliente-celular">Celular</Label>
                <Input
                  id="caja-cliente-celular"
                  className="min-h-11"
                  inputMode="tel"
                  value={clienteCelular}
                  onChange={(e) => setClienteCelular(e.target.value)}
                  autoComplete="tel"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-xl border border-border bg-muted/50 p-4">
            <p className="text-sm font-semibold">Pago</p>
            <div className="flex flex-col gap-2">
              <Label htmlFor="caja-monto-pagado">¿Cuánto pagó hoy?</Label>
              <Input
                id="caja-monto-pagado"
                className="min-h-11"
                inputMode="numeric"
                placeholder={total > 0 ? String(total) : "0"}
                value={montoPagado}
                onChange={(e) => setMontoPagado(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-fit"
              disabled={total <= 0}
              onClick={() => setMontoPagado(String(total))}
            >
              Pagó todo
            </Button>
            <div className="flex flex-col gap-2">
              <Label htmlFor="caja-notas">Nota (opcional)</Label>
              <Input
                id="caja-notas"
                className="min-h-11"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
              />
            </div>
          </div>

          <Button
            type="button"
            className="min-h-11 w-full gap-2 sm:w-auto"
            disabled={!canFacturar || savePending}
            onClick={submit}
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            {savePending ? "Facturando…" : "Facturar e imprimir"}
          </Button>
        </>
      )}
    </div>
  );
}
