import { getAllProductosCredito } from "@/lib/pipeline/queries";
import { ProductosCreditoManager } from "@/components/productos-credito/productos-credito-manager";
import { AdminHubSubnav } from "@/components/layout/admin-hub-subnav";
import { PageHeader } from "@/components/layout/page-header";

export default async function ProductosCreditoPage() {
  const productos = await getAllProductosCredito();

  return (
    <div className="flex flex-col gap-6">
      <AdminHubSubnav hubId="tienda" />
      <PageHeader
        title="Extras a cuotas"
        description="Cosas que el cliente paga poco a poco."
      />
      <ProductosCreditoManager productos={productos} />
    </div>
  );
}
