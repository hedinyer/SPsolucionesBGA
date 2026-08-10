export { formatCop } from "./format-cop";

export function formatDate(date: string | Date | null | undefined): string {  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export function formatDateOnly(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" }).format(d);
}

export { formatCuotas } from "@/lib/payments/payment-metrics";
