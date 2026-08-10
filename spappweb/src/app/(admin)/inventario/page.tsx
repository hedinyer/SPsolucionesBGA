import { getAllCategorias, getAllProductos } from "@/lib/pipeline/queries";
import { InventarioManager } from "@/components/inventario/inventario-manager";
import { AdminHubSubnav } from "@/components/layout/admin-hub-subnav";
import { PageHeader } from "@/components/layout/page-header";

export default async function InventarioPage() {
  const [categorias, productos] = await Promise.all([
    getAllCategorias(),
    getAllProductos(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <AdminHubSubnav hubId="tienda" />
      <PageHeader
        title="Stock"
        description="Repuestos, lubricantes y accesorios de la tienda."
      />
      <InventarioManager categorias={categorias} productos={productos} />
    </div>
  );
}
