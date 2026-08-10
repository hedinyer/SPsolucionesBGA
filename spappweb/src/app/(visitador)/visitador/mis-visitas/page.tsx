import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, MapPin } from "lucide-react";
import {
  getVisitadorSession,
  hasVisitadorAccess,
} from "@/lib/auth/visitador-session";
import { createAnonClient } from "@/lib/supabase/anon";
import type { VisitaRow } from "@/lib/pipeline/types";
import { formatDate } from "@/lib/utils/format";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function MisVisitasPage() {
  const session = await getVisitadorSession();
  if (!hasVisitadorAccess(session)) {
    redirect("/visitador/login");
  }

  const anon = createAnonClient();
  const { data, error } = await anon.rpc("get_visitas_asignadas", {
    p_visitador_id: session.visitadorId,
  });

  if (error) {
    return (
      <p className="text-center text-sm text-destructive">
        No se pudieron cargar las visitas: {error.message}
      </p>
    );
  }

  const visitas = (data ?? []) as VisitaRow[];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">Hola, {session.username}</h1>
        <p className="text-sm text-muted-foreground">
          {visitas.length === 0
            ? "No tienes visitas asignadas por ahora."
            : `${visitas.length} visita(s) pendiente(s)`}
        </p>
      </div>

      {visitas.length === 0 ? (
        <Card className="border-border shadow-none">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Cuando el administrador te asigne una visita, aparecerá aquí.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {visitas.map((visita) => (
            <li key={visita.id}>
              <Link href={`/visitador/visitas/${visita.id}`}>
                <Card className="border-border shadow-none transition-colors hover:bg-muted/50">
                  <CardContent className="flex items-center justify-between gap-3 py-4 min-h-[4.5rem]">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {visita.cliente_nombre ?? "Cliente"}
                      </p>
                      <p className="mt-1 flex items-start gap-1 text-sm text-muted-foreground">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">
                          {[visita.direccion_visita, visita.barrio]
                            .filter(Boolean)
                            .join(", ") || "Sin dirección"}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(visita.fecha_programada)}
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
