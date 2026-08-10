import { redirect } from "next/navigation";
import {
  getAllVisitadores,
  getEquipoVisitasDetalle,
  getReferralLeaderboard,
  getReferralLinkLeaderboard,
} from "@/lib/pipeline/queries";
import { getAdminClientReferralScope } from "@/lib/auth/admin-client-scope";
import {
  commissionPeriodFromKey,
  currentCommissionPeriod,
} from "@/lib/referrals";
import { EquipoTabs } from "@/components/equipo/equipo-tabs";
import { PageHeader } from "@/components/layout/page-header";

// Métricas de comisión deben leer siempre datos frescos.
export const dynamic = "force-dynamic";

export default async function VisitadoresPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; tab?: string }>;
}) {
  if (await getAdminClientReferralScope()) {
    redirect("/inbox");
  }
  const params = await searchParams;
  const period =
    (params.periodo ? commissionPeriodFromKey(params.periodo) : null) ??
    currentCommissionPeriod();
  const range = {
    startIso: period.startIso,
    endExclusiveIso: period.endExclusiveIso,
  };

  const [visitadores, leaderboard, linkLeaderboard, visitasDetalle] =
    await Promise.all([
      getAllVisitadores(),
      getReferralLeaderboard(range),
      getReferralLinkLeaderboard(range),
      getEquipoVisitasDetalle(range),
    ]);

  const tab =
    params.tab === "metricas" ||
    params.tab === "visitadores" ||
    params.tab === "vendedores"
      ? params.tab
      : params.periodo
        ? "metricas"
        : "vendedores";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Equipo"
        description="Visitadores, vendedores y ranking de captación."
      />
      <EquipoTabs
        key={period.key}
        visitadores={visitadores}
        leaderboard={leaderboard}
        linkLeaderboard={linkLeaderboard}
        visitasDetalle={visitasDetalle}
        period={period}
        defaultTab={tab}
      />
    </div>
  );
}
