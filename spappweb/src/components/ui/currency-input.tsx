"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function formatThousands(digits: string): string {
  if (!digits) return "";
  const n = Number(digits);
  if (!Number.isFinite(n)) return "";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(n);
}

export type CurrencyInputProps = Omit<
  React.ComponentProps<"input">,
  "type" | "value" | "onChange" | "min" | "max"
> & {
  value: number | null;
  onValueChange: (value: number | null) => void;
  min?: number;
  max?: number;
};

export function CurrencyInput({
  value,
  onValueChange,
  min,
  max,
  className,
  disabled,
  id,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  placeholder,
  ...rest
}: CurrencyInputProps) {
  const formatted =
    value == null ? "" : formatThousands(String(Math.trunc(value)));
  const [text, setText] = React.useState(formatted);
  const [focused, setFocused] = React.useState(false);

  // Keep display in sync when value changes externally while not editing
  const display = focused ? text : formatted;

  return (
    <Input
      {...rest}
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      disabled={disabled}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedBy}
      placeholder={placeholder}
      value={display}
      className={cn("tabular-nums", className)}
      onFocus={(e) => {
        setFocused(true);
        setText(
          value == null ? "" : formatThousands(String(Math.trunc(value))),
        );
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        if (value == null) setText("");
        else setText(formatThousands(String(Math.trunc(value))));
        rest.onBlur?.(e);
      }}
      onChange={(e) => {
        const digits = digitsOnly(e.target.value);
        if (!digits) {
          setText("");
          onValueChange(null);
          return;
        }
        let n = Number(digits);
        if (min != null && n < min) n = min;
        if (max != null && n > max) n = max;
        setText(formatThousands(String(n)));
        onValueChange(n);
      }}
    />
  );
}
