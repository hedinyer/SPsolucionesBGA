import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getAllBikes, getInboxListItems, getInboxQueues } from "@/lib/pipeline/queries";
import { InboxQueueList } from "@/components/inbox/inbox-queue-list";
import { InboxQueuesLive } from "@/components/inbox/inbox-queues-live";
import { queueTitle } from "@/components/inbox/queue-cards";
import type { InboxQueueId } from "@/lib/pipeline/types";
import { Button } from "@/components/ui/button";

const VALID_QUEUES: InboxQueueId[] = [
  "creditos",
  "visitas_sin_asignar",
  "visitas_programadas",
  "pagos",
  "retiro",
  "entrega",
  "morosos",
  "recoger",
  "solicitudes_taller",
];

function parseQueue(value: string | undefined): InboxQueueId | null {
  if (!value) return null;
  return VALID_QUEUES.includes(value as InboxQueueId)
    ? (value as InboxQueueId)
    : null;
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ cola?: string }>;
}) {
  const params = await searchParams;
  const queueId = parseQueue(params.cola);
  const [queues, bikes, items] = await Promise.all([
    getInboxQueues(),
    getAllBikes(),
    queueId ? getInboxListItems(queueId) : Promise.resolve([]),
  ]);

  if (!queueId) {
    return <InboxQueuesLive initialQueues={queues} bikes={bikes} />;
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">Hoy</h1>
        <p className="mt-1 text-muted-foreground">Cola de trabajo activa.</p>
      </div>

      <div className="flex flex-col gap-4">
        <Button variant="ghost" asChild className="gap-2 px-0">
          <Link href="/inbox">
            <ChevronLeft className="h-4 w-4" />
            Volver a Hoy
          </Link>
        </Button>
        <h2 className="text-lg font-medium">{queueTitle(queueId)}</h2>
        <InboxQueueList items={items} queueId={queueId} />
      </div>
    </div>
  );
}
