import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import {
  getActiveVisitadores,
  getAllBikes,
  getAllProductosCredito,
  getClientPipeline,
} from "@/lib/pipeline/queries";
import { ClientPipelineView } from "@/components/pipeline/client-pipeline-view";
import { ClientInfoSummary } from "@/components/clientes/client-info-summary";
import { ClientHeaderActions } from "@/components/clientes/client-header-actions";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";

export default async function ClientPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId: userIdStr } = await params;
  const userId = Number(userIdStr);
  if (!Number.isFinite(userId)) notFound();

  const [pipeline, visitadores, bikes, productosCredito] = await Promise.all([
    getClientPipeline(userId),
    getActiveVisitadores(),
    getAllBikes(),
    getAllProductosCredito(),
  ]);

  if (!pipeline) notFound();

  const esRenovacion =
    pipeline.compra?.admin_data?.es_renovacion === true ||
    (pipeline.contract?.contrato_data as { es_renovacion?: unknown } | undefined)
      ?.es_renovacion === true;

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" asChild className="w-fit gap-2 px-0">
        <Link href="/clientes">
          <ChevronLeft data-icon="inline-start" />
          Volver a Clientes
        </Link>
      </Button>

      <PageHeader
        title={
          <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span>{pipeline.displayName}</span>
            {esRenovacion ? (
              <span className="text-base font-bold uppercase tracking-wide text-red-600 sm:text-lg">
                RENOVACION
              </span>
            ) : null}
          </span>
        }
        description={`Usuario @${pipeline.user.user} · ID ${pipeline.user.id}`}
        action={<ClientHeaderActions pipeline={pipeline} />}
      />

      <ClientInfoSummary pipeline={pipeline} bikes={bikes} />

      <ClientPipelineView
        pipeline={pipeline}
        visitadores={visitadores}
        bikes={bikes}
        productosCredito={productosCredito}
      />
    </div>
  );
}
