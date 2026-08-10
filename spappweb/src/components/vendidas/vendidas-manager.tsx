"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bike, ExternalLink, Trash2, User } from "lucide-react";
import {
  deleteVendidaMoto,
  updateVendidaEstadoFisico,
} from "@/lib/actions/admin-actions";
import type { VendidaEstadoFisico, VendidaMotoRow } from "@/lib/pipeline/types";
import { VENDIDA_ESTADO_FISICO_LABELS } from "@/lib/pipeline/types";
import { getMoraDisplay } from "@/lib/pipeline/mora-utils";
import { formatCop } from "@/lib/utils/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { TouchSelect } from "@/components/ui/touch-select";
import { cn } from "@/lib/utils";

const estadoBadgeClass: Record<VendidaEstadoFisico, string> = {
  activa: "bg-emerald-50 text-emerald-800 border-emerald-200",
  recogida: "bg-amber-50 text-amber-800 border-amber-200",
  robada: "bg-red-50 text-red-800 border-red-200",
  en_transito: "bg-sky-50 text-sky-800 border-sky-200",
  en_patio: "bg-violet-50 text-violet-800 border-violet-200",
};

function pickUser(row: VendidaMotoRow): string {
  const users = row.users;
  if (!users) return `#${row.user_id}`;
  if (Array.isArray(users)) return users[0]?.user ?? `#${row.user_id}`;
  return users.user;
}

function PhotoThumb({
  src,
  alt,
  fallback,
}: {
  src: string | null | undefined;
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
        <User className="h-4 w-4" />
      ) : (
        <Bike className="h-4 w-4" />
      )}
    </div>
  );
}

