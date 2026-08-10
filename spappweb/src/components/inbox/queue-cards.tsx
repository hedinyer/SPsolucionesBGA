import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { InboxQueue, InboxQueueId } from "@/lib/pipeline/types";

interface QueueCardsProps {
  queues: InboxQueue[];
}

export function QueueCards({ queues }: QueueCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {queues.map((queue) => (
        <QueueCard key={queue.id} queue={queue} />
      ))}
    </div>
  );
}

function QueueCard({ queue }: { queue: InboxQueue }) {
  const href =
    queue.id === "solicitudes_taller"
      ? "/solicitudes"
      : `/inbox?cola=${queue.id}`;
  const hasWork = queue.count > 0;

  return (
    <Link href={href} className="group block">
      <Card className="h-full transition-colors group-hover:bg-muted/40">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <CardTitle className="font-heading text-3xl tabular-nums sm:text-4xl">
              {queue.count}
            </CardTitle>
            <p className="text-base font-medium text-foreground">{queue.label}</p>
            <CardDescription>{queue.description}</CardDescription>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            {hasWork ? (
              <Badge variant="secondary">Pendiente</Badge>
            ) : (
              <Badge variant="outline">Al día</Badge>
            )}
            <ArrowRight
              className="size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              strokeWidth={1.5}
            />
          </div>
        </CardHeader>
      </Card>
    </Link>
  );
}

export function queueTitle(id: InboxQueueId): string {
  const map: Record<InboxQueueId, string> = {
    creditos: "Clientes sin visita",
    clientes_guillen: "Solicitudes Guillen",
    visitas_sin_asignar: "Visitas sin asignar",
    visitas_programadas: "Visitas programadas",
    pagos: "Pagos por confirmar",
    retiro: "Preparar retiro",
    entrega: "Registrar entrega",
    morosos: "Clientes en mora",
    recoger: "Motos para recoger",
    solicitudes_taller: "Solicitudes de taller",
  };
  return map[id];
}
