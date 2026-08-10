import { CajaCuadrePanel } from "@/components/caja/caja-cuadre-panel";
import { CajaProductosManager } from "@/components/caja/caja-productos-manager";
import { AdminHubSubnav } from "@/components/layout/admin-hub-subnav";
import { PageHeader } from "@/components/layout/page-header";
import { getCajaSesionHoy } from "@/lib/actions/caja-actions";

export default async function CajaPage() {
  const sesion = await getCajaSesionHoy().catch(() => null);

  return (
    <div className="flex flex-col gap-6">
      <AdminHubSubnav hubId="tienda" />
      <PageHeader
        title="Caja"
        description="Abre y cierra la caja del día, y factura carritos del móvil."
      />
      <CajaCuadrePanel initialSesion={sesion} />
      <CajaProductosManager />
    </div>
  );
}
