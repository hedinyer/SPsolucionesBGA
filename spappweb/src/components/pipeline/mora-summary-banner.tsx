import type { ClientPipeline } from "@/lib/pipeline/types";
import {
  getMoraDisplay,
  moraEstadoLabel,
} from "@/lib/pipeline/mora-utils";
import { formatCop } from "@/lib/utils/format";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function MoraSummaryBanner({ pipeline }: { pipeline: ClientPipeline }) {
  if (pipeline.compra?.estado !== "entregada") return null;

  const { dias, monto, enMoraBandeja, paraRecoger, tieneDeuda } =
    getMoraDisplay(pipeline);

  if (!tieneDeuda) return null;

  const visitaPendiente =
    pipeline.visita != null && pipeline.visita.estado !== "completada";

  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 text-sm",
        enMoraBandeja
          ? "border-amber-200 bg-amber-50 text-amber-950"
          : paraRecoger
            ? "border-red-200 bg-red-50 text-red-950"
            : "border-border bg-muted/50 text-foreground",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">Cuenta de mora</p>
          <p className="mt-1">
            {dias > 0 ? `${dias} días de atraso · ` : ""}
            Adeudado {formatCop(monto)}
          </p>
          <p className="mt-1 text-xs opacity-80">
            {moraEstadoLabel(pipeline.atraso)}
            {visitaPendiente
              ? " · Visible aunque la visita domiciliaria siga pendiente"
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {enMoraBandeja ? (
            <Badge
              variant="outline"
              className="border-amber-300 bg-background font-normal text-amber-900"
            >
              Cliente en mora
            </Badge>
          ) : null}
          {paraRecoger ? (
            <Badge
              variant="outline"
              className="border-red-200 bg-background font-normal text-red-800"
            >
              Para recoger
            </Badge>
          ) : null}
        </div>
      </div>
    </div>
  );
}
