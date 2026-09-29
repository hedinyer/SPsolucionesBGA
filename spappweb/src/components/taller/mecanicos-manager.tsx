"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, Pencil, Plus, Trophy } from "lucide-react";
import { toast } from "sonner";
import {
  deleteMecanico,
  saveMecanico,
  subirFotoTaller,
} from "@/lib/actions/taller-actions";
import type { MecanicoStats } from "@/lib/taller/types";
import { MECANICO_COLORES } from "@/lib/taller/types";
import {
  formatSegundosCorto,
  TallerTimerDisplay,
} from "@/components/taller/taller-timer";
import { TallerRealtimeRefresh } from "@/components/taller/taller-realtime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function MecanicosManager({
  mecanicos,
}: {
  mecanicos: MecanicoStats[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [activo, setActivo] = useState(true);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [color, setColor] = useState<string>(MECANICO_COLORES[0]);

  const ranking = [...mecanicos]
    .filter((m) => m.activo)
    .sort((a, b) => b.segundosSemana - a.segundosSemana);

  function openNew() {
    setEditId(null);
    setNombre("");
    setTelefono("");
    setActivo(true);
    setFotoUrl(null);
    setColor(
      MECANICO_COLORES[Math.floor(Math.random() * MECANICO_COLORES.length)]!,
    );
    setOpen(true);
  }

  function openEdit(m: MecanicoStats) {
    setEditId(m.id);
    setNombre(m.nombre);
    setTelefono(m.telefono ?? "");
    setActivo(m.activo);
    setFotoUrl(m.foto_url);
    setColor(m.color ?? MECANICO_COLORES[0]!);
    setOpen(true);
  }

  async function onPickFoto(file: File | null) {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    fd.set("folder", "mecanicos");
    const r = await subirFotoTaller(fd);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    setFotoUrl(r.publicUrl);
  }

  return (
    <div className="flex flex-col gap-6">
      <TallerRealtimeRefresh />

      <Button
        type="button"
        className="min-h-12 w-full gap-2 sm:w-auto"
        onClick={openNew}
      >
        <Plus className="size-4" />
        Nuevo mecánico
      </Button>

      {ranking.length > 0 ? (
        <section className="rounded-xl border border-border p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Trophy className="size-4 text-amber-500" />
            Ranking de la semana
          </h2>
          <ol className="flex flex-col gap-2">
            {ranking.slice(0, 5).map((m, i) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  <span className="w-5 tabular-nums text-muted-foreground">
                    {i + 1}.
                  </span>
                  <span
                    className="size-3 rounded-full"
                    style={{ backgroundColor: m.color ?? "#64748b" }}
                  />
                  {m.nombre}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {formatSegundosCorto(m.segundosSemana)}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <ul className="flex flex-col gap-3">
        {mecanicos.map((m) => (
          <li
            key={m.id}
            className={cn(
              "flex flex-col gap-3 rounded-xl border p-4",
              m.activo ? "border-border bg-background" : "border-dashed opacity-70",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                {m.foto_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.foto_url}
                    alt=""
                    className="size-14 rounded-full object-cover"
                  />
                ) : (
                  <span
                    className="flex size-14 items-center justify-center rounded-full text-xl font-bold text-white"
                    style={{ backgroundColor: m.color ?? "#64748b" }}
                  >
                    {m.nombre.slice(0, 1)}
                  </span>
                )}
                <div>
                  <p className="text-lg font-semibold">{m.nombre}</p>
                  {m.telefono ? (
                    <p className="text-sm text-muted-foreground">{m.telefono}</p>
                  ) : null}
                  {!m.activo ? (
                    <Badge variant="outline">Inactivo</Badge>
                  ) : null}
                </div>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-10"
                aria-label={`Editar ${m.nombre}`}
                onClick={() => openEdit(m)}
              >
                <Pencil className="size-4" />
              </Button>
            </div>

            {m.trabajandoEn ? (
              <Link
                href={`/taller/${m.trabajandoEn.ordenId}`}
                className="flex items-center justify-between rounded-lg bg-primary/10 px-3 py-2 text-sm"
              >
                <span>
                  Ahora en:{" "}
                  <strong className="uppercase">
                    {m.trabajandoEn.placa || m.trabajandoEn.modelo}
                  </strong>
                </span>
                <TallerTimerDisplay
                  timerRunning
                  timerStartedAt={m.trabajandoEn.desde}
                  segundosAcumulados={m.trabajandoEn.segundosPrevios}
                />
              </Link>
            ) : (
              <p className="text-sm text-muted-foreground">Libre ahora</p>
            )}

            <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
              <Stat label="Hoy" value={formatSegundosCorto(m.segundosHoy)} />
              <Stat
                label="Semana"
                value={formatSegundosCorto(m.segundosSemana)}
              />
              <Stat label="Motos 30d" value={String(m.terminadas30d)} />
              <Stat
                label="Promedio"
                value={
                  m.promedioPorMoto != null
                    ? formatSegundosCorto(m.promedioPorMoto)
                    : "—"
                }
              />
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editId ? "Editar mecánico" : "Nuevo mecánico"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center gap-2">
              <label className="relative cursor-pointer">
                {fotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={fotoUrl}
                    alt=""
                    className="size-20 rounded-full object-cover"
                  />
                ) : (
                  <span
                    className="flex size-20 items-center justify-center rounded-full text-2xl font-bold text-white"
                    style={{ backgroundColor: color }}
                  >
                    {(nombre || "?").slice(0, 1)}
                  </span>
                )}
                <span className="absolute right-0 bottom-0 flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Camera className="size-4" />
                </span>
                <input
                  type="file"
                  accept="image/*"
                  capture="user"
                  className="sr-only"
                  onChange={(e) =>
                    void onPickFoto(e.target.files?.[0] ?? null)
                  }
                />
              </label>
              <div className="flex flex-wrap justify-center gap-2">
                {MECANICO_COLORES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Color ${c}`}
                    aria-pressed={color === c}
                    onClick={() => setColor(c)}
                    className={cn(
                      "size-8 rounded-full border-2",
                      color === c ? "border-foreground" : "border-transparent",
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="mec-nombre">Nombre</Label>
              <Input
                id="mec-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="min-h-11 text-base"
                autoComplete="name"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="mec-tel">Celular</Label>
              <Input
                id="mec-tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                className="min-h-11 text-base"
                inputMode="tel"
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="mec-activo">Activo</Label>
              <Switch
                id="mec-activo"
                checked={activo}
                onCheckedChange={setActivo}
              />
            </div>

            <Button
              type="button"
              className="min-h-12"
              disabled={pending || !nombre.trim()}
              onClick={() => {
                startTransition(async () => {
                  const r = await saveMecanico({
                    id: editId ?? undefined,
                    nombre: nombre.trim(),
                    telefono: telefono.trim() || undefined,
                    activo,
                    fotoUrl,
                    color,
                  });
                  if (!r.ok) {
                    toast.error(r.error);
                    return;
                  }
                  toast.success(editId ? "Actualizado" : "Creado");
                  setOpen(false);
                  router.refresh();
                });
              }}
            >
              Guardar
            </Button>

            {editId && activo ? (
              <Button
                type="button"
                variant="ghost"
                className="min-h-10 text-destructive"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    const r = await deleteMecanico(editId);
                    if (!r.ok) {
                      toast.error(r.error);
                      return;
                    }
                    toast.success("Desactivado");
                    setOpen(false);
                    router.refresh();
                  });
                }}
              >
                Desactivar
              </Button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 px-2 py-2">
      <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}
