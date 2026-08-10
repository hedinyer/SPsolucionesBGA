"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  CheckCircle2,
  Camera,
  ClipboardList,
  Loader2,
  MessageCircle,
} from "lucide-react";
import { toast } from "sonner";
import { submitPublicApplication } from "@/lib/actions/client-actions";
import type { HojaVidaFormData } from "@/lib/contracts/hoja-vida-schema";
import { uploadDocumentPhotoFromBrowser } from "@/lib/utils/upload-document-client";
import {
  IdentityUploadFlow,
  type IdentityPhotoFiles,
} from "@/components/hojadevida/identity-upload-flow";
import { HojaVidaForm } from "@/components/hojadevida/hoja-vida-form";
import {
  FlowPhaseBar,
  PrimaryAction,
  StepCard,
  type FlowPhase,
} from "@/components/hojadevida/flow-shell";
import { retryAsync } from "@/lib/client/retry-async";
import {
  clearHojadevidaDraft,
  getStableUploadFolder,
  readHojadevidaDraft,
  writeHojadevidaDraft,
  type HojadevidaPhotoUrls,
} from "@/lib/client/hojadevida-draft";
import { parseReferralSource } from "@/lib/referrals";

type Step = "welcome" | "photos" | "uploading" | "hoja" | "sending" | "success";

