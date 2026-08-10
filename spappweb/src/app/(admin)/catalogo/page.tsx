import { getAllBikes, getAllGarajeMotos } from "@/lib/pipeline/queries";
import { countStockSegundaMano } from "@/lib/garaje/stock-segunda";
import { CatalogoManager } from "@/components/catalogo/catalogo-manager";
import { AdminHubSubnav } from "@/components/layout/admin-hub-subnav";
import { PageHeader } from "@/components/layout/page-header";

export default async function CatalogoPage() {
  const [bikes, motosGaraje] = await Promise.all([
    getAllBikes(),
    getAllGarajeMotos(),
  ]);
  const stockSegunda = countStockSegundaMano(motosGaraje);

  return (
    <div className="flex flex-col gap-6">
      <AdminHubSubnav hubId="motos" />
      <PageHeader
        title="Modelos"
        description="Catálogo con precios, stock nuevo y segunda mano en patio. Desde aquí puedes registrar en garaje o vender al contado."
      />
      <CatalogoManager bikes={bikes} stockSegunda={stockSegunda} />
    </div>
  );
}
