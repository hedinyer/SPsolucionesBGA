"use client";

import {
  TARIFA_ESTADO_LABELS,
  type TarifaProductoCreditoRow,
} from "@/lib/pipeline/types";
import { formatCop, formatDateOnly } from "@/lib/utils/format";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function ProductoCreditoTalonario({
  tarifas,
}: {
  tarifas: TarifaProductoCreditoRow[];
}) {
  if (tarifas.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Aún no hay talonario de cuotas para este producto.
      </p>
    );
  }

  const sorted = [...tarifas].sort(
    (a, b) => a.numero_periodo - b.numero_periodo,
  );
  const pagadas = sorted.filter((t) => t.estado === "pagada").length;

  return (
    <div className="mt-3 rounded-lg border border-border">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <p className="text-sm font-medium">Talonario del producto</p>
        <p className="text-xs text-muted-foreground">
          {pagadas} de {sorted.length} días pagados
        </p>
      </div>
      <div className="max-h-64 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">Día</TableHead>
              <TableHead>Vence</TableHead>
              <TableHead>Monto</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium tabular-nums">
                  #{t.numero_periodo}
                </TableCell>
                <TableCell className="text-sm">
                  {formatDateOnly(t.fecha_vencimiento)}
                </TableCell>
                <TableCell className="text-sm tabular-nums">
                  {formatCop(t.monto_esperado)}
                  {t.monto_pagado != null &&
                  t.monto_pagado > 0 &&
                  t.estado !== "pagada"
                    ? ` · abonado ${formatCop(t.monto_pagado)}`
                    : ""}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={t.estado === "pagada" ? "outline" : "secondary"}
                    className={
                      t.estado === "pagada"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : t.estado === "vencida"
                          ? "border-red-200 bg-red-50 text-red-800"
                          : undefined
                    }
                  >
                    {TARIFA_ESTADO_LABELS[t.estado]}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
        Este talonario es independiente del de la moto. Los abonos de “Cuotas
        diarias” se aplican aquí en orden.
      </p>
    </div>
  );
}
