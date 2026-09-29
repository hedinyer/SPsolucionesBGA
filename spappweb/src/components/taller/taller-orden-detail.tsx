"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronLeft,
  MessageCircle,
  Minus,
  Pause,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  addOrdenRepuesto,
  assignOrdenMecanico,
  corregirRepuesto,
  pauseOrdenTimer,
  removeOrdenRepuesto,
  removeTarea,
  startOrdenTimer,
  toggleTareaHecha,
  updateOrdenEstado,
} from "@/lib/actions/taller-actions";
import type {
  MecanicoRow,
  MotivoPausa,
  OrdenTallerRow,
} from "@/lib/taller/types";
import {
  MOTIVO_PAUSA_LABEL,
  ORDEN_ESTADO_LABEL,
  ordenListaChecklist,
  REPUESTO_ESTADO_LABEL,
  repuestoNombre,
} from "@/lib/taller/types";
import { zonaMotoLabel, type ZonaMotoId } from "@/lib/taller/zonas-moto";
import {
  MotoDiagrama,
  useZonaResumen,
} from "@/components/taller/moto-diagrama";
import { TallerZonaSheet } from "@/components/taller/taller-zona-sheet";
import { TallerTimerDisplay } from "@/components/taller/taller-timer";
import { TallerRealtimeRefresh } from "@/components/taller/taller-realtime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type ProductoLite = {
  id: number;
  nombre: string;
  sku: string;
  stock: number;
  precio: number;
  imagen_url: string | null;
};

const MOTIVOS: MotivoPausa[] = [
  "almuerzo",
  "esperando_repuesto",
  "otra_moto",
  "fin_dia",
];

