import { searchClients, listClientesMotoCredito } from "@/lib/pipeline/queries";
import { ClientesSearchLive } from "@/components/clientes/clientes-search-live";
import { PageHeader } from "@/components/layout/page-header";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; nuevo?: string }>;
}) {
  const { q, nuevo } = await searchParams;
  const query = q?.trim() ?? "";
  const [results, creditClients] = await Promise.all([
    query.length >= 2 ? searchClients(query) : Promise.resolve([]),
    listClientesMotoCredito(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Clientes"
        description="Personas y pipeline: clientes con moto a crédito, ordenados por atraso. Busca por placa, cédula o nombre."
      />
      <ClientesSearchLive
        initialQuery={query}
        initialResults={results}
        creditClients={creditClients}
        initialShowCreate={nuevo === "1"}
      />
    </div>
  );
}
