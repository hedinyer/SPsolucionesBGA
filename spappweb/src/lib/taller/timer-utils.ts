/** Segundos totales de reparación (acumulados + tramo en curso). */
export function getOrdenTimerSeconds(orden: {
  timer_running: boolean;
  timer_started_at: string | null;
  segundos_acumulados: number;
}): number {
  let total = orden.segundos_acumulados;
  if (orden.timer_running && orden.timer_started_at) {
    const elapsed = Math.floor(
      (Date.now() - new Date(orden.timer_started_at).getTime()) / 1000,
    );
    total += Math.max(0, elapsed);
  }
  return total;
}

export function formatTimer(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
