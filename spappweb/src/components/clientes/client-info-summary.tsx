import { Bike, User } from "lucide-react";
import { parseTitularidadHistorial } from "@/lib/admin/titularidad";
import type { BikeRow, ClientPipeline } from "@/lib/pipeline/types";
import {
  COMPRA_ESTADO_LABELS,
  FRECUENCIA_LABELS,
} from "@/lib/pipeline/types";
import { getMoraDisplay, moraEstadoLabel } from "@/lib/pipeline/mora-utils";
import { referralLabel } from "@/lib/referrals";
import { formatCop, formatCuotas } from "@/lib/utils/format";
import { GpsMotoPanel } from "@/components/pipeline/gps-moto-panel";
import { Card, CardContent } from "@/components/ui/card";

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
    </div>
  );
}

function PhotoThumb({
  src,
  alt,
  fallback,
  caption,
}: {
  src: string | null;
  alt: string;
  fallback: "user" | "bike";
  caption: string;
}) {
  return (
    <div className="relative aspect-square overflow-hidden rounded-lg border border-border bg-muted/50">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          {fallback === "user" ? (
            <User className="h-8 w-8" />
          ) : (
            <Bike className="h-8 w-8" />
          )}
        </div>
      )}
      <span className="absolute bottom-1.5 left-1.5 rounded bg-foreground/70 px-1.5 py-0.5 text-[10px] font-medium text-background">
        {caption}
      </span>
    </div>
  );
}

export function ClientInfoSummary({
  pipeline,
  bikes = [],
}: {
  pipeline: ClientPipeline;
  bikes?: BikeRow[];
}) {
  const hoja = pipeline.contract?.hoja_vida_data as
    | Record<string, unknown>
    | undefined;
  const contrato = pipeline.contract?.contrato_data as
    | Record<string, unknown>
    | undefined;
  const cedula =
    (hoja?.numero_identificacion as string | undefined)?.trim() ||
    (contrato?.cedula_contratante as string | undefined)?.trim() ||
    null;
  const celular =
    (hoja?.celular as string | undefined)?.trim() ||
    pipeline.visita?.cliente_celular?.trim() ||
    null;
  const compra = pipeline.compra;
  const resumen = pipeline.rentingResumen;
  const mora = getMoraDisplay(pipeline);
  const selfieUrl = pipeline.document?.selfie_url ?? null;
  const motoImagenUrl =
    bikes.find((b) => b.id === compra?.bike_id)?.imagen_url ?? null;

  const hasContent =
    cedula ||
    celular ||
    compra ||
    resumen ||
    mora.tieneDeuda ||
    pipeline.visita?.direccion_visita ||
    selfieUrl ||
    motoImagenUrl ||
    pipeline.document?.referral_source;

  const placaGps = compra?.placa?.trim() || null;
  const titularidadHistorial = parseTitularidadHistorial(
    (compra?.admin_data as Record<string, unknown> | undefined) ?? null,
  );
  if (!hasContent && !placaGps) return null;

  return (
    <Card className="overflow-hidden border-border shadow-none">
      <CardContent className="flex flex-col gap-0 p-0">
        <div className="flex flex-col gap-0 lg:flex-row">
          <div className="flex min-w-0 flex-1 flex-col sm:flex-row">
            <div className="grid w-full shrink-0 grid-cols-2 gap-0 border-b border-border sm:w-56 sm:grid-cols-1 sm:border-b-0 sm:border-r">
              <PhotoThumb
                src={selfieUrl}
                alt={`Foto de ${pipeline.displayName}`}
                fallback="user"
                caption="Cliente"
              />
              <PhotoThumb
                src={motoImagenUrl}
                alt={compra ? `Moto ${compra.modelo}` : "Moto"}
                fallback="bike"
                caption={compra?.placa ?? "Moto"}
              />
            </div>

            <div className="grid flex-1 gap-4 p-6 sm:grid-cols-2">
              {cedula && <InfoItem label="Cédula" value={cedula} />}
              {celular && <InfoItem label="Celular" value={celular} />}
              {pipeline.document?.referral_source && (
                <InfoItem
                  label="Referido por"
                  value={
                    referralLabel(pipeline.document.referral_source) ??
                    pipeline.document.referral_source
                  }
                />
              )}
              {compra && (
                <>
                  <InfoItem
                    label="Moto"
                    value={`${compra.modelo} · ${compra.color}`}
                  />
                  {compra.placa && (
                    <InfoItem label="Placa" value={compra.placa} />
                  )}
                  <InfoItem
                    label="Estado compra"
                    value={COMPRA_ESTADO_LABELS[compra.estado]}
                  />
                  {compra.estado !== "cancelada" && (
                    <InfoItem
                      label="Frecuencia de pago"
                      value={FRECUENCIA_LABELS[compra.frecuencia_pago]}
                    />
                  )}
                </>
              )}
              {pipeline.visita?.direccion_visita && (
                <InfoItem
                  label="Dirección"
                  value={pipeline.visita.direccion_visita}
                />
              )}
              {mora.tieneDeuda && compra?.estado === "entregada" && (
                <>
                  <InfoItem
                    label="Estado de pagos"
                    value={moraEstadoLabel(pipeline.atraso)}
                  />
                  <InfoItem
                    label="Días de atraso"
                    value={mora.dias > 0 ? String(mora.dias) : "—"}
                  />
                  <InfoItem label="Adeudado" value={formatCop(mora.monto)} />
                </>
              )}
              {resumen && (
                <>
                  <InfoItem
                    label="Cuotas pagadas"
                    value={formatCuotas(resumen.cuotasPagadas)}
                  />
                  <InfoItem
                    label="Total pagado"
                    value={formatCop(resumen.totalPagado)}
                  />
                  {resumen.totalAdeudado > 0 && (
                    <InfoItem
                      label="Adeudado"
                      value={formatCop(resumen.totalAdeudado)}
                    />
                  )}
                </>
              )}
            </div>
          </div>

          {placaGps ? (
            <div className="min-w-0 border-t border-border lg:w-[22rem] lg:shrink-0 lg:border-t-0 lg:border-l">
              <GpsMotoPanel
                placa={placaGps}
                userId={pipeline.user.id}
                embedded
              />
            </div>
          ) : null}
        </div>

        {titularidadHistorial.length > 0 && (
          <div className="border-t border-border px-6 py-4">
            <p className="text-xs text-muted-foreground">
              Historial de titularidad
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {titularidadHistorial.map((e, i) => (
                <li key={`${e.at}-${i}`} className="text-sm">
                  <span className="font-medium">
                    @{e.from_user} → @{e.to_user}
                  </span>
                  <span className="text-muted-foreground">
                    {" · "}
                    {new Date(e.at).toLocaleString("es-CO", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                    {e.motivo ? ` · ${e.motivo}` : ""}
                    {e.by ? ` · por ${e.by}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
