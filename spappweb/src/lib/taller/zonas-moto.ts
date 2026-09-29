/** Zonas tocables de la moto (silueta lateral estilo naked 125). */
export const ZONAS_MOTO = [
  {
    id: "llanta_delantera",
    label: "Llanta delantera",
    short: "Llanta delante",
    tareasRapidas: [
      "Cambiar llanta",
      "Reparar pinchazo",
      "Balancear",
      "Ajustar presión",
    ],
  },
  {
    id: "llanta_trasera",
    label: "Llanta trasera",
    short: "Llanta atrás",
    tareasRapidas: [
      "Cambiar llanta",
      "Reparar pinchazo",
      "Balancear",
      "Ajustar presión",
    ],
  },
  {
    id: "freno_delantero",
    label: "Freno delantero",
    short: "Freno delante",
    tareasRapidas: [
      "Cambiar pastillas",
      "Cambiar disco",
      "Purgar líquido",
      "Ajustar",
    ],
  },
  {
    id: "freno_trasero",
    label: "Freno trasero",
    short: "Freno atrás",
    tareasRapidas: [
      "Cambiar pastillas",
      "Cambiar disco",
      "Purgar líquido",
      "Ajustar",
    ],
  },
  {
    id: "suspension_delantera",
    label: "Suspensión delantera",
    short: "Horquilla",
    tareasRapidas: ["Cambiar aceite", "Sellar fugas", "Ajustar", "Revisar"],
  },
  {
    id: "amortiguador_trasero",
    label: "Amortiguador trasero",
    short: "Amortiguador",
    tareasRapidas: ["Cambiar amortiguador", "Ajustar", "Revisar"],
  },
  {
    id: "motor",
    label: "Motor",
    short: "Motor",
    tareasRapidas: [
      "Cambio de aceite",
      "Filtro de aire",
      "Bujía",
      "Ajuste de válvulas",
      "Carburación / inyección",
    ],
  },
  {
    id: "escape",
    label: "Escape",
    short: "Escape",
    tareasRapidas: ["Soldar", "Cambiar", "Silenciador", "Revisar"],
  },
  {
    id: "cadena_pinones",
    label: "Cadena y piñones",
    short: "Cadena",
    tareasRapidas: [
      "Cambiar kit de arrastre",
      "Tensar cadena",
      "Lubricar",
      "Cambiar cadena",
    ],
  },
  {
    id: "tanque",
    label: "Tanque",
    short: "Tanque",
    tareasRapidas: ["Limpiar", "Reparar fuga", "Tapón", "Revisar"],
  },
  {
    id: "sillin",
    label: "Sillín",
    short: "Sillín",
    tareasRapidas: ["Cambiar", "Coser / tapizar", "Ajustar", "Revisar"],
  },
  {
    id: "luces_electrico",
    label: "Luces y eléctrico",
    short: "Eléctrico",
    tareasRapidas: [
      "Batería",
      "Faro",
      "Direccionales",
      "Stop",
      "Cableado",
      "Claxon",
    ],
  },
  {
    id: "manubrio_mandos",
    label: "Manubrio y mandos",
    short: "Manubrio",
    tareasRapidas: [
      "Ajustar",
      "Cambiar grips",
      "Palancas",
      "Espejos",
      "Switch",
    ],
  },
  {
    id: "plasticos",
    label: "Plásticos",
    short: "Plásticos",
    tareasRapidas: ["Cambiar pieza", "Pegar", "Pintar", "Tornillería"],
  },
] as const;

export type ZonaMotoId = (typeof ZONAS_MOTO)[number]["id"];

/** Etiquetas de zonas viejas (órdenes ya guardadas). */
const ZONAS_LEGACY: Record<string, string> = {
  freno: "Freno",
  llantas: "Llantas",
  suspension: "Suspensión",
  motor: "Motor",
  escape: "Escape",
  kit_arrastre: "Kit de arrastre",
  electrico: "Eléctrico",
  carenaje: "Carenaje",
  direccion: "Dirección",
};

export function zonaMotoLabel(id: string): string {
  return (
    ZONAS_MOTO.find((z) => z.id === id)?.label ??
    ZONAS_LEGACY[id] ??
    id
  );
}

export function zonaMotoTareasRapidas(id: string): readonly string[] {
  return ZONAS_MOTO.find((z) => z.id === id)?.tareasRapidas ?? [];
}

export function isZonaMotoId(id: string): id is ZonaMotoId {
  return ZONAS_MOTO.some((z) => z.id === id);
}
