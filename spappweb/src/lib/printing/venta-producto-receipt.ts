import type { VentaProductoRow } from "@/lib/actions/venta-producto-actions";
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

function fechaLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return new Intl.DateTimeFormat("es-CO", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Bogota",
    }).format(new Date());
  }
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(d);
}

async function qrDataUrl(text: string): Promise<string> {
  const QRCode = (await import("qrcode")).default;
  return QRCode.toDataURL(text, {
    width: 200,
    margin: 1,
    errorCorrectionLevel: "M",
  });
}

export async function buildVentaProductoReceiptHtml(
  venta: VentaProductoRow,
  origin = "",
): Promise<string> {
  const f = folio(venta.id);
  const qrSrc = await qrDataUrl(f);
  const beraLogo = `${origin}/beralogo.jpg`;
  const sgLogo = `${origin}/logosolucionesgarrido.jpg`;

  const saldo = Math.max(0, venta.total - venta.montoPagado);
  const contado = saldo === 0;

  const itemsHtml = venta.items
    .map(
      (item) => `
    <div class="item">
      <div class="item-name">${esc(item.nombre)}</div>
      <div class="item-meta">${esc(item.sku)} · ${item.cantidad} × ${esc(formatCop(item.precioUnitario))}</div>
      <div class="item-sub">${esc(formatCop(item.subtotal))}</div>
    </div>`,
    )
    .join("");

  const cedulaHtml = venta.clienteCedula
    ? `CC ${esc(venta.clienteCedula)} · `
    : "";

  const notasHtml = venta.notas
    ? `<div class="section"><div class="label">Notas</div><div class="value">${esc(venta.notas)}</div></div>`
    : "";

  // ponytail: sin @page size raro — Chrome lanza "Error interno" al imprimir
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Venta productos ${esc(f)}</title>
<style>
@media print { body { margin: 0; } }
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 11px;
  max-width: 72mm;
  margin: 8px auto;
  padding: 8px 6px;
  color: #111;
  line-height: 1.4;
}
.logos {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 10px;
}
.logos img {
  max-width: 42%;
  max-height: 36px;
  object-fit: contain;
}
.divider {
  border: none;
  border-top: 1px dashed #ccc;
  margin: 10px 0;
}
.header {
  text-align: center;
  margin-bottom: 4px;
}
.header h1 {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #222;
}
.header .folio {
  font-family: ui-monospace, monospace;
  font-size: 13px;
  font-weight: 700;
  margin-top: 4px;
}
.header .fecha {
  font-size: 10px;
  color: #666;
  margin-top: 2px;
}
.section { margin-bottom: 8px; }
.label {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #888;
  margin-bottom: 3px;
}
.value {
  font-size: 12px;
  font-weight: 500;
  word-break: break-word;
}
.sub {
  font-size: 10px;
  color: #666;
  margin-top: 2px;
}
.items { margin: 8px 0; }
.item {
  padding: 6px 0;
  border-bottom: 1px dotted #ddd;
}
.item:last-child { border-bottom: none; }
.item-name { font-weight: 600; font-size: 11px; }
.item-meta { font-size: 9px; color: #666; margin-top: 1px; }
.item-sub {
  text-align: right;
  font-family: ui-monospace, monospace;
  font-weight: 600;
  font-size: 11px;
  margin-top: 2px;
}
.totals {
  background: #f5f5f5;
  border: 1px solid #e5e5e5;
  border-radius: 6px;
  padding: 8px 10px;
  margin: 8px 0;
}
.totals .row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 2px 0;
}
.totals .amount {
  font-family: ui-monospace, monospace;
  font-weight: 600;
}
.totals .saldo span:last-child { color: #b45309; }
.status-ok {
  text-align: center;
  font-weight: 700;
  font-size: 12px;
  color: #15803d;
  padding: 6px 0 2px;
  letter-spacing: 0.04em;
}
.qr-block {
  text-align: center;
  margin: 12px 0 8px;
}
.qr-block img {
  width: 100px;
  height: 100px;
}
.qr-block .folio-qr {
  font-family: ui-monospace, monospace;
  font-size: 11px;
  font-weight: 600;
  margin-top: 4px;
  letter-spacing: 0.1em;
}
.footer {
  text-align: center;
  font-size: 10px;
  color: #888;
  margin-top: 8px;
  font-style: italic;
}
</style></head><body>
<div class="logos">
  <img src="${esc(beraLogo)}" alt="Bera" />
  <img src="${esc(sgLogo)}" alt="Soluciones Garrido" />
</div>
<hr class="divider" />
<div class="header">
  <h1>Comprobante de venta</h1>
  <div class="folio">${esc(f)}</div>
  <div class="fecha">${esc(fechaLabel(venta.createdAt))}</div>
</div>
<hr class="divider" />
<div class="section">
  <div class="label">Cliente</div>
  <div class="value">${esc(venta.clienteNombre)}</div>
  <div class="sub">${cedulaHtml}${esc(venta.clienteCelular)}</div>
</div>
<hr class="divider" />
<div class="section">
  <div class="label">Productos</div>
  <div class="items">${itemsHtml}</div>
</div>
<div class="totals">
  <div class="row"><span>Total</span><span class="amount">${esc(formatCop(venta.total))}</span></div>
  <div class="row"><span>Pagado</span><span class="amount">${esc(formatCop(venta.montoPagado))}</span></div>
  ${
    contado
      ? `<div class="status-ok">✓ PAGO DE CONTADO</div>`
      : `<div class="row saldo"><span>Saldo</span><span class="amount">${esc(formatCop(saldo))}</span></div>`
  }
</div>
${notasHtml}
<hr class="divider" />
<div class="qr-block">
  <img src="${qrSrc}" alt="QR ${esc(f)}" />
  <div class="folio-qr">${esc(f)}</div>
</div>
<div class="footer">Gracias por su compra</div>
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

export async function printVentaProductoReceipt(
  venta: VentaProductoRow,
): Promise<void> {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  const html = await buildVentaProductoReceiptHtml(venta, origin);
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
