import { AlertTriangle, Bike, RefreshCw, ShieldAlert } from "lucide-react";
import type { ClientPipeline } from "@/lib/pipeline/types";
import {
  getMoraDisplay,
  moraEstadoLabel,
} from "@/lib/pipeline/mora-utils";
import { formatCop } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

export function ClientStatusStrip({
  pipeline,
  esRenovacion,
}: {
  pipeline: ClientPipeline;
  esRenovacion: boolean;
}) {
  const mora = getMoraDisplay(pipeline);
  const showMora =
    pipeline.compra?.estado === "entregada" && mora.tieneDeuda;
  const showVigilado = pipeline.vigilado;
  const showRecogida = mora.yaRecogida;
  const showCongelado = Boolean(pipeline.congelamiento);

  if (
    !showVigilado &&
    !showMora &&
    !esRenovacion &&
    !showRecogida &&
    !showCongelado
  ) {
    return null;
  }

  return (
    <section
      aria-label="Estado del cliente"
      className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 sm:p-4"
    >
      <ul className="flex flex-wrap gap-2">
        {showVigilado ? (
          <li>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-red-100 px-2 py-1 text-sm font-semibold text-red-800">
              <ShieldAlert className="size-4 shrink-0" aria-hidden />
              Cliente vigilado
            </span>
          </li>
        ) : null}
        {esRenovacion ? (
          <li>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-sm font-semibold text-foreground">
              <RefreshCw className="size-4 shrink-0" aria-hidden />
              Renovación
            </span>
          </li>
        ) : null}
        {showRecogida ? (
          <li>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-sm font-semibold text-foreground">
              <Bike className="size-4 shrink-0" aria-hidden />
              Moto recogida
            </span>
          </li>
        ) : null}
        {showCongelado && pipeline.congelamiento ? (
          <li>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-sky-100 px-2 py-1 text-sm font-semibold text-sky-900">
              Crédito congelado · {pipeline.congelamiento.diasRestantes} día
              {pipeline.congelamiento.diasRestantes === 1 ? "" : "s"}
            </span>
          </li>
        ) : null}
        {showMora ? (
          <li>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold",
                mora.paraRecoger
                  ? "bg-red-100 text-red-900"
                  : mora.enMoraBandeja
                    ? "bg-amber-100 text-amber-950"
                    : "bg-muted text-foreground",
              )}
            >
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
              {moraEstadoLabel(pipeline.atraso, {
                yaRecogida: mora.yaRecogida,
              })}
              {mora.dias > 0 ? ` · ${mora.dias} días` : ""}
              {" · "}
              {formatCop(mora.monto)}
            </span>
          </li>
        ) : null}
      </ul>
      {showVigilado ? (
        <p className="text-sm text-muted-foreground">
          {pipeline.notaVigilancia?.trim() || "Sin nota de vigilancia."}
        </p>
      ) : null}
    </section>
  );
}
