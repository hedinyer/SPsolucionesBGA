"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import {
  deleteGarajeMoto,
  deleteGarajeParqueadero,
  saveGarajeMoto,
  saveGarajeParqueadero,
} from "@/lib/actions/admin-actions";
import type {
  BikeRow,
  GarajeCondicion,
  GarajeMantenimientoItemRow,
  GarajeMotoEstado,
  GarajeMotoRow,
  GarajeParqueaderoRow,
  InventarioProductoRow,
} from "@/lib/pipeline/types";
import {
  GARAJE_CONDICION_LABELS,
  GARAJE_ESTADO_LABELS,
  GARAJE_ORIGEN_LABELS,
} from "@/lib/pipeline/types";
import {
  GarajeMotoCicloPanel,
  plazoBadgeLabel,
} from "@/components/garaje/garaje-moto-ciclo-panel";
import { getStoragePublicUrl } from "@/lib/utils/storage-urls";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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
import {
  garajeUploadFolder,
  ImageFileField,
} from "@/components/ui/image-file-field";
import { STORAGE_BUCKETS } from "@/lib/supabase/storage-buckets";
import { uploadImageFromBrowser } from "@/lib/utils/upload-image-client";
import { Textarea } from "@/components/ui/textarea";
import { TouchSelect } from "@/components/ui/touch-select";
import { cn } from "@/lib/utils";

const actionBtnClass =
  "inline-flex min-h-11 w-full touch-manipulation cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80 active:bg-primary/90 sm:w-auto";

