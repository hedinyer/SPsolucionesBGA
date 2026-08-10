"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { toast } from "sonner";
import { deleteClienteSinVisita } from "@/lib/actions/admin-actions";
import type { InboxListItem, InboxQueueId } from "@/lib/pipeline/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface InboxQueueListProps {
  items: InboxListItem[];
  queueId: InboxQueueId;
}

type CreditoFiltro = "pendiente" | "aceptada" | "rechazada";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function matchesCreditosSearch(item: InboxListItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    item.displayName,
    item.cedula,
    item.celular,
    item.username,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export function InboxQueueList({ items, queueId }: InboxQueueListProps) {
  const router = useRouter();
  const [list, setList] = useState(items);
  const [search, setSearch] = useState("");
  const [creditoFiltro, setCreditoFiltro] = useState<CreditoFiltro>("pendiente");
  const [pending, startTransition] = useTransition();
  const [toDelete, setToDelete] = useState<InboxListItem | null>(null);
  const canDelete = queueId === "creditos";
  const isCreditos = queueId === "creditos";
  const isClientesGuillen = queueId === "clientes_guillen";
  const hasSearch = isCreditos || isClientesGuillen;

  const visibleList = useMemo(
    () =>
      isCreditos
        ? list.filter(
            (item) =>
              item.estadoSolicitud === creditoFiltro &&
              matchesCreditosSearch(item, search),
          )
        : isClientesGuillen
          ? list.filter((item) => matchesCreditosSearch(item, search))
          : list,
    [isCreditos, isClientesGuillen, list, search, creditoFiltro],
  );

  useEffect(() => {
    setList(items);
  }, [items]);

  function confirmDelete() {
    if (!toDelete) return;
    const { userId, displayName } = toDelete;

    startTransition(async () => {
      try {
        await deleteClienteSinVisita(userId);
        setList((prev) => prev.filter((item) => item.userId !== userId));
        toast.success(`${displayName} eliminado.`);
        setToDelete(null);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo eliminar.");
      }
    });
  }

  if (list.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay items en esta cola.</p>;
  }

  return (
    <div className={hasSearch ? "flex flex-col gap-4" : undefined}>
      {hasSearch ? (
        <div className="flex flex-col gap-3">
          {isCreditos ? (
            <Tabs
              value={creditoFiltro}
              onValueChange={(value) =>
                setCreditoFiltro(value as CreditoFiltro)
              }
            >
              <TabsList className="w-full max-w-lg">
                <TabsTrigger value="pendiente" className="flex-1">
                  Pendiente
                </TabsTrigger>
                <TabsTrigger value="aceptada" className="flex-1">
                  Aprobado
                </TabsTrigger>
                <TabsTrigger value="rechazada" className="flex-1">
                  Rechazado
                </TabsTrigger>
              </TabsList>
            </Tabs>
          ) : null}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, cédula o celular…"
              className="min-h-11 pl-9"
            />
          </div>
        </div>
      ) : null}

      {visibleList.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {hasSearch && search.trim()
            ? `No hay clientes que coincidan con "${search.trim()}".`
            : isCreditos
              ? creditoFiltro === "pendiente"
                ? "No hay solicitudes pendientes sin visita."
                : creditoFiltro === "aceptada"
                  ? "No hay clientes con crédito aprobado sin visita."
                  : "No hay clientes con crédito rechazado sin visita."
              : isClientesGuillen
                ? "No hay clientes del link de Guillén."
                : "No hay items en esta cola."}
        </p>
      ) : (
      <ul className="divide-y divide-border rounded-lg border border-border">
        {visibleList.map((item) => (
          <li
            key={item.userId}
            className="flex items-stretch hover:bg-muted/50"
          >
            <Link
              href={`/clientes/${item.userId}`}
              className="flex min-w-0 flex-1 flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex shrink-0 items-center gap-2">
                  <Avatar className="!size-20 shrink-0 after:rounded-full sm:!size-24">
                    {item.selfieUrl ? (
                      <AvatarImage
                        src={item.selfieUrl}
                        alt={`Selfie de ${item.displayName}`}
                      />
                    ) : null}
                    <AvatarFallback className="text-base">
                      {initials(item.displayName)}
                    </AvatarFallback>
                  </Avatar>
                  {item.motoImagenUrl ? (
                    <Avatar className="!size-20 shrink-0 rounded-lg after:rounded-lg sm:!size-24">
                      <AvatarImage
                        src={item.motoImagenUrl}
                        alt={`Moto de ${item.displayName}`}
                        className="rounded-lg object-cover"
                      />
                      <AvatarFallback className="rounded-lg text-xs">
                        Moto
                      </AvatarFallback>
                    </Avatar>
                  ) : null}
                </div>
                <div className="min-w-0">
                  <p className="font-medium">{item.displayName}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {[
                      item.cedula ? `C.C. ${item.cedula}` : null,
                      item.celular || null,
                      item.subtitle,
                    ]
                      .filter(Boolean)
                      .join(" · ") || `@${item.username}`}
                  </p>
                </div>
              </div>
              <span className="text-sm font-medium text-foreground sm:text-muted-foreground">
                Abrir →
              </span>
            </Link>
            {canDelete ? (
              <div className="flex shrink-0 items-center pr-2 sm:pr-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Eliminar ${item.displayName}`}
                  disabled={pending}
                  onClick={() => setToDelete(item)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      )}

      <AlertDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setToDelete(null);
        }}
      >
        <AlertDialogContent className="bg-background">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete?.displayName}
              {toDelete?.cedula ? ` (C.C. ${toDelete.cedula})` : toDelete ? ` (@${toDelete.username})` : ""}.
              Se borrarán por completo su cuenta, solicitud, contrato, visitas,
              pagos, moto y archivos en Supabase. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
