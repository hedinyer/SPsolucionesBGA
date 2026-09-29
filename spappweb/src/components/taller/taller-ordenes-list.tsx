"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Clock,
  Package,
  Plus,
  Search,
  Wrench,
} from "lucide-react";
import type { MecanicoRow, OrdenTallerRow } from "@/lib/taller/types";
import {
  ORDEN_ESTADO_LABEL,
  ordenTienePendientesSebastian,
  ordenTieneRechazados,
} from "@/lib/taller/types";
import { TallerTimerDisplay } from "@/components/taller/taller-timer";
import { TallerNuevaOrdenForm } from "@/components/taller/taller-nueva-orden-form";
import { TallerRealtimeRefresh } from "@/components/taller/taller-realtime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Tab = "recibida" | "en_reparacion" | "lista";

const TABS: { id: Tab; label: string }[] = [
  { id: "recibida", label: "Esperando" },
  { id: "en_reparacion", label: "Reparando" },
  { id: "lista", label: "Listas" },
];

function MecanicoAvatar({ m }: { m: MecanicoRow | null }) {
  if (!m) {
    return (
      <span className="flex size-9 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">
        ?
      </span>
    );
  }
  if (m.foto_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={m.foto_url}
        alt=""
        className="size-9 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      className="flex size-9 items-center justify-center rounded-full text-sm font-bold text-white"
      style={{ backgroundColor: m.color ?? "#64748b" }}
      aria-hidden
    >
      {m.nombre.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function TallerOrdenesList({
  ordenes,
  mecanicos,
}: {
  ordenes: OrdenTallerRow[];
  mecanicos: MecanicoRow[];
}) {
  const [tab, setTab] = useState<Tab>("en_reparacion");
  const [q, setQ] = useState("");
  const [nuevaOpen, setNuevaOpen] = useState(false);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = {
      recibida: 0,
      en_reparacion: 0,
      lista: 0,
    };
    for (const o of ordenes) {
      if (o.estado in c) c[o.estado as Tab] += 1;
    }
    return c;
  }, [ordenes]);

  const filtered = useMemo(() => {
    const needle = q.trim().toUpperCase();
    return ordenes.filter((o) => {
      if (o.estado !== tab) return false;
      if (!needle) return true;
      return (
        (o.placa ?? "").toUpperCase().includes(needle) ||
        o.modelo.toUpperCase().includes(needle) ||
        String(o.numero).includes(needle)
      );
    });
  }, [ordenes, tab, q]);

  // Prefer tab with items
  const effectiveTab =
    counts[tab] > 0 || ordenes.length === 0
      ? tab
      : (TABS.find((t) => counts[t.id] > 0)?.id ?? tab);

  const list =
    effectiveTab === tab
      ? filtered
      : ordenes.filter((o) => o.estado === effectiveTab);

  return (
    <div className="flex flex-col gap-4 pb-24">
      <TallerRealtimeRefresh onRejectVibrate />

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value.toUpperCase())}
          placeholder="Buscar placa…"
          className="min-h-11 pl-9 text-base uppercase"
          aria-label="Buscar por placa"
          autoComplete="off"
        />
      </div>

      <div
        className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1"
        role="tablist"
        aria-label="Estado de las motos"
      >
        {TABS.map((t) => {
          const selected = (tab === t.id ? tab : effectiveTab) === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex min-h-11 touch-manipulation flex-col items-center justify-center rounded-lg px-1 text-xs font-medium transition-colors sm:text-sm",
                selected
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
            >
              <span>{t.label}</span>
              <span className="tabular-nums opacity-70">{counts[t.id]}</span>
            </button>
          );
        })}
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <Wrench className="mx-auto mb-2 size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No hay motos aquí. Toca &quot;Llegó una moto&quot;.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((orden) => {
            const rechazado = ordenTieneRechazados(orden);
            const pendiente = ordenTienePendientesSebastian(orden);
            return (
              <li key={orden.id}>
                <Link
                  href={`/taller/${orden.id}`}
                  className={cn(
                    "flex flex-col gap-3 rounded-xl border p-4 transition-colors hover:bg-muted/40",
                    rechazado
                      ? "border-red-400 bg-red-50/60 dark:bg-red-950/20"
                      : "border-border bg-background",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xl font-bold tracking-wide uppercase">
                        {orden.placa || `Orden #${orden.numero}`}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {orden.modelo}
                        {orden.color ? ` · ${orden.color}` : ""}
                      </p>
                    </div>
                    <MecanicoAvatar m={orden.mecanico} />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {rechazado ? (
                      <Badge
                        variant="destructive"
                        className="gap-1 text-xs"
                      >
                        <AlertTriangle className="size-3" />
                        No aprobado: corregir
                      </Badge>
                    ) : null}
                    {pendiente ? (
                      <Badge
                        variant="secondary"
                        className="gap-1 bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100"
                      >
                        <Package className="size-3" />
                        Esperando a Sebastian
                      </Badge>
                    ) : null}
                    <Badge variant="outline" className="gap-1">
                      <Clock className="size-3" />
                      {ORDEN_ESTADO_LABEL[orden.estado]}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {orden.mecanico?.nombre ?? "Sin mecánico"}
                    </span>
                    <TallerTimerDisplay
                      timerRunning={orden.timer_running}
                      timerStartedAt={orden.timer_started_at}
                      segundosAcumulados={orden.segundos_acumulados}
                    />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur safe-area-bottom lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <Button
          type="button"
          className="min-h-12 w-full touch-manipulation gap-2 text-base"
          onClick={() => setNuevaOpen(true)}
        >
          <Plus className="size-5" />
          Llegó una moto
        </Button>
      </div>

      <TallerNuevaOrdenForm
        open={nuevaOpen}
        onOpenChange={setNuevaOpen}
        mecanicos={mecanicos.filter((m) => m.activo)}
      />
    </div>
  );
}
