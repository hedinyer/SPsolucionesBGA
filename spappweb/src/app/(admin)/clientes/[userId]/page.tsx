import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import {
  getActiveVisitadores,
  getAllBikes,
  getAllProductos,
  getAllProductosCredito,
  getClientPipeline,
} from "@/lib/pipeline/queries";
import { ClientPipelineView } from "@/components/pipeline/client-pipeline-view";
import { ClientInfoSummary } from "@/components/clientes/client-info-summary";
import { ClientHeaderActions } from "@/components/clientes/client-header-actions";
import { ClientStatusStrip } from "@/components/clientes/client-status-strip";
import { ConductorPanel } from "@/components/clientes/conductor-panel";
import { LazyDetails } from "@/components/clientes/lazy-details";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { parseConductorInfo } from "@/lib/admin/conductor";

export default async function ClientPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId: userIdStr } = await params;
  const userId = Number(userIdStr);
  if (!Number.isFinite(userId)) notFound();

  const [pipeline, visitadores, bikes, productosCredito, inventarioProductos] =
    await Promise.all([
      getClientPipeline(userId),
      getActiveVisitadores(),
      getAllBikes(),
      getAllProductosCredito(),
      getAllProductos(),
    ]);

  if (!pipeline) notFound();

  const esRenovacion =
    pipeline.compra?.admin_data?.es_renovacion === true ||
    (pipeline.contract?.contrato_data as { es_renovacion?: unknown } | undefined)
      ?.es_renovacion === true;

  const conductor = pipeline.compra
    ? parseConductorInfo(
        (pipeline.compra.admin_data as Record<string, unknown> | undefined) ??
          null,
      )
    : null;

  const hoja = pipeline.contract?.hoja_vida_data as
    | Record<string, unknown>
    | undefined;
  const contrato = pipeline.contract?.contrato_data as
    | Record<string, unknown>
    | undefined;
  const cedulaSub =
    (hoja?.numero_identificacion as string | undefined)?.trim() ||
    (contrato?.cedula_contratante as string | undefined)?.trim() ||
    null;
  const subtitle =
    [pipeline.compra?.placa?.trim(), cedulaSub].filter(Boolean).join(" · ") ||
    `@${pipeline.user.user}`;

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" asChild className="w-fit gap-2 px-0">
        <Link href="/clientes">
          <ChevronLeft data-icon="inline-start" />
          Volver a Clientes
        </Link>
      </Button>

      <PageHeader
        title={pipeline.displayName}
        description={subtitle}
        action={<ClientHeaderActions pipeline={pipeline} />}
      />

      <ClientStatusStrip pipeline={pipeline} esRenovacion={esRenovacion} />

      <ClientInfoSummary pipeline={pipeline} bikes={bikes} />

      {pipeline.compra ? (
        <LazyDetails
          className="rounded-xl border border-border bg-card"
          summaryClassName="cursor-pointer list-none px-4 py-3 text-sm font-medium marker:content-none [&::-webkit-details-marker]:hidden"
          summary={
            <span className="flex items-center justify-between gap-2">
              <span>
                Conductor
                {conductor?.nombre?.trim()
                  ? ` · ${conductor.nombre.trim()}`
                  : " · sin asignar"}
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                Mostrar u ocultar
              </span>
            </span>
          }
        >
          <div className="border-t border-border p-0">
            <ConductorPanel
              compra={pipeline.compra}
              userId={pipeline.user.id}
              embedded
            />
          </div>
        </LazyDetails>
      ) : null}

      <ClientPipelineView
        pipeline={pipeline}
        visitadores={visitadores}
        bikes={bikes}
        productosCredito={productosCredito}
        inventarioProductos={inventarioProductos}
      />
    </div>
  );
}
