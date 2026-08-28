import { VentaShell } from "@/components/venta/venta-shell";
import { AdminHubSubnav } from "@/components/layout/admin-hub-subnav";
import { getCajaSesionHoy } from "@/lib/actions/caja-actions";

export default async function VentaPage() {
  const sesion = await getCajaSesionHoy().catch(() => null);

  return (
    <div className="flex flex-col gap-6">
      <AdminHubSubnav hubId="tienda" />
      <VentaShell initialSesion={sesion} />
    </div>
  );
}
