import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAllBikes, getAllGarajeParqueaderos } from "@/lib/pipeline/queries";
import { NewMotoForm } from "@/components/garaje/new-moto-form";

export default async function NuevaMotoGarajePage({
  searchParams,
}: {
  searchParams: Promise<{ modelo?: string; color?: string }>;
}) {
  const params = await searchParams;
  const [parqueaderos, bikes] = await Promise.all([
    getAllGarajeParqueaderos(),
    getAllBikes(),
  ]);
  const parqueaderosActivos = parqueaderos.filter((p) => p.activo);
  const catalogoBikes = bikes.filter((b) => b.activo);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href="/garaje"
          className="inline-flex min-h-11 touch-manipulation items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Volver al garaje
        </Link>
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Registrar moto</h1>
          <p className="mt-1 text-muted-foreground">
            Elige un modelo del catálogo o escribe uno nuevo. Luego vende en
            Contado si aplica.
          </p>
        </div>
      </div>
      <NewMotoForm
        parqueaderos={parqueaderosActivos}
        catalogoBikes={catalogoBikes}
        initialModelo={params.modelo?.trim() ?? ""}
        initialColor={params.color?.trim() ?? ""}
      />
    </div>
  );
}
