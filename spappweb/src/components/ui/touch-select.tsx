"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { rankBySimilarity } from "@/lib/search/fuzzy-text";
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
  const [menuRect, setMenuRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return rankBySimilarity(q, options, (option) => option.label, {
      threshold: 0.4,
      limit: 12,
    }).map(({ item }) => item);
  }, [options, query]);

  const showSuggestions = searchable && query.trim().length > 0;

  useEffect(() => {
    if (!showSuggestions) {
      setMenuRect(null);
      return;
    }

    function updatePosition() {
      const el = inputRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setMenuRect({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [showSuggestions, query, filtered.length]);

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
  const listboxId = id ? `${id}-sugerencias` : undefined;

  function selectOption(optionValue: string) {
    onChange(optionValue);
    setQuery("");
  }

  const suggestions =
    showSuggestions && menuRect
      ? createPortal(
          <div
            data-touch-select-portal=""
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            // pointer-events-auto: el Dialog modal pone pointer-events:none en body;
            // sin esto el menú se ve pero no recibe clics.
            className="pointer-events-auto fixed z-[140] max-h-44 overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10"
            style={{
              top: menuRect.top,
              left: menuRect.left,
              width: menuRect.width,
            }}
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
                    onPointerDown={(e) => {
                      // Selecciona en pointerdown (antes de que el Dialog trague el click)
                      // y evita que el input pierda el foco de forma rara.
                      e.preventDefault();
                      e.stopPropagation();
                      if (disabled) return;
                      selectOption(option.value);
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
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Input
        ref={inputRef}
        id={id}
        type="search"
        value={query}
        disabled={disabled}
        aria-label={ariaLabel ? `${ariaLabel}: buscar` : searchPlaceholder}
        aria-invalid={ariaInvalid}
        aria-expanded={showSuggestions}
        aria-controls={showSuggestions ? listboxId : undefined}
        aria-autocomplete="list"
        role="combobox"
        placeholder={searchPlaceholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && query) {
            e.preventDefault();
            setQuery("");
          }
        }}
        className="min-h-11 touch-manipulation text-base md:text-sm"
      />
      {selected ? (
        <p className="text-sm text-muted-foreground">
          Elegida:{" "}
          <span className="font-medium text-foreground">{selected.label}</span>
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {placeholder ?? "Escribe para ver sugerencias"}
        </p>
      )}
      {suggestions}
      {name ? <input type="hidden" name={name} value={value} /> : null}
    </div>
  );
}
