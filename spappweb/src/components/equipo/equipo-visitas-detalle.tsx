import Link from "next/link";
import type {
  EquipoVisitaDetalleItem,
  EquipoVisitasDetalle,
} from "@/lib/pipeline/types";
import type { LeaderboardRow } from "@/lib/referrals";
import { EquipoLeaderboard } from "@/components/equipo/equipo-leaderboard";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function VisitasList({
  title,
  items,
}: {
  title: string;
  items: EquipoVisitaDetalleItem[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-heading text-lg font-semibold tracking-tight">
          {title}
        </h3>
        <span className="text-sm tabular-nums text-muted-foreground">
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Ninguna por ahora.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-background">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/clientes/${item.userId}`}
                className="flex items-center gap-3 px-3 py-3 hover:bg-muted/50"
              >
                <Avatar className="!size-14 shrink-0 after:rounded-full">
                  {item.selfieUrl ? (
                    <AvatarImage
                      src={item.selfieUrl}
                      alt={`Foto de ${item.displayName}`}
                    />
                  ) : null}
                  <AvatarFallback>{initials(item.displayName)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.displayName}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {[item.referralLabel, item.visitadorNombre]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function EquipoVisitasDetalle({
  leaderboard,
  asignadas,
  completadas,
}: EquipoVisitasDetalle & {
  leaderboard: LeaderboardRow[];
}) {
  return (
    <div className="flex flex-col gap-8">
      <EquipoLeaderboard
        rows={leaderboard}
        title="¿Quién hace más visitas?"
        emptyMessage="Aún no hay visitas completadas."
        totalLabel={(n) => `${n} visita${n === 1 ? "" : "s"} completadas`}
        itemLabel={(n) => (n === 1 ? "visita" : "visitas")}
      />
      <div className="grid gap-8 lg:grid-cols-2">
        <VisitasList title="Asignadas" items={asignadas} />
        <VisitasList title="Completadas" items={completadas} />
      </div>
    </div>
  );
}
