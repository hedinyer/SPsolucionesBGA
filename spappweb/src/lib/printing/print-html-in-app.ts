/**
 * Imprime HTML en la misma pestaña vía iframe oculto (sin window.open).
 */
export function printHtmlInApp(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.setAttribute(
      "style",
      "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none",
    );
    document.body.appendChild(iframe);

    let settled = false;
    const cleanup = () => {
      URL.revokeObjectURL(url);
      iframe.remove();
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    iframe.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("No se pudo abrir el diálogo de impresión."));
    };

    iframe.onload = () => {
      const win = iframe.contentWindow;
      if (!win) {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error("No se pudo abrir el diálogo de impresión."));
        return;
      }

      win.onafterprint = finish;

      window.setTimeout(() => {
        try {
          win.focus();
          win.print();
        } catch {
          finish();
          return;
        }
        // Fallback si el navegador no dispara afterprint
        window.setTimeout(finish, 120_000);
      }, 250);
    };

    iframe.src = url;
  });
}
