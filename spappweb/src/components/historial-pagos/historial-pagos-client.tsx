"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { FileImage, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import {
  listHistorialPagos,
  type HistorialPagoRow,
} from "@/lib/actions/historial-pagos-actions";
import {
  CONTEXTO_PAGO_LABELS,
  MEDIO_PAGO_ADMIN_LABELS,
  type ContextoPago,
  type MedioPagoAdminStored,
} from "@/lib/pipeline/types";
import { formatCop, formatDate } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type PeriodoPreset = "hoy" | "ayer" | "semana" | "rango";

function todayBogota(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
  }).format(new Date());
}

function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + delta);
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Lunes de la semana (Bogotá) a partir de un YMD. */
function startOfWeekYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay(); // 0=domingo
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + mondayOffset);
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function rangeForPreset(preset: PeriodoPreset): {
  desde: string;
  hasta: string;
} {
  const hoy = todayBogota();
  if (preset === "hoy") return { desde: hoy, hasta: hoy };
  if (preset === "ayer") {
    const ayer = addDaysYmd(hoy, -1);
    return { desde: ayer, hasta: ayer };
  }
  if (preset === "semana") {
    return { desde: startOfWeekYmd(hoy), hasta: hoy };
  }
  return { desde: hoy, hasta: hoy };
}

function contextoLabel(ctx: ContextoPago | null): string {
  if (!ctx) return "Pago";
  return CONTEXTO_PAGO_LABELS[ctx] ?? ctx;
}

function medioLabel(medio: string | null): string {
  if (!medio) return "—";
  if (medio in MEDIO_PAGO_ADMIN_LABELS) {
    return MEDIO_PAGO_ADMIN_LABELS[medio as MedioPagoAdminStored];
  }
  return medio;
}

const PRESETS: { id: PeriodoPreset; label: string }[] = [
  { id: "hoy", label: "Hoy" },
  { id: "ayer", label: "Ayer" },
  { id: "semana", label: "Esta semana" },
  { id: "rango", label: "Elegir fechas" },
];

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-border shadow-none">
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 font-heading text-2xl font-semibold tracking-tight tabular-nums">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      {children}
    </span>
  );
}

function openComprobante(
  row: HistorialPagoRow,
  setUrl: (url: string | null) => void,
  setLabel: (label: string) => void,
) {
  setUrl(row.comprobanteUrl);
  setLabel(`Comprobante de ${row.placa || row.clienteNombre}`);
}

