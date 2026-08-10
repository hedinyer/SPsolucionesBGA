import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAvailableBikes,
  getGarajeMotosDisponiblesCredito,
} from "@/lib/pipeline/queries";
import { MotoSelectionFlow } from "@/components/contrato/moto-selection-flow";
import {
  FRECUENCIA_LABELS,
  COMPRA_ESTADO_LABELS,
  type FrecuenciaPago,
  type MotoCompraEstado,
} from "@/lib/pipeline/types";
import { formatCop } from "@/lib/utils/format";

export const metadata = { title: "Elegir moto" };

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border-2 border-border bg-background p-6 text-center">
      <h1 className="text-xl font-bold text-foreground">{title}</h1>
      <p className="mt-2 text-base leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

export default async function MotoPage({
  params,
}: {
  params: Promise<{ contractId: string }>;
}) {
  const { contractId } = await params;
  const supabase = createAdminClient();

  const { data: contract } = await supabase
    .from("digital_contracts")
    .select("id, user_id, status")
    .eq("id", contractId)
    .maybeSingle();

  if (!contract) {
    return (
      <Notice
        title="Enlace no válido"
        body="No encontramos este enlace. Pide a tu asesor uno nuevo."
      />
    );
  }

  if (contract.status !== "firmado") {
    return (
      <Notice
        title="Contrato pendiente"
        body="Primero debes firmar tu contrato. Pide el link de firma a tu asesor."
      />
    );
  }

  const { data: compra } = await supabase
    .from("user_moto_compra")
    .select(
      "modelo, color, frecuencia_pago, monto_total_primer_pago, estado",
    )
    .eq("user_id", contract.user_id)
    .maybeSingle();

  if (compra) {
    const freq = FRECUENCIA_LABELS[compra.frecuencia_pago as FrecuenciaPago];
    const estado = COMPRA_ESTADO_LABELS[compra.estado as MotoCompraEstado];
    return (
      <Notice
        title="Moto ya elegida"
        body={`Ya registraste ${compra.modelo} · ${compra.color} (${freq}). Estado: ${estado}. Total primer pago: ${formatCop(compra.monto_total_primer_pago)}.`}
      />
    );
  }

  const [bikes, garajeMotos] = await Promise.all([
    getAvailableBikes(),
    getGarajeMotosDisponiblesCredito(),
  ]);
  return (
    <MotoSelectionFlow
      contractId={contract.id}
      bikes={bikes}
      garajeMotos={garajeMotos}
    />
  );
}
