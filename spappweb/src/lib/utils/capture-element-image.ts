import html2canvas from "html2canvas-pro";

const COLOR_PROPS = [
  "color",
  "backgroundColor",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "outlineColor",
] as const;

function camelToKebab(value: string): string {
  return value.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

function applyComputedColors(source: Element, clone: Element) {
  if (!(source instanceof HTMLElement) || !(clone instanceof HTMLElement)) {
    return;
  }

  const computed = window.getComputedStyle(source);
  for (const prop of COLOR_PROPS) {
    const value = computed[prop];
    if (!value || value === "transparent" || value === "rgba(0, 0, 0, 0)") {
      continue;
    }
    clone.style.setProperty(camelToKebab(prop), value);
  }

  const sourceChildren = Array.from(source.children);
  const cloneChildren = Array.from(clone.children);
  sourceChildren.forEach((child, index) => {
    const cloneChild = cloneChildren[index];
    if (cloneChild) applyComputedColors(child, cloneChild);
  });
}

export async function captureElementAsPng(
  element: HTMLElement,
  options?: {
    hideSelector?: string;
  },
): Promise<Blob> {
  const canvas = await html2canvas(element, {
    backgroundColor: "#ffffff",
    scale: 2,
    useCORS: true,
    logging: false,
    onclone: (_doc, clonedElement) => {
      clonedElement.style.overflow = "visible";
      clonedElement.style.maxHeight = "none";

      if (options?.hideSelector) {
        clonedElement.querySelectorAll(options.hideSelector).forEach((node) => {
          (node as HTMLElement).style.display = "none";
        });
      }

      applyComputedColors(element, clonedElement);
    },
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("No se pudo generar la imagen."));
          return;
        }
        resolve(blob);
      },
      "image/png",
      1,
    );
  });
}

export async function copyImageBlobToClipboard(blob: Blob): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("Tu navegador no permite copiar imágenes al portapapeles.");
  }

  await navigator.clipboard.write([
    new ClipboardItem({
      "image/png": blob,
    }),
  ]);
}

export function downloadImageBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