export function HistorialPagosClient() {
  const [pending, startTransition] = useTransition();
  const [preset, setPreset] = useState<PeriodoPreset>("hoy");
  const initial = rangeForPreset("hoy");
  const [fechaDesde, setFechaDesde] = useState(initial.desde);
  const [fechaHasta, setFechaHasta] = useState(initial.hasta);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<HistorialPagoRow[]>([]);
  const [totalMonto, setTotalMonto] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [comprobanteUrl, setComprobanteUrl] = useState<string | null>(null);
  const [comprobanteLabel, setComprobanteLabel] = useState("");

  function load(next?: {
    desde?: string;
    hasta?: string;
    query?: string;
  }) {
    const desde = next?.desde ?? fechaDesde;
    const hasta = next?.hasta ?? fechaHasta;
    const query = next?.query ?? q;

    startTransition(async () => {
      try {
        const result = await listHistorialPagos({
          fechaDesde: desde,
          fechaHasta: hasta,
          q: query.trim() || undefined,
        });
        setRows(result.rows);
        setTotalMonto(result.totalMonto);
        setTruncated(result.truncated);
        setLoaded(true);
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "No se pudo cargar el historial.",
        );
      }
    });
  }

  useEffect(() => {
    load();
    // Carga inicial de Hoy
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectPreset(next: PeriodoPreset) {
    setPreset(next);
    if (next === "rango") return;
    const range = rangeForPreset(next);
    setFechaDesde(range.desde);
    setFechaHasta(range.hasta);
    load({ desde: range.desde, hasta: range.hasta });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (fechaDesde > fechaHasta) {
      toast.error("La fecha desde no puede ser posterior a la fecha hasta.");
      return;
    }
    load();
  }

  const statusText = loaded
    ? `${rows.length} pago${rows.length === 1 ? "" : "s"} · ${formatCop(totalMonto)}`
    : pending
      ? "Cargando pagos…"
      : "";

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-5 rounded-2xl border border-border bg-background p-4 shadow-sm sm:p-5"
        aria-busy={pending}
      >
        <div className="flex flex-col gap-2">
          <span
            id="periodo-label"
            className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            Periodo
          </span>
          <div
            role="group"
            aria-labelledby="periodo-label"
            className="flex w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1"
          >
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={preset === p.id}
                onClick={() => selectPreset(p.id)}
                className={cn(
                  "min-h-11 shrink-0 touch-manipulation rounded-lg px-3 py-2 text-center text-sm font-medium transition-[color,transform,box-shadow] active:scale-[0.96] sm:flex-1",
                  preset === p.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {preset === "rango" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="hp-desde"
                className="text-xs text-muted-foreground"
              >
                Desde
              </Label>
              <Input
                id="hp-desde"
                type="date"
                className="min-h-11"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="hp-hasta"
                className="text-xs text-muted-foreground"
              >
                Hasta
              </Label>
              <Input
                id="hp-hasta"
                type="date"
                className="min-h-11"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
              />
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="hp-q" className="text-xs text-muted-foreground">
            Cliente, cédula o placa
          </Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="hp-q"
                className="min-h-11 pl-9"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Ej. 1098… o HAO83I"
                autoComplete="off"
              />
            </div>
            <Button
              type="submit"
              className="min-h-11 active:scale-[0.96] transition-transform sm:min-w-36"
              disabled={pending}
            >
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Buscando…
                </>
              ) : (
                <>
                  <Search className="size-4" aria-hidden />
                  Buscar
                </>
              )}
            </Button>
          </div>
        </div>
      </form>

      <div className="sr-only" role="status" aria-live="polite">
        {statusText}
        {truncated ? " Hay más resultados; acorta el rango." : ""}
      </div>

      {loaded ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Stat
            label="Pagos"
            value={String(rows.length)}
          />
          <Stat label="Total confirmado" value={formatCop(totalMonto)} />
        </div>
      ) : pending ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Card className="border-border shadow-none">
            <CardContent className="flex min-h-[4.5rem] items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Cargando…
            </CardContent>
          </Card>
          <Card className="border-border shadow-none">
            <CardContent className="min-h-[4.5rem] p-4" />
          </Card>
        </div>
      ) : null}

      {truncated ? (
        <p className="text-sm text-muted-foreground">
          Hay más resultados; acorta el rango.
        </p>
      ) : null}

      {!pending && loaded && rows.length === 0 ? (
        <Empty className="border border-dashed border-border">
          <EmptyHeader>
            <EmptyTitle>No hay pagos en estas fechas</EmptyTitle>
            <EmptyDescription>
              Prueba otro periodo o busca por cliente, cédula o placa.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {rows.length > 0 ? (
        <>
          <ul className="flex flex-col gap-3 md:hidden">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex flex-col rounded-xl border border-border bg-background shadow-sm"
              >
                <div className="flex flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-heading text-lg font-semibold tracking-tight">
                        {row.placa || "Sin placa"}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {row.clienteNombre}
                        {row.cedula && row.cedula !== row.clienteNombre
                          ? ` · ${row.cedula}`
                          : ""}
                      </p>
                    </div>
                    <p className="shrink-0 text-right text-xl font-semibold tabular-nums tracking-tight">
                      {formatCop(row.monto)}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(row.fecha)}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <Chip>{contextoLabel(row.contextoPago)}</Chip>
                    <Chip>{medioLabel(row.medioPagoAdmin)}</Chip>
                  </div>
                  {row.referencia ? (
                    <p className="text-xs text-muted-foreground">
                      Ref. {row.referencia}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
                  {row.comprobanteUrl ? (
                    <Button
                      type="button"
                      className="min-h-11 active:scale-[0.96] transition-transform"
                      onClick={() =>
                        openComprobante(
                          row,
                          setComprobanteUrl,
                          setComprobanteLabel,
                        )
                      }
                      aria-label={`Ver foto del comprobante de ${row.placa || row.clienteNombre}`}
                    >
                      <FileImage className="size-4" aria-hidden />
                      Ver foto
                    </Button>
                  ) : (
                    <span className="inline-flex min-h-11 items-center text-sm text-muted-foreground">
                      Sin foto
                    </span>
                  )}
                  <Button
                    asChild
                    variant="outline"
                    className="min-h-11 active:scale-[0.96] transition-transform"
                  >
                    <Link href={`/clientes/${row.userId}`}>Ver cliente</Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-hidden rounded-2xl border border-border bg-background shadow-sm md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="sticky top-0 z-[1] border-b border-border bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 font-medium">Placa</th>
                    <th className="px-4 py-3 font-medium">Cliente</th>
                    <th className="px-4 py-3 font-medium">Fecha</th>
                    <th className="px-4 py-3 font-medium">Tipo</th>
                    <th className="px-4 py-3 font-medium">Medio</th>
                    <th className="px-4 py-3 font-medium text-right">Monto</th>
                    <th className="px-4 py-3 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
                    >
                      <td className="px-4 py-3 font-heading font-semibold">
                        {row.placa || "Sin placa"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span>{row.clienteNombre}</span>
                          {row.cedula && row.cedula !== row.clienteNombre ? (
                            <span className="text-xs text-muted-foreground">
                              {row.cedula}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {formatDate(row.fecha)}
                      </td>
                      <td className="px-4 py-3">
                        <Chip>{contextoLabel(row.contextoPago)}</Chip>
                      </td>
                      <td className="px-4 py-3">
                        <Chip>{medioLabel(row.medioPagoAdmin)}</Chip>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">
                        {formatCop(row.monto)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {row.comprobanteUrl ? (
                            <Button
                              type="button"
                              size="sm"
                              className="min-h-11 active:scale-[0.96] transition-transform"
                              onClick={() =>
                                openComprobante(
                                  row,
                                  setComprobanteUrl,
                                  setComprobanteLabel,
                                )
                              }
                              aria-label={`Ver foto del comprobante de ${row.placa || row.clienteNombre}`}
                            >
                              <FileImage className="size-4" aria-hidden />
                              Ver foto
                            </Button>
                          ) : (
                            <span className="inline-flex min-h-11 items-center text-xs text-muted-foreground">
                              Sin foto
                            </span>
                          )}
                          <Button
                            asChild
                            variant="outline"
                            size="sm"
                            className="min-h-11 active:scale-[0.96] transition-transform"
                          >
                            <Link href={`/clientes/${row.userId}`}>
                              Ver cliente
                            </Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}

      <Dialog
        open={Boolean(comprobanteUrl)}
        onOpenChange={(open) => {
          if (!open) {
            setComprobanteUrl(null);
            setComprobanteLabel("");
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{comprobanteLabel || "Comprobante"}</DialogTitle>
          </DialogHeader>
          {comprobanteUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={comprobanteUrl}
              alt={comprobanteLabel || "Comprobante de pago"}
              className="max-h-[70dvh] w-full rounded-lg object-contain outline outline-1 outline-black/10"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
