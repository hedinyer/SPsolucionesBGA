"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

type TouchSelectOption = {
  value: string;
  label: string;
};

type TouchSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: TouchSelectOption[];
  className?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
};

function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function TouchSelect({
  value,
  onChange,
  options,
  className,
  id,
  name,
  disabled,
  required,
  placeholder,
  searchable = false,
  searchPlaceholder = "Buscar…",
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
}: TouchSelectProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = normalizeLabel(query.trim());
    if (!q) return options;
    return options.filter((option) =>
      normalizeLabel(option.label).includes(q),
    );
  }, [options, query]);

  if (!searchable) {
    return (
      <select
        id={id}
        name={name}
        value={value}
        disabled={disabled}
        required={required}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "min-h-11 w-full touch-manipulation rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
      >
        {placeholder != null && (
          <option value="">{placeholder}</option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  const selected = options.find((option) => option.value === value);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Input
        id={id}
        type="search"
        value={query}
        disabled={disabled}
        aria-label={ariaLabel ? `${ariaLabel}: buscar` : searchPlaceholder}
        aria-invalid={ariaInvalid}
        placeholder={searchPlaceholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => setQuery(e.target.value)}
        className="min-h-11 touch-manipulation text-base md:text-sm"
      />
      {selected ? (
        <p className="text-xs text-muted-foreground">
          Elegida: <span className="font-medium text-foreground">{selected.label}</span>
        </p>
      ) : placeholder ? (
        <p className="text-xs text-muted-foreground">{placeholder}</p>
      ) : null}
      <div
        role="listbox"
        aria-label={ariaLabel}
        className="max-h-44 overflow-y-auto rounded-lg border border-input bg-background"
      >
        {filtered.length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted-foreground">
            Sin resultados
          </p>
        ) : (
          filtered.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={disabled}
                onClick={() => {
                  onChange(option.value);
                  setQuery("");
                }}
                className={cn(
                  "flex min-h-11 w-full items-center px-3 text-left text-base touch-manipulation outline-none hover:bg-muted focus-visible:bg-muted disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
                  isSelected && "bg-muted font-medium",
                )}
              >
                {option.label}
              </button>
            );
          })
        )}
      </div>
      {name ? <input type="hidden" name={name} value={value} /> : null}
    </div>
  );
}
