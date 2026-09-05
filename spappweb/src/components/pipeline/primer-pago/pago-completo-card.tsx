"use client";

import { formatCop } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PagoCompletoCard({
  totalRecibido,
  onIrEntrega,
}: {
  totalRecibido: number;
  onIrEntrega?: () => void;
}) {
  return (
    <Card className="border-emerald-200 bg-emerald-50/80">
      <CardHeader>
        <CardTitle className="text-emerald-950">Pago completo</CardTitle>
        <p className="text-sm text-emerald-900/90" role="status">
          La moto queda lista para retiro. Recibido: {formatCop(totalRecibido)}.
        </p>
      </CardHeader>
      {onIrEntrega && (
        <CardContent>
          <Button type="button" onClick={onIrEntrega}>
            Ir a entrega
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
