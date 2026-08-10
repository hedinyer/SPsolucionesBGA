import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  getVisitadorSession,
  hasVisitadorAccess,
} from "@/lib/auth/visitador-session";
import { createAnonClient } from "@/lib/supabase/anon";
import type { VisitaRow } from "@/lib/pipeline/types";
import { VisitaEjecucionForm } from "@/components/visitador/visita-ejecucion-form";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function VisitaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getVisitadorSession();
  if (!hasVisitadorAccess(session)) {
    redirect("/visitador/login");
  }

  const anon = createAnonClient();
  const { data, error } = await anon.rpc("get_visitas_asignadas", {
    p_visitador_id: session.visitadorId,
  });

  if (error) notFound();

  const visitas = (data ?? []) as VisitaRow[];
  const visita = visitas.find((v) => v.id === id);
  if (!visita) notFound();

  return (
    <div className="space-y-4">
      <Button variant="ghost" asChild className="-ml-2 min-h-11 px-2">
        <Link href="/visitador/mis-visitas">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Volver
        </Link>
      </Button>
      <VisitaEjecucionForm visita={visita} visitadorId={session.visitadorId} />
    </div>
  );
}
