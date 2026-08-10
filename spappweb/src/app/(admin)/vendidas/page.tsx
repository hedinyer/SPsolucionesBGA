import { getAllVendidasMotos } from "@/lib/pipeline/queries";
import { VendidasManager } from "@/components/vendidas/vendidas-manager";
import { AdminHubSubnav } from "@/components/layout/admin-hub-subnav";
import { PageHeader } from "@/components/layout/page-header";

export default async function VendidasPage() {
  const motos = await getAllVendidasMotos();

  return (
    <div className="flex flex-col gap-6">
      <AdminHubSubnav hubId="motos" />
      <PageHeader
        title="En calle"
        description="Motos entregadas: estado físico, mora y acciones operativas."
      />
      <VendidasManager motos={motos} />
    </div>
  );
}
