import Link from "next/link";
import { VentaManager } from "@/components/venta/venta-manager";
import { AdminHubSubnav } from "@/components/layout/admin-hub-subnav";
import { PageHeader } from "@/components/layout/page-header";
import { getCajaSesionHoy } from "@/lib/actions/caja-actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default async function VentaPage() {
  const sesion = await getCajaSesionHoy().catch(() => null);
  const cajaAbierta = Boolean(sesion?.abierta);

  return (
    <div className="flex flex-col gap-6">
      <AdminHubSubnav hubId="tienda" />
      <PageHeader
        title="Repuestos y accesorios"
        description="Escanea repuestos, arma el carrito y envía la cotización por WhatsApp."
      />
      {!cajaAbierta ? (
        <Link href="/caja" className="block">
          <Alert className="caja-monto-blink border-transparent">
            <AlertTitle>Caja aún no abierta</AlertTitle>
            <AlertDescription>
              Abre la caja para empezar a vender.
            </AlertDescription>
          </Alert>
        </Link>
      ) : null}
      <VentaManager />
    </div>
  );
}
