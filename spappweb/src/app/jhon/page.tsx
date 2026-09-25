import { JhonClientesList } from "@/components/jhon/jhon-clientes-list";
import { PageHeader } from "@/components/layout/page-header";
import {
  JHON_FECHA_DESDE,
  JHON_FECHA_HASTA,
  listClientesJhon,
} from "@/lib/jhon/queries";
import { formatDateOnly } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Clientes Jhon",
  description: "Clientes que compraron del 17 al 20 de septiembre de 2026.",
};

export default async function JhonPage() {
  const clients = await listClientesJhon();

  return (
    <div className="min-h-dvh bg-muted/30">
      <div className="mx-auto flex max-w-[1313px] flex-col gap-6 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-8">
        <PageHeader
          title="Clientes para Jhon"
          description={`Compras del ${formatDateOnly(JHON_FECHA_DESDE)} al ${formatDateOnly(JHON_FECHA_HASTA)}. Teléfono para copiar y WhatsApp para llamar.`}
        />
        <JhonClientesList clients={clients} />
      </div>
    </div>
  );
}
