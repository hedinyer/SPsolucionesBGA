import type { BikeRow, ClientPipeline, ProductoCreditoRow, VisitadorRow } from "@/lib/pipeline/types";
import { motoListo } from "@/lib/pipeline/step-logic";
import { ClientStepper } from "@/components/pipeline/client-stepper";
import { FlowOrderPrompt } from "@/components/pipeline/flow-order-prompt";
import { CreditReviewPanel } from "@/components/pipeline/credit-review-panel";
import { ContractReadonlyPanel } from "@/components/pipeline/contract-readonly-panel";
import { ContractSharePanel } from "@/components/pipeline/contract-share-panel";
import { VisitActionPanel } from "@/components/pipeline/visit-action-panel";
import { AdminMotoAssignPanel } from "@/components/pipeline/admin-moto-assign-panel";
import { MotoSelectionPanel } from "@/components/pipeline/moto-selection-panel";
import { PaymentConfirmPanel } from "@/components/pipeline/payment-confirm-panel";
import { CreditProductsPanel } from "@/components/pipeline/credit-products-panel";
import { DeliveryPanel } from "@/components/pipeline/delivery-panel";
import { RentingPanel } from "@/components/pipeline/renting-panel";
import { MoraSummaryBanner } from "@/components/pipeline/mora-summary-banner";
import { TrackingPanel } from "@/components/pipeline/tracking-panel";

interface ClientPipelineViewProps {
  pipeline: ClientPipeline;
  visitadores: VisitadorRow[];
  bikes: BikeRow[];
  productosCredito: ProductoCreditoRow[];
}

export function ClientPipelineView({
  pipeline,
  visitadores,
  bikes,
  productosCredito,
}: ClientPipelineViewProps) {
  const { userId } = { userId: pipeline.user.id };
  const adminStep = pipeline.currentAdminStep;
  const contractId = pipeline.contract?.id ?? null;
  const contractSigned = pipeline.contract?.status === "firmado";
  const clienteCelular =
    typeof pipeline.contract?.hoja_vida_data?.celular === "string"
      ? (pipeline.contract.hoja_vida_data.celular as string)
      : null;
  const referenciasUsadas = pipeline.pagosHistorial
    .map((p) => p.referencia)
    .filter((r): r is string => Boolean(r?.trim()));
  const documentId = pipeline.document?.id;
  const showContractShare =
    pipeline.compra &&
    motoListo(pipeline.compra) &&
    pipeline.contract &&
    !contractSigned;
  const legacyClientMoto =
    contractSigned && !pipeline.compra && contractId;

  return (
    <div className="flex flex-col gap-8">
      <ClientStepper steps={pipeline.steps} />
      <FlowOrderPrompt
        compra={pipeline.compra}
        visita={pipeline.visita}
        userId={userId}
      />
      <MoraSummaryBanner pipeline={pipeline} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {adminStep === "credito" && pipeline.document && (
            <CreditReviewPanel
              document={pipeline.document}
              userId={userId}
              contractId={contractId}
              clienteCelular={clienteCelular}
              contractSigned={contractSigned}
            />
          )}
          {adminStep === "moto" && documentId && (
            <AdminMotoAssignPanel
              compra={pipeline.compra}
              bikes={bikes}
              userId={userId}
              documentId={documentId}
            />
          )}
          {showContractShare && (
            <ContractSharePanel
              contract={pipeline.contract!}
              compra={pipeline.compra!}
              userId={userId}
              pagos={pipeline.pagos}
              clienteCelular={clienteCelular}
            />
          )}
          {legacyClientMoto && (
            <MotoSelectionPanel
              contract={pipeline.contract}
              compra={pipeline.compra}
              contractId={contractId}
              clienteCelular={clienteCelular}
              userId={userId}
            />
          )}
          {adminStep === "pago" && (
            <>
              <CreditProductsPanel
                compra={pipeline.compra}
                items={pipeline.compraProductosCredito}
                catalogo={productosCredito}
                userId={userId}
              />
              <PaymentConfirmPanel
                compra={pipeline.compra}
                pagos={pipeline.pagos}
                userId={userId}
                referenciasUsadas={referenciasUsadas}
                clienteNombre={pipeline.displayName}
                clienteCedula={pipeline.user.user}
              />
            </>
          )}
          {(adminStep === "entrega" ||
            pipeline.compra?.estado === "entregada" ||
            pipeline.compra?.estado === "saldada") && (
            <DeliveryPanel
              compra={pipeline.compra}
              userId={userId}
              clienteCelular={clienteCelular}
              clienteNombre={pipeline.displayName}
            />
          )}
          {adminStep === "visita" && (
            <VisitActionPanel
              visita={pipeline.visita}
              visitadores={visitadores}
              userId={userId}
              compra={pipeline.compra}
              referralSource={pipeline.document?.referral_source}
            />
          )}
          {pipeline.compra?.estado === "entregada" && (
            <RentingPanel pipeline={pipeline} userId={userId} />
          )}

          {!adminStep &&
            pipeline.compra?.estado !== "entregada" &&
            pipeline.compra?.estado !== "saldada" &&
            !showContractShare &&
            !legacyClientMoto && (
            <div className="rounded-lg border border-border bg-muted/50 px-6 py-10 text-center text-sm text-muted-foreground">
              No hay acciones pendientes de tu parte. El cliente continúa en
              la app.
            </div>
          )}

          <details className="rounded-lg border border-border">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
              Ver historial del proceso
            </summary>
            <div className="flex flex-col gap-4 border-t border-border p-4">
              {pipeline.document && adminStep !== "credito" && (
                <CreditReviewPanel
                  document={pipeline.document}
                  userId={userId}
                  contractId={contractId}
                  clienteCelular={clienteCelular}
                  contractSigned={contractSigned}
                />
              )}
              <ContractReadonlyPanel contract={pipeline.contract} />
              <MotoSelectionPanel
                contract={pipeline.contract}
                compra={pipeline.compra}
                contractId={contractId}
                clienteCelular={clienteCelular}
                userId={userId}
              />
              {adminStep !== "pago" && (
                <>
                  <CreditProductsPanel
                    compra={pipeline.compra}
                    items={pipeline.compraProductosCredito}
                    catalogo={productosCredito}
                    userId={userId}
                  />
                  <PaymentConfirmPanel
                    compra={pipeline.compra}
                    pagos={pipeline.pagos}
                    userId={userId}
                    referenciasUsadas={referenciasUsadas}
                  />
                </>
              )}
              {adminStep !== "entrega" &&
                pipeline.compra?.estado !== "entregada" &&
                pipeline.compra?.estado !== "saldada" && (
                <DeliveryPanel
                  compra={pipeline.compra}
                  userId={userId}
                  clienteCelular={clienteCelular}
                  clienteNombre={pipeline.displayName}
                />
              )}
              {adminStep !== "visita" && (
                <VisitActionPanel
                  visita={pipeline.visita}
                  visitadores={visitadores}
                  userId={userId}
                  compra={pipeline.compra}
                  referralSource={pipeline.document?.referral_source}
                />
              )}
            </div>
          </details>
        </div>

        <div className="flex flex-col gap-6">
          <TrackingPanel
            tracking={pipeline.tracking}
            userId={userId}
            moroso={pipeline.moroso}
            recoger={pipeline.recoger}
            atraso={pipeline.atraso}
          />
        </div>
      </div>
    </div>
  );
}
