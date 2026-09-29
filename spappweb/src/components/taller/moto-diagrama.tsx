"use client";

import { useMemo } from "react";
import {
  Circle,
  Disc3,
  Zap,
  Gauge,
  Link2,
  Fuel,
  Armchair,
  Lightbulb,
  ShipWheel,
  PanelsTopLeft,
  Cog,
  ArrowDownToLine,
  type LucideIcon,
} from "lucide-react";
import { ZONAS_MOTO, type ZonaMotoId } from "@/lib/taller/zonas-moto";
import type { TareaGravedad } from "@/lib/taller/types";
import { cn } from "@/lib/utils";

export type ZonaResumen = {
  count: number;
  gravedad: TareaGravedad | null;
  pendientes: number;
};

type Props = {
  selected: ZonaMotoId | null;
  onSelect: (zona: ZonaMotoId) => void;
  resumen: Partial<Record<string, ZonaResumen>>;
  disabled?: boolean;
  className?: string;
};

const ZONA_ICON: Record<ZonaMotoId, LucideIcon> = {
  llanta_delantera: Circle,
  llanta_trasera: Circle,
  freno_delantero: Disc3,
  freno_trasero: Disc3,
  suspension_delantera: ArrowDownToLine,
  amortiguador_trasero: Gauge,
  motor: Cog,
  escape: Zap,
  cadena_pinones: Link2,
  tanque: Fuel,
  sillin: Armchair,
  luces_electrico: Lightbulb,
  manubrio_mandos: ShipWheel,
  plasticos: PanelsTopLeft,
};

const GRUPOS: { titulo: string; ids: ZonaMotoId[] }[] = [
  {
    titulo: "Ruedas y frenos",
    ids: [
      "llanta_delantera",
      "llanta_trasera",
      "freno_delantero",
      "freno_trasero",
    ],
  },
  {
    titulo: "Motor y marcha",
    ids: [
      "motor",
      "escape",
      "cadena_pinones",
      "suspension_delantera",
      "amortiguador_trasero",
    ],
  },
  {
    titulo: "Cuerpo y controles",
    ids: [
      "tanque",
      "sillin",
      "manubrio_mandos",
      "luces_electrico",
      "plasticos",
    ],
  },
];

function worstGravedad(
  a: TareaGravedad | null,
  b: TareaGravedad | null,
): TareaGravedad | null {
  const rank = (g: TareaGravedad | null) =>
    g === "urgente" ? 0 : g === "pronto" ? 1 : g === "bien" ? 2 : 3;
  return rank(a) <= rank(b) ? a : b;
}

/** Selector simple: grupos + botones grandes con ícono y nombre. */
export function MotoDiagrama({
  selected,
  onSelect,
  resumen,
  disabled,
  className,
}: Props) {
  return (
    <div className={cn("flex flex-col gap-5", className)}>
      {GRUPOS.map((grupo) => (
        <div key={grupo.titulo} className="flex flex-col gap-2">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {grupo.titulo}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {grupo.ids.map((id) => {
              const zona = ZONAS_MOTO.find((z) => z.id === id)!;
              const Icon = ZONA_ICON[id];
              const r = resumen[id];
              const pressed = selected === id;
              const urgente = r?.gravedad === "urgente";
              const pronto = r?.gravedad === "pronto";

              return (
                <button
                  key={id}
                  type="button"
                  disabled={disabled}
                  aria-pressed={pressed}
                  onClick={() => onSelect(id)}
                  className={cn(
                    "flex min-h-[4.5rem] touch-manipulation items-center gap-3 rounded-2xl border-2 px-3 py-3 text-left transition-colors",
                    "active:scale-[0.98] disabled:opacity-50",
                    pressed
                      ? "border-primary bg-primary text-primary-foreground"
                      : urgente
                        ? "border-red-400 bg-red-50 dark:bg-red-950/30"
                        : pronto
                          ? "border-amber-400 bg-amber-50 dark:bg-amber-950/20"
                          : r && r.count > 0
                            ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20"
                            : "border-border bg-background hover:border-primary/40 hover:bg-muted/50",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-11 shrink-0 items-center justify-center rounded-xl",
                      pressed
                        ? "bg-primary-foreground/20"
                        : "bg-muted",
                    )}
                    aria-hidden
                  >
                    <Icon className="size-5" strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] leading-snug font-semibold">
                      {zona.label}
                    </span>
                    {r && r.count > 0 ? (
                      <span
                        className={cn(
                          "mt-0.5 block text-xs",
                          pressed
                            ? "text-primary-foreground/80"
                            : "text-muted-foreground",
                        )}
                      >
                        {r.count} {r.count === 1 ? "tarea" : "tareas"}
                        {r.pendientes > 0
                          ? ` · ${r.pendientes} por hacer`
                          : " · listo"}
                      </span>
                    ) : (
                      <span
                        className={cn(
                          "mt-0.5 block text-xs",
                          pressed
                            ? "text-primary-foreground/70"
                            : "text-muted-foreground",
                        )}
                      >
                        Tocar para anotar
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** @deprecated usar MotoDiagrama */
export function MotoZonaLista(props: Omit<Props, "className" | "disabled">) {
  return <MotoDiagrama {...props} />;
}

export function buildZonaResumen(
  trabajos: { zona: string; hecho: boolean; gravedad: TareaGravedad | null }[],
): Partial<Record<string, ZonaResumen>> {
  const map: Partial<Record<string, ZonaResumen>> = {};
  for (const t of trabajos) {
    const prev = map[t.zona];
    if (!prev) {
      map[t.zona] = {
        count: 1,
        gravedad: t.gravedad,
        pendientes: t.hecho ? 0 : 1,
      };
    } else {
      prev.count += 1;
      prev.gravedad = worstGravedad(prev.gravedad, t.gravedad);
      if (!t.hecho) prev.pendientes += 1;
    }
  }
  return map;
}

export function useZonaResumen(
  trabajos: { zona: string; hecho: boolean; gravedad: TareaGravedad | null }[],
) {
  return useMemo(() => buildZonaResumen(trabajos), [trabajos]);
}
