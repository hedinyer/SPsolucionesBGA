"use client";

import { Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import type { VisitadorRow } from "@/lib/pipeline/types";
import { visitadorPortalUrl } from "@/lib/utils/site-url";
import { Button } from "@/components/ui/button";

export function visitadorUsername(
  v: VisitadorRow | null | undefined,
): string | null {
  if (!v?.users) return null;
  if (Array.isArray(v.users)) {
    return v.users[0]?.user ?? null;
  }
  return v.users.user ?? null;
}

export function ShareVisitadorLink({
  nombre,
  username,
  telefono,
  compact = false,
}: {
  nombre: string;
  username?: string | null;
  telefono?: string | null;
  compact?: boolean;
}) {
  const link = visitadorPortalUrl(username);

  function copy() {
    navigator.clipboard
      .writeText(link)
      .then(() => toast.success("Link copiado."))
      .catch(() => toast.error("No se pudo copiar."));
  }

  const mensaje = `Hola ${nombre}, entra al portal de visitador para ver tus visitas asignadas: ${link}`;
  const digits = (telefono ?? "").replace(/\D/g, "");
  const waBase = digits ? `https://wa.me/57${digits}` : "https://wa.me/";
  const waUrl = `${waBase}?text=${encodeURIComponent(mensaje)}`;

  if (compact) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-9 touch-manipulation"
        onClick={copy}
      >
        <Copy className="mr-1.5 h-4 w-4" />
        Copiar link
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/50 p-4">
      <p className="text-sm font-medium text-foreground">
        Link del portal para {nombre}
      </p>
      <p className="break-all rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground">
        {link}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={copy}>
          <Copy className="mr-1.5 h-4 w-4" />
          Copiar link
        </Button>
        <Button
          size="sm"
          className="bg-green-600 text-white hover:bg-green-700"
          asChild
        >
          <a href={waUrl} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="mr-1.5 h-4 w-4" />
            Enviar por WhatsApp
          </a>
        </Button>
      </div>
    </div>
  );
}
