"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type ComponentProps,
} from "react";
import { searchContadoClientes } from "@/lib/actions/venta-moto-actions";
import {
  CONTADO_TIPO_DOC_LABELS,
  type ContadoClienteMatch,
} from "@/lib/venta-contado/contado-cliente";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function useContadoClienteSearch(query: string) {
  const [matches, setMatches] = useState<ContadoClienteMatch[]>([]);
  const [pending, startTransition] = useTransition();
  const reqId = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setMatches([]);
      return;
    }

    const handle = setTimeout(() => {
      const id = ++reqId.current;
      startTransition(async () => {
        try {
          const data = await searchContadoClientes(q);
          if (id === reqId.current) setMatches(data);
        } catch {
          if (id === reqId.current) setMatches([]);
        }
      });
    }, 250);

    return () => clearTimeout(handle);
  }, [query]);

  return { matches, pending };
}

export function ContadoClienteSuggestInput({
  id,
  name,
  value,
  onChange,
  matches,
  showSuggestions,
  onPick,
  required,
  type,
  inputMode,
  autoComplete,
  placeholder,
  className,
  onBlur,
}: {
  id: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  matches: ContadoClienteMatch[];
  showSuggestions: boolean;
  onPick: (match: ContadoClienteMatch) => void;
  required?: boolean;
  type?: ComponentProps<"input">["type"];
  inputMode?: ComponentProps<"input">["inputMode"];
  autoComplete?: string;
  placeholder?: string;
  className?: string;
  onBlur?: () => void;
}) {
  const listId = useId();
  const open = showSuggestions && matches.length > 0;

  return (
    <div className="flex flex-col gap-2">
      <Input
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        required={required}
        inputMode={inputMode}
        autoComplete={autoComplete ?? "off"}
        placeholder={placeholder}
        className={cn("min-h-11", className)}
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        spellCheck={false}
      />
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-sm"
        >
          {matches.map((match) => {
            const tipo = CONTADO_TIPO_DOC_LABELS[match.clienteTipoDocumento];
            const meta = [
              match.clienteCedula ? `${tipo} ${match.clienteCedula}` : null,
              match.clienteCelular,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={match.id}>
                <button
                  type="button"
                  role="option"
                  className="flex min-h-11 w-full flex-col items-start justify-center gap-0.5 px-3 py-2 text-left touch-manipulation hover:bg-muted focus-visible:bg-muted"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    onPick(match);
                  }}
                >
                  <span className="font-medium leading-snug">
                    {match.clienteNombre || match.clienteCedula}
                  </span>
                  {meta ? (
                    <span className="text-xs text-muted-foreground">{meta}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
