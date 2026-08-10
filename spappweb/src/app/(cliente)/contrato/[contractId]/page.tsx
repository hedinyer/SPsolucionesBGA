import { createAdminClient } from "@/lib/supabase/admin";
import { buildContratoComercial } from "@/lib/contracts/contrato-renting-clausulas";
import {
  prefillFromHojaYContrato,
  resolveHojaVidaForContract,
} from "@/lib/contracts/contract-prefill";
import {
  TIPO_IDENTIFICACION_LABELS,
} from "@/lib/contracts/hoja-vida-schema";
import { ContractSignFlow } from "@/components/contrato/contract-sign-flow";
import type { FrecuenciaPago } from "@/lib/pipeline/types";

export const metadata = { title: "Firmar contrato" };

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border-2 border-border bg-background p-6 text-center">
      <h1 className="text-xl font-bold text-foreground">{title}</h1>
      <p className="mt-2 text-base leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

export default async function ContratoPage({
  params,
}: {
  params: Promise<{ contractId: string }>;
}) {
  const { contractId } = await params;

  const supabase = createAdminClient();
  const { data: contract } = await supabase
    .from("digital_contracts")
    .select(
      "id, user_id, status, hoja_vida_data, contrato_data, users_documents(estado_solicitud)",
    )
    .eq("id", contractId)
    .maybeSingle();

  if (!contract) {
    return (
      <Notice
        title="Enlace no válido"
        body="No encontramos este contrato. Pide a tu asesor un nuevo enlace."
      />
    );
  }

  const doc = contract.users_documents as
    | { estado_solicitud?: string }
    | { estado_solicitud?: string }[]
    | null;
  const estado = Array.isArray(doc) ? doc[0]?.estado_solicitud : doc?.estado_solicitud;

  if (estado !== "aceptada") {
    return (
      <Notice
        title="Crédito aún no aprobado"
        body="Cuando tu crédito sea aprobado podrás firmar el contrato desde este enlace."
      />
    );
  }

  if (contract.status === "firmado") {
    return (
      <Notice
        title="Contrato ya firmado"
        body="Este contrato ya fue firmado. No necesitas hacer nada más."
      />
    );
  }

  let { data: compra } = await supabase
    .from("user_moto_compra")
    .select(
      "modelo, color, placa, chasis, referencia, frecuencia_pago, cuota_inicial_monto, monto_cuota_periodo",
    )
    .eq("digital_contract_id", contractId)
    .maybeSingle();

  if (!compra) {
    const { data: byUser } = await supabase
      .from("user_moto_compra")
      .select(
        "modelo, color, placa, chasis, referencia, frecuencia_pago, cuota_inicial_monto, monto_cuota_periodo",
      )
      .eq("user_id", contract.user_id)
      .maybeSingle();
    compra = byUser;
  }

  if (!compra?.placa?.trim() || !compra?.chasis?.trim()) {
    return (
      <Notice
        title="Moto aún no asignada"
        body="Tu asesor debe asignar la moto y la placa antes de que puedas firmar. Te avisaremos cuando esté listo."
      />
    );
  }

  const hoja = await resolveHojaVidaForContract(
    supabase,
    contract.user_id as number,
    contract.hoja_vida_data as Record<string, unknown>,
  );

  if (!hoja.nombre_completo.trim() || !hoja.numero_identificacion.trim()) {
    return (
      <Notice
        title="Datos incompletos"
        body="No encontramos tu hoja de vida en el sistema. Pide a tu asesor que revise tu solicitud."
      />
    );
  }

  const prefill = prefillFromHojaYContrato(
    hoja,
    contract.contrato_data as Record<string, unknown> | null,
  );
  const tipoLabel = hoja.tipo_identificacion
    ? TIPO_IDENTIFICACION_LABELS[hoja.tipo_identificacion]
    : "";

  return (
    <ContractSignFlow
      contractId={contract.id}
      prefill={prefill}
      resumen={{
        nombre: hoja.nombre_completo,
        documento: `${tipoLabel} ${hoja.numero_identificacion}`.trim(),
        celular: hoja.celular,
        correo: hoja.correo,
      }}
      comercial={buildContratoComercial({
        modelo: compra.modelo as string,
        color: compra.color as string,
        placa: compra.placa as string,
        chasis: compra.chasis as string,
        referencia: (compra.referencia as string | null) ?? null,
        frecuencia_pago: compra.frecuencia_pago as FrecuenciaPago,
        cuota_inicial_monto: compra.cuota_inicial_monto as number,
        monto_cuota_periodo: compra.monto_cuota_periodo as number,
      })}
    />
  );
}
