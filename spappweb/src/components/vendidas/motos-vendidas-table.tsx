import { User } from "lucide-react";
import type { GarajeMotoVendidaRow } from "@/lib/pipeline/types";
import { GARAJE_CONDICION_LABELS } from "@/lib/pipeline/types";
import { formatDate } from "@/lib/utils/format";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function Selfie({ src, alt }: { src: string | null; alt: string }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className="h-11 w-11 rounded-lg border border-border object-cover"
      />
    );
  }
  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
      <User className="h-4 w-4" />
    </div>
  );
}

export function MotosVendidasTable({
  motos,
}: {
  motos: GarajeMotoVendidaRow[];
}) {
  if (motos.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Sin vendidas</EmptyTitle>
          <EmptyDescription>
            Cuando una unidad de garaje se entregue o se marque vendida, aparece
            aquí.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cliente</TableHead>
            <TableHead>Placa</TableHead>
            <TableHead>Referencia</TableHead>
            <TableHead>Modelo</TableHead>
            <TableHead>Color</TableHead>
            <TableHead>Condición</TableHead>
            <TableHead>Fecha de venta</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {motos.map((m) => (
            <TableRow key={m.id}>
              <TableCell>
                <Selfie src={m.selfieUrl} alt={`Cliente ${m.placa ?? ""}`} />
              </TableCell>
              <TableCell className="font-medium">{m.placa ?? "—"}</TableCell>
              <TableCell>{m.referencia || "—"}</TableCell>
              <TableCell>{m.modelo}</TableCell>
              <TableCell>{m.color}</TableCell>
              <TableCell>{GARAJE_CONDICION_LABELS[m.condicion]}</TableCell>
              <TableCell>{formatDate(m.fechaVenta)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
