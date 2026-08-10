"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bike, CircleDollarSign, Pencil, Plus, Printer, Tag, User } from "lucide-react";
import type { VentaMotoRow } from "@/lib/actions/venta-moto-actions";
import { AbonoVentaDialog } from "@/components/venta-contado/abono-venta-dialog";
import { EditarVentaContadoDialog } from "@/components/venta-contado/editar-venta-contado-dialog";
import { PlacaVentaDialog } from "@/components/venta-contado/placa-venta-dialog";
import { VenderMotoSheet } from "@/components/inbox/vender-moto-sheet";
import { printVentaMotoReceipt } from "@/lib/printing/venta-moto-receipt";
import type { BikeRow } from "@/lib/pipeline/types";
import { formatCop, formatDate } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

function saldo(venta: VentaMotoRow): number | null {
  if (venta.valorVenta == null) return null;
  return Math.max(0, venta.valorVenta - venta.montoPagado);
}

function pagoLabel(venta: VentaMotoRow): string {
  if (venta.valorVenta == null) return "—";
  if (venta.montoPagado >= venta.valorVenta) return "Contado";
  if (venta.montoPagado > 0) return "Abono";
  return "Pendiente";
}

function puedeAbonar(venta: VentaMotoRow): boolean {
  return venta.valorVenta != null && venta.montoPagado < venta.valorVenta;
}

function PhotoThumb({
  src,
  alt,
  fallback,
}: {
  src: string | null | undefined;
  alt: string;
  fallback: "user" | "bike";
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt} className="h-full w-full object-cover" />
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
      {fallback === "user" ? (
        <User className="h-4 w-4" />
      ) : (
        <Bike className="h-4 w-4" />
      )}
    </div>
  );
}