const outlineBtnClass =
  "inline-flex min-h-11 flex-1 touch-manipulation cursor-pointer items-center justify-center gap-1 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/50 active:bg-muted/50";

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function GarajeManager({
  parqueaderos,
  motos,
  stockNuevo = [],
  productos = [],
  mantenimientoByMoto = {},
  initialFotoPendiente = false,
}: {
  parqueaderos: GarajeParqueaderoRow[];
  motos: GarajeMotoRow[];
  stockNuevo?: BikeRow[];
  productos?: InventarioProductoRow[];
  mantenimientoByMoto?: Record<string, GarajeMantenimientoItemRow[]>;
  initialFotoPendiente?: boolean;
}) {
  const router = useRouter();
  const [motoOpen, setMotoOpen] = useState(false);
  const [parqOpen, setParqOpen] = useState(false);
  const [editingMoto, setEditingMoto] = useState<GarajeMotoRow | null>(null);
  const [editingParq, setEditingParq] = useState<GarajeParqueaderoRow | null>(
    null,
  );
  const [pending, startTransition] = useTransition();
  const [filtroParqueadero, setFiltroParqueadero] = useState<string>("all");
  const [filtroCondicion, setFiltroCondicion] = useState<string>("all");
  const [filtroFotoPendiente, setFiltroFotoPendiente] = useState(
    initialFotoPendiente,
  );

  function openMotoEditor(moto: GarajeMotoRow) {
    setEditingMoto(moto);
    setMotoOpen(true);
  }

  function closeMotoEditor() {
    setMotoOpen(false);
    setEditingMoto(null);
  }

  useEffect(() => {
    if (!motoOpen && !parqOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [motoOpen, parqOpen]);

  const parqueaderosActivos = parqueaderos.filter((p) => p.activo);

  const motosFiltradas = useMemo(() => {
    return motos.filter((m) => {
      if (filtroParqueadero !== "all") {
        if (filtroParqueadero === "none" && m.parqueadero_id != null) return false;
        if (
          filtroParqueadero !== "none" &&
          String(m.parqueadero_id) !== filtroParqueadero
        ) {
          return false;
        }
      }
      if (filtroCondicion !== "all" && m.condicion !== filtroCondicion) {
        return false;
      }
      if (filtroFotoPendiente && m.placa_foto_url) return false;
      return true;
    });
  }, [motos, filtroParqueadero, filtroCondicion, filtroFotoPendiente]);

  const pendientesFoto = motos.filter((m) => !m.placa_foto_url).length;

  return (
    <Tabs defaultValue="motos">
      <TabsList className="h-auto w-full max-w-full gap-1 overflow-x-auto p-1">
        <TabsTrigger
          value="motos"
          className="min-h-11 flex-1 touch-manipulation px-3 sm:min-h-8"
        >
          Motos
          {pendientesFoto > 0 && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
              {pendientesFoto} sin foto
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger
          value="parqueaderos"
          className="min-h-11 flex-1 touch-manipulation px-3 sm:min-h-8"
        >
          Parqueaderos
        </TabsTrigger>
      </TabsList>

      <TabsContent value="motos" className="flex flex-col gap-4">
        {stockNuevo.length > 0 ? (
          <section className="flex flex-col gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Motos nuevas (catálogo)
              </h2>
              <p className="text-xs text-muted-foreground">
                Stock del catálogo. Registra la unidad física o vende al
                contado desde aquí.
              </p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {stockNuevo.map((bike) => {
                const garajeQs = new URLSearchParams({
                  modelo: bike.modelo,
                  color: bike.color,
                });
                const contadoQs = new URLSearchParams({
                  nuevo: "1",
                  bikeId: String(bike.id),
                });
                return (
                  <li
                    key={bike.id}
                    className="flex flex-col gap-3 overflow-hidden rounded-xl border border-border bg-background p-3"
                  >
                    <div className="flex gap-3">
                      <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/50">
                        {bike.imagen_url ? (
                          <Image
                            src={bike.imagen_url}
                            alt={`${bike.modelo} ${bike.color}`}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                            Sin foto
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{bike.modelo}</p>
                        <p className="text-sm text-muted-foreground">
                          {bike.color}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Badge
                            variant="outline"
                            className="border-emerald-200 bg-emerald-50 font-normal text-emerald-800"
                          >
                            Nueva
                          </Badge>
                          <Badge variant="secondary" className="font-normal">
                            Stock {bike.stock}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/garaje/nueva?${garajeQs}`}
                        className="inline-flex min-h-11 flex-1 touch-manipulation items-center justify-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted/50"
                      >
                        Registrar unidad
                      </Link>
                      <Link
                        href={`/venta-contado?${contadoQs}`}
                        className="inline-flex min-h-11 flex-1 touch-manipulation items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80"
                      >
                        Vender contado
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Unidades en patio
            </h2>
            <p className="text-xs text-muted-foreground">
              Motos físicas registradas o recuperadas por mora.
            </p>
          </div>
          <div className="grid w-full gap-3 sm:flex sm:flex-wrap sm:items-end">
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Parqueadero</Label>
              <TouchSelect
                aria-label="Filtrar por parqueadero"
                value={filtroParqueadero}
                onChange={setFiltroParqueadero}
                options={[
                  { value: "all", label: "Todos" },
                  { value: "none", label: "Sin asignar" },
                  ...parqueaderos.map((p) => ({
                    value: String(p.id),
                    label: p.nombre,
                  })),
                ]}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Condición</Label>
              <TouchSelect
                aria-label="Filtrar por condición"
                value={filtroCondicion}
                onChange={setFiltroCondicion}
                options={[
                  { value: "all", label: "Todas" },
                  ...(Object.keys(GARAJE_CONDICION_LABELS) as GarajeCondicion[]).map(
                    (c) => ({
                      value: c,
                      label: GARAJE_CONDICION_LABELS[c],
                    }),
                  ),
                ]}
              />
            </div>
            <div className="flex min-h-11 items-center">
              <label className="flex min-h-11 w-full cursor-pointer touch-manipulation items-center gap-3 rounded-lg border border-border px-3 text-sm sm:w-auto sm:border-0 sm:px-0">
                <Switch
                  checked={filtroFotoPendiente}
                  onCheckedChange={setFiltroFotoPendiente}
                />
                Solo foto pendiente
              </label>
            </div>
          </div>
          <Link href="/garaje/nueva" className={actionBtnClass}>
            <Plus className="pointer-events-none h-4 w-4" />
            Nueva moto
          </Link>
        </div>

        {motosFiltradas.length === 0 ? (
          <Empty className="border border-dashed border-border">
            <EmptyHeader>
              <EmptyTitle>
                {motos.length === 0 ? "Garaje vacío" : "Sin resultados"}
              </EmptyTitle>
              <EmptyDescription>
                {motos.length === 0 ? (
                  <>
                    Registra una unidad con{" "}
                    <Link
                      href="/garaje/nueva"
                      className="font-medium text-foreground underline underline-offset-4"
                    >
                      Nueva moto
                    </Link>{" "}
                    o marca una entregada como Recogida / En patio en En calle.
                  </>
                ) : (
                  "No hay motos con estos filtros."
                )}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}

        {motosFiltradas.length > 0 ? (
        <div className="hidden overflow-x-auto rounded-lg border border-border lg:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Placa</TableHead>
                <TableHead>Referencia</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>Color</TableHead>
                <TableHead>Parqueadero</TableHead>
                <TableHead>Condición</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {motosFiltradas.map((m) => {
                  const img = getStoragePublicUrl(
                    STORAGE_BUCKETS.garajeImagenes,
                    m.placa_foto_url,
                  );
                  return (
                    <TableRow key={m.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="relative h-10 w-14 shrink-0 overflow-hidden rounded border border-border bg-muted/50">
                            {img ? (
                              <Image
                                src={img}
                                alt=""
                                fill
                                className="object-cover"
                                unoptimized
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                                —
                              </div>
                            )}
                          </div>
                          <div>
                            <span className="font-medium">
                              {m.placa ?? "Sin placa"}
                            </span>
                            {!m.placa_foto_url && (
                              <Badge
                                variant="outline"
                                className="ml-2 border-amber-300 text-amber-800"
                              >
                                Foto pendiente
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{m.referencia}</TableCell>
                      <TableCell>{m.modelo}</TableCell>
                      <TableCell>{m.color}</TableCell>
                      <TableCell>
                        {m.parqueadero_nombre ?? (
                          <span className="text-muted-foreground">Sin asignar</span>
                        )}
                      </TableCell>
                      <TableCell>{GARAJE_CONDICION_LABELS[m.condicion]}</TableCell>
                      <TableCell>{GARAJE_ORIGEN_LABELS[m.origen]}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          <span>{GARAJE_ESTADO_LABELS[m.estado]}</span>
                          {plazoBadgeLabel(m) ? (
                            <Badge
                              variant="outline"
                              className={
                                plazoBadgeLabel(m) === "Plazo vencido"
                                  ? "border-red-300 text-red-800"
                                  : "border-amber-300 text-amber-800"
                              }
                            >
                              {plazoBadgeLabel(m)}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            className="inline-flex min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-lg hover:bg-muted active:bg-muted"
                            aria-label="Editar moto"
                            onClick={() => openMotoEditor(m)}
                          >
                            <Pencil className="pointer-events-none h-4 w-4" />
                          </button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="bg-background">
                              <AlertDialogHeader>
                                <AlertDialogTitle>¿Eliminar moto?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {m.modelo} · {m.referencia}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() =>
                                    startTransition(async () => {
                                      try {
                                        await deleteGarajeMoto(m.id);
                                        toast.success("Moto eliminada.");
                                        router.refresh();
                                      } catch (e) {
                                        toast.error(
                                          e instanceof Error
                                            ? e.message
                                            : "No se pudo eliminar.",
                                        );
                                      }
                                    })
                                  }
                                >
                                  Eliminar
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </div>
        ) : null}

        {motosFiltradas.length > 0 ? (
        <div className="flex flex-col gap-3 lg:hidden">
          {motosFiltradas.map((m) => {
              const img = getStoragePublicUrl(
                STORAGE_BUCKETS.garajeImagenes,
                m.placa_foto_url,
              );
              return (
                <div
                  key={m.id}
                  className="rounded-lg border border-border p-4 text-sm"
                >
                  <div className="flex gap-3">
                    <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded border border-border bg-muted/50">
                      {img ? (
                        <Image
                          src={img}
                          alt=""
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                          Sin foto
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{m.placa ?? "Sin placa"}</p>
                      <p className="text-muted-foreground">
                        {m.modelo} · {m.color}
                      </p>
                      {!m.placa_foto_url && (
                        <Badge
                          variant="outline"
                          className="mt-1 border-amber-300 text-amber-800"
                        >
                          Foto pendiente
                        </Badge>
                      )}
                    </div>
                  </div>
                  <dl className="mt-3 flex flex-col gap-1.5">
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Referencia</dt>
                      <dd>{m.referencia}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Parqueadero</dt>
                      <dd>{m.parqueadero_nombre ?? "Sin asignar"}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Condición</dt>
                      <dd>{GARAJE_CONDICION_LABELS[m.condicion]}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Estado</dt>
                      <dd className="text-right">
                        {GARAJE_ESTADO_LABELS[m.estado]}
                        {plazoBadgeLabel(m) ? (
                          <span className="mt-0.5 block text-xs text-amber-800">
                            {plazoBadgeLabel(m)}
                          </span>
                        ) : null}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      className={outlineBtnClass}
                      onClick={() => openMotoEditor(m)}
                    >
                      <Pencil className="pointer-events-none mr-1 h-4 w-4" />
                      Editar
                    </button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="min-h-11 flex-1 touch-manipulation"
                        >
                          <Trash2 className="mr-1 h-4 w-4" />
                          Eliminar
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="bg-background">
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Eliminar moto?</AlertDialogTitle>
                          <AlertDialogDescription>
                            {m.modelo} · {m.referencia}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() =>
                              startTransition(async () => {
                                try {
                                  await deleteGarajeMoto(m.id);
                                  toast.success("Moto eliminada.");
                                  router.refresh();
                                } catch (e) {
                                  toast.error(
                                    e instanceof Error
                                      ? e.message
                                      : "No se pudo eliminar.",
                                  );
                                }
                              })
                            }
                          >
                            Eliminar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              );
            })}
        </div>
        ) : null}
      </TabsContent>

      <TabsContent value="parqueaderos" className="flex flex-col gap-4">
        <div className="flex justify-end">
          <Button
            type="button"
            className="min-h-11 w-full touch-manipulation bg-primary text-primary-foreground hover:bg-primary/80 sm:w-auto"
            onClick={() => {
              setEditingParq(null);
              setParqOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Nuevo parqueadero
          </Button>
        </div>
        <div className="hidden overflow-x-auto rounded-lg border border-border lg:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Orden</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {parqueaderos.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.nombre}</TableCell>
                  <TableCell>{p.slug}</TableCell>
                  <TableCell>{p.orden}</TableCell>
                  <TableCell>
                    <Badge variant={p.activo ? "outline" : "secondary"}>
                      {p.activo ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingParq(p);
                          setParqOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-background">
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              ¿Eliminar parqueadero?
                            </AlertDialogTitle>
                            <AlertDialogDescription>{p.nombre}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() =>
                                startTransition(async () => {
                                  try {
                                    await deleteGarajeParqueadero(p.id);
                                    toast.success("Parqueadero eliminado.");
                                    router.refresh();
                                  } catch (e) {
                                    toast.error(
                                      e instanceof Error
                                        ? e.message
                                        : "No se pudo eliminar.",
                                    );
                                  }
                                })
                              }
                            >
                              Eliminar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-col gap-3 lg:hidden">
          {parqueaderos.map((p) => (
            <div
              key={p.id}
              className="rounded-lg border border-border p-4 text-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{p.nombre}</p>
                <Badge variant={p.activo ? "outline" : "secondary"}>
                  {p.activo ? "Activo" : "Inactivo"}
                </Badge>
              </div>
              <dl className="mt-3 flex flex-col gap-1.5">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Slug</dt>
                  <dd>{p.slug}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Orden</dt>
                  <dd>{p.orden}</dd>
                </div>
              </dl>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11 flex-1 touch-manipulation"
                  onClick={() => {
                    setEditingParq(p);
                    setParqOpen(true);
                  }}
                >
                  <Pencil className="mr-1 h-4 w-4" />
                  Editar
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-11 flex-1 touch-manipulation"
                    >
                      <Trash2 className="mr-1 h-4 w-4" />
                      Eliminar
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="bg-background">
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Eliminar parqueadero?</AlertDialogTitle>
                      <AlertDialogDescription>{p.nombre}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() =>
                          startTransition(async () => {
                            try {
                              await deleteGarajeParqueadero(p.id);
                              toast.success("Parqueadero eliminado.");
                              router.refresh();
                            } catch (e) {
                              toast.error(
                                e instanceof Error
                                  ? e.message
                                  : "No se pudo eliminar.",
                              );
                            }
                          })
                        }
                      >
                        Eliminar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      </TabsContent>

      <MotoDialog
        open={motoOpen && editingMoto != null}
        onOpenChange={(open) => {
          if (!open) closeMotoEditor();
        }}
        editing={editingMoto}
        parqueaderos={parqueaderosActivos}
        productos={productos}
        mantenimientoItems={
          editingMoto ? (mantenimientoByMoto[editingMoto.id] ?? []) : []
        }
        pending={pending}
        onSave={(form) =>
          startTransition(async () => {
            try {
              let placaFotoUrl = form.placaFotoUrl;
              if (form.imageFile) {
                placaFotoUrl = await uploadImageFromBrowser(
                  STORAGE_BUCKETS.garajeImagenes,
                  garajeUploadFolder(form.placa || form.referencia, editingMoto?.id),
                  form.imageFile,
                );
              }

              const isNewManual = !editingMoto && form.origen === "manual";

              const result = await saveGarajeMoto({
                id: editingMoto?.id,
                parqueaderoId: form.parqueaderoId,
                placa: form.placa,
                placaFotoUrl,
                referencia: form.referencia,
                modelo: form.modelo,
                color: form.color,
                origen: editingMoto?.origen ?? form.origen,
                condicion: form.condicion,
                estado: form.estado,
                notas: form.notas,
                isNewManual,
              });
              if (!result.ok) {
                toast.error(result.error);
                return;
              }
              toast.success(editingMoto ? "Moto actualizada." : "Moto registrada.");
              router.refresh();
              closeMotoEditor();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Error al guardar.");
            }
          })
        }
      />

      <ParqueaderoDialog
        open={parqOpen}
        onOpenChange={setParqOpen}
        editing={editingParq}
        pending={pending}
        onSave={(form) =>
          startTransition(async () => {
            try {
              await saveGarajeParqueadero(form);
              toast.success(
                editingParq ? "Parqueadero actualizado." : "Parqueadero creado.",
              );
              router.refresh();
              setParqOpen(false);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Error al guardar.");
            }
          })
        }
      />
    </Tabs>
  );
}

function MotoDialog({
  open,
  onOpenChange,
  editing,
  parqueaderos,
  productos,
  mantenimientoItems,
  pending,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: GarajeMotoRow | null;
  parqueaderos: GarajeParqueaderoRow[];
  productos: InventarioProductoRow[];
  mantenimientoItems: GarajeMantenimientoItemRow[];
  pending: boolean;
  onSave: (form: {
    parqueaderoId: number | null;
    placa: string;
    placaFotoUrl: string;
    imageFile: File | null;
    referencia: string;
    modelo: string;
    color: string;
    origen: "manual" | "recuperacion";
    condicion: GarajeCondicion;
    estado: GarajeMotoEstado;
    notas: string;
  }) => void;
}) {
  const [parqueaderoId, setParqueaderoId] = useState<string>("none");
  const [placa, setPlaca] = useState("");
  const [placaFotoUrl, setPlacaFotoUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [referencia, setReferencia] = useState("");
  const [modelo, setModelo] = useState("");
  const [color, setColor] = useState("");
  const [condicion, setCondicion] = useState<GarajeCondicion>("recuperada");
  const [estado, setEstado] = useState<GarajeMotoEstado>("en_garaje");
  const [notas, setNotas] = useState("");

  function load() {
    setParqueaderoId(
      editing?.parqueadero_id ? String(editing.parqueadero_id) : "none",
    );
    setPlaca(editing?.placa ?? "");
    setPlacaFotoUrl(editing?.placa_foto_url ?? "");
    setImageFile(null);
    setReferencia(editing?.referencia ?? "");
    setModelo(editing?.modelo ?? "");
    setColor(editing?.color ?? "");
    setCondicion(editing?.condicion ?? "recuperada");
    setEstado(editing?.estado ?? "en_garaje");
    setNotas(editing?.notas ?? "");
  }

  useEffect(() => {
    if (open) load();
  }, [open, editing?.id]);

  const isNewManual = !editing;
  const requiresPhoto =
    (isNewManual && condicion !== "nueva") ||
    (editing?.origen === "recuperacion" && !placaFotoUrl && !imageFile);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="moto-dialog-title"
    >
      <button
        type="button"
        className="absolute inset-0 touch-manipulation bg-black/40"
        aria-label="Cerrar"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl safe-area-bottom sm:max-h-[90dvh] sm:max-w-lg sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 id="moto-dialog-title" className="text-base font-medium">
            {editing ? "Editar moto" : "Registrar moto"}
          </h2>
          <button
            type="button"
            className="inline-flex min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-lg hover:bg-muted active:bg-muted"
            aria-label="Cerrar"
            onClick={() => onOpenChange(false)}
          >
            <X className="pointer-events-none h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-4">
          {editing ? (
            <GarajeMotoCicloPanel
              moto={editing}
              productos={productos}
              items={mantenimientoItems}
            />
          ) : null}
          {editing?.origen === "recuperacion" && !editing.placa_foto_url && (
            <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Moto recuperada por mora. Completa la foto de placa y asigna
              parqueadero.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <ImageFileField
                label={
                  condicion === "nueva"
                    ? "Foto de placa (opcional)"
                    : "Foto de placa"
                }
                existingUrl={
                  placaFotoUrl
                    ? getStoragePublicUrl(
                        STORAGE_BUCKETS.garajeImagenes,
                        placaFotoUrl,
                      ) ?? placaFotoUrl
                    : null
                }
                file={imageFile}
                onFileChange={setImageFile}
                disabled={pending}
                enableCamera
              />
            </div>
            <Field label="Placa" value={placa} onChange={setPlaca} />
            <Field label="Referencia moto" value={referencia} onChange={setReferencia} />
            <Field label="Modelo" value={modelo} onChange={setModelo} />
            <Field label="Color" value={color} onChange={setColor} />
            <div className="flex flex-col gap-2">
              <Label>Parqueadero</Label>
              <TouchSelect
                aria-label="Parqueadero"
                value={parqueaderoId}
                onChange={setParqueaderoId}
                options={[
                  { value: "none", label: "Sin asignar" },
                  ...parqueaderos.map((p) => ({
                    value: String(p.id),
                    label: p.nombre,
                  })),
                ]}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Condición</Label>
              <TouchSelect
                aria-label="Condición"
                value={condicion}
                onChange={(v) => setCondicion(v as GarajeCondicion)}
                options={(Object.keys(GARAJE_CONDICION_LABELS) as GarajeCondicion[]).map(
                  (c) => ({
                    value: c,
                    label: GARAJE_CONDICION_LABELS[c],
                  }),
                )}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Estado</Label>
              <TouchSelect
                aria-label="Estado"
                value={estado}
                onChange={(v) => setEstado(v as GarajeMotoEstado)}
                options={(Object.keys(GARAJE_ESTADO_LABELS) as GarajeMotoEstado[]).map(
                  (e) => ({
                    value: e,
                    label: GARAJE_ESTADO_LABELS[e],
                  }),
                )}
              />
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label>Notas</Label>
              <Textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                className="min-h-24 touch-manipulation text-base md:text-sm"
              />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-border bg-muted/50 p-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            className={cn(outlineBtnClass, "sm:flex-none sm:px-6")}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={cn(actionBtnClass, "sm:flex-none sm:px-6")}
            disabled={
              pending ||
              !referencia.trim() ||
              !modelo.trim() ||
              !color.trim() ||
              (requiresPhoto && !imageFile && !placaFotoUrl)
            }
            onClick={() =>
              onSave({
                parqueaderoId:
                  parqueaderoId === "none" ? null : Number(parqueaderoId),
                placa,
                placaFotoUrl,
                imageFile,
                referencia,
                modelo,
                color,
                origen: "manual",
                condicion,
                estado,
                notas,
              })
            }
          >
            {pending ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ParqueaderoDialog({
  open,
  onOpenChange,
  editing,
  pending,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: GarajeParqueaderoRow | null;
  pending: boolean;
  onSave: (form: {
    id?: number;
    nombre: string;
    slug: string;
    activo: boolean;
    orden: number;
  }) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [slug, setSlug] = useState("");
  const [orden, setOrden] = useState("0");
  const [activo, setActivo] = useState(true);

  function load() {
    setNombre(editing?.nombre ?? "");
    setSlug(editing?.slug ?? "");
    setOrden(String(editing?.orden ?? 0));
    setActivo(editing?.activo ?? true);
  }

  useEffect(() => {
    if (open) load();
  }, [open, editing?.id]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="parqueadero-dialog-title"
    >
      <button
        type="button"
        className="absolute inset-0 touch-manipulation bg-black/40"
        aria-label="Cerrar"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl safe-area-bottom sm:max-h-[90dvh] sm:max-w-lg sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 id="parqueadero-dialog-title" className="text-base font-medium">
            {editing ? "Editar parqueadero" : "Nuevo parqueadero"}
          </h2>
          <button
            type="button"
            className="inline-flex min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-lg hover:bg-muted active:bg-muted"
            aria-label="Cerrar"
            onClick={() => onOpenChange(false)}
          >
            <X className="pointer-events-none h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-4">
          <div className="grid gap-4">
            <Field
              label="Nombre"
              value={nombre}
              onChange={(v) => {
                setNombre(v);
                if (!editing) setSlug(slugify(v));
              }}
            />
            <Field label="Slug" value={slug} onChange={setSlug} />
            <Field label="Orden" value={orden} onChange={setOrden} type="number" />
            <div className="flex min-h-11 items-center gap-3">
              <Switch checked={activo} onCheckedChange={setActivo} />
              <Label>Activo</Label>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-border bg-muted/50 p-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            className={cn(outlineBtnClass, "sm:flex-none sm:px-6")}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={cn(actionBtnClass, "sm:flex-none sm:px-6")}
            disabled={pending || !nombre.trim() || !slug.trim()}
            onClick={() =>
              onSave({
                id: editing?.id,
                nombre,
                slug,
                activo,
                orden: Number(orden),
              })
            }
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 touch-manipulation text-base md:text-sm"
      />
    </div>
  );
}
