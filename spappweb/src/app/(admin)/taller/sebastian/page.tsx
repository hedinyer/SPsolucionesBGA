import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import {
  countPendientesSebastian,
  getPendientesSebastian,
} from "@/lib/taller/queries";
import { SebastianApprovalPanel } from "@/components/taller/sebastian-approval-panel";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function SebastianPage() {
  const [ordenes, pendientes] = await Promise.all([
    getPendientesSebastian(),
    countPendientesSebastian(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" asChild className="w-fit gap-2 px-0">
        <Link href="/taller">
          <ChevronLeft data-icon="inline-start" />
          Volver al taller
        </Link>
      </Button>
      <PageHeader
        title="Sebastian"
        description={
          pendientes > 0
            ? `${pendientes} pedidos esperando tu OK. Al aprobar se descuenta del inventario.`
            : "Aprueba o rechaza repuestos. Al aprobar se descuenta del inventario."
        }
      />
      <SebastianApprovalPanel ordenes={ordenes} />
    </div>
  );
}
