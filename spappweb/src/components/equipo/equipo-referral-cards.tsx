"use client";

import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { isHiddenEquipoReferral, REFERRAL_SOURCES } from "@/lib/referrals";
import { hojaVidaUrl } from "@/lib/utils/site-url";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function EquipoReferralCards() {
  // ponytail: Guillén/Yhosmer (otros PDV) fuera de Equipo BGA.
  const sources = REFERRAL_SOURCES.filter((s) => !isHiddenEquipoReferral(s.slug));

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {sources.map((source) => {
        // Punto de venta: /hojadevida sin ref (también vale ?ref=punto-de-venta).
        const link =
          source.slug === "punto-de-venta"
            ? hojaVidaUrl()
            : hojaVidaUrl(source.slug);

        function copy() {
          navigator.clipboard
            .writeText(link)
            .then(() => toast.success("Link copiado."))
            .catch(() => toast.error("No se pudo copiar."));
        }

        return (
          <Card key={source.slug} className="shadow-none">
            <CardHeader>
              <CardTitle>{source.label}</CardTitle>
              <CardDescription>
                {source.slug === "punto-de-venta"
                  ? "Link del local: /hojadevida (con o sin ?ref=punto-de-venta)."
                  : "Cada hoja de vida por este link queda registrada a su nombre para comisiones."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="break-all rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-foreground">
                {link}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={copy}>
                  <Copy className="mr-1.5 h-4 w-4" />
                  Copiar link
                </Button>
                <Button size="sm" variant="ghost" asChild>
                  <a href={link} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-1.5 h-4 w-4" />
                    Abrir
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
