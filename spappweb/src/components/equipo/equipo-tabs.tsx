"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type {
  CommissionPeriod,
  LeaderboardRow,
  ReferralLeaderboardRow,
} from "@/lib/referrals";
import { shiftCommissionPeriod } from "@/lib/referrals";
import type {
  EquipoVisitasDetalle as EquipoVisitasDetalleData,
  VisitadorRow,
} from "@/lib/pipeline/types";
import { EquipoReferralCards } from "@/components/equipo/equipo-referral-cards";
import { EquipoLeaderboard } from "@/components/equipo/equipo-leaderboard";
import { EquipoVisitasDetalle } from "@/components/equipo/equipo-visitas-detalle";
import { VisitadoresManager } from "@/components/visitadores/visitadores-manager";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function EquipoTabs({
  visitadores,
  leaderboard,
  linkLeaderboard,
  visitasDetalle,
  period,
  defaultTab = "vendedores",
}: {
  visitadores: VisitadorRow[];
  leaderboard: ReferralLeaderboardRow[];
  linkLeaderboard: ReferralLeaderboardRow[];
  visitasDetalle: EquipoVisitasDetalleData & {
    leaderboard: LeaderboardRow[];
  };
  period: CommissionPeriod;
  defaultTab?: string;
}) {
  const prev = shiftCommissionPeriod(period.key, -1);
  const next = shiftCommissionPeriod(period.key, 1);

  return (
    <Tabs defaultValue={defaultTab}>
      <TabsList className="h-auto w-full max-w-full gap-1 overflow-x-auto p-1">
        <TabsTrigger
          value="visitadores"
          className="min-h-11 flex-1 touch-manipulation px-3 sm:min-h-8"
        >
          Visitadores
        </TabsTrigger>
        <TabsTrigger
          value="vendedores"
          className="min-h-11 flex-1 touch-manipulation px-3 sm:min-h-8"
        >
          Vendedores
        </TabsTrigger>
        <TabsTrigger
          value="metricas"
          className="min-h-11 flex-1 touch-manipulation px-3 sm:min-h-8"
        >
          Métricas
        </TabsTrigger>
      </TabsList>

      <TabsContent value="visitadores" className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Personas que realizan visitas domiciliarias.
        </p>
        <VisitadoresManager visitadores={visitadores} />
      </TabsContent>

      <TabsContent value="vendedores" className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Links de hoja de vida para atribución de comisiones.
        </p>
        <EquipoReferralCards />
      </TabsContent>

      <TabsContent value="metricas" className="flex flex-col gap-12 pt-2">
        <PeriodNav period={period} prev={prev} next={next} />
        <EquipoLeaderboard
          rows={leaderboard}
          emptyMessage="Aún no hay compras a crédito atribuidas en este periodo."
          totalLabel={(n) =>
            `${n} compra${n === 1 ? "" : "s"} a crédito atribuidas`
          }
        />
        <EquipoLeaderboard
          rows={linkLeaderboard}
          title="¿Quién trae más clientes usando el link?"
          emptyMessage="Aún no hay hojas de vida atribuidas en este periodo."
          totalLabel={(n) =>
            `${n} hoja${n === 1 ? "" : "s"} de vida atribuidas`
          }
        />
        <EquipoVisitasDetalle
          leaderboard={visitasDetalle.leaderboard}
          asignadas={visitasDetalle.asignadas}
          completadas={visitasDetalle.completadas}
        />
      </TabsContent>
    </Tabs>
  );
}

function PeriodNav({
  period,
  prev,
  next,
}: {
  period: CommissionPeriod;
  prev: CommissionPeriod | null;
  next: CommissionPeriod | null;
}) {
  const href = (key: string) =>
    `/visitadores?tab=metricas&periodo=${encodeURIComponent(key)}`;

  // No avanzar a un ciclo que aún no empezó (día 20 en el futuro).
  const nextAllowed = next && new Date(next.startIso) <= new Date();

  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        Periodo de comisión
      </p>
      <div className="flex items-center gap-2">
        {prev ? (
          <Button asChild variant="outline" size="icon">
            <Link href={href(prev.key)} aria-label="Periodo anterior">
              <ChevronLeft />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="icon" disabled aria-label="Periodo anterior">
            <ChevronLeft />
          </Button>
        )}
        <p className="min-w-[12rem] text-center text-sm font-semibold capitalize sm:min-w-[16rem] sm:text-base">
          {period.label}
        </p>
        {nextAllowed && next ? (
          <Button asChild variant="outline" size="icon">
            <Link href={href(next.key)} aria-label="Periodo siguiente">
              <ChevronRight />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="icon" disabled aria-label="Periodo siguiente">
            <ChevronRight />
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Ciclos intercalados 20→5 y 5→20 · Bogotá
      </p>
    </div>
  );
}