export function TallerOrdenDetail({
  orden,
  mecanicos,
  productos,
}: {
  orden: OrdenTallerRow;
  mecanicos: MecanicoRow[];
  productos: ProductoLite[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [zona, setZona] = useState<ZonaMotoId | null>(null);
  const [zonaOpen, setZonaOpen] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [repuestoOpen, setRepuestoOpen] = useState(false);
  const [repuestoZona, setRepuestoZona] = useState<string | null>(null);
  const [prodQ, setProdQ] = useState("");
  const [selectedProd, setSelectedProd] = useState<ProductoLite | null>(null);
  const [cantidad, setCantidad] = useState(1);
  const [descLibre, setDescLibre] = useState("");
  const [modoLibre, setModoLibre] = useState(false);
  const [editRechazo, setEditRechazo] = useState<string | null>(null);
  const [confirmEstado, setConfirmEstado] = useState<
    "lista" | "entregada" | "cancelada" | null
  >(null);

  const resumen = useZonaResumen(orden.trabajos);
  const checklist = ordenListaChecklist(orden);
  const cerrada =
    orden.estado === "entregada" || orden.estado === "cancelada";
  const activos = mecanicos.filter((m) => m.activo);

  const productosFiltrados = useMemo(() => {
    const q = prodQ.trim().toLowerCase();
    if (!q) return productos.slice(0, 30);
    return productos
      .filter(
        (p) =>
          p.nombre.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [productos, prodQ]);

  const statusMsg = useMemo(() => {
    if (orden.timer_running) return "Cronómetro en marcha";
    if (orden.estado === "lista") return "Moto lista para entregar";
    return ORDEN_ESTADO_LABEL[orden.estado];
  }, [orden]);

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, okMsg?: string) {
    startTransition(async () => {
      const r = await action();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (okMsg) toast.success(okMsg);
      router.refresh();
    });
  }

  function whatsappHref() {
    const tel = (orden.contacto_telefono ?? "").replace(/\D/g, "");
    if (!tel) return null;
    const normalized = tel.startsWith("57") ? tel : `57${tel}`;
    const placa = orden.placa || orden.modelo;
    const text = encodeURIComponent(
      `Hola${orden.contacto_nombre ? ` ${orden.contacto_nombre}` : ""}, tu moto ${placa} ya está lista en SP Soluciones. Puedes pasar a recogerla.`,
    );
    return `https://wa.me/${normalized}?text=${text}`;
  }

  return (
    <div className="flex flex-col gap-6 pb-28">
      <TallerRealtimeRefresh onRejectVibrate />
      <p className="sr-only" role="status" aria-live="polite">
        {statusMsg}
      </p>

      <Button variant="ghost" asChild className="w-fit gap-2 px-0">
        <Link href="/taller">
          <ChevronLeft data-icon="inline-start" />
          Tablero
        </Link>
      </Button>

      <header className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Orden #{orden.numero}</p>
            <h1 className="text-3xl font-bold tracking-wide uppercase">
              {orden.placa || orden.modelo}
            </h1>
            <p className="text-sm text-muted-foreground">
              {orden.modelo}
              {orden.color ? ` · ${orden.color}` : ""}
              {orden.contacto_nombre ? ` · ${orden.contacto_nombre}` : ""}
            </p>
          </div>
          <Badge variant="outline">{ORDEN_ESTADO_LABEL[orden.estado]}</Badge>
        </div>

        <div className="flex flex-col items-center gap-2 py-2">
          <TallerTimerDisplay
            timerRunning={orden.timer_running}
            timerStartedAt={orden.timer_started_at}
            segundosAcumulados={orden.segundos_acumulados}
            size="lg"
          />
        </div>

        {!cerrada ? (
          <div className="flex flex-col gap-2">
            {orden.timer_running ? (
              <Button
                type="button"
                variant="secondary"
                className="min-h-14 touch-manipulation gap-2 text-lg"
                disabled={pending}
                onClick={() => setPauseOpen(true)}
              >
                <Pause className="size-5" />
                Pausar
              </Button>
            ) : (
              <Button
                type="button"
                className="min-h-14 touch-manipulation gap-2 text-lg"
                disabled={pending || !orden.mecanico_id}
                onClick={() =>
                  run(async () => {
                    const r = await startOrdenTimer({ ordenId: orden.id });
                    if (r.ok && r.pausadas > 0) {
                      toast.message("Pausamos la otra moto de este mecánico");
                    }
                    return r;
                  }, "Cronómetro en marcha")
                }
              >
                <Play className="size-5" />
                {orden.segundos_acumulados > 0 ? "Seguir" : "Empezar"}
              </Button>
            )}
            {!orden.mecanico_id ? (
              <p className="text-center text-sm text-amber-700 dark:text-amber-300">
                Primero elige quién arregla la moto.
              </p>
            ) : null}
          </div>
        ) : null}
      </header>

      {/* Mecánico */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Mecánico</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {activos.map((m) => {
            const on = orden.mecanico_id === m.id;
            return (
              <button
                key={m.id}
                type="button"
                disabled={cerrada || pending}
                aria-pressed={on}
                onClick={() =>
                  run(
                    () =>
                      assignOrdenMecanico({
                        ordenId: orden.id,
                        mecanicoId: m.id,
                      }),
                    `Asignado a ${m.nombre}`,
                  )
                }
                className={cn(
                  "flex min-h-14 touch-manipulation items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm",
                  on
                    ? "border-primary bg-primary/10 font-medium"
                    : "border-border",
                )}
              >
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: m.color ?? "#64748b" }}
                >
                  {m.foto_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.foto_url}
                      alt=""
                      className="size-8 rounded-full object-cover"
                    />
                  ) : (
                    m.nombre.slice(0, 1)
                  )}
                </span>
                {m.nombre}
              </button>
            );
          })}
        </div>
      </section>

      {orden.descripcion_falla ? (
        <section className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
          <p className="font-medium">Lo que dijo el cliente</p>
          <p className="text-muted-foreground">{orden.descripcion_falla}</p>
        </section>
      ) : null}

      {/* Partes de la moto */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-semibold">¿Qué parte vas a arreglar?</h2>
          <p className="text-sm text-muted-foreground">
            Toca una parte para anotar el trabajo.
          </p>
        </div>
        <MotoDiagrama
          selected={zona}
          resumen={resumen}
          disabled={cerrada}
          onSelect={(z) => {
            if (cerrada) return;
            setZona(z);
            setZonaOpen(true);
          }}
        />
      </section>

      {/* Tareas */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">
          Tareas ({orden.trabajos.filter((t) => t.hecho).length}/
          {orden.trabajos.length})
        </h2>
        {orden.trabajos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay tareas. Toca una parte de la moto.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {orden.trabajos.map((t) => (
              <li
                key={t.id}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3",
                  t.gravedad === "urgente"
                    ? "border-red-300 bg-red-50/50 dark:bg-red-950/20"
                    : t.gravedad === "pronto"
                      ? "border-amber-300 bg-amber-50/40 dark:bg-amber-950/10"
                      : "border-border",
                )}
              >
                <button
                  type="button"
                  disabled={cerrada || pending}
                  aria-pressed={t.hecho}
                  aria-label={t.hecho ? "Marcar pendiente" : "Marcar hecho"}
                  onClick={() =>
                    run(() =>
                      toggleTareaHecha({
                        ordenId: orden.id,
                        tareaId: t.id,
                        hecho: !t.hecho,
                      }),
                    )
                  }
                  className={cn(
                    "mt-0.5 flex size-8 shrink-0 touch-manipulation items-center justify-center rounded-md border",
                    t.hecho
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-border",
                  )}
                >
                  {t.hecho ? <Check className="size-4" /> : null}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    {zonaMotoLabel(t.zona)}
                  </p>
                  <p
                    className={cn(
                      "text-sm",
                      t.hecho && "text-muted-foreground line-through",
                    )}
                  >
                    {t.nota}
                  </p>
                </div>
                {!cerrada ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    aria-label="Borrar tarea"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        removeTarea({ ordenId: orden.id, tareaId: t.id }),
                      )
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Repuestos */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Repuestos</h2>
          {!cerrada ? (
            <Button
              type="button"
              size="sm"
              className="min-h-10 gap-1"
              onClick={() => {
                setRepuestoZona(null);
                setRepuestoOpen(true);
              }}
            >
              <Plus className="size-4" />
              Pedir
            </Button>
          ) : null}
        </div>
        {orden.repuestos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ninguno pedido aún.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {orden.repuestos.map((r) => (
              <li
                key={r.id}
                className={cn(
                  "flex flex-col gap-2 rounded-lg border p-3",
                  r.estado === "rechazado"
                    ? "border-red-400 bg-red-50/60 dark:bg-red-950/20"
                    : r.estado === "aprobado"
                      ? "border-emerald-300"
                      : "border-amber-300",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {repuestoNombre(r)} × {r.cantidad}
                    </p>
                    {r.zona ? (
                      <p className="text-xs text-muted-foreground">
                        {zonaMotoLabel(r.zona)}
                      </p>
                    ) : null}
                    {r.motivo_rechazo ? (
                      <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                        Motivo: {r.motivo_rechazo}
                      </p>
                    ) : null}
                  </div>
                  <Badge
                    variant={
                      r.estado === "aprobado"
                        ? "default"
                        : r.estado === "rechazado"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {REPUESTO_ESTADO_LABEL[r.estado]}
                  </Badge>
                </div>
                {!cerrada && r.estado !== "aprobado" ? (
                  <div className="flex gap-2">
                    {r.estado === "rechazado" ? (
                      <Button
                        type="button"
                        size="sm"
                        className="min-h-10 flex-1"
                        onClick={() => {
                          setEditRechazo(r.id);
                          setSelectedProd(
                            productos.find((p) => p.id === r.producto_id) ??
                              null,
                          );
                          setCantidad(r.cantidad);
                          setDescLibre(r.descripcion ?? "");
                          setModoLibre(!r.producto_id);
                          setRepuestoZona(r.zona);
                          setRepuestoOpen(true);
                        }}
                      >
                        Corregir
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="min-h-10"
                      disabled={pending}
                      onClick={() =>
                        run(() => removeOrdenRepuesto(r.id, orden.id), "Quitado")
                      }
                    >
                      Quitar
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {orden.fotos.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Fotos de ingreso</h2>
          <div className="grid grid-cols-3 gap-2">
            {orden.fotos.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={url}
                src={url}
                alt="Foto de cómo llegó la moto"
                className="aspect-square rounded-lg object-cover"
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* Acciones de estado */}
      {!cerrada ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-3 backdrop-blur safe-area-bottom lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          <div className="mx-auto flex max-w-[1313px] flex-col gap-2">
            {orden.estado !== "lista" ? (
              <>
                <Button
                  type="button"
                  className="min-h-12 w-full touch-manipulation text-base"
                  disabled={pending || !checklist.puedeMarcarLista}
                  onClick={() => setConfirmEstado("lista")}
                >
                  Moto lista
                </Button>
                {!checklist.puedeMarcarLista ? (
                  <p className="text-center text-xs text-muted-foreground">
                    {[
                      checklist.tareasPendientes > 0
                        ? `${checklist.tareasPendientes} tareas pendientes`
                        : null,
                      orden.trabajos.length === 0 ? "Falta anotar tareas" : null,
                      checklist.repuestosPendientes > 0
                        ? `${checklist.repuestosPendientes} esperando a Sebastian`
                        : null,
                      checklist.repuestosRechazados > 0
                        ? `${checklist.repuestosRechazados} rechazados por corregir`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : null}
              </>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">
                {whatsappHref() ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-12 flex-1 gap-2"
                    asChild
                  >
                    <a href={whatsappHref()!} target="_blank" rel="noreferrer">
                      <MessageCircle className="size-4" />
                      Avisar por WhatsApp
                    </a>
                  </Button>
                ) : null}
                <Button
                  type="button"
                  className="min-h-12 flex-1"
                  disabled={pending}
                  onClick={() => setConfirmEstado("entregada")}
                >
                  Entregar
                </Button>
              </div>
            )}
            <Button
              type="button"
              variant="ghost"
              className="min-h-10 text-destructive"
              disabled={pending}
              onClick={() => setConfirmEstado("cancelada")}
            >
              Cancelar orden
            </Button>
          </div>
        </div>
      ) : null}

      <TallerZonaSheet
        ordenId={orden.id}
        zona={zona}
        open={zonaOpen}
        onOpenChange={setZonaOpen}
        onAskRepuesto={(z) => {
          setRepuestoZona(z);
          setRepuestoOpen(true);
        }}
      />

      {/* Pausar */}
      <Dialog open={pauseOpen} onOpenChange={setPauseOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Por qué pausas?</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-2">
            {MOTIVOS.map((m) => (
              <Button
                key={m}
                type="button"
                variant="outline"
                className="min-h-12 justify-start"
                disabled={pending}
                onClick={() => {
                  setPauseOpen(false);
                  run(
                    () =>
                      pauseOrdenTimer({ ordenId: orden.id, motivo: m }),
                    "Pausado",
                  );
                }}
              >
                {MOTIVO_PAUSA_LABEL[m]}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Pedir / corregir repuesto */}
      <Dialog
        open={repuestoOpen}
        onOpenChange={(v) => {
          setRepuestoOpen(v);
          if (!v) {
            setEditRechazo(null);
            setSelectedProd(null);
            setCantidad(1);
            setDescLibre("");
            setModoLibre(false);
            setProdQ("");
          }
        }}
      >
        <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editRechazo ? "Corregir pedido" : "Pedir repuesto"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 overflow-y-auto">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={!modoLibre ? "default" : "outline"}
                className="min-h-10 flex-1"
                onClick={() => setModoLibre(false)}
              >
                Del inventario
              </Button>
              <Button
                type="button"
                variant={modoLibre ? "default" : "outline"}
                className="min-h-10 flex-1"
                onClick={() => setModoLibre(true)}
              >
                No está en inventario
              </Button>
            </div>

            {modoLibre ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="desc-libre">¿Qué necesitas?</Label>
                <Input
                  id="desc-libre"
                  value={descLibre}
                  onChange={(e) => setDescLibre(e.target.value)}
                  className="min-h-11 text-base"
                  placeholder="Ej.: Retén de horquilla 31 mm"
                />
              </div>
            ) : (
              <>
                <Input
                  value={prodQ}
                  onChange={(e) => setProdQ(e.target.value)}
                  placeholder="Buscar producto…"
                  className="min-h-11 text-base"
                  autoComplete="off"
                />
                <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                  {productosFiltrados.map((p) => {
                    const on = selectedProd?.id === p.id;
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedProd(p)}
                          className={cn(
                            "flex w-full min-h-12 items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm",
                            on
                              ? "border-primary bg-primary/10"
                              : "border-border",
                          )}
                        >
                          {p.imagen_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={p.imagen_url}
                              alt=""
                              className="size-10 rounded object-cover"
                            />
                          ) : (
                            <span className="flex size-10 items-center justify-center rounded bg-muted text-xs">
                              —
                            </span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">
                              {p.nombre}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Hay {p.stock}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            <div className="flex items-center justify-center gap-3">
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="size-11"
                aria-label="Menos"
                onClick={() => setCantidad((c) => Math.max(1, c - 1))}
              >
                <Minus className="size-4" />
              </Button>
              <span className="w-10 text-center text-xl font-bold tabular-nums">
                {cantidad}
              </span>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="size-11"
                aria-label="Más"
                onClick={() => setCantidad((c) => c + 1)}
              >
                <Plus className="size-4" />
              </Button>
            </div>

            <Button
              type="button"
              className="min-h-12"
              disabled={
                pending ||
                (!modoLibre && !selectedProd) ||
                (modoLibre && !descLibre.trim())
              }
              onClick={() => {
                startTransition(async () => {
                  if (editRechazo) {
                    const r = await corregirRepuesto({
                      repuestoId: editRechazo,
                      ordenId: orden.id,
                      productoId: modoLibre
                        ? undefined
                        : selectedProd?.id,
                      descripcion: modoLibre ? descLibre : undefined,
                      cantidad,
                    });
                    if (!r.ok) {
                      toast.error(r.error);
                      return;
                    }
                    toast.success("Corregido. Esperando a Sebastian");
                  } else {
                    const r = await addOrdenRepuesto({
                      ordenId: orden.id,
                      productoId: modoLibre
                        ? undefined
                        : selectedProd?.id,
                      descripcion: modoLibre ? descLibre : undefined,
                      cantidad,
                      zona: repuestoZona ?? undefined,
                    });
                    if (!r.ok) {
                      toast.error(r.error);
                      return;
                    }
                    toast.success(
                      r.stockWarning
                        ? `Pedido enviado. ${r.stockWarning}`
                        : "Pedido enviado a Sebastian",
                    );
                  }
                  setRepuestoOpen(false);
                  router.refresh();
                });
              }}
            >
              {editRechazo ? "Enviar de nuevo" : "Enviar a Sebastian"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmEstado != null}
        onOpenChange={(v) => !v && setConfirmEstado(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmEstado === "lista"
                ? "¿Marcar moto lista?"
                : confirmEstado === "entregada"
                  ? "¿Entregar la moto?"
                  : "¿Cancelar esta orden?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmEstado === "cancelada"
                ? "Los pedidos pendientes se rechazarán."
                : "Puedes seguir desde el tablero."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmEstado) return;
                const estado = confirmEstado;
                setConfirmEstado(null);
                run(
                  () => updateOrdenEstado({ ordenId: orden.id, estado }),
                  estado === "lista"
                    ? "Moto lista"
                    : estado === "entregada"
                      ? "Entregada"
                      : "Cancelada",
                );
              }}
            >
              Sí
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
