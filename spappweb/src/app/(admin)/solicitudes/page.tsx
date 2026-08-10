import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getAllSolicitudesTaller } from "@/lib/pipeline/queries";
import { SolicitudesManager } from "@/components/solicitudes/solicitudes-manager";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";

export default async function SolicitudesPage() {
  const solicitudes = await getAllSolicitudesTaller();

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" asChild className="w-fit gap-2 px-0">
        <Link href="/inbox">
          <ChevronLeft data-icon="inline-start" />
          Volver a Hoy
        </Link>
      </Button>
      <PageHeader
        title="Solicitudes de taller"
        description="Repuestos, reparaciones y cambios de aceite solicitados por clientes."
      />
      <SolicitudesManager solicitudes={solicitudes} />
    </div>
  );
}
