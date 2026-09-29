import Link from "next/link";
import { UserCheck, Users } from "lucide-react";
import {
  countPendientesSebastian,
  getMecanicos,
  getTableroTaller,
} from "@/lib/taller/queries";
import { TallerOrdenesList } from "@/components/taller/taller-ordenes-list";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function TallerPage() {
  const [ordenes, mecanicos, pendientesSebastian] = await Promise.all([
    getTableroTaller(),
    getMecanicos(true),
    countPendientesSebastian(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Taller"
        description="Motos en reparación, tiempos y repuestos."
        action={
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" asChild className="min-h-11 gap-2">
              <Link href="/taller/sebastian">
                <UserCheck className="size-4" />
                Sebastian
                {pendientesSebastian > 0 ? (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                    {pendientesSebastian}
                  </span>
                ) : null}
              </Link>
            </Button>
            <Button variant="outline" asChild className="min-h-11 gap-2">
              <Link href="/taller/mecanicos">
                <Users className="size-4" />
                Mecánicos
              </Link>
            </Button>
          </div>
        }
      />

      <TallerOrdenesList ordenes={ordenes} mecanicos={mecanicos} />
    </div>
  );
}
