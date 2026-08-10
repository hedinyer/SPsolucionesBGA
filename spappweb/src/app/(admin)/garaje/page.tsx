import {
  getAllBikes,
  getAllGarajeMotos,
  getAllGarajeParqueaderos,
  getAllProductos,
  getGarajeMantenimientoItemsByMotoIds,
} from "@/lib/pipeline/queries";
import { GarajeManager } from "@/components/garaje/garaje-manager";
import { AdminHubSubnav } from "@/components/layout/admin-hub-subnav";
import { PageHeader } from "@/components/layout/page-header";

export default async function GarajePage({
  searchParams,
}: {
  searchParams: Promise<{ fotoPendiente?: string }>;
}) {
  const params = await searchParams;
  const [parqueaderos, motos, productos, bikes] = await Promise.all([
    getAllGarajeParqueaderos(),
    getAllGarajeMotos(),
    getAllProductos(),
    getAllBikes(),
  ]);

  const stockNuevo = bikes.filter((b) => b.activo && b.stock > 0);

  const motosConMantenimiento = motos.filter(
    (m) =>
      m.estado === "en_mantenimiento" ||
      m.estado === "disponible" ||
      m.estado === "retenida",
  );

  const mantenimientoByMoto = await getGarajeMantenimientoItemsByMotoIds(
    motosConMantenimiento.map((m) => m.id),
  );

  return (
    <div className="flex flex-col gap-6">
      <AdminHubSubnav hubId="motos" />
      <PageHeader
        title="Garaje"
        description="Unidades físicas en parqueaderos: nuevas, segunda mano y recuperadas por mora."
      />
      <GarajeManager
        parqueaderos={parqueaderos}
        motos={motos}
        stockNuevo={stockNuevo}
        productos={productos}
        mantenimientoByMoto={mantenimientoByMoto}
        initialFotoPendiente={params.fotoPendiente === "1"}
      />
    </div>
  );
}
