"use client";

import { Copy, Link2 } from "lucide-react";
import { toast } from "sonner";
import { referralLabel } from "@/lib/referrals";
import { hojaVidaUrl } from "@/lib/utils/site-url";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ScopedReferralLink({
  referralScope,
  collapsed = false,
  className,
}: {
  referralScope: string;
  collapsed?: boolean;
  className?: string;
}) {
  const link = hojaVidaUrl(referralScope);
  const label = referralLabel(referralScope) ?? referralScope;

  function copy() {
    navigator.clipboard
      .writeText(link)
      .then(() => toast.success("Link de hoja de vida copiado."))
      .catch(() => toast.error("No se pudo copiar."));
  }

  if (collapsed) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("size-8 text-muted-foreground", className)}
        onClick={copy}
        aria-label={`Copiar link de ${label}`}
        title={`Link ${label}`}
      >
        <Link2 className="size-4" strokeWidth={1.75} />
      </Button>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <p className="px-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">
        Mi link
      </p>
      <p className="break-all rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2.5 py-2 text-[11px] leading-snug text-sidebar-foreground">
        {link}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full justify-start gap-2"
        onClick={copy}
      >
        <Copy className="size-3.5 shrink-0" strokeWidth={1.75} />
        Copiar link
      </Button>
    </div>
  );
}
