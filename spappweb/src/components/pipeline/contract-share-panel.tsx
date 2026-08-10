"use client";

import { Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import type { DigitalContractRow, PagoRow, UserMotoCompraRow } from "@/lib/pipeline/types";
import { formatCop } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FrecuenciaPagoEditor } from "@/components/pipeline/frecuencia-pago-editor";
import { getSiteUrl } from "@/lib/utils/site-url";

interface ContractSharePanelProps {
  contract: DigitalContractRow;
  compra: UserMotoCompraRow;
  userId: number;
  pagos?: PagoRow[];
  clienteCelular?: string | null;
}

export function ContractSharePanel({
  contract,
  compra,
  userId,
  pagos = [],
  clienteCelular,
}: ContractSharePanelProps) {
  const link = `${getSiteUrl()}/contrato/${contract.id}`;

  function copy() {
    navigator.clipboard
      .writeText(link)
      .then(() => toast.success("Link copiado."))
      .catch(() => toast.error("No se pudo copiar."));
  }

  const mensaje = `Hola, tu moto ${compra.modelo} ${compra.color} (placa ${compra.placa}) está lista. Firma tu contrato aquí: ${link}`;
  const digits = (clienteCelular ?? "").replace(/\D/g, "");
  const waBase = digits ? `https://wa.me/57${digits}` : "https://wa.me/";
  const waUrl = `${waBase}?text=${encodeURIComponent(mensaje)}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contrato listo para firmar</CardTitle>
        <p className="text-sm text-muted-foreground">
          El cliente debe firmar con los datos de la moto asignada.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Moto</dt>
            <dd className="font-medium">
              {compra.modelo} · {compra.color}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Placa</dt>
            <dd className="font-medium">{compra.placa}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Chasis</dt>
            <dd>{compra.chasis}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Frecuencia</dt>
            <dd>
              <FrecuenciaPagoEditor
                compra={compra}
                userId={userId}
                pagos={pagos}
                compact
              />
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Total primer pago</dt>
            <dd className="text-lg font-semibold">
              {formatCop(compra.monto_total_primer_pago)}
            </dd>
          </div>
        </dl>
        <div className="flex flex-col gap-3 rounded-lg border border-green-300 bg-green-50 p-4">
          <p className="text-sm font-medium text-green-900">
            Link de firma del contrato
          </p>
          <p className="break-all rounded-md border border-green-200 bg-background px-3 py-2 text-xs text-foreground">
            {link}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={copy}>
              <Copy className="mr-1.5 h-4 w-4" />
              Copiar link
            </Button>
            <Button
              size="sm"
              className="bg-green-600 text-white hover:bg-green-700"
              asChild
            >
              <a href={waUrl} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="mr-1.5 h-4 w-4" />
                Enviar por WhatsApp
              </a>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
