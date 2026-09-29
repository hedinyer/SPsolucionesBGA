import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getMecanicosConStats } from "@/lib/taller/queries";
import { MecanicosManager } from "@/components/taller/mecanicos-manager";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function MecanicosPage() {
  const mecanicos = await getMecanicosConStats();

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" asChild className="w-fit gap-2 px-0">
        <Link href="/taller">
          <ChevronLeft data-icon="inline-start" />
          Volver al taller
        </Link>
      </Button>
      <PageHeader
        title="Mecánicos"
        description="Quién está trabajando, cuánto lleva y ranking de la semana."
      />
      <MecanicosManager mecanicos={mecanicos} />
    </div>
  );
}
