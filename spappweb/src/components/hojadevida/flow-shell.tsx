"use client";

import { Check, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const PHASES = [
  { id: "fotos", label: "Fotos" },
  { id: "datos", label: "Tus datos" },
  { id: "listo", label: "Listo" },
] as const;

export type FlowPhase = (typeof PHASES)[number]["id"];

export function FlowPhaseBar({ active }: { active: FlowPhase }) {
  const activeIdx = PHASES.findIndex((p) => p.id === active);

  return (
    <nav aria-label="Progreso del trámite" className="mb-6">
      <ol className="flex items-center justify-between gap-1">
        {PHASES.map((phase, i) => {
          const done = i < activeIdx;
          const current = i === activeIdx;
          return (
            <li key={phase.id} className="flex flex-1 flex-col items-center gap-1">
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold",
                  done && "bg-primary text-primary-foreground",
                  current && "bg-primary text-primary-foreground ring-4 ring-black/15",
                  !done && !current && "bg-muted text-muted-foreground",
                )}
                aria-current={current ? "step" : undefined}
              >
                {done ? <Check className="h-5 w-5" strokeWidth={2.5} /> : i + 1}
              </div>
              <span
                className={cn(
                  "text-center text-xs font-medium",
                  current ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {phase.label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function FlowProgress({
  step,
  total,
  title,
}: {
  step: number;
  total: number;
  title: string;
}) {
  const pct = Math.round((step / total) * 100);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-foreground">
          Paso {step} de {total}
        </span>
        <span className="text-muted-foreground">{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-base font-medium text-foreground">{title}</p>
    </div>
  );
}

export function StepCard({
  title,
  instruction,
  help,
  children,
}: {
  title: string;
  instruction?: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border-2 border-border bg-background p-5 shadow-sm">
      <h2 className="text-xl font-bold leading-snug text-foreground">{title}</h2>
      {instruction && (
        <p className="mt-2 text-base leading-relaxed text-foreground">
          {instruction}
        </p>
      )}
      {help && (
        <div className="mt-4 rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm leading-relaxed text-foreground">
          {help}
        </div>
      )}
      <div className="mt-5 flex flex-col gap-4">{children}</div>
    </div>
  );
}

export function FieldBlock({
  label,
  hint,
  example,
  children,
}: {
  label: string;
  hint?: string;
  example?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="block text-base font-semibold text-foreground">{label}</label>
      {hint && (
        <p className="text-sm leading-relaxed text-muted-foreground">{hint}</p>
      )}
      {example && (
        <p className="text-sm text-muted-foreground">
          Ejemplo: <span className="font-medium text-foreground">{example}</span>
        </p>
      )}
      {children}
    </div>
  );
}

export function StickyActions({
  primary,
  secondary,
}: {
  primary: React.ReactNode;
  secondary?: React.ReactNode;
}) {
  return (
    <div className="sticky bottom-0 -mx-4 mt-6 flex flex-col gap-3 border-t border-border bg-background px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      {primary}
      {secondary}
    </div>
  );
}

export function PrimaryAction({
  children,
  disabled,
  onClick,
  type = "button",
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <Button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="min-h-14 w-full touch-manipulation text-base font-semibold bg-primary text-primary-foreground hover:bg-primary/80 active:bg-neutral-900 disabled:opacity-50"
    >
      {children}
    </Button>
  );
}

export function SecondaryAction({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled}
      onClick={onClick}
      className="min-h-12 w-full touch-manipulation text-base font-medium"
    >
      <ChevronLeft className="mr-1 h-5 w-5" />
      {children}
    </Button>
  );
}

export function ChoiceButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-14 w-full touch-manipulation rounded-xl border-2 px-4 text-base font-semibold transition-colors",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-foreground active:bg-muted/50",
      )}
    >
      {children}
    </button>
  );
}

export const fieldInputClass =
  "min-h-12 text-base touch-manipulation";
