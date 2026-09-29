"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, ChevronLeft, ChevronRight, User, UserX } from "lucide-react";
import { toast } from "sonner";
import {
  buscarClienteTallerAction,
  createOrdenTaller,
  historialPlacaAction,
  subirFotoTaller,
} from "@/lib/actions/taller-actions";
import type {
  ClienteTallerHit,
  MecanicoRow,
  OrdenHistorialItem,
} from "@/lib/taller/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const MODELOS = ["NKD 125", "Boxer", "AKT", "Yamaha", "Suzuki", "Otro"];

const FALLAS = [
  "Frenos",
  "Motor",
  "Llanta pinchada",
  "Cadena",
  "Luces",
  "Ruido raro",
  "No enciende",
  "Otro",
];

type Step =
  | "tipo"
  | "cliente"
  | "datos"
  | "historial"
  | "fotos"
  | "falla"
  | "mecanico";

export function TallerNuevaOrdenForm({
  open,
  onOpenChange,
  mecanicos,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mecanicos: MecanicoRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<Step>("tipo");
  const [esCliente, setEsCliente] = useState<boolean | null>(null);

  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<ClienteTallerHit[]>([]);
  const [cliente, setCliente] = useState<ClienteTallerHit | null>(null);
  const [motoId, setMotoId] = useState<string | null>(null);

  const [placa, setPlaca] = useState("");
  const [modelo, setModelo] = useState("NKD 125");
  const [modeloOtro, setModeloOtro] = useState("");
  const [color, setColor] = useState("");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [kilometraje, setKilometraje] = useState("");

  const [historial, setHistorial] = useState<OrdenHistorialItem[]>([]);
  const [fotos, setFotos] = useState<string[]>([]);
  const [fallaChips, setFallaChips] = useState<string[]>([]);
  const [fallaTexto, setFallaTexto] = useState("");
  const [mecanicoId, setMecanicoId] = useState<number | null>(null);

  function reset() {
    setStep("tipo");
    setEsCliente(null);
    setSearch("");
    setHits([]);
    setCliente(null);
    setMotoId(null);
    setPlaca("");
    setModelo("NKD 125");
    setModeloOtro("");
    setColor("");
    setNombre("");
    setTelefono("");
    setKilometraje("");
    setHistorial([]);
    setFotos([]);
    setFallaChips([]);
    setFallaTexto("");
    setMecanicoId(null);
  }

  useEffect(() => {
    if (!open) return;
    const term = search.trim();
    if (term.length < 2) return;
    const t = window.setTimeout(() => {
      void buscarClienteTallerAction(term).then(setHits).catch(() => setHits([]));
    }, 300);
    return () => window.clearTimeout(t);
  }, [search, open]);

  const clientHits = search.trim().length < 2 ? [] : hits;

  async function goAfterDatos() {
    const p = placa.trim().toUpperCase();
    if (p.length >= 5) {
      const h = await historialPlacaAction(p);
      setHistorial(h);
      if (h.length > 0) {
        setStep("historial");
        return;
      }
    }
    setStep("fotos");
  }

  function submit() {
    const modeloFinal =
      modelo === "Otro" ? modeloOtro.trim() || "Otro" : modelo;
    if (!modeloFinal) {
      toast.error("Elige el modelo.");
      return;
    }
    const falla = [...fallaChips, fallaTexto.trim()].filter(Boolean).join(". ");

    startTransition(async () => {
      const r = await createOrdenTaller({
        userId: cliente?.userId,
        userMotoCompraId: motoId ?? undefined,
        placa: placa.trim().toUpperCase() || undefined,
        modelo: modeloFinal,
        color: color.trim() || undefined,
        contactoNombre: nombre.trim() || cliente?.nombre || undefined,
        contactoTelefono: telefono.trim() || cliente?.telefono || undefined,
        descripcionFalla: falla || undefined,
        kilometraje: kilometraje ? Number(kilometraje) : undefined,
        mecanicoId: mecanicoId ?? undefined,
        fotos,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Moto recibida");
      reset();
      onOpenChange(false);
      router.push(`/taller/${r.id}`);
      router.refresh();
    });
  }

  async function onPickPhotos(files: FileList | null) {
    if (!files?.length) return;
    const remaining = 8 - fotos.length;
    const slice = [...files].slice(0, remaining);
    for (const file of slice) {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("folder", "ingresos");
      const r = await subirFotoTaller(fd);
      if (!r.ok) {
        toast.error(r.error);
        continue;
      }
      setFotos((prev) => [...prev, r.publicUrl]);
    }
  }

  const stepsOrder: Step[] = esCliente
    ? ["tipo", "cliente", "datos", "historial", "fotos", "falla", "mecanico"]
    : ["tipo", "datos", "historial", "fotos", "falla", "mecanico"];
  const stepIndex = Math.max(0, stepsOrder.indexOf(step));

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle>Llegó una moto</DialogTitle>
          <DialogDescription>
            Paso {stepIndex + 1} de {stepsOrder.length}
          </DialogDescription>
          <div
            className="mt-2 flex gap-1"
            role="progressbar"
            aria-valuenow={stepIndex + 1}
            aria-valuemin={1}
            aria-valuemax={stepsOrder.length}
          >
            {stepsOrder.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 flex-1 rounded-full",
                  i <= stepIndex ? "bg-primary" : "bg-muted",
                )}
              />
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {step === "tipo" ? (
            <div className="flex flex-col gap-3">
              <p className="text-base font-medium">¿Es cliente de SP?</p>
              <Button
                type="button"
                className="min-h-16 touch-manipulation justify-start gap-3 text-base"
                onClick={() => {
                  setEsCliente(true);
                  setStep("cliente");
                }}
              >
                <User className="size-6" />
                Sí, es cliente
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-16 touch-manipulation justify-start gap-3 text-base"
                onClick={() => {
                  setEsCliente(false);
                  setStep("datos");
                }}
              >
                <UserX className="size-6" />
                No, es particular
              </Button>
            </div>
          ) : null}

          {step === "cliente" ? (
            <div className="flex flex-col gap-3">
              <Label htmlFor="buscar-cliente">Nombre, cédula o placa</Label>
              <Input
                id="buscar-cliente"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="min-h-11 text-base"
                autoComplete="off"
                autoFocus
              />
              <ul className="flex flex-col gap-2">
                {clientHits.map((h) => (
                  <li key={h.userId}>
                    <button
                      type="button"
                      className="flex w-full min-h-14 touch-manipulation flex-col items-start rounded-lg border border-border px-3 py-2 text-left hover:bg-muted"
                      onClick={() => {
                        setCliente(h);
                        setNombre(h.nombre);
                        setTelefono(h.telefono ?? "");
                        if (h.motos[0]) {
                          setMotoId(h.motos[0].id);
                          setPlaca(h.motos[0].placa ?? "");
                          setModelo(h.motos[0].modelo || "NKD 125");
                          setColor(h.motos[0].color ?? "");
                        }
                        setStep("datos");
                      }}
                    >
                      <span className="font-medium">{h.nombre}</span>
                      <span className="text-xs text-muted-foreground">
                        {h.motos.map((m) => m.placa || m.modelo).join(" · ") ||
                          "Sin moto registrada"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11"
                onClick={() => setStep("datos")}
              >
                Seguir sin elegir
              </Button>
            </div>
          ) : null}

          {step === "datos" ? (
            <div className="flex flex-col gap-4">
              {cliente?.motos && cliente.motos.length > 1 ? (
                <div className="flex flex-col gap-2">
                  <Label>¿Cuál moto?</Label>
                  <div className="flex flex-wrap gap-2">
                    {cliente.motos.map((m) => (
                      <Button
                        key={m.id}
                        type="button"
                        variant={motoId === m.id ? "default" : "outline"}
                        className="min-h-11"
                        onClick={() => {
                          setMotoId(m.id);
                          setPlaca(m.placa ?? "");
                          setModelo(m.modelo || modelo);
                          setColor(m.color ?? "");
                        }}
                      >
                        {m.placa || m.modelo}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-col gap-2">
                <Label htmlFor="placa">Placa</Label>
                <Input
                  id="placa"
                  value={placa}
                  onChange={(e) => setPlaca(e.target.value.toUpperCase())}
                  className="min-h-11 text-base uppercase"
                  autoComplete="off"
                  placeholder="ABC12D"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label>Modelo</Label>
                <div className="flex flex-wrap gap-2">
                  {MODELOS.map((m) => (
                    <Button
                      key={m}
                      type="button"
                      variant={modelo === m ? "default" : "outline"}
                      className="min-h-10"
                      onClick={() => setModelo(m)}
                    >
                      {m}
                    </Button>
                  ))}
                </div>
                {modelo === "Otro" ? (
                  <Input
                    value={modeloOtro}
                    onChange={(e) => setModeloOtro(e.target.value)}
                    placeholder="Escribe el modelo"
                    className="min-h-11 text-base"
                  />
                ) : null}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="color">Color</Label>
                <Input
                  id="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="min-h-11 text-base"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="contacto">Nombre del dueño</Label>
                <Input
                  id="contacto"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="min-h-11 text-base"
                  autoComplete="name"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="tel">Celular (WhatsApp)</Label>
                <Input
                  id="tel"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  className="min-h-11 text-base"
                  inputMode="tel"
                  autoComplete="tel"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="km">Kilometraje (opcional)</Label>
                <Input
                  id="km"
                  value={kilometraje}
                  onChange={(e) =>
                    setKilometraje(e.target.value.replace(/\D/g, ""))
                  }
                  className="min-h-11 text-base"
                  inputMode="numeric"
                />
              </div>
            </div>
          ) : null}

          {step === "historial" ? (
            <div className="flex flex-col gap-3">
              <p className="text-base font-medium">
                Esta moto ya vino {historial.length}{" "}
                {historial.length === 1 ? "vez" : "veces"}
              </p>
              <ul className="flex flex-col gap-2">
                {historial.map((h) => (
                  <li
                    key={h.id}
                    className="rounded-lg border border-border p-3 text-sm"
                  >
                    <p className="font-medium">
                      #{h.numero} ·{" "}
                      {new Date(h.created_at).toLocaleDateString("es-CO")}
                    </p>
                    <p className="text-muted-foreground">
                      {h.trabajos.slice(0, 3).join(" · ") || "Sin detalle"}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {step === "fotos" ? (
            <div className="flex flex-col gap-3">
              <p className="text-base font-medium">Fotos de cómo llegó</p>
              <p className="text-sm text-muted-foreground">
                Recomendado. Sirve si después dicen que ya estaba rayada.
              </p>
              <label className="flex min-h-24 cursor-pointer touch-manipulation flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-6">
                <Camera className="size-8 text-muted-foreground" />
                <span className="text-sm font-medium">Tomar o elegir fotos</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="sr-only"
                  onChange={(e) => void onPickPhotos(e.target.files)}
                />
              </label>
              {fotos.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {fotos.map((url) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={url}
                      src={url}
                      alt=""
                      className="aspect-square rounded-lg object-cover"
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {step === "falla" ? (
            <div className="flex flex-col gap-3">
              <p className="text-base font-medium">¿Qué falla?</p>
              <div className="flex flex-wrap gap-2">
                {FALLAS.map((f) => {
                  const on = fallaChips.includes(f);
                  return (
                    <Button
                      key={f}
                      type="button"
                      variant={on ? "default" : "outline"}
                      className="min-h-10"
                      onClick={() =>
                        setFallaChips((prev) =>
                          on ? prev.filter((x) => x !== f) : [...prev, f],
                        )
                      }
                    >
                      {f}
                    </Button>
                  );
                })}
              </div>
              <Textarea
                value={fallaTexto}
                onChange={(e) => setFallaTexto(e.target.value)}
                placeholder="Más detalle (opcional)"
                className="min-h-24 text-base"
              />
            </div>
          ) : null}

          {step === "mecanico" ? (
            <div className="flex flex-col gap-3">
              <p className="text-base font-medium">¿Quién la arregla?</p>
              <div className="grid grid-cols-2 gap-2">
                {mecanicos.map((m) => {
                  const on = mecanicoId === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setMecanicoId(m.id)}
                      className={cn(
                        "flex min-h-20 touch-manipulation flex-col items-center justify-center gap-2 rounded-xl border-2 p-3",
                        on
                          ? "border-primary bg-primary/10"
                          : "border-border hover:bg-muted",
                      )}
                    >
                      {m.foto_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={m.foto_url}
                          alt=""
                          className="size-12 rounded-full object-cover"
                        />
                      ) : (
                        <span
                          className="flex size-12 items-center justify-center rounded-full text-lg font-bold text-white"
                          style={{ backgroundColor: m.color ?? "#64748b" }}
                        >
                          {m.nombre.slice(0, 1)}
                        </span>
                      )}
                      <span className="text-sm font-medium">{m.nombre}</span>
                    </button>
                  );
                })}
              </div>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11"
                onClick={() => setMecanicoId(null)}
              >
                Después elijo
              </Button>
            </div>
          ) : null}
        </div>

        <div className="flex gap-2 border-t border-border p-3 safe-area-bottom">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 flex-1 gap-1"
            disabled={pending || step === "tipo"}
            onClick={() => {
              const idx = stepsOrder.indexOf(step);
              if (idx <= 0) return;
              let prev = stepsOrder[idx - 1]!;
              if (prev === "historial" && historial.length === 0) {
                prev = stepsOrder[idx - 2] ?? "datos";
              }
              setStep(prev);
            }}
          >
            <ChevronLeft className="size-4" />
            Atrás
          </Button>
          {step === "mecanico" ? (
            <Button
              type="button"
              className="min-h-11 flex-1"
              disabled={pending}
              onClick={submit}
            >
              {pending ? "Guardando…" : "Recibir moto"}
            </Button>
          ) : (
            <Button
              type="button"
              className="min-h-11 flex-1 gap-1"
              disabled={pending || (step === "datos" && !modelo.trim())}
              onClick={() => {
                if (step === "datos") {
                  void goAfterDatos();
                  return;
                }
                if (step === "historial") {
                  setStep("fotos");
                  return;
                }
                if (step === "fotos") {
                  setStep("falla");
                  return;
                }
                if (step === "falla") {
                  setStep("mecanico");
                  return;
                }
                if (step === "cliente") setStep("datos");
              }}
            >
              Siguiente
              <ChevronRight className="size-4" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
