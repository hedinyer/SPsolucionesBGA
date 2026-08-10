"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  submitNeomundoParticipante,
  type NeomundoActionState,
} from "@/lib/actions/neomundo-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";

const IG_HANDLES = [
  "bera_avbavaria_girardot",
  "bera_centro_bucaramanga",
  "soluciones_pinilla_motos",
  "felipegarrido07",
] as const;

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      size="lg"
      disabled={pending}
      className="min-h-14 w-full touch-manipulation bg-[#e53935] text-base font-bold text-white hover:bg-[#c62828]"
    >
      {pending ? (
        <>
          <Spinner data-icon="inline-start" />
          Enviando…
        </>
      ) : (
        "¡Participar!"
      )}
    </Button>
  );
}

export function NeomundoForm() {
  const [state, formAction] = useActionState<NeomundoActionState, FormData>(
    submitNeomundoParticipante,
    null,
  );

  if (state?.ok) {
    return (
      <div className="safe-area-top flex min-h-dvh flex-col items-center justify-center gap-4 px-5 text-center">
        <p className="text-3xl font-black text-[#ffeb3b]">¡Registro recibido!</p>
        <p className="text-base text-white/90">
          Ya estás participando por la Bera SBR 150 cc azul. ¡Te esperamos en la
          feria del tendero!
        </p>
      </div>
    );
  }

  return (
    <div className="safe-area-top flex flex-col">
      <img
        src="/neomundo/poster.png"
        alt="Rifa Día del Tendero 2026 — Bera SBR 150 cc azul"
        className="h-auto w-full object-cover object-top"
      />

      <div className="flex flex-col gap-5 px-4 pt-4">
        <header className="text-center">
          <h1 className="text-2xl font-black leading-tight text-[#ffeb3b]">
            Día del Tendero 2026
          </h1>
          <p className="mt-1 text-sm font-semibold text-white">
            Rifaremos una Bera SBR 150 cc azul entre los asistentes
          </p>
        </header>

        <section className="rounded-xl bg-[#e53935] p-4 text-center shadow-md">
          <p className="text-sm font-bold uppercase tracking-wide">
            Requisitos para participar
          </p>
          <p className="mt-2 text-sm leading-snug">
            Síguenos en Instagram y/o TikTok y llena tu hoja de datos
          </p>
          <ul className="mt-3 space-y-1.5 text-left text-sm">
            {IG_HANDLES.map((h) => (
              <li key={h}>
                <a
                  href={`https://instagram.com/${h}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="touch-manipulation font-medium underline underline-offset-2"
                >
                  @{h}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-white/85">
            También puedes seguirnos en TikTok
          </p>
        </section>

        <form action={formAction} className="pb-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="nombre" className="text-white">
                Nombre del cliente
              </FieldLabel>
              <Input
                id="nombre"
                name="nombre"
                autoComplete="name"
                required
                minLength={2}
                className="min-h-11 border-white/30 bg-white text-base text-foreground"
                placeholder="Tu nombre completo"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="telefono" className="text-white">
                Número de teléfono (WhatsApp)
              </FieldLabel>
              <Input
                id="telefono"
                name="telefono"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                required
                className="min-h-11 border-white/30 bg-white text-base text-foreground"
                placeholder="3001234567"
              />
            </Field>
            {state && !state.ok ? (
              <FieldDescription className="text-[#ffeb3b]" role="alert">
                {state.error}
              </FieldDescription>
            ) : null}
            <SubmitButton />
          </FieldGroup>
        </form>

        <footer className="pb-6 text-center">
          <p className="text-base font-black uppercase text-[#ffeb3b]">
            ¡Participa y gana!
          </p>
          <p className="mt-1 text-sm text-white/90">
            No te pierdas la oportunidad de llevarte esta espectacular Bera SBR
            150 cc azul.
          </p>
          <p className="mt-3 text-sm font-bold">
            ¡Te esperamos en la feria del tendero!
          </p>
        </footer>
      </div>
    </div>
  );
}
