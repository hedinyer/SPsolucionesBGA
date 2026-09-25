"use client";

import Link from "next/link";
import { Bike, Copy, User } from "lucide-react";
import { toast } from "sonner";
import type { JhonCliente } from "@/lib/jhon/types";
import { COMPRA_ESTADO_LABELS } from "@/lib/pipeline/types";
import { formatCop, formatDateOnly } from "@/lib/utils/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

function PhotoThumb({
  src,
  alt,
  fallback,
}: {
  src: string | null;
  alt: string;
  fallback: "user" | "bike";
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt} className="h-full w-full object-cover" />
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
      {fallback === "user" ? (
        <User className="h-7 w-7" />
      ) : (
        <Bike className="h-7 w-7" />
      )}
    </div>
  );
}

function CanceladoStamp() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
      aria-hidden
    >
      <span
        className={cn(
          "absolute right-[-0.5rem] top-8 select-none border-[3px] border-red-600",
          "rotate-[-28deg] px-3 py-1 text-2xl font-black uppercase tracking-[0.2em] text-red-600",
          "opacity-90 shadow-sm sm:right-0 sm:top-10 sm:px-4 sm:text-3xl",
        )}
      >
        Cancelado
      </span>
    </div>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
      fill="currentColor"
    >
      <path d="M17.47 14.38c-.28-.14-1.65-.81-1.9-.91-.26-.09-.44-.14-.63.14-.19.28-.72.91-.89 1.1-.16.19-.33.21-.61.07-.28-.14-1.18-.43-2.25-1.38-.83-.74-1.39-1.65-1.55-1.93-.16-.28-.02-.43.12-.57.13-.13.28-.33.42-.49.14-.16.19-.28.28-.47.09-.19.05-.35-.02-.49-.07-.14-.63-1.51-.86-2.07-.23-.55-.46-.47-.63-.48h-.54c-.19 0-.49.07-.75.35-.26.28-.98.96-.98 2.34 0 1.38 1.01 2.72 1.15 2.91.14.19 1.98 3.02 4.8 4.24.67.29 1.2.46 1.61.59.68.22 1.29.19 1.78.11.54-.08 1.65-.67 1.88-1.32.23-.65.23-1.2.16-1.32-.07-.11-.25-.18-.53-.32ZM12.04 21.8h-.01a9.8 9.8 0 0 1-5-.1l-.36-.12-3.73.98 1-3.64-.24-.37a9.8 9.8 0 0 1-1.5-5.22 9.83 9.83 0 0 1 16.87-6.88 9.76 9.76 0 0 1-6.03 16.65Zm8.38-16.03A11.82 11.82 0 0 0 12.03 2C6.5 2 2 6.49 2 12.01c0 1.76.46 3.48 1.34 5L2 22l5.14-1.35a10.04 10.04 0 0 0 4.89 1.24h.01c5.53 0 10.03-4.49 10.03-10.01 0-2.67-1.04-5.18-2.93-7.07Z" />
    </svg>
  );
}

function whatsappHref(celular: string): string | null {
  const chunks = celular.match(/\d{10,}/g) ?? [];
  const local = chunks.find((n) => n.startsWith("3") && n.length === 10);
  const raw = local ?? chunks[0] ?? celular.replace(/\D/g, "");
  if (raw.length < 10) return null;
  const withCountry = raw.startsWith("57") ? raw : `57${raw.slice(-10)}`;
  return `https://wa.me/${withCountry}`;
}

function copyCelular(celular: string) {
  navigator.clipboard
    .writeText(celular)
    .then(() => toast.success("Teléfono copiado."))
    .catch(() => toast.error("No se pudo copiar."));
}

