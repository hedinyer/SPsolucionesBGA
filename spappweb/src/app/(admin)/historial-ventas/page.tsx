import { listVentasProductoHistorial } from "@/lib/actions/venta-producto-actions";
import { getVentasContado } from "@/lib/actions/venta-moto-actions";
import { listHistorialMotosCredito } from "@/lib/actions/historial-motos-actions";
import { HistorialVentasClient } from "@/components/historial-ventas/historial-ventas-client";
import { AdminHubSubnav } from "@/components/layout/admin-hub-subnav";
import { PageHeader } from "@/components/layout/page-header";

export const dynamic = "force-dynamic";

export default async function HistorialVentasPage() {
  const [ventas, ventasContado, creditosSaldados] = await Promise.all([
    listVentasProductoHistorial().catch(() => []),
    getVentasContado().catch(() => []),
    listHistorialMotosCredito().catch(() => []),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <AdminHubSubnav hubId="tienda" />
      <PageHeader
        title="Historial"
        description="Productos de inventario y motos (contado o crédito liquidado)."
      />
      <HistorialVentasClient
        ventas={ventas}
        ventasMotos={[
          ...ventasContado.map((v) => ({
            id: v.id,
            origen: "contado" as const,
            fecha: v.createdAt,
            clienteNombre: v.clienteNombre,
            clienteCedula: v.clienteCedula,
            placa: v.placa,
            modelo: v.modelo,
            color: v.color,
            monto: v.valorVenta ?? v.montoPagado,
            userId: null,
          })),
          ...creditosSaldados,
        ]}
      />
    </div>
  );
}
