import { HistorialPagosClient } from "@/components/historial-pagos/historial-pagos-client";
import { PageHeader } from "@/components/layout/page-header";

export const dynamic = "force-dynamic";

export default function HistorialPagosPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title="Historial de pagos"
        description="Pagos ya confirmados. Filtra por día o por cliente."
      />
      <HistorialPagosClient />
    </div>
  );
}
