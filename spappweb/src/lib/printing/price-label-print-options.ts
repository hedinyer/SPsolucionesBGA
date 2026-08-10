import {
  LABEL_GAP_MM,
  LABEL_HEIGHT_MM,
  LABEL_WIDTH_MM,
  type LabelsPerRow,
  labelSlotLeftMm,
  rowHeightMm,
  rowWidthMm,
} from "@/lib/printing/price-label";

export type PaperPreset = "row" | "single" | "custom";

export interface PriceLabelPrintOptions {
  preset: PaperPreset;
  labelsPerRow: LabelsPerRow;
  pageWidthMm: number;
  pageHeightMm: number;
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  slot: 0 | 1 | 2;
  offsetXmm: number;
  offsetYmm: number;
  contentScale: number;
  copies: number;
  /** 0 = normal, 90 = girar a la derecha (horario). */
  rotationDeg: 0 | 90;
  /** Separa la columna izquierda del centro (mm, hacia la izquierda). */
  nudgeLeftColumnMm: number;
  /** Separa la columna derecha del centro (mm, hacia la derecha). */
  nudgeRightColumnMm: number;
}

export const DEFAULT_PRINT_OPTIONS: PriceLabelPrintOptions = {
  preset: "row",
  labelsPerRow: 3,
  pageWidthMm: rowWidthMm(3),
  pageHeightMm: rowHeightMm(),
  marginTopMm: 0,
  marginRightMm: 0,
  marginBottomMm: 0,
  marginLeftMm: 0,
  slot: 0,
  offsetXmm: 0,
  offsetYmm: 0,
  contentScale: 1,
  copies: 3,
  rotationDeg: 0,
  nudgeLeftColumnMm: 3,
  nudgeRightColumnMm: 3,
};

export function clampSlot(
  slot: number,
  labelsPerRow: LabelsPerRow,
): 0 | 1 | 2 {
  const max = labelsPerRow - 1;
  return Math.max(0, Math.min(max, slot)) as 0 | 1 | 2;
}

export function syncRowPageSize(
  options: PriceLabelPrintOptions,
): PriceLabelPrintOptions {
  if (options.preset === "custom") return options;
  const labelsPerRow =
    options.preset === "single" ? 1 : options.labelsPerRow;
  return {
    ...options,
    labelsPerRow,
    pageWidthMm: rowWidthMm(labelsPerRow),
    pageHeightMm: rowHeightMm(),
    slot: clampSlot(options.slot, labelsPerRow),
  };
}

export function applyPaperPreset(
  preset: PaperPreset,
  current: PriceLabelPrintOptions,
): PriceLabelPrintOptions {
  if (preset === "single") {
    return syncRowPageSize({ ...current, preset, labelsPerRow: 1 });
  }
  if (preset === "row") {
    return syncRowPageSize({
      ...current,
      preset,
      labelsPerRow: current.labelsPerRow === 1 ? 3 : current.labelsPerRow,
    });
  }
  return { ...current, preset };
}

export function setLabelsPerRow(
  labelsPerRow: LabelsPerRow,
  current: PriceLabelPrintOptions,
): PriceLabelPrintOptions {
  return syncRowPageSize({
    ...current,
    preset: labelsPerRow === 1 ? "single" : "row",
    labelsPerRow,
    copies: labelsPerRow,
  });
}

/** Slots a imprimir en cada página. */
export function labelSlotsForPages(options: PriceLabelPrintOptions): number[][] {
  const copies = Math.max(1, Math.min(options.copies, 99));
  const perRow = options.labelsPerRow;

  if (copies === 1) {
    return [[clampSlot(options.slot, perRow)]];
  }

  const pages: number[][] = [];
  let remaining = copies;
  while (remaining > 0) {
    const count = Math.min(perRow, remaining);
    pages.push(Array.from({ length: count }, (_, i) => i));
    remaining -= count;
  }
  return pages;
}

export function slotEdgeNudgeX(
  options: PriceLabelPrintOptions,
  slot: number,
): number {
  const last = options.labelsPerRow - 1;
  if (options.labelsPerRow <= 1) return 0;
  if (slot === 0) return -options.nudgeLeftColumnMm;
  if (slot === last) return options.nudgeRightColumnMm;
  return 0;
}

export function labelLeftMm(
  options: PriceLabelPrintOptions,
  slot: number,
): number {
  return (
    options.marginLeftMm +
    options.offsetXmm +
    labelSlotLeftMm(slot) +
    slotEdgeNudgeX(options, slot)
  );
}

export function labelTopMm(options: PriceLabelPrintOptions): number {
  return options.marginTopMm + options.offsetYmm + LABEL_GAP_MM;
}

export interface LabelPlacement {
  pageWidthMm: number;
  pageHeightMm: number;
  leftMm: number;
  topMm: number;
  widthMm: number;
  heightMm: number;
}

/** Posición y tamaño de etiqueta (rotación 90° sin transform CSS). */
export function labelPlacement(
  options: PriceLabelPrintOptions,
  slot: number,
): LabelPlacement {
  const nudgeX = slotEdgeNudgeX(options, slot);
  const origLeft =
    options.marginLeftMm +
    options.offsetXmm +
    labelSlotLeftMm(slot) +
    nudgeX;
  const origTop = labelTopMm(options);

  if (options.rotationDeg === 90) {
    return {
      pageWidthMm: options.pageHeightMm,
      pageHeightMm: options.pageWidthMm,
      leftMm: origTop,
      topMm: origLeft,
      widthMm: LABEL_HEIGHT_MM,
      heightMm: LABEL_WIDTH_MM,
    };
  }

  return {
    pageWidthMm: options.pageWidthMm,
    pageHeightMm: options.pageHeightMm,
    leftMm: origLeft,
    topMm: origTop,
    widthMm: LABEL_WIDTH_MM,
    heightMm: LABEL_HEIGHT_MM,
  };
}

export function presetLabel(preset: PaperPreset, labelsPerRow: LabelsPerRow) {
  if (preset === "custom") return "Personalizado";
  const n = preset === "single" ? 1 : labelsPerRow;
  const w = rowWidthMm(n);
  const h = rowHeightMm();
  return `Fila ${n} etiqueta${n === 1 ? "" : "s"} (${w} × ${h} mm)`;
}
