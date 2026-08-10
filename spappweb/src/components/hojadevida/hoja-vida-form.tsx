"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  emptyHojaVidaForm,
  ESTADO_CIVIL_LABELS,
  TIPO_IDENTIFICACION_LABELS,
  type HojaVidaFormData,
  type TipoIdentificacion,
  type EstadoCivil,
} from "@/lib/contracts/hoja-vida-schema";
import {
  isFullName,
  isValidBirthDate,
  isHojaVidaComplete,
  formatBirthDateInput,
} from "@/lib/contracts/hoja-vida-validation";
import { Input } from "@/components/ui/input";
import {
  ChoiceButton,
  FieldBlock,
  fieldInputClass,
  FlowProgress,
  PrimaryAction,
  SecondaryAction,
  StepCard,
  StickyActions,
} from "@/components/hojadevida/flow-shell";

type HojaStepId =
  | "nombre"
  | "tipo_id"
  | "numero_id"
  | "fecha"
  | "celular"
  | "direccion"
  | "barrio"
  | "correo"
  | "trabajo"
  | "empresa"
  | "independiente"
  | "estado_civil"
  | "conyuge"
  | "referencia_1"
  | "referencia_2";

const STEP_TITLES: Record<HojaStepId, string> = {
  nombre: "Tu nombre completo",
  tipo_id: "Tipo de documento",
  numero_id: "Número de documento",
  fecha: "Fecha de nacimiento",
  celular: "Tu celular",
  direccion: "Dirección de tu casa",
  barrio: "Barrio donde vives",
  correo: "Correo electrónico",
  trabajo: "¿Trabajas en una empresa?",
  empresa: "Datos de tu trabajo",
  independiente: "¿Cómo trabajas?",
  estado_civil: "Estado civil",
  conyuge: "Datos de tu pareja",
  referencia_1: "Referencia personal 1",
  referencia_2: "Referencia personal 2",
};

function buildSteps(form: HojaVidaFormData): HojaStepId[] {
  const steps: HojaStepId[] = [
    "nombre",
    "tipo_id",
    "numero_id",
    "fecha",
    "celular",
    "direccion",
    "barrio",
    "correo",
    "trabajo",
  ];
  if (form.trabaja_empresa === true) steps.push("empresa");
  else if (form.trabaja_empresa === false) steps.push("independiente");
  steps.push("estado_civil");
  if (form.estado_civil === "casado" || form.estado_civil === "union_libre") {
    steps.push("conyuge");
  }
  steps.push("referencia_1", "referencia_2");
  return steps;
}

function validateStep(id: HojaStepId, form: HojaVidaFormData): string | null {
  switch (id) {
    case "nombre":
      return isFullName(form.nombre_completo)
        ? null
        : "Escribe tu nombre y al menos un apellido.";
    case "tipo_id":
      return form.tipo_identificacion ? null : "Elige un tipo de documento.";
    case "numero_id":
      return form.numero_identificacion.trim()
        ? null
        : "Escribe el número de tu documento.";
    case "fecha":
      return isValidBirthDate(form.fecha_nacimiento)
        ? null
        : "Escribe los 8 números de tu fecha. Las barras se ponen solas.";
    case "celular":
      return form.celular.trim().length >= 10
        ? null
        : "El celular debe tener mínimo 10 números.";
    case "direccion":
      return form.direccion.trim() ? null : "Escribe tu dirección.";
    case "barrio":
      return form.barrio.trim() ? null : "Escribe el barrio.";
    case "correo":
      return form.correo.includes("@") ? null : "Escribe un correo válido.";
    case "trabajo":
      return form.trabaja_empresa != null ? null : "Pulsa Sí o No.";
    case "empresa":
      return form.nombre_empresa.trim()
        ? null
        : "Escribe el nombre de la empresa.";
    case "independiente":
      if (form.independiente == null) return "Pulsa Sí o No.";
      if (form.independiente !== true && !form.habilidad.trim()) {
        return "Escribe tu oficio o a qué te dedicas.";
      }
      return null;
    case "estado_civil":
      return form.estado_civil ? null : "Elige tu estado civil.";
    case "conyuge":
      if (!isFullName(form.nombre_conyuge)) {
        return "Escribe nombre y apellido de tu pareja.";
      }
      return form.celular_conyuge.trim().length >= 10
        ? null
        : "Escribe el celular de tu pareja (10 números).";
    case "referencia_1": {
      const r = form.referencias[0];
      if (!isFullName(r.nombre)) return "Nombre y apellido de la referencia 1.";
      return r.celular.trim().length >= 10
        ? null
        : "Celular de la referencia 1 (10 números).";
    }
    case "referencia_2": {
      const r = form.referencias[1];
      if (!isFullName(r.nombre)) return "Nombre y apellido de la referencia 2.";
      return r.celular.trim().length >= 10
        ? null
        : "Celular de la referencia 2 (10 números).";
    }
    default:
      return null;
  }
}

