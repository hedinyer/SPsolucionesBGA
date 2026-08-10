import { Check, Circle, Lock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PipelineStep } from "@/lib/pipeline/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface ClientStepperProps {
  steps: PipelineStep[];
}

export function ClientStepper({ steps }: ClientStepperProps) {
  return (
    <Card>
      <CardContent className="pt-(--card-spacing)">
        {/* Mobile: horizontal scroll with snap */}
        <ol className="flex gap-3 overflow-x-auto pb-1 lg:hidden snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {steps.map((step) => (
            <li
              key={step.id}
              className="flex min-w-[5.5rem] shrink-0 snap-start flex-col items-center gap-1.5 text-center"
            >
              <StepIcon step={step} compact />
              <p
                className={cn(
                  "line-clamp-2 text-xs font-medium leading-tight",
                  step.state === "actual" && "text-foreground",
                  step.state === "completado" && "text-foreground",
                  step.state === "bloqueado" && "text-muted-foreground",
                  step.state === "pendiente" && "text-muted-foreground",
                  step.state === "error" && "text-destructive",
                )}
              >
                {step.label}
              </p>
              {step.adminActionRequired && (
                <Badge variant="secondary" className="text-[10px]">
                  Tu turno
                </Badge>
              )}
            </li>
          ))}
        </ol>

        {/* Desktop: horizontal stepper */}
        <ol className="hidden lg:flex lg:items-start">
          {steps.map((step, index) => (
            <li
              key={step.id}
              className="relative flex flex-1 flex-col items-center text-center"
            >
              {index < steps.length - 1 && (
                <div
                  aria-hidden
                  className="absolute top-4 left-[calc(50%+1.125rem)] h-0.5 w-[calc(100%-2.25rem)] bg-border"
                />
              )}
              <StepIcon step={step} />
              <div className="mt-2 min-w-0 px-1">
                <p
                  className={cn(
                    "text-sm font-medium",
                    step.state === "actual" && "text-foreground",
                    step.state === "completado" && "text-foreground",
                    step.state === "bloqueado" && "text-muted-foreground",
                    step.state === "pendiente" && "text-muted-foreground",
                    step.state === "error" && "text-destructive",
                  )}
                >
                  {step.label}
                </p>
                {step.adminActionRequired && (
                  <Badge variant="secondary" className="mt-1 text-[10px]">
                    Tu turno
                  </Badge>
                )}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function StepIcon({
  step,
  compact = false,
}: {
  step: PipelineStep;
  compact?: boolean;
}) {
  const size = compact ? "size-8" : "size-9";
  const base = cn(
    "relative z-10 flex items-center justify-center rounded-full border-2",
    size,
  );

  if (step.state === "completado") {
    return (
      <div className={cn(base, "border-primary bg-primary text-primary-foreground")}>
        <Check className="size-3.5 sm:size-4" strokeWidth={2} />
      </div>
    );
  }
  if (step.state === "error") {
    return (
      <div className={cn(base, "border-destructive bg-destructive/10 text-destructive")}>
        <X className="size-3.5 sm:size-4" strokeWidth={2} />
      </div>
    );
  }
  if (step.state === "actual") {
    return (
      <div className={cn(base, "border-primary bg-background text-foreground")}>
        <Circle className="size-2.5 fill-primary text-primary sm:size-3" />
      </div>
    );
  }
  if (step.state === "bloqueado") {
    return (
      <div className={cn(base, "border-border bg-muted text-muted-foreground")}>
        <Lock className="size-3 sm:size-3.5" strokeWidth={1.75} />
      </div>
    );
  }
  return (
    <div className={cn(base, "border-border bg-background text-muted-foreground")}>
      <Circle className="size-2.5 sm:size-3" strokeWidth={1.5} />
    </div>
  );
}
