"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Search, UserPlus, X } from "lucide-react";
import { searchClientesAction } from "@/lib/actions/clientes-search-actions";
import type { ClientSearchResult } from "@/lib/pipeline/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ClientesSearchResults } from "@/components/clientes/clientes-search-results";
import { CrearClienteForm } from "@/components/clientes/crear-cliente-form";

export function ClientesSearchLive({
  initialQuery,
  initialResults,
  creditClients,
  initialShowCreate = false,
}: {
  initialQuery: string;
  initialResults: ClientSearchResult[];
  creditClients: ClientSearchResult[];
  initialShowCreate?: boolean;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState(initialResults);
  const [activeQuery, setActiveQuery] = useState(initialQuery);
  const [showCreate, setShowCreate] = useState(initialShowCreate);
  const [pending, startTransition] = useTransition();
  const reqId = useRef(0);
  const firstRun = useRef(true);

  useEffect(() => {
    const q = query.trim();
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (showCreate) params.set("nuevo", "1");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `/clientes?${qs}` : "/clientes");

    // En el primer render ya tenemos los resultados del servidor
    if (firstRun.current) {
      firstRun.current = false;
      if (q === initialQuery.trim()) return;
    }

    if (q.length < 2) {
      setResults([]);
      setActiveQuery(q);
      return;
    }

    const handle = setTimeout(() => {
      const id = ++reqId.current;
      startTransition(async () => {
        try {
          const data = await searchClientesAction(q);
          if (id === reqId.current) {
            setResults(data);
            setActiveQuery(q);
          }
        } catch {
          // se ignora: el siguiente tecleo reintenta
        }
      });
    }, 250);

    return () => clearTimeout(handle);
  }, [query, initialQuery, showCreate]);

  const trimmed = query.trim();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Placa, cédula o nombre…"
            className="min-h-11 pl-9 pr-9"
            inputMode="search"
            autoFocus={!showCreate}
          />
          {pending && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
        <Button
          type="button"
          variant={showCreate ? "outline" : "default"}
          className="min-h-11 shrink-0 gap-2 touch-manipulation sm:w-auto"
          onClick={() => setShowCreate((v) => !v)}
        >
          {showCreate ? (
            <>
              <X className="h-4 w-4" />
              Cerrar
            </>
          ) : (
            <>
              <UserPlus className="h-4 w-4" />
              Crear cliente
            </>
          )}
        </Button>
      </div>

      {showCreate && (
        <div className="rounded-xl border border-border p-4 sm:p-6">
          <p className="mb-4 text-sm font-medium text-foreground">
            Nuevo cliente por cédula
          </p>
          <CrearClienteForm />
        </div>
      )}

      {trimmed.length > 0 && trimmed.length < 2 && (
        <p className="text-sm text-muted-foreground">
          Escribe al menos 2 caracteres para buscar.
        </p>
      )}

      {activeQuery.trim().length >= 2 && (
        <ClientesSearchResults results={results} query={activeQuery.trim()} />
      )}

      {trimmed.length < 2 && (
        <ClientesSearchResults
          results={creditClients}
          query=""
          listTitle={`${creditClients.length} cliente${creditClients.length === 1 ? "" : "s"} con moto a crédito · mayor atraso primero`}
        />
      )}

      {trimmed.length >= 2 && activeQuery.trim().length < 2 && pending && (
        <p className="text-sm text-muted-foreground">Buscando…</p>
      )}
    </div>
  );
}
