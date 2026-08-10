import { getGarajeMotosVendidas } from "@/lib/pipeline/queries";
import { MotosVendidasTable } from "@/components/vendidas/motos-vendidas-table";
import { AdminHubSubnav } from "@/components/layout/admin-hub-subnav";
import { PageHeader } from "@/components/layout/page-header";

export default async function MotosVendidasPage() {
  const motos = await getGarajeMotosVendidas();

  return (
    <div className="flex flex-col gap-6">
      <AdminHubSubnav hubId="motos" />
      <PageHeader
        title="Vendidas"
        description="Unidades de garaje ya vendidas: placa, condición y cliente."
      />
      <MotosVendidasTable motos={motos} />
    </div>
  );
}