interface HojaVidaFormProps {
  initial?: HojaVidaFormData;
  initialStepIndex?: number;
  readOnly?: boolean;
  onComplete?: (form: HojaVidaFormData) => void;
  onDraftChange?: (form: HojaVidaFormData, stepIndex: number) => void;
  onBack?: () => void;
  pending?: boolean;
  submitLabel?: string;
}

export function HojaVidaForm({
  initial,
  initialStepIndex = 0,
  readOnly = false,
  onComplete,
  onDraftChange,
  onBack,
  pending = false,
  submitLabel = "Enviar mi solicitud",
}: HojaVidaFormProps) {
  const [form, setForm] = useState<HojaVidaFormData>(
    initial ?? emptyHojaVidaForm(),
  );
  const [stepIndex, setStepIndex] = useState(initialStepIndex);

  const steps = useMemo(() => buildSteps(form), [form]);
  const currentId = steps[stepIndex] ?? steps[0];
  const isLast = stepIndex >= steps.length - 1;

  useEffect(() => {
    if (stepIndex >= steps.length) {
      setStepIndex(Math.max(0, steps.length - 1));
    }
  }, [stepIndex, steps.length]);

  useEffect(() => {
    if (readOnly || !onDraftChange) return;
    onDraftChange(form, stepIndex);
  }, [form, stepIndex, readOnly, onDraftChange]);

  function patch(partial: Partial<HojaVidaFormData>) {
    setForm((prev) => ({ ...prev, ...partial }));
  }

  function goNext() {
    const err = validateStep(currentId, form);
    if (err) {
      toast.error(err);
      return;
    }
    if (isLast) {
      if (!isHojaVidaComplete(form)) {
        toast.error("Revisa que todo esté completo.");
        return;
      }
      onComplete?.(form);
      return;
    }
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }

  function goBack() {
    if (stepIndex > 0) {
      setStepIndex((i) => i - 1);
    } else {
      onBack?.();
    }
  }

  if (readOnly) {
    return (
      <StepCard title="Resumen de tus datos">
        <dl className="flex flex-col gap-3 text-base">
          <Row label="Nombre" value={form.nombre_completo} />
          <Row label="Celular" value={form.celular} />
        </dl>
      </StepCard>
    );
  }

  return (
    <div>
      <FlowProgress
        step={stepIndex + 1}
        total={steps.length}
        title={STEP_TITLES[currentId]}
      />

      <StepCard title={STEP_TITLES[currentId]}>
        {currentId === "nombre" && (
          <FieldBlock
            label="Nombre y apellidos"
            hint="Como aparece en tu cédula."
            example="Juan Pérez"
          >
            <Input
              className={fieldInputClass}
              value={form.nombre_completo}
              autoComplete="name"
              placeholder="Nombre y apellido"
              onChange={(e) => patch({ nombre_completo: e.target.value })}
            />
          </FieldBlock>
        )}

        {currentId === "tipo_id" && (
          <FieldBlock label="Elige tu tipo de documento">
            <div className="flex flex-col gap-2">
              {(Object.entries(TIPO_IDENTIFICACION_LABELS) as [TipoIdentificacion, string][]).map(
                ([value, label]) => (
                  <ChoiceButton
                    key={value}
                    selected={form.tipo_identificacion === value}
                    onClick={() => patch({ tipo_identificacion: value })}
                  >
                    {label}
                  </ChoiceButton>
                ),
              )}
            </div>
          </FieldBlock>
        )}

        {currentId === "numero_id" && (
          <FieldBlock
            label="Número de documento"
            hint="Solo números y letras, sin puntos."
            example="1234567890"
          >
            <Input
              className={fieldInputClass}
              inputMode="numeric"
              value={form.numero_identificacion}
              placeholder="Tu número de cédula"
              onChange={(e) => patch({ numero_identificacion: e.target.value })}
            />
          </FieldBlock>
        )}

        {currentId === "fecha" && (
          <FieldBlock
            label="Fecha de nacimiento"
            hint="Solo escribe números. Las barras / se agregan solas."
            example="15031990 → 15/03/1990"
          >
            <Input
              className={fieldInputClass}
              inputMode="numeric"
              placeholder="DD/MM/AAAA"
              maxLength={10}
              value={form.fecha_nacimiento}
              onChange={(e) =>
                patch({ fecha_nacimiento: formatBirthDateInput(e.target.value) })
              }
            />
          </FieldBlock>
        )}

        {currentId === "celular" && (
          <FieldBlock
            label="Número de celular"
            hint="El que usas todos los días. Te llamaremos a este número."
            example="3001234567"
          >
            <Input
              className={fieldInputClass}
              inputMode="tel"
              placeholder="10 dígitos"
              value={form.celular}
              onChange={(e) => patch({ celular: e.target.value })}
            />
          </FieldBlock>
        )}

        {currentId === "direccion" && (
          <FieldBlock
            label="Dirección"
            hint="Calle, carrera, número, apartamento."
            example="Calle 10 # 20-30"
          >
            <Input
              className={fieldInputClass}
              value={form.direccion}
              placeholder="¿Dónde vives?"
              onChange={(e) => patch({ direccion: e.target.value })}
            />
          </FieldBlock>
        )}

        {currentId === "barrio" && (
          <FieldBlock label="Barrio" example="Centro, La Floresta…">
            <Input
              className={fieldInputClass}
              value={form.barrio}
              placeholder="Nombre del barrio"
              onChange={(e) => patch({ barrio: e.target.value })}
            />
          </FieldBlock>
        )}

        {currentId === "correo" && (
          <FieldBlock
            label="Correo electrónico"
            hint="Si no tienes, puedes crear uno gratis en Gmail."
            example="nombre@gmail.com"
          >
            <Input
              className={fieldInputClass}
              type="email"
              inputMode="email"
              placeholder="tu@correo.com"
              value={form.correo}
              onChange={(e) => patch({ correo: e.target.value })}
            />
          </FieldBlock>
        )}

        {currentId === "trabajo" && (
          <FieldBlock label="¿Trabajas en una empresa?">
            <div className="flex gap-3">
              <ChoiceButton
                selected={form.trabaja_empresa === true}
                onClick={() =>
                  patch({
                    trabaja_empresa: true,
                    independiente: null,
                    habilidad: "",
                  })
                }
              >
                Sí, trabajo
              </ChoiceButton>
              <ChoiceButton
                selected={form.trabaja_empresa === false}
                onClick={() =>
                  patch({
                    trabaja_empresa: false,
                    nombre_empresa: "",
                    telefono_empresa: "",
                    direccion_empresa: "",
                  })
                }
              >
                No
              </ChoiceButton>
            </div>
          </FieldBlock>
        )}

        {currentId === "empresa" && (
          <div className="flex flex-col gap-4">
            <FieldBlock label="Nombre de la empresa">
              <Input
                className={fieldInputClass}
                value={form.nombre_empresa}
                onChange={(e) => patch({ nombre_empresa: e.target.value })}
              />
            </FieldBlock>
            <FieldBlock label="Teléfono de la empresa (opcional)">
              <Input
                className={fieldInputClass}
                inputMode="tel"
                value={form.telefono_empresa}
                onChange={(e) => patch({ telefono_empresa: e.target.value })}
              />
            </FieldBlock>
          </div>
        )}

        {currentId === "independiente" && (
          <div className="flex flex-col gap-4">
            <FieldBlock label="¿Trabajas por tu cuenta (independiente)?">
              <div className="flex gap-3">
                <ChoiceButton
                  selected={form.independiente === true}
                  onClick={() => patch({ independiente: true, habilidad: "" })}
                >
                  Sí
                </ChoiceButton>
                <ChoiceButton
                  selected={form.independiente === false}
                  onClick={() => patch({ independiente: false })}
                >
                  No
                </ChoiceButton>
              </div>
            </FieldBlock>
            {form.independiente !== true && (
              <FieldBlock
                label="¿A qué te dedicas?"
                example="Mototaxi, ventas, construcción…"
              >
                <Input
                  className={fieldInputClass}
                  value={form.habilidad}
                  onChange={(e) => patch({ habilidad: e.target.value })}
                />
              </FieldBlock>
            )}
          </div>
        )}

        {currentId === "estado_civil" && (
          <FieldBlock label="Selecciona uno">
            <div className="flex flex-col gap-2">
              {(Object.entries(ESTADO_CIVIL_LABELS) as [EstadoCivil, string][]).map(
                ([value, label]) => (
                  <ChoiceButton
                    key={value}
                    selected={form.estado_civil === value}
                    onClick={() =>
                      patch({
                        estado_civil: value,
                        nombre_conyuge: "",
                        celular_conyuge: "",
                      })
                    }
                  >
                    {label}
                  </ChoiceButton>
                ),
              )}
            </div>
          </FieldBlock>
        )}

        {currentId === "conyuge" && (
          <div className="flex flex-col gap-4">
            <FieldBlock label="Nombre completo de tu pareja">
              <Input
                className={fieldInputClass}
                value={form.nombre_conyuge}
                onChange={(e) => patch({ nombre_conyuge: e.target.value })}
              />
            </FieldBlock>
            <FieldBlock label="Celular de tu pareja">
              <Input
                className={fieldInputClass}
                inputMode="tel"
                value={form.celular_conyuge}
                onChange={(e) => patch({ celular_conyuge: e.target.value })}
              />
            </FieldBlock>
          </div>
        )}

        {(currentId === "referencia_1" || currentId === "referencia_2") && (
          <div className="flex flex-col gap-4">
            <FieldBlock
              label="Persona que te conozca"
              hint="Un familiar o amigo que confirme quién eres. No puede ser tu pareja."
            >
              <Input
                className={fieldInputClass}
                placeholder="Nombre y apellidos"
                value={
                  form.referencias[currentId === "referencia_1" ? 0 : 1].nombre
                }
                onChange={(e) => {
                  const i = currentId === "referencia_1" ? 0 : 1;
                  const refs = [...form.referencias] as HojaVidaFormData["referencias"];
                  refs[i] = { ...refs[i], nombre: e.target.value };
                  patch({ referencias: refs });
                }}
              />
            </FieldBlock>
            <FieldBlock label="Celular de esa persona">
              <Input
                className={fieldInputClass}
                inputMode="tel"
                placeholder="10 dígitos"
                value={
                  form.referencias[currentId === "referencia_1" ? 0 : 1].celular
                }
                onChange={(e) => {
                  const i = currentId === "referencia_1" ? 0 : 1;
                  const refs = [...form.referencias] as HojaVidaFormData["referencias"];
                  refs[i] = { ...refs[i], celular: e.target.value };
                  patch({ referencias: refs });
                }}
              />
            </FieldBlock>
          </div>
        )}
      </StepCard>

      <StickyActions
        primary={
          <PrimaryAction onClick={goNext} disabled={pending}>
            {pending
              ? "Enviando…"
              : isLast
                ? submitLabel
                : "Siguiente paso →"}
          </PrimaryAction>
        }
        secondary={<SecondaryAction onClick={goBack}>Volver atrás</SecondaryAction>}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null;
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