export function JhonClientesList({ clients }: { clients: JhonCliente[] }) {
  if (clients.length === 0) {
    return (
      <Empty className="border border-dashed border-border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <User />
          </EmptyMedia>
          <EmptyTitle>Sin compras en esas fechas</EmptyTitle>
          <EmptyDescription>
            No hay clientes con fecha de venta del 17 al 20 de septiembre de
            2026.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {clients.length} cliente{clients.length === 1 ? "" : "s"}
      </p>
      <ul className="grid gap-4 lg:grid-cols-2">
        {clients.map((client) => {
          const cancelado = client.compraEstado === "cancelada";
          const waUrl = client.celular ? whatsappHref(client.celular) : null;
          return (
            <li
              key={client.compraId ?? client.userId}
              className={cn(
                "relative overflow-hidden rounded-xl border border-border bg-background",
                cancelado && "border-red-200 bg-red-50/30",
              )}
            >
              {cancelado ? <CanceladoStamp /> : null}
              <div className="flex">
                <div className="flex w-[6.5rem] shrink-0 flex-col border-r border-border sm:w-32">
                  <div className="relative aspect-square overflow-hidden bg-muted/50">
                    <PhotoThumb
                      src={client.selfieUrl}
                      alt={`Foto de ${client.displayName}`}
                      fallback="user"
                    />
                    <span className="absolute bottom-1 left-1 rounded bg-foreground/70 px-1.5 py-0.5 text-[10px] font-medium text-background">
                      Cliente
                    </span>
                  </div>
                  <div className="relative aspect-square overflow-hidden border-t border-border bg-muted/50">
                    <PhotoThumb
                      src={client.motoImagenUrl}
                      alt={
                        client.motoLabel ? `Moto ${client.motoLabel}` : "Moto"
                      }
                      fallback="bike"
                    />
                    <span className="absolute bottom-1 left-1 rounded bg-foreground/70 px-1.5 py-0.5 text-[10px] font-medium text-background">
                      {client.placa ?? "Moto"}
                    </span>
                  </div>
                </div>

                <div className="flex min-w-0 flex-1 flex-col">
                  <Link
                    href={`/clientes/${client.userId}`}
                    className="min-w-0 flex-1 p-4 hover:bg-muted/50"
                  >
                    <div className="flex flex-col gap-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{client.displayName}</p>
                        {client.vigilado ? (
                          <span className="vigilado-pulse text-sm font-bold">
                            <span aria-hidden>!</span>
                            Cliente vigilado
                          </span>
                        ) : null}
                        {client.motoRecogida && !cancelado ? (
                          <span className="text-sm font-bold uppercase tracking-wide text-foreground">
                            MOTO RECOGIDA
                          </span>
                        ) : null}
                        {client.compraEstado && (
                          <Badge variant="outline" className="text-xs">
                            {COMPRA_ESTADO_LABELS[client.compraEstado]}
                          </Badge>
                        )}
                        {client.compraEstado &&
                          !client.motoRecogida &&
                          !cancelado &&
                          (client.diasAtraso > 0 ? (
                            <Badge
                              variant="outline"
                              className="border-red-200 bg-red-50 text-xs text-red-800"
                            >
                              {client.diasAtraso} día
                              {client.diasAtraso === 1 ? "" : "s"} atraso
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-emerald-200 bg-emerald-50 text-xs text-emerald-800"
                            >
                              Al día
                            </Badge>
                          ))}
                      </div>
                      {client.vigilado && client.notaVigilancia ? (
                        <p className="text-sm font-medium text-foreground">
                          {client.notaVigilancia}
                        </p>
                      ) : null}
                      <p className="text-sm text-muted-foreground">
                        @{client.username}
                        {client.cedula ? ` · C.C. ${client.cedula}` : ""}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Referido por {client.referralLabel}
                      </p>
                      {(client.placa || client.motoLabel) && (
                        <p className="text-sm text-muted-foreground">
                          {client.placa ? `Placa ${client.placa}` : null}
                          {client.placa && client.motoLabel ? " · " : null}
                          {client.motoLabel}
                        </p>
                      )}
                      {client.fechaVenta && (
                        <p className="text-base text-muted-foreground">
                          Fecha de venta{" "}
                          <span className="font-bold text-foreground">
                            {formatDateOnly(client.fechaVenta)}
                          </span>
                        </p>
                      )}
                      {client.cuotasPagadas > 0 && (
                        <p className="text-sm text-muted-foreground">
                          {client.cuotasPagadas} cuota
                          {client.cuotasPagadas === 1 ? "" : "s"} pagada
                          {client.cuotasPagadas === 1 ? "" : "s"}
                        </p>
                      )}
                      {client.montoAdeudado > 0 ? (
                        <p className="text-base text-muted-foreground">
                          Debe{" "}
                          <span className="font-bold text-red-700">
                            {formatCop(client.montoAdeudado)}
                          </span>
                        </p>
                      ) : null}
                    </div>
                  </Link>

                  <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
                    {client.celular ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="font-mono"
                          onClick={() => copyCelular(client.celular!)}
                        >
                          <Copy className="mr-1.5 h-4 w-4" />
                          <span className="select-all">{client.celular}</span>
                        </Button>
                        {waUrl ? (
                          <Button
                            asChild
                            size="sm"
                            className="bg-[#25D366] text-white hover:bg-[#1ebe5d]"
                          >
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`Abrir WhatsApp de ${client.displayName}`}
                            >
                              <WhatsAppIcon className="mr-1.5 h-4 w-4" />
                              WhatsApp
                            </a>
                          </Button>
                        ) : null}
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Sin teléfono
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
