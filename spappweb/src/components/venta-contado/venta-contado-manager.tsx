"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bike,
  CircleDollarSign,
  Pencil,
  Plus,
  Printer,
  Tag,
  User,
} from "lucide-react";
import type { VentaMotoRow } from "@/lib/actions/venta-moto-actions";
import { CONTADO_TIPO_DOC_LABELS } from "@/lib/venta-contado/contado-cliente";
import { AbonoVentaDialog } from "@/components/venta-contado/abono-venta-dialog";
import { EditarVentaContadoDialog } from "@/components/venta-contado/editar-venta-contado-dialog";
import { PlacaVentaDialog } from "@/components/venta-contado/placa-venta-dialog";
import { VenderMotoSheet } from "@/components/inbox/vender-moto-sheet";
import { printVentaMotoReceipt } from "@/lib/printing/venta-moto-receipt";
import type { BikeRow } from "@/lib/pipeline/types";
import { formatCop, formatDate } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
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
  className,
}: {
  src: string | null | undefined;
  alt: string;
  fallback: "user" | "bike";
  className?: string;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className={cn("h-full w-full object-cover", className)}
      />
    );
  }
  return (
    <div
      className={cn(
        "flex h-full w-full items-center justify-center bg-muted text-muted-foreground",
        className,
      )}
    >
      {fallback === "user" ? (
        <User className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Bike className="h-4 w-4" aria-hidden="true" />
      )}
    </div>
  );
}

function EstadoBadge({ venta }: { venta: VentaMotoRow }) {
  const label = pagoLabel(venta);
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
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

function ClienteMeta({ venta }: { venta: VentaMotoRow }) {
  const tipo = venta.clienteTipoDocumento
    ? CONTADO_TIPO_DOC_LABELS[venta.clienteTipoDocumento]
    : null;
  return (
    <div className="min-w-0 space-y-1">
      <p className="truncate font-medium leading-snug text-foreground">
        {venta.clienteNombre}
      </p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {tipo ? `${tipo} ` : null}
        {venta.clienteCedula}
        <span className="text-border"> · </span>
        {venta.clienteCelular}
      </p>
      {venta.clienteDireccion ? (
        <p className="text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
          {venta.clienteDireccion}
        </p>
      ) : null}
      {venta.clienteCorreo ? (
        <p className="truncate text-xs leading-relaxed text-muted-foreground">
          {venta.clienteCorreo}
        </p>
      ) : null}
    </div>
  );
}

function MotoMeta({ venta }: { venta: VentaMotoRow }) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="font-medium leading-snug">
        {venta.modelo}
        <span className="font-normal text-muted-foreground">
          {" "}
          · {venta.color}
        </span>
      </p>
      {venta.placa ? (
        <p className="text-xs font-medium text-foreground">
          Placa {venta.placa}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Sin placa</p>
      )}
      {venta.chasis ? (
        <p className="truncate text-xs text-muted-foreground">
          Chasis {venta.chasis}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Chasis pendiente</p>
      )}
    </div>
  );
}

function MoneyBlock({ venta }: { venta: VentaMotoRow }) {
  const s = saldo(venta);
  return (
    <dl className="grid min-w-0 grid-cols-3 gap-x-3 gap-y-1 text-sm tabular-nums">
      <div className="min-w-0">
        <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Precio
        </dt>
        <dd className="truncate font-medium">
          {venta.valorVenta != null ? formatCop(venta.valorVenta) : "—"}
        </dd>
      </div>
      <div className="min-w-0">
        <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Pagado
        </dt>
        <dd className="truncate">{formatCop(venta.montoPagado)}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Saldo
        </dt>
        <dd className="truncate font-medium">
          {s != null ? formatCop(s) : "—"}
        </dd>
      </div>
    </dl>
  );
}

function RowActions({
  venta,
  onEdit,
  onPlaca,
  onAbono,
  onPrint,
}: {
  venta: VentaMotoRow;
  onEdit: () => void;
  onPlaca: () => void;
  onAbono: () => void;
  onPrint: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 min-h-9 gap-1.5 px-3"
        onClick={onEdit}
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        Editar
      </Button>
      {!venta.placa ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 min-h-9 gap-1.5 px-3"
          onClick={onPlaca}
        >
          <Tag className="h-3.5 w-3.5" aria-hidden="true" />
          Placa
        </Button>
      ) : null}
      {puedeAbonar(venta) ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 min-h-9 gap-1.5 px-3"
          onClick={onAbono}
        >
          <CircleDollarSign className="h-3.5 w-3.5" aria-hidden="true" />
          Abonar
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 min-h-9 min-w-9"
        aria-label={`Reimprimir recibo de ${venta.clienteNombre}`}
        onClick={onPrint}
      >
        <Printer className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
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
        (v.clienteDireccion ?? "").toLowerCase().includes(q) ||
        (v.clienteCorreo ?? "").toLowerCase().includes(q) ||
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
        <div className="min-w-0 flex-1">
          <label
            htmlFor="contado-buscar"
            className="mb-1.5 block text-sm font-medium text-foreground"
          >
            Buscar
          </label>
          <input
            id="contado-buscar"
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Cliente, documento, celular, correo, dirección, placa…"
            className="flex h-11 w-full rounded-lg border border-border bg-background px-3 text-base outline-none focus-visible:border-neutral-400 focus-visible:ring-2 focus-visible:ring-ring/40 sm:text-sm"
          />
        </div>
        <Button
          className="h-11 gap-2 bg-primary text-primary-foreground hover:bg-primary/80 sm:shrink-0"
          onClick={() => setSheetOpen(true)}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
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
        <ul className="flex flex-col gap-3">
          {ventasFiltradas.map((v) => (
            <li
              key={v.id}
              className="rounded-xl border border-border bg-background p-4 shadow-sm sm:p-5"
            >
              {/* φ ≈ 1.618: cliente 1.618fr · moto 1fr · pago/acciones 0.618fr */}
              <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1.618fr)_minmax(0,1fr)_minmax(14rem,0.618fr)] xl:items-start xl:gap-6">
                <div className="flex min-w-0 gap-3">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-border bg-muted/50 outline outline-1 outline-black/10">
                    <PhotoThumb
                      src={v.selfieUrl}
                      alt={`Foto de ${v.clienteNombre}`}
                      fallback="user"
                    />
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <ClienteMeta venta={v} />
                    <p className="text-xs text-muted-foreground">
                      {formatDate(v.createdAt)}
                    </p>
                  </div>
                </div>

                <div className="flex min-w-0 gap-3 border-t border-border/70 pt-4 xl:border-t-0 xl:pt-0">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-border bg-muted/50 outline outline-1 outline-black/10">
                    <PhotoThumb
                      src={v.motoImagenUrl}
                      alt={`Moto ${v.modelo}`}
                      fallback="bike"
                    />
                  </div>
                  <MotoMeta venta={v} />
                </div>

                <div className="flex min-w-0 flex-col gap-3 border-t border-border/70 pt-4 xl:border-t-0 xl:pt-0">
                  <div className="flex items-start justify-between gap-3">
                    <MoneyBlock venta={v} />
                    <EstadoBadge venta={v} />
                  </div>
                  <RowActions
                    venta={v}
                    onEdit={() => setEditVenta(v)}
                    onPlaca={() => setPlacaVenta(v)}
                    onAbono={() => setAbonoVenta(v)}
                    onPrint={() => handlePrint(v)}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
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
