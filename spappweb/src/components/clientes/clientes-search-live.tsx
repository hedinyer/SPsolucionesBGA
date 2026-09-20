"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Filter, Loader2, Search, UserPlus, X } from "lucide-react";
import { searchClientesAction } from "@/lib/actions/clientes-search-actions";
import type { ClientSearchResult } from "@/lib/pipeline/types";
import {
  COMPRA_FILTER_OPTIONS,
  DEFAULT_CLIENTES_FILTERS,
  filterClientSearchResults,
  hasActiveClientesFilters,
  SITUACION_FILTER_OPTIONS,
  type ClienteCompraFilter,
  type ClienteSituacionFilter,
  type ClientesListFilters,
} from "@/lib/clientes/clientes-list-filters";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ClientesSearchResults } from "@/components/clientes/clientes-search-results";
import { CrearClienteForm } from "@/components/clientes/crear-cliente-form";
import { cn } from "@/lib/utils";

const selectClassName = cn(
  "flex h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm",
  "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

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
  const [filters, setFilters] = useState<ClientesListFilters>(
    DEFAULT_CLIENTES_FILTERS,
  );
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
  const searching = activeQuery.trim().length >= 2;
  const sourceList = searching ? results : creditClients;
  const filteredList = useMemo(
    () => filterClientSearchResults(sourceList, filters),
    [sourceList, filters],
  );
  const filtersActive = hasActiveClientesFilters(filters);

  const listTitle = searching
    ? undefined
    : filtersActive
      ? `${filteredList.length} de ${creditClients.length} cliente${creditClients.length === 1 ? "" : "s"} · filtros activos`
      : `${creditClients.length} cliente${creditClients.length === 1 ? "" : "s"} con moto a crédito · mayor atraso primero`;

  function patchFilter<K extends keyof ClientesListFilters>(
    key: K,
    value: ClientesListFilters[K],
  ) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

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

      <div className="rounded-xl border border-border bg-background p-3 sm:p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
          <Filter className="h-4 w-4 shrink-0" />
          Filtros
          {filtersActive ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto h-8 touch-manipulation px-2 text-muted-foreground"
              onClick={() => setFilters(DEFAULT_CLIENTES_FILTERS)}
            >
              Limpiar
            </Button>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filtro-situacion" className="text-xs text-muted-foreground">
              Situación
            </Label>
            <select
              id="filtro-situacion"
              className={selectClassName}
              value={filters.situacion}
              onChange={(e) =>
                patchFilter(
                  "situacion",
                  e.target.value as ClienteSituacionFilter,
                )
              }
            >
              {SITUACION_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filtro-compra" className="text-xs text-muted-foreground">
              Estado compra
            </Label>
            <select
              id="filtro-compra"
              className={selectClassName}
              value={filters.compraEstado}
              onChange={(e) =>
                patchFilter(
                  "compraEstado",
                  e.target.value as ClienteCompraFilter,
                )
              }
            >
              {COMPRA_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filtro-desde" className="text-xs text-muted-foreground">
              Venta desde
            </Label>
            <Input
              id="filtro-desde"
              type="date"
              value={filters.fechaDesde}
              onChange={(e) => patchFilter("fechaDesde", e.target.value)}
              className="min-h-11"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filtro-hasta" className="text-xs text-muted-foreground">
              Venta hasta
            </Label>
            <Input
              id="filtro-hasta"
              type="date"
              value={filters.fechaHasta}
              onChange={(e) => patchFilter("fechaHasta", e.target.value)}
              className="min-h-11"
            />
          </div>
        </div>
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

      {searching && (
        <ClientesSearchResults
          results={filteredList}
          query={activeQuery.trim()}
          listTitle={
            filtersActive
              ? `${filteredList.length} de ${results.length} resultado${results.length === 1 ? "" : "s"} · filtros activos`
              : undefined
          }
          emptyHint={
            filtersActive
              ? "Ningún resultado coincide con los filtros. Prueba limpiarlos."
              : undefined
          }
        />
      )}

      {trimmed.length < 2 && (
        <ClientesSearchResults
          results={filteredList}
          query=""
          listTitle={listTitle}
          emptyHint={
            filtersActive
              ? "Ningún cliente coincide con los filtros. Prueba limpiarlos."
              : undefined
          }
        />
      )}

      {trimmed.length >= 2 && activeQuery.trim().length < 2 && pending && (
        <p className="text-sm text-muted-foreground">Buscando…</p>
      )}
    </div>
  );
}
