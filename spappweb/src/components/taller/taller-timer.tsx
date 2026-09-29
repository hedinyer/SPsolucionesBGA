"use client";

import { useEffect, useState } from "react";
import {
  formatTimer,
  getOrdenTimerSeconds,
} from "@/lib/taller/timer-utils";
import { cn } from "@/lib/utils";

type TimerProps = {
  timerRunning: boolean;
  timerStartedAt: string | null;
  segundosAcumulados: number;
  /** Epoch ms del servidor al momento del render (corrige reloj del celular). */
  serverNow?: number;
  size?: "sm" | "lg";
  className?: string;
};

export function TallerTimerDisplay({
  timerRunning,
  timerStartedAt,
  segundosAcumulados,
  serverNow,
  size = "sm",
  className,
}: TimerProps) {
  const [tick, setTick] = useState(0);
  const [offset] = useState(() =>
    serverNow != null ? Date.now() - serverNow : 0,
  );

  useEffect(() => {
    if (!timerRunning) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [timerRunning]);

  void tick;

  const correctedStartedAt =
    timerRunning && timerStartedAt
      ? new Date(
          new Date(timerStartedAt).getTime() + offset,
        ).toISOString()
      : timerStartedAt;

  const seconds = getOrdenTimerSeconds({
    timer_running: timerRunning,
    timer_started_at: correctedStartedAt,
    segundos_acumulados: segundosAcumulados,
  });

  return (
    <time
      role="timer"
      aria-live="off"
      aria-atomic="true"
      dateTime={`PT${seconds}S`}
      className={cn(
        "font-mono tabular-nums tracking-tight",
        size === "lg" ? "text-4xl font-semibold sm:text-5xl" : "text-base font-medium",
        timerRunning &&
          "motion-safe:animate-pulse text-primary",
        className,
      )}
    >
      {formatTimer(seconds)}
    </time>
  );
}

export function formatSegundosCorto(total: number) {
  if (total < 60) return `${total}s`;
  if (total < 3600) return `${Math.floor(total / 60)} min`;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