function VendidaPhotos({ moto }: { moto: VendidaMotoRow }) {
  const name = pickUser(moto);
  return (
    <div className="flex shrink-0 gap-1.5">
      <div className="h-11 w-11 overflow-hidden rounded-lg border border-border bg-muted/50">
        <PhotoThumb
          src={moto.selfieUrl}
          alt={`Foto de ${name}`}
          fallback="user"
        />
      </div>
      <div className="h-11 w-11 overflow-hidden rounded-lg border border-border bg-muted/50">
        <PhotoThumb
          src={moto.motoImagenUrl}
          alt={`Moto ${moto.modelo}`}
          fallback="bike"
        />
      </div>
    </div>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function vendidaMora(moto: VendidaMotoRow) {
  return getMoraDisplay({
    atraso: moto.atraso,
    moroso:
      moto.morosos?.estado === "activo" ? moto.morosos : null,
    recoger: moto.motos_para_recoger ?? null,
  });
}

function MoraCell({ moto }: { moto: VendidaMotoRow }) {
  if (moto.estado === "saldada") {
    return (
      <Badge
        variant="outline"
        className="border-emerald-200 bg-emerald-50 font-normal text-emerald-800"
      >
        Saldada
      </Badge>
    );
  }

  const { dias, monto, enMoraBandeja, paraRecoger, tieneDeuda } =
    vendidaMora(moto);

  if (!tieneDeuda) {
    return <span className="text-muted-foreground">Al día</span>;
  }

  if (paraRecoger) {
    return (
      <div className="flex flex-col gap-1">
        <span className="font-medium text-red-800">{dias} días</span>
        <p className="text-xs text-red-700">Adeudado {formatCop(monto)}</p>
        <Badge
          variant="outline"
          className="border-red-200 bg-red-50 font-normal text-red-800"
        >
          Para recoger
        </Badge>
      </div>
    );
  }

  if (!enMoraBandeja) {
    return (
      <div className="flex flex-col gap-1">
        <span className="font-medium text-foreground">{dias} días</span>
        <p className="text-xs text-muted-foreground">Adeudado {formatCop(monto)}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="font-medium text-amber-800">{dias} días</span>
      <p className="text-xs text-amber-700">Adeudado {formatCop(monto)}</p>
      <Badge
        variant="outline"
        className="border-amber-200 bg-amber-50 font-normal text-amber-800"
      >
        En mora
      </Badge>
    </div>
  );
}

export function VendidasManager({ motos }: { motos: VendidaMotoRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filtroEstado, setFiltroEstado] = useState<string>("all");
  const [filtroMora, setFiltroMora] = useState<string>("all");
  const [filtroCredito, setFiltroCredito] = useState<string>("activos");
  const [busqueda, setBusqueda] = useState("");

  const activas = useMemo(
    () => motos.filter((m) => m.estado === "entregada"),
    [motos],
  );

  const enMoraCount = useMemo(
    () => activas.filter((m) => vendidaMora(m).enMoraBandeja).length,
    [activas],
  );
  const paraRecogerCount = useMemo(
    () => activas.filter((m) => vendidaMora(m).paraRecoger).length,
    [activas],
  );

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return motos.filter((m) => {
      if (filtroCredito === "activos" && m.estado !== "entregada") return false;
      if (filtroCredito === "saldados" && m.estado !== "saldada") return false;
      if (filtroEstado !== "all" && m.estado_fisico !== filtroEstado) {
        return false;
      }
      if (m.estado === "saldada") {
        // Saldadas no aplican filtros de mora
      } else {
        if (filtroMora === "en_mora" && !vendidaMora(m).enMoraBandeja) {
          return false;
        }
        if (filtroMora === "para_recoger" && !vendidaMora(m).paraRecoger) {
          return false;
        }
      }
      if (!q) return true;
      const user = pickUser(m).toLowerCase();
      return (
        user.includes(q) ||
        (m.placa ?? "").toLowerCase().includes(q) ||
        m.modelo.toLowerCase().includes(q) ||
        (m.referencia ?? "").toLowerCase().includes(q) ||
        (m.chasis ?? "").toLowerCase().includes(q)
      );
    });
  }, [motos, filtroEstado, filtroMora, filtroCredito, busqueda]);

  function handleEstadoChange(moto: VendidaMotoRow, estado: VendidaEstadoFisico) {
    if (estado === moto.estado_fisico) return;
    startTransition(async () => {
      try {
        await updateVendidaEstadoFisico({
          compraId: moto.id,
          userId: moto.user_id,
          estadoFisico: estado,
        });
        toast.success("Estado actualizado.");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo actualizar.");
      }
    });
  }

  function handleDelete(moto: VendidaMotoRow) {
    startTransition(async () => {
      try {
        await deleteVendidaMoto(moto.id, moto.user_id);
        toast.success("Moto eliminada de todas las tablas relacionadas.");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo eliminar.");
      }
    });
  }

  const estadoOptions = [
    { value: "all", label: "Todos los estados" },
    ...(Object.keys(VENDIDA_ESTADO_FISICO_LABELS) as VendidaEstadoFisico[]).map(
      (e) => ({
        value: e,
        label: VENDIDA_ESTADO_FISICO_LABELS[e],
      }),
    ),
  ];

  const moraOptions = [
    { value: "all", label: "Todas" },
    { value: "en_mora", label: "En mora (3 días)" },
    { value: "para_recoger", label: "Para recoger (4+ días)" },
  ];

  const creditoOptions = [
    { value: "activos", label: "Créditos activos" },
    { value: "saldados", label: "Saldados" },
    { value: "all", label: "Todos" },
  ];

  return (
    <div className="flex flex-col gap-4">
      {enMoraCount > 0 || paraRecogerCount > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {enMoraCount > 0 ? (
            <>
              <span className="font-medium">{enMoraCount}</span> moto
              {enMoraCount === 1 ? "" : "s"} con exactamente 3 días de atraso
              (bandeja <strong>Clientes en mora</strong>).
            </>
          ) : null}
          {enMoraCount > 0 && paraRecogerCount > 0 ? " " : null}
          {paraRecogerCount > 0 ? (
            <>
              <span className="font-medium">{paraRecogerCount}</span> moto
              {paraRecogerCount === 1 ? "" : "s"} con 4+ días en{" "}
              <strong>Motos para recoger</strong>.
            </>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Buscar
          </label>
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Cliente, placa, modelo, chasis…"
            className="flex h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-neutral-400"
          />
        </div>
        <div className="w-full sm:w-44">
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Crédito
          </label>
          <TouchSelect
            value={filtroCredito}
            onChange={setFiltroCredito}
            options={creditoOptions}
          />
        </div>
        <div className="w-full sm:w-52">
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Estado físico
          </label>
          <TouchSelect
            value={filtroEstado}
            onChange={setFiltroEstado}
            options={estadoOptions}
          />
        </div>
        <div className="w-full sm:w-52">
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Pagos
          </label>
          <TouchSelect
            value={filtroMora}
            onChange={setFiltroMora}
            options={moraOptions}
            disabled={filtroCredito === "saldados"}
          />
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {filtradas.length} moto{filtradas.length === 1 ? "" : "s"}
        {filtroCredito === "saldados" ? " saldada" : " entregada"}
        {filtradas.length === 1 ? "" : "s"}
      </p>

      <div className="hidden overflow-hidden rounded-xl border border-border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Moto</TableHead>
              <TableHead>Placa</TableHead>
              <TableHead>Entrega</TableHead>
              <TableHead>Cuota</TableHead>
              <TableHead>Mora</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-[180px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="p-0">
                  <Empty className="border-0 py-10">
                    <EmptyHeader>
                      <EmptyTitle>Sin motos en calle</EmptyTitle>
                      <EmptyDescription>
                        No hay motos vendidas con esos filtros.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            ) : (
              filtradas.map((moto) => {
                const mora = vendidaMora(moto);
                return (
                <TableRow
                  key={moto.id}
                  className={cn(
                    mora.paraRecoger && "bg-red-50/60",
                    mora.enMoraBandeja && "bg-amber-50/60",
                  )}
                >
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/50">
                        <PhotoThumb
                          src={moto.selfieUrl}
                          alt={`Foto de ${pickUser(moto)}`}
                          fallback="user"
                        />
                      </div>
                      <Link
                        href={`/clientes/${moto.user_id}`}
                        className="font-medium text-foreground hover:underline"
                      >
                        {pickUser(moto)}
                      </Link>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/50">
                        <PhotoThumb
                          src={moto.motoImagenUrl}
                          alt={`Moto ${moto.modelo}`}
                          fallback="bike"
                        />
                      </div>
                      <div>
                        <div className="font-medium">{moto.modelo}</div>
                        <div className="text-xs text-muted-foreground">
                          {moto.color}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{moto.placa ?? "—"}</TableCell>
                  <TableCell>{formatDate(moto.fecha_entrega)}</TableCell>
                  <TableCell>{formatCop(moto.monto_cuota_periodo)}</TableCell>
                  <TableCell>
                    <MoraCell moto={moto} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {moto.estado === "saldada" ? (
                        <Badge
                          variant="outline"
                          className="border-emerald-200 bg-emerald-50 font-normal text-emerald-800"
                        >
                          Saldada
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className={cn(
                            "font-normal",
                            estadoBadgeClass[moto.estado_fisico],
                          )}
                        >
                          {VENDIDA_ESTADO_FISICO_LABELS[moto.estado_fisico]}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {moto.estado === "saldada" ? (
                      <Link
                        href={`/clientes/${moto.user_id}`}
                        className="text-sm font-medium text-foreground hover:underline"
                      >
                        Ver cliente
                      </Link>
                    ) : (
                    <div className="flex items-center gap-2">
                      <TouchSelect
                        value={moto.estado_fisico}
                        onChange={(v) =>
                          handleEstadoChange(moto, v as VendidaEstadoFisico)
                        }
                        options={(
                          Object.keys(
                            VENDIDA_ESTADO_FISICO_LABELS,
                          ) as VendidaEstadoFisico[]
                        ).map((e) => ({
                          value: e,
                          label: VENDIDA_ESTADO_FISICO_LABELS[e],
                        }))}
                        disabled={pending}
                      />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="shrink-0 text-destructive hover:bg-red-50 hover:text-red-700"
                            disabled={pending}
                            aria-label="Eliminar moto"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              ¿Eliminar moto vendida?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              Se eliminará la compra de{" "}
                              <strong>{pickUser(moto)}</strong> (
                              {moto.modelo}
                              {moto.placa ? ` · ${moto.placa}` : ""}) junto con
                              tarifas, pagos, mora, recogidas y registros de
                              garaje vinculados. Esta acción no se puede
                              deshacer.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-red-600 hover:bg-red-700"
                              onClick={() => handleDelete(moto)}
                            >
                              Eliminar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                    )}
                  </TableCell>
                </TableRow>
              );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 md:hidden">
        {filtradas.length === 0 ? (
          <Empty className="border border-dashed border-border">
            <EmptyHeader>
              <EmptyTitle>Sin motos en calle</EmptyTitle>
              <EmptyDescription>
                No hay motos vendidas con esos filtros.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          filtradas.map((moto) => {
            const mora = vendidaMora(moto);
            return (
            <article
              key={moto.id}
              className={cn(
                "rounded-xl border p-4",
                mora.paraRecoger
                  ? "border-red-200 bg-red-50/40"
                  : mora.enMoraBandeja
                    ? "border-amber-200 bg-amber-50/40"
                    : "border-border",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <VendidaPhotos moto={moto} />
                  <div className="min-w-0">
                    <Link
                      href={`/clientes/${moto.user_id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {pickUser(moto)}
                    </Link>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {moto.modelo} · {moto.color}
                    </p>
                    {moto.placa ? (
                      <p className="text-sm text-muted-foreground">
                        Placa {moto.placa}
                      </p>
                    ) : null}
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "shrink-0 font-normal",
                    moto.estado === "saldada"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : estadoBadgeClass[moto.estado_fisico],
                  )}
                >
                  {moto.estado === "saldada"
                    ? "Saldada"
                    : VENDIDA_ESTADO_FISICO_LABELS[moto.estado_fisico]}
                </Badge>
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-muted-foreground">Entrega</dt>
                  <dd>{formatDate(moto.fecha_entrega)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Cuota</dt>
                  <dd>{formatCop(moto.monto_cuota_periodo)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Mora</dt>
                  <dd>
                    {moto.estado === "saldada" ? (
                      "Crédito liquidado"
                    ) : mora.tieneDeuda ? (
                      <>
                        {mora.dias} días · {formatCop(mora.monto)}
                        {mora.paraRecoger ? " · Para recoger" : null}
                        {mora.enMoraBandeja ? " · En mora" : null}
                      </>
                    ) : (
                      "Al día"
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Garaje</dt>
                  <dd>
                    {(moto.garaje_motos?.length ?? 0) > 0 ? "Sí" : "No"}
                  </dd>
                </div>
              </dl>

              {moto.estado !== "saldada" ? (
              <div className="mt-4 flex flex-col gap-2">
                <label className="text-sm font-medium text-foreground">
                  Cambiar estado
                </label>
                <TouchSelect
                  value={moto.estado_fisico}
                  onChange={(v) =>
                    handleEstadoChange(moto, v as VendidaEstadoFisico)
                  }
                  options={(
                    Object.keys(
                      VENDIDA_ESTADO_FISICO_LABELS,
                    ) as VendidaEstadoFisico[]
                  ).map((e) => ({
                    value: e,
                    label: VENDIDA_ESTADO_FISICO_LABELS[e],
                  }))}
                  disabled={pending}
                />
              </div>
              ) : null}

              <div className="mt-4 flex gap-2">
                <Link
                  href={`/clientes/${moto.user_id}`}
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm font-medium"
                >
                  <ExternalLink className="h-4 w-4" />
                  Cliente
                </Link>
                {moto.estado !== "saldada" ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11 flex-1 border-red-200 text-destructive hover:bg-red-50"
                      disabled={pending}
                    >
                      <Trash2 className="h-4 w-4" />
                      Eliminar
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        ¿Eliminar moto vendida?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        Se eliminará la compra y todos los registros vinculados
                        (tarifas, pagos, mora, garaje). No se puede deshacer.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-red-600 hover:bg-red-700"
                        onClick={() => handleDelete(moto)}
                      >
                        Eliminar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                ) : null}
              </div>
            </article>
          );
          })
        )}
      </div>
    </div>
  );
}
