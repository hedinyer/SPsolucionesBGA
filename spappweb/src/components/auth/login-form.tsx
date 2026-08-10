"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { loginAdminAction } from "@/lib/actions/auth-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full" size="lg" disabled={pending}>
      {pending ? (
        <>
          <Spinner data-icon="inline-start" />
          Entrando…
        </>
      ) : (
        "Entrar"
      )}
    </Button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState(loginAdminAction, null);

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--muted)_0%,_var(--background)_55%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]"
      />

      <Card className="relative z-10 w-full max-w-md">
        <CardHeader className="text-center">
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            Soluciones Garrido
          </p>
          <CardTitle className="font-heading text-2xl">SP Admin</CardTitle>
          <CardDescription>
            Ingresa con una cuenta administrador, no con cuentas de cliente
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="username">Usuario</FieldLabel>
                <Input
                  id="username"
                  name="username"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Contraseña</FieldLabel>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </Field>
              {state?.error ? (
                <FieldDescription className="text-destructive" role="alert">
                  {state.error}
                </FieldDescription>
              ) : null}
              <SubmitButton />
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
