import type { CajaSesionState } from "@/lib/actions/caja-actions";
import { formatCop } from "@/lib/utils/format";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function folio(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function fechaLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(d);
}

function line(
  label: string,
  value: number,
  opts?: { sign?: "+" | "−"; skipZero?: boolean },
): string {
  if (opts?.skipZero !== false && value === 0) return "";
  const sign = opts?.sign ? `${opts.sign} ` : "";
  return `<tr><td>${esc(label)}</td><td class="num">${esc(sign + formatCop(value))}</td></tr>`;
}

export function buildCajaArqueoReceiptHtml(
  sesion: CajaSesionState,
  origin = "",
): string {
  const f = folio(sesion.id);
  const beraLogo = `${origin}/beralogo.jpg`;
  const sgLogo = `${origin}/logosolucionesgarrido.jpg`;
  const e = sesion.informe.efectivo;
  const nequi = sesion.informe.nequi;
  const davi = sesion.informe.davivienda;
  const egresos = sesion.informe.egresos;
  const contado = sesion.montoCierre ?? 0;
  const esperado = sesion.efectivoEsperado;
  const diferencia =
    sesion.diferencia ?? contado - esperado;
  const diffLabel =
    diferencia === 0 ? "Cuadra" : diferencia < 0 ? "Falta" : "Sobra";
  const diffClass =
    diferencia === 0 ? "ok" : diferencia < 0 ? "bad" : "warn";

  const notasHtml = sesion.notasCierre
    ? `<div class="block"><div class="label">Notas de cierre</div><div>${esc(sesion.notasCierre)}</div></div>`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Arqueo de caja ${esc(f)}</title>
<style>
@media print { body { margin: 0; } }
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 11px;
  color: #111;
  max-width: 80mm;
  margin: 0 auto;
  padding: 8px 10px 16px;
}
.logos { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 6px; }
.logos img { max-height: 28px; width: auto; object-fit: contain; }
.divider { border: none; border-top: 1px dashed #999; margin: 8px 0; }
.header { text-align: center; }
.header h1 { font-size: 13px; font-weight: 700; letter-spacing: 0.02em; text-transform: uppercase; }
.folio { font-size: 12px; font-weight: 700; margin-top: 2px; }
.meta { color: #555; margin-top: 2px; line-height: 1.35; }
.block { margin: 6px 0; }
.label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; color: #666; margin-bottom: 3px; }
table { width: 100%; border-collapse: collapse; }
td { padding: 2px 0; vertical-align: top; }
td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.totals td { padding-top: 4px; font-weight: 700; }
.badge {
  margin-top: 8px;
  text-align: center;
  font-weight: 700;
  padding: 6px;
  border: 1px solid #111;
}
.badge.ok { background: #ecfdf5; }
.badge.bad { background: #fef2f2; }
.badge.warn { background: #fffbeb; }
.firmas { display: flex; gap: 12px; margin-top: 28px; }
.firma { flex: 1; text-align: center; }
.firma .line { border-top: 1px solid #333; margin-top: 36px; padding-top: 4px; font-size: 10px; }
.footer { text-align: center; color: #888; margin-top: 12px; font-size: 10px; }
</style></head><body>
<div class="logos">
  <img src="${esc(beraLogo)}" alt="Bera" />
  <img src="${esc(sgLogo)}" alt="Soluciones Garrido" />
</div>
<hr class="divider" />
<div class="header">
  <h1>Arqueo de caja</h1>
  <div class="folio">${esc(f)}</div>
  <div class="meta">
    Apertura: ${esc(fechaLabel(sesion.openedAt))}<br />
    Cierre: ${esc(fechaLabel(sesion.closedAt))}
  </div>
</div>
<hr class="divider" />
<div class="block">
  <div class="label">Efectivo en caja</div>
  <table>
    ${line("Apertura", e.apertura, { sign: "+", skipZero: false })}
    ${line("Ventas productos", e.ventasProducto, { sign: "+" })}
    ${line("Ventas motos", e.ventasMoto, { sign: "+" })}
    ${line("Pagos crédito (efectivo)", e.pagosCredito, { sign: "+" })}
    ${line("Visitas (efectivo)", e.pagosVisitaEfectivo, { sign: "+" })}
    ${line("Entradas manuales", e.entradasManuales, { sign: "+" })}
    ${line("Salidas manuales", e.salidasManuales, { sign: "−" })}
    ${line("Egresos en efectivo", e.pagosSalida, { sign: "−" })}
    <tr class="totals"><td>Efectivo esperado</td><td class="num">${esc(formatCop(esperado))}</td></tr>
    <tr class="totals"><td>Efectivo contado</td><td class="num">${esc(formatCop(contado))}</td></tr>
  </table>
  <div class="badge ${diffClass}">${esc(diffLabel)}: ${esc(formatCop(Math.abs(diferencia)))}</div>
</div>
<hr class="divider" />
<div class="block">
  <div class="label">Transferencias y egresos</div>
  <table>
    ${line(`Nequi ingresos (${nequi.cantidad})`, nequi.monto, { skipZero: false })}
    ${line("Nequi egresos", nequi.pagosSalida)}
    ${line(`Davivienda ingresos (${davi.cantidad})`, davi.monto, { skipZero: false })}
    ${line("Davivienda egresos", davi.pagosSalida)}
    ${line(`Egresos totales (${egresos.cantidad})`, egresos.total, { skipZero: false })}
    ${line("Ingresos del día", sesion.informe.ingresosDia, { skipZero: false })}
    ${line("Neto del día", sesion.informe.netoDia, { skipZero: false })}
  </table>
</div>
${notasHtml}
<div class="firmas">
  <div class="firma"><div class="line">Entregó</div></div>
  <div class="firma"><div class="line">Recibió</div></div>
</div>
<div class="footer">Documento de arqueo · ${esc(f)}</div>
</body></html>`;
}

function triggerPrint(win: Window): void {
  window.setTimeout(() => {
    try {
      win.focus();
      win.print();
    } catch {
      // el usuario imprime con Ctrl+P desde la pestaña abierta
    }
  }, 400);
}

export async function printCajaArqueoReceipt(
  sesion: CajaSesionState,
): Promise<void> {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  const html = buildCajaArqueoReceiptHtml(sesion, origin);
  const popup = window.open("", "_blank", "noopener,noreferrer");
  if (popup) {
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    triggerPrint(popup);
    return;
  }

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.setAttribute(
    "style",
    "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0",
  );
  iframe.src = url;
  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (win) triggerPrint(win);
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
      iframe.remove();
    }, 120_000);
  };
  document.body.appendChild(iframe);
}