export function PublicApplicationFlow({
  initialReferralSource = null,
}: {
  initialReferralSource?: string | null;
} = {}) {
  const uploadFolder = useMemo(() => getStableUploadFolder(), []);
  const [step, setStep] = useState<Step>("welcome");
  const [photoUrls, setPhotoUrls] = useState<HojadevidaPhotoUrls | null>(null);
  const [pending, startTransition] = useTransition();
  const [restoredForm, setRestoredForm] = useState<HojaVidaFormData | undefined>();
  const [restoredFormStep, setRestoredFormStep] = useState<number | undefined>();
  const [referralSource, setReferralSource] = useState<string | null>(() =>
    parseReferralSource(initialReferralSource),
  );

  const phase: FlowPhase =
    step === "welcome" || step === "photos" || step === "uploading"
      ? "fotos"
      : step === "hoja" || step === "sending"
        ? "datos"
        : "listo";

  useEffect(() => {
    const draft = readHojadevidaDraft();
    const fromUrl = parseReferralSource(initialReferralSource);
    const referral =
      fromUrl ?? parseReferralSource(draft?.referralSource) ?? null;

    if (referral) {
      setReferralSource(referral);
      writeHojadevidaDraft({
        uploadFolder: draft?.uploadFolder ?? uploadFolder,
        photoUrls: draft?.photoUrls,
        form: draft?.form,
        formStepIndex: draft?.formStepIndex,
        resumeStep: draft?.resumeStep,
        referralSource: referral,
      });
    }

    if (!draft?.resumeStep || !draft.photoUrls) return;

    setPhotoUrls(draft.photoUrls);
    if (draft.form) setRestoredForm(draft.form);
    if (draft.formStepIndex != null) setRestoredFormStep(draft.formStepIndex);
    setStep(draft.resumeStep === "hoja" ? "hoja" : "photos");
  }, [initialReferralSource, uploadFolder]);

  useEffect(() => {
    if (step !== "success") return;

    const url = window.location.href;
    window.history.replaceState({ hojadevida: "welcome" }, "", url);
    window.history.pushState({ hojadevida: "success" }, "", url);

    function onPopState(event: PopStateEvent) {
      const marker = (event.state as { hojadevida?: string } | null)?.hojadevida;
      if (marker === "success") {
        setStep("success");
        return;
      }
      setStep("welcome");
      setPhotoUrls(null);
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [step]);

  function persistDraft(
    partial: Partial<{
      photoUrls: HojadevidaPhotoUrls;
      form: HojaVidaFormData;
      formStepIndex: number;
      resumeStep: "photos" | "hoja";
      referralSource: string | null;
    }>,
  ) {
    const prev = readHojadevidaDraft();
    writeHojadevidaDraft({
      uploadFolder,
      photoUrls: partial.photoUrls ?? prev?.photoUrls ?? photoUrls ?? undefined,
      form: partial.form ?? prev?.form,
      formStepIndex: partial.formStepIndex ?? prev?.formStepIndex,
      resumeStep: partial.resumeStep ?? prev?.resumeStep ?? "hoja",
      referralSource:
        partial.referralSource !== undefined
          ? partial.referralSource
          : (prev?.referralSource ?? referralSource),
    });
  }

  function resetToWelcome() {
    setStep("welcome");
    setPhotoUrls(null);
    setRestoredForm(undefined);
    setRestoredFormStep(undefined);
    clearHojadevidaDraft();
    window.history.replaceState(
      { hojadevida: "welcome" },
      "",
      window.location.href,
    );
  }

  function onPhotosComplete(files: IdentityPhotoFiles) {
    setStep("uploading");
    startTransition(async () => {
      try {
        const urls = await retryAsync(
          async () => {
            const [front, back, selfie] = await Promise.all([
              uploadDocumentPhotoFromBrowser(
                uploadFolder,
                "document_front",
                files.document_front,
              ),
              uploadDocumentPhotoFromBrowser(
                uploadFolder,
                "document_back",
                files.document_back,
              ),
              uploadDocumentPhotoFromBrowser(
                uploadFolder,
                "selfie",
                files.selfie,
              ),
            ]);
            return {
              documentFrontUrl: front,
              documentBackUrl: back,
              selfieUrl: selfie,
            };
          },
          {
            onRetry: () => {
              toast.message("Reintentando subida de fotos…");
            },
          },
        );

        setPhotoUrls(urls);
        persistDraft({ photoUrls: urls, resumeStep: "hoja" });
        setStep("hoja");
      } catch (e) {
        setStep("photos");
        toast.error(
          e instanceof Error
            ? e.message
            : "No se pudieron subir las fotos. Revisa tu conexión e intenta de nuevo.",
        );
      }
    });
  }

  function onFormDraftChange(form: HojaVidaFormData, formStepIndex: number) {
    persistDraft({ form, formStepIndex, resumeStep: "hoja" });
  }

  function onHojaComplete(form: HojaVidaFormData) {
    if (!photoUrls) {
      toast.error("Faltan las fotos. Vuelve al paso anterior.");
      setStep("photos");
      return;
    }

    setStep("sending");
    startTransition(async () => {
      try {
        await retryAsync(
          () =>
            submitPublicApplication({
              documentFrontUrl: photoUrls.documentFrontUrl,
              documentBackUrl: photoUrls.documentBackUrl,
              selfieUrl: photoUrls.selfieUrl,
              hojaVida: form,
              referralSource,
            }),
          {
            onRetry: () => {
              toast.message("Reintentando envío…");
            },
          },
        );

        clearHojadevidaDraft();
        setStep("success");
      } catch {
        setStep("hoja");
        persistDraft({ form, resumeStep: "hoja" });
        toast.error(
          "Sin conexión estable. Tus datos están guardados; toca Enviar de nuevo.",
        );
      }
    });
  }

  if (step !== "welcome") {
    return (
      <div>
        {step !== "success" && <FlowPhaseBar active={phase} />}

        {step === "uploading" && (
          <StepCard
            title="Subiendo tus fotos"
            instruction="No cierres esta página. Espera un momento."
          >
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="h-12 w-12 animate-spin text-foreground" />
              <p className="text-center text-base text-muted-foreground">
                Guardando fotos de tu cédula…
              </p>
            </div>
          </StepCard>
        )}

        {step === "sending" && (
          <StepCard
            title="Enviando tu solicitud"
            instruction="No cierres esta página. Espera un momento."
          >
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="h-12 w-12 animate-spin text-foreground" />
              <p className="text-center text-base text-muted-foreground">
                Guardando tus datos…
              </p>
            </div>
          </StepCard>
        )}

        {step === "success" && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col items-center rounded-2xl border-2 border-green-500 bg-green-50 p-8 text-center">
              <CheckCircle2 className="h-16 w-16 text-green-600" strokeWidth={1.5} />
              <h2 className="mt-4 text-2xl font-bold text-foreground">
                ¡Solicitud enviada con éxito!
              </h2>
              <p className="mt-3 text-base leading-relaxed text-foreground">
                Recibimos tus fotos y datos. Todo quedó registrado correctamente.
              </p>
              <div className="mt-5 flex w-full items-start gap-3 rounded-xl bg-background px-4 py-4 text-left">
                <MessageCircle className="mt-0.5 h-8 w-8 shrink-0 text-green-600" />
                <div>
                  <p className="text-base font-semibold text-foreground">
                    Te escribiremos por WhatsApp
                  </p>
                  <p className="mt-1 text-base leading-relaxed text-foreground">
                    En aproximadamente{" "}
                    <span className="font-semibold text-foreground">2 horas</span>{" "}
                    recibirás la respuesta a tu solicitud de crédito al número
                    que indicaste.
                  </p>
                </div>
              </div>
            </div>
            <p className="text-center text-sm text-muted-foreground">
              Ya puedes cerrar esta página.
            </p>
            <PrimaryAction onClick={resetToWelcome}>
              Volver al inicio
            </PrimaryAction>
          </div>
        )}

        {step === "hoja" && (
          <HojaVidaForm
            initial={restoredForm}
            initialStepIndex={restoredFormStep}
            onDraftChange={onFormDraftChange}
            onComplete={onHojaComplete}
            onBack={() => setStep("photos")}
            pending={pending}
            submitLabel="Enviar mi solicitud ✓"
          />
        )}

        {step === "photos" && (
          <IdentityUploadFlow onComplete={onPhotosComplete} />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <StepCard
        title="Solicitud de crédito para moto"
        instruction="Te guiamos paso a paso. Solo necesitas tu celular y tu cédula."
      >
        <ol className="flex flex-col gap-4">
          <li className="flex gap-4 rounded-xl border-2 border-border p-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
              1
            </div>
            <div>
              <p className="text-base font-bold text-foreground">Tomar 3 fotos</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Frente y reverso de la cédula, y una selfie.
              </p>
            </div>
            <Camera className="ml-auto h-8 w-8 shrink-0 text-muted-foreground" />
          </li>
          <li className="flex gap-4 rounded-xl border-2 border-border p-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
              2
            </div>
            <div>
              <p className="text-base font-bold text-foreground">Llenar tus datos</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Una pregunta a la vez, fácil de entender.
              </p>
            </div>
            <ClipboardList className="ml-auto h-8 w-8 shrink-0 text-muted-foreground" />
          </li>
          <li className="flex gap-4 rounded-xl border-2 border-border p-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
              3
            </div>
            <div>
              <p className="text-base font-bold text-foreground">Enviar solicitud</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Nosotros te avisamos por WhatsApp si eres aprobado.
              </p>
            </div>
            <CheckCircle2 className="ml-auto h-8 w-8 shrink-0 text-muted-foreground" />
          </li>
        </ol>
      </StepCard>

      <PrimaryAction onClick={() => setStep("photos")}>
        Empezar →
      </PrimaryAction>
    </div>
  );
}