function EstadoBadge({ venta }: { venta: VentaMotoRow }) {
  const label = pagoLabel(venta);
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
        label === "Contado" && "bg-green-100 text-green-800",
        label === "Abono" && "bg-amber-100 text-amber-800",
        label === "Pendiente" && "bg-red-100 text-red-800",
        label === "—" && "bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

export function VentaContadoManager({
  ventas,
  bikes,
  openNuevo = false,
  initialBikeId,
}: {
  ventas: VentaMotoRow[];
  bikes: BikeRow[];
  openNuevo?: boolean;
  initialBikeId?: string;
}) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(openNuevo);
  const [prefillsBikeId, setPrefillsBikeId] = useState(initialBikeId);
  const [busqueda, setBusqueda] = useState("");
  const [abonoVenta, setAbonoVenta] = useState<VentaMotoRow | null>(null);
  const [placaVenta, setPlacaVenta] = useState<VentaMotoRow | null>(null);
  const [editVenta, setEditVenta] = useState<VentaMotoRow | null>(null);

  useEffect(() => {
    if (!openNuevo) return;
    setSheetOpen(true);
    setPrefillsBikeId(initialBikeId);
    router.replace("/venta-contado", { scroll: false });
  }, [openNuevo, initialBikeId, router]);

  const ventasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return ventas;
    return ventas.filter((v) => {
      return (
        v.clienteNombre.toLowerCase().includes(q) ||
        v.clienteCedula.toLowerCase().includes(q) ||
        v.clienteCelular.toLowerCase().includes(q) ||
        v.modelo.toLowerCase().includes(q) ||
        v.color.toLowerCase().includes(q) ||
        (v.chasis ?? "").toLowerCase().includes(q) ||
        (v.placa ?? "").toLowerCase().includes(q)
      );
    });
  }, [ventas, busqueda]);

  async function handlePrint(venta: VentaMotoRow) {
    try {
      await printVentaMotoReceipt(venta);
    } catch {
      // el recibo abre en pestaña; errores raros no bloquean la UI
    }
  }

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex-1">
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Buscar
          </label>
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Cliente, cédula, celular, placa, modelo, chasis…"
            className="flex h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-neutral-400"
          />
        </div>
        <Button
          className="gap-2 bg-primary text-primary-foreground hover:bg-primary/80 sm:shrink-0"
          onClick={() => setSheetOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Nueva venta contado
        </Button>
      </div>

      {ventas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-12 text-center text-muted-foreground">
          No hay ventas de contado registradas.
        </p>
      ) : ventasFiltradas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-12 text-center text-muted-foreground">
          Sin resultados para &ldquo;{busqueda.trim()}&rdquo;.
        </p>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border border-border lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Moto</TableHead>
                  <TableHead>Precio</TableHead>
                  <TableHead>Pagado</TableHead>
                  <TableHead>Saldo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-48" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {ventasFiltradas.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(v.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/50">
                          <PhotoThumb
                            src={v.selfieUrl}
                            alt={`Foto de ${v.clienteNombre}`}
                            fallback="user"
                          />
                        </div>
                        <div>
                          <div className="font-medium">{v.clienteNombre}</div>
                          <div className="text-xs text-muted-foreground">
                            {v.clienteCedula} · {v.clienteCelular}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/50">
                          <PhotoThumb
                            src={v.motoImagenUrl}
                            alt={`Moto ${v.modelo}`}
                            fallback="bike"
                          />
                        </div>
                        <div>
                          <div>
                            {v.modelo} · {v.color}
                          </div>
                          {v.placa ? (
                            <div className="text-xs font-medium text-foreground">
                              Placa {v.placa}
                            </div>
                          ) : null}
                          {v.chasis ? (
                            <div className="text-xs text-muted-foreground">
                              Chasis {v.chasis}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {v.valorVenta != null ? formatCop(v.valorVenta) : "—"}
                    </TableCell>
                    <TableCell>{formatCop(v.montoPagado)}</TableCell>
                    <TableCell>
                      {saldo(v) != null ? formatCop(saldo(v)!) : "—"}
                    </TableCell>
                    <TableCell>
                      <EstadoBadge venta={v} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1 px-2 text-xs"
                          onClick={() => setEditVenta(v)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Editar
                        </Button>
                        {!v.placa ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1 px-2 text-xs"
                            onClick={() => setPlacaVenta(v)}
                          >
                            <Tag className="h-3.5 w-3.5" />
                            Agregar placa
                          </Button>
                        ) : null}
                        {puedeAbonar(v) ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1 px-2 text-xs"
                            onClick={() => setAbonoVenta(v)}
                          >
                            <CircleDollarSign className="h-3.5 w-3.5" />
                            Abonar
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Reimprimir recibo"
                          onClick={() => handlePrint(v)}
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 lg:hidden">
            {ventasFiltradas.map((v) => (
              <div
                key={v.id}
                className="rounded-lg border border-border p-4 text-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex shrink-0 gap-1.5">
                      <div className="h-11 w-11 overflow-hidden rounded-lg border border-border bg-muted/50">
                        <PhotoThumb
                          src={v.selfieUrl}
                          alt={`Foto de ${v.clienteNombre}`}
                          fallback="user"
                        />
                      </div>
                      <div className="h-11 w-11 overflow-hidden rounded-lg border border-border bg-muted/50">
                        <PhotoThumb
                          src={v.motoImagenUrl}
                          alt={`Moto ${v.modelo}`}
                          fallback="bike"
                        />
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium">{v.clienteNombre}</p>
                      <p className="text-muted-foreground">
                        {v.modelo} · {v.color}
                        {v.placa ? ` · Placa ${v.placa}` : ""}
                      </p>
                    </div>
                  </div>
                  <EstadoBadge venta={v} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDate(v.createdAt)}
                </p>
                <dl className="mt-3 flex flex-col gap-1">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Precio</dt>
                    <dd>
                      {v.valorVenta != null ? formatCop(v.valorVenta) : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Pagado</dt>
                    <dd>{formatCop(v.montoPagado)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Saldo</dt>
                    <dd>
                      {saldo(v) != null ? formatCop(saldo(v)!) : "—"}
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-2"
                    onClick={() => setEditVenta(v)}
                  >
                    <Pencil className="h-4 w-4" />
                    Editar
                  </Button>
                  {!v.placa ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-2"
                      onClick={() => setPlacaVenta(v)}
                    >
                      <Tag className="h-4 w-4" />
                      Agregar placa
                    </Button>
                  ) : null}
                  {puedeAbonar(v) ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-2"
                      onClick={() => setAbonoVenta(v)}
                    >
                      <CircleDollarSign className="h-4 w-4" />
                      Abonar
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn("gap-2", puedeAbonar(v) ? "flex-1" : "w-full")}
                    onClick={() => handlePrint(v)}
                  >
                    <Printer className="h-4 w-4" />
                    Reimprimir
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <VenderMotoSheet
        bikes={bikes}
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) setPrefillsBikeId(undefined);
        }}
        onSaved={() => router.refresh()}
        initialBikeId={prefillsBikeId}
      />

      <AbonoVentaDialog
        venta={abonoVenta}
        open={abonoVenta != null}
        onOpenChange={(open) => {
          if (!open) setAbonoVenta(null);
        }}
      />

      <PlacaVentaDialog
        venta={placaVenta}
        open={placaVenta != null}
        onOpenChange={(open) => {
          if (!open) setPlacaVenta(null);
        }}
      />

      <EditarVentaContadoDialog
        venta={editVenta}
        open={editVenta != null}
        onOpenChange={(open) => {
          if (!open) setEditVenta(null);
        }}
      />
    </>
  );
}
