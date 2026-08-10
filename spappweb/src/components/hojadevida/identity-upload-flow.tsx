"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Camera, CheckCircle2, ImagePlus, IdCard, UserRound } from "lucide-react";
import { toast } from "sonner";
import type { DocumentPhotoKey } from "@/lib/utils/upload-document-client";
import {
  FlowProgress,
  PrimaryAction,
  SecondaryAction,
  StepCard,
  StickyActions,
} from "@/components/hojadevida/flow-shell";
import { cn } from "@/lib/utils";

const STEPS: {
  key: DocumentPhotoKey;
  title: string;
  instruction: string;
  help: string;
  icon: typeof IdCard;
}[] = [
  {
    key: "document_front",
    title: "Foto del frente de tu cédula",
    instruction: "Pon tu cédula sobre una mesa y toma la foto de frente.",
    help: "Debe verse claro tu nombre, número y foto. Sin flash si refleja.",
    icon: IdCard,
  },
  {
    key: "document_back",
    title: "Foto del reverso de tu cédula",
    instruction: "Voltea la cédula y toma foto del lado de atrás.",
    help: "Todos los datos del reverso deben leerse bien.",
    icon: IdCard,
  },
  {
    key: "selfie",
    title: "Selfie (foto de tu cara)",
    instruction: "Mira a la cámara del celular y toma una foto de tu rostro.",
    help: "Buena luz, sin gorra ni gafas oscuras. Solo tu cara.",
    icon: UserRound,
  },
];

export type IdentityPhotoFiles = Record<DocumentPhotoKey, File>;

interface IdentityUploadFlowProps {
  onComplete: (files: IdentityPhotoFiles) => void;
}

export function IdentityUploadFlow({ onComplete }: IdentityUploadFlowProps) {
  const [step, setStep] = useState(0);
  const [files, setFiles] = useState<Partial<Record<DocumentPhotoKey, File>>>(
    {},
  );
  const [previews, setPreviews] = useState<
    Partial<Record<DocumentPhotoKey, string>>
  >({});
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const isReview = step >= STEPS.length;
  const current = STEPS[step];
  const totalSteps = STEPS.length + 1;
  const displayStep = isReview ? STEPS.length + 1 : step + 1;
  const allCaptured = STEPS.every((s) => files[s.key]);

  function onFileChange(key: DocumentPhotoKey, file: File | null) {
    if (!file) return;
    setFiles((prev) => ({ ...prev, [key]: file }));
    const url = URL.createObjectURL(file);
    setPreviews((prev) => {
      const old = prev[key];
      if (old) URL.revokeObjectURL(old);
      return { ...prev, [key]: url };
    });
    toast.success("Foto guardada. Pulsa «Siguiente paso».");
  }

  function onNext() {
    if (!isReview && !files[current.key]) {
      toast.error("Primero toma o elige la foto.");
      return;
    }
    if (step < STEPS.length) setStep(step + 1);
  }

  function onBack() {
    if (step > 0) setStep(step - 1);
  }

  function onConfirm() {
    if (!allCaptured) {
      toast.error("Faltan fotos. Revisa cada una.");
      return;
    }
    onComplete({
      document_front: files.document_front!,
      document_back: files.document_back!,
      selfie: files.selfie!,
    });
  }

  if (isReview) {
    return (
      <div>
        <FlowProgress
          step={displayStep}
          total={totalSteps}
          title="Revisa tus 3 fotos"
        />
        <StepCard
          title="¿Se ven bien las fotos?"
          instruction="Si alguna salió borrosa, pulsa «Cambiar» y repítela."
        >
          <div className="flex flex-col gap-3">
            {STEPS.map((s) => (
              <div
                key={s.key}
                className="flex items-center gap-3 rounded-xl border-2 border-border p-3"
              >
                {previews[s.key] ? (
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg">
                    <Image
                      src={previews[s.key]!}
                      alt={s.title}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                ) : (
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    ?
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground">{s.title}</p>
                  <button
                    type="button"
                    className="mt-1 min-h-10 text-sm font-medium text-foreground underline"
                    onClick={() => setStep(STEPS.findIndex((x) => x.key === s.key))}
                  >
                    Cambiar esta foto
                  </button>
                </div>
                {files[s.key] && (
                  <CheckCircle2 className="h-6 w-6 shrink-0 text-green-600" />
                )}
              </div>
            ))}
          </div>
        </StepCard>
        <StickyActions
          primary={
            <PrimaryAction onClick={onConfirm}>
              Sí, continuar con mis datos →
            </PrimaryAction>
          }
          secondary={
            <SecondaryAction onClick={() => setStep(STEPS.length - 1)}>
              Volver atrás
            </SecondaryAction>
          }
        />
      </div>
    );
  }

  const Icon = current.icon;
  const hasPhoto = Boolean(files[current.key]);

  return (
    <div>
      <FlowProgress
        step={displayStep}
        total={totalSteps}
        title={current.title}
      />
      <StepCard
        title={current.title}
        instruction={current.instruction}
        help={current.help}
      >
        <div
          className={cn(
            "flex flex-col items-center rounded-xl border-2 border-dashed p-6",
            hasPhoto ? "border-green-500 bg-green-50/50" : "border-border bg-muted/50",
          )}
        >
          {hasPhoto && previews[current.key] ? (
            <>
              <div className="relative aspect-[4/3] w-full max-w-xs overflow-hidden rounded-xl border-2 border-green-500">
                <Image
                  src={previews[current.key]!}
                  alt="Vista previa"
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
              <p className="mt-3 flex items-center gap-2 text-base font-semibold text-green-700">
                <CheckCircle2 className="h-5 w-5" />
                Foto lista
              </p>
            </>
          ) : (
            <Icon className="mb-3 h-16 w-16 text-muted-foreground" strokeWidth={1.25} />
          )}

          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture={current.key === "selfie" ? "user" : "environment"}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              if (file) onFileChange(current.key, file);
              e.target.value = "";
            }}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              if (file) onFileChange(current.key, file);
              e.target.value = "";
            }}
          />

          <div className="mt-4 w-full flex flex-col gap-3">
            <PrimaryAction onClick={() => cameraRef.current?.click()}>
              <span className="inline-flex items-center justify-center gap-2">
                <Camera className="h-5 w-5" />
                {hasPhoto ? "Tomar otra foto" : "Tomar foto con cámara"}
              </span>
            </PrimaryAction>
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              className="flex min-h-12 w-full touch-manipulation items-center justify-center gap-2 rounded-xl border-2 border-border bg-background text-base font-semibold text-foreground active:bg-muted/50"
            >
              <ImagePlus className="h-5 w-5" />
              Elegir de la galería
            </button>
          </div>
        </div>
      </StepCard>

      <StickyActions
        primary={
          <PrimaryAction onClick={onNext} disabled={!hasPhoto}>
            Siguiente paso →
          </PrimaryAction>
        }
        secondary={
          step > 0 ? (
            <SecondaryAction onClick={onBack}>Volver atrás</SecondaryAction>
          ) : undefined
        }
      />
    </div>
  );
}
