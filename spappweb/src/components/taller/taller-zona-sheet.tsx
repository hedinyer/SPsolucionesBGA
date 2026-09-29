"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { addTarea } from "@/lib/actions/taller-actions";
import {
  zonaMotoLabel,
  zonaMotoTareasRapidas,
  type ZonaMotoId,
} from "@/lib/taller/zonas-moto";
import type { TareaGravedad } from "@/lib/taller/types";
import { GRAVEDAD_LABEL } from "@/lib/taller/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const GRAVEDAD_BTN: Record<
  TareaGravedad,
  { bg: string; active: string; icon: string }
> = {
  bien: {
    bg: "border-emerald-300 hover:bg-emerald-50",
    active: "bg-emerald-600 text-white border-emerald-600",
    icon: "✓",
  },
  pronto: {
    bg: "border-amber-300 hover:bg-amber-50",
    active: "bg-amber-500 text-white border-amber-500",
    icon: "!",
  },
  urgente: {
    bg: "border-red-300 hover:bg-red-50",
    active: "bg-red-600 text-white border-red-600",
    icon: "!!",
  },
};

export function TallerZonaSheet({
  ordenId,
  zona,
  open,
  onOpenChange,
  onAskRepuesto,
}: {
  ordenId: string;
  zona: ZonaMotoId | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAskRepuesto?: (zona: ZonaMotoId) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [gravedad, setGravedad] = useState<TareaGravedad>("pronto");
  const [nota, setNota] = useState("");
  const [chip, setChip] = useState<string | null>(null);

  const label = zona ? zonaMotoLabel(zona) : "";
  const rapidas = zona ? zonaMotoTareasRapidas(zona) : [];

  function reset() {
    setGravedad("pronto");
    setNota("");
    setChip(null);
  }

  function save(text: string) {
    if (!zona || !text.trim()) return;
    startTransition(async () => {
      const r = await addTarea({
        ordenId,
        zona,
        nota: text.trim(),
        gravedad,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Tarea guardada");
      reset();
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <SheetContent
        side="bottom"
        className="max-h-[90dvh] overflow-y-auto rounded-t-2xl safe-area-bottom"
      >
        <SheetHeader>
          <SheetTitle>{label || "Parte de la moto"}</SheetTitle>
          <SheetDescription>
            Elige qué tan grave es y qué vas a hacer.
          </SheetDescription>
        </SheetHeader>

        {zona ? (
          <div className="flex flex-col gap-5 px-4 pb-6">
            <div
              className="grid grid-cols-3 gap-2"
              role="radiogroup"
              aria-label="Qué tan grave"
            >
              {(["bien", "pronto", "urgente"] as const).map((g) => {
                const active = gravedad === g;
                return (
                  <button
                    key={g}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setGravedad(g)}
                    className={cn(
                      "flex min-h-14 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-xl border-2 text-sm font-semibold",
                      active ? GRAVEDAD_BTN[g].active : GRAVEDAD_BTN[g].bg,
                    )}
                  >
                    <span aria-hidden className="text-lg">
                      {GRAVEDAD_BTN[g].icon}
                    </span>
                    {GRAVEDAD_LABEL[g]}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Tareas rápidas</p>
              <div className="flex flex-wrap gap-2">
                {rapidas.map((t) => {
                  const on = chip === t;
                  return (
                    <Button
                      key={t}
                      type="button"
                      size="sm"
                      variant={on ? "default" : "outline"}
                      className="min-h-10 touch-manipulation"
                      onClick={() => {
                        setChip(t);
                        setNota(t);
                      }}
                    >
                      {on ? <Check className="size-3.5" /> : null}
                      {t}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="tarea-nota">Escribe o habla</Label>
              <Textarea
                id="tarea-nota"
                value={nota}
                onChange={(e) => {
                  setNota(e.target.value);
                  setChip(null);
                }}
                placeholder="Ej.: Pastillas al 2 mm, cambiar ya"
                className="min-h-24 text-base"
                rows={3}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Button
                type="button"
                className="min-h-12 w-full touch-manipulation gap-2 text-base"
                disabled={pending || !nota.trim()}
                onClick={() => save(nota)}
              >
                <Plus className="size-5" />
                Guardar tarea
              </Button>
              {onAskRepuesto ? (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 w-full touch-manipulation"
                  onClick={() => {
                    onOpenChange(false);
                    onAskRepuesto(zona);
                  }}
                >
                  Pedir repuesto para esta parte
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 w-full touch-manipulation gap-2"
                onClick={() => onOpenChange(false)}
              >
                <X className="size-4" />
                Cancelar
              </Button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
