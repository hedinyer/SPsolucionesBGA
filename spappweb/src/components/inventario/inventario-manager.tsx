"use client";

import {
  useState,
  useTransition,
  useEffect,
  useId,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronDown,
  ListFilter,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  deleteCategoria,
  deleteProducto,
  saveCategoria,
  saveProducto,
} from "@/lib/actions/admin-actions";
import { refreshInventarioData } from "@/lib/actions/inventario-actions";
import { createAnonClient } from "@/lib/supabase/anon";
import type {
  InventarioCategoriaRow,
  InventarioProductoRow,
  InventarioUbicacion,
} from "@/lib/pipeline/types";
import { INVENTARIO_UBICACIONES } from "@/lib/pipeline/types";
import {
  normalizeSearch,
  rankBySimilarity,
} from "@/lib/search/fuzzy-text";
import { formatCop } from "@/lib/utils/format";
import { getStoragePublicUrl } from "@/lib/utils/storage-urls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ImageFileField,
  productoUploadFolder,
  uploadImageFile,
} from "@/components/ui/image-file-field";
import { STORAGE_BUCKETS } from "@/lib/supabase/storage-buckets";
import { Textarea } from "@/components/ui/textarea";
import { TouchSelect } from "@/components/ui/touch-select";
import { ProductoInventarioCard } from "@/components/inventario/producto-inventario-card";
import { ProductoNovedadesDialog } from "@/components/inventario/producto-novedades-dialog";

/** Genera SKU desde el nombre completo (sin truncar). */
function skuFromNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatMilesInput(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("es-CO");
}

function parseMilesInput(raw: string): number {
  return Number(raw.replace(/\D/g, ""));
}

function formatMilesFromNumber(n: number): string {
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("es-CO");
}

/** Firma liviana: solo se considera “cambio” si afecta listado o totales. */
function inventarioFingerprint(
  categorias: InventarioCategoriaRow[],
  productos: InventarioProductoRow[],
): string {
  const cats = categorias
    .map((c) => `${c.id}:${c.nombre}:${Number(c.activo)}:${c.orden}`)
    .join("|");
  const prods = productos
    .map(
      (p) =>
        `${p.id}:${p.stock}:${p.costo}:${p.precio}:${p.nombre}:${p.categoria_id}:${p.ubicacion ?? ""}:${p.gaveta ?? ""}:${p.imagen_url ?? ""}:${Number(p.activo)}`,
    )
    .join("|");
  return `${cats}#${prods}`;
}

type StockPreset = "all" | "bajo" | "sin" | "con";

const STOCK_PRESETS: {
  value: StockPreset;
  label: string;
  hint: string;
}[] = [
  { value: "all", label: "Todos", hint: "Sin filtro de cantidad" },
  { value: "bajo", label: "Casi no hay", hint: "Quedan pocas unidades" },
  { value: "sin", label: "No hay", hint: "Cero unidades" },
  { value: "con", label: "Sí hay", hint: "Al menos una unidad" },
];

function parseOptionalMiles(raw: string): number | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

function inInclusiveRange(
  value: number,
  min: number | null,
  max: number | null,
): boolean {
  if (min != null && value < min) return false;
  if (max != null && value > max) return false;
  return true;
}

function SimpleRangeRow({
  idPrefix,
  question,
  tip,
  min,
  max,
  onMinChange,
  onMaxChange,
  inputMode = "numeric",
  minPlaceholder,
  maxPlaceholder,
}: {
  idPrefix: string;
  question: string;
  tip: string;
  min: string;
  max: string;
  onMinChange: (value: string) => void;
  onMaxChange: (value: string) => void;
  inputMode?: "numeric" | "decimal";
  minPlaceholder: string;
  maxPlaceholder: string;
}) {
  const minId = `${idPrefix}-desde`;
  const maxId = `${idPrefix}-hasta`;
  const tipId = `${idPrefix}-tip`;
  return (
    <fieldset className="min-w-0 rounded-lg border border-border bg-background p-3">
      <legend className="px-1 text-sm font-medium text-foreground">
        {question}
      </legend>
      <p id={tipId} className="mb-3 text-xs text-muted-foreground">
        {tip}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={minId}>Desde</Label>
          <Input
            id={minId}
            value={min}
            onChange={(e) => onMinChange(e.target.value)}
            placeholder={minPlaceholder}
            className="min-h-11"
            inputMode={inputMode}
            autoComplete="off"
            spellCheck={false}
            aria-describedby={tipId}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={maxId}>Hasta</Label>
          <Input
            id={maxId}
            value={max}
            onChange={(e) => onMaxChange(e.target.value)}
            placeholder={maxPlaceholder}
            className="min-h-11"
            inputMode={inputMode}
            autoComplete="off"
            spellCheck={false}
            aria-describedby={tipId}
          />
        </div>
      </div>
    </fieldset>
  );
}

export function InventarioManager({
  categorias: categoriasInitial,
  productos: productosInitial,
}: {
  categorias: InventarioCategoriaRow[];
  productos: InventarioProductoRow[];
}) {
  const router = useRouter();
  const [categorias, setCategorias] = useState(categoriasInitial);
  const [productos, setProductos] = useState(productosInitial);
  const [catOpen, setCatOpen] = useState(false);
  const [prodOpen, setProdOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<InventarioCategoriaRow | null>(
    null,
  );
  const [editingProd, setEditingProd] = useState<InventarioProductoRow | null>(
    null,
  );
  const [photoPreview, setPhotoPreview] = useState<{
    url: string;
    nombre: string;
  } | null>(null);
  const [deletingProd, setDeletingProd] =
    useState<InventarioProductoRow | null>(null);
  const [novedadesProd, setNovedadesProd] =
    useState<InventarioProductoRow | null>(null);
  const [nombreQuery, setNombreQuery] = useState("");
  const [categoriaQuery, setCategoriaQuery] = useState("");
  const [filtrosOpen, setFiltrosOpen] = useState(false);
  const [numerosOpen, setNumerosOpen] = useState(false);
  const [categoriaFiltro, setCategoriaFiltro] = useState("all");
  const [ubicacionFiltro, setUbicacionFiltro] = useState("all");
  const [stockPreset, setStockPreset] = useState<StockPreset>("all");
  const [stockMin, setStockMin] = useState("");
  const [stockMax, setStockMax] = useState("");
  const [costoMin, setCostoMin] = useState("");
  const [costoMax, setCostoMax] = useState("");
  const [precioMin, setPrecioMin] = useState("");
  const [precioMax, setPrecioMax] = useState("");
  const [pending, startTransition] = useTransition();
  const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshingRef = useRef(false);
  const pendingRefreshRef = useRef(false);
  const fingerprintRef = useRef(
    inventarioFingerprint(categoriasInitial, productosInitial),
  );

  useEffect(() => {
    const next = inventarioFingerprint(categoriasInitial, productosInitial);
    if (next === fingerprintRef.current) return;
    fingerprintRef.current = next;
    setCategorias(categoriasInitial);
    setProductos(productosInitial);
  }, [categoriasInitial, productosInitial]);

  const applyInventarioData = useCallback(
    (data: {
      categorias: InventarioCategoriaRow[];
      productos: InventarioProductoRow[];
    }) => {
      const next = inventarioFingerprint(data.categorias, data.productos);
      if (next === fingerprintRef.current) return;
      fingerprintRef.current = next;
      setCategorias(data.categorias);
      setProductos(data.productos);
    },
    [],
  );

  const refreshInventarioLive = useCallback(
    (immediate = false) => {
      if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);

      const run = () => {
        if (refreshingRef.current) {
          pendingRefreshRef.current = true;
          return;
        }
        refreshingRef.current = true;
        void refreshInventarioData()
          .then(applyInventarioData)
          .catch(() => undefined)
          .finally(() => {
            refreshingRef.current = false;
            if (pendingRefreshRef.current) {
              pendingRefreshRef.current = false;
              run();
            }
          });
      };

      if (immediate) {
        run();
        return;
      }
      refreshDebounceRef.current = setTimeout(run, 300);
    },
    [applyInventarioData],
  );

  // Solo socket (Supabase Realtime): sin polling periódico.
  useEffect(() => {
    const supabase = createAnonClient();
    const channel = supabase
      .channel("inventario_live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventario_productos" },
        () => refreshInventarioLive(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventario_categorias" },
        () => refreshInventarioLive(),
      );

    void channel.subscribe();

    return () => {
      if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
      void supabase.removeChannel(channel);
    };
  }, [refreshInventarioLive]);

  const categoriasActivas = useMemo(
    () =>
      [...categorias]
        .filter((c) => c.activo)
        .sort((a, b) =>
          a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }),
        ),
    [categorias],
  );

  const categoriasFiltradas = useMemo(() => {
    const q = normalizeSearch(categoriaQuery.trim());
    const list = [...categorias].sort((a, b) =>
      a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }),
    );
    if (!q) return list;
    return list.filter(
      (c) =>
        normalizeSearch(c.nombre).includes(q) ||
        normalizeSearch(c.slug).includes(q),
    );
  }, [categorias, categoriaQuery]);

  const productosIndex = useMemo(
    () =>
      productos.map((producto) => ({
        producto,
        haystack: normalizeSearch(producto.nombre),
      })),
    [productos],
  );

  const filtrosAvanzadosActivos = useMemo(() => {
    let n = 0;
    if (categoriaFiltro !== "all") n += 1;
    if (ubicacionFiltro !== "all") n += 1;
    if (stockPreset !== "all") n += 1;
    if (stockMin.trim() || stockMax.trim()) n += 1;
    if (costoMin.trim() || costoMax.trim()) n += 1;
    if (precioMin.trim() || precioMax.trim()) n += 1;
    return n;
  }, [
    categoriaFiltro,
    ubicacionFiltro,
    stockPreset,
    stockMin,
    stockMax,
    costoMin,
    costoMax,
    precioMin,
    precioMax,
  ]);

  const hayFiltros =
    Boolean(nombreQuery.trim()) || filtrosAvanzadosActivos > 0;

  const { productosFiltrados, busquedaAproximada } = useMemo(() => {
    const q = normalizeSearch(nombreQuery.trim());
    const terms = q ? q.split(/\s+/).filter(Boolean) : [];
    const sMin = parseOptionalMiles(stockMin);
    const sMax = parseOptionalMiles(stockMax);
    const cMin = parseOptionalMiles(costoMin);
    const cMax = parseOptionalMiles(costoMax);
    const pMin = parseOptionalMiles(precioMin);
    const pMax = parseOptionalMiles(precioMax);
    const categoriaId =
      categoriaFiltro === "all" ? null : Number(categoriaFiltro);

    function matchesAdvanced(producto: InventarioProductoRow): boolean {
      if (categoriaId != null && producto.categoria_id !== categoriaId) {
        return false;
      }
      if (
        ubicacionFiltro !== "all" &&
        (producto.ubicacion ?? "Soluciones") !== ubicacionFiltro
      ) {
        return false;
      }
      if (stockPreset === "sin" && producto.stock !== 0) return false;
      if (stockPreset === "con" && producto.stock <= 0) return false;
      if (stockPreset === "bajo" && producto.stock > producto.stock_minimo) {
        return false;
      }
      if (!inInclusiveRange(producto.stock, sMin, sMax)) return false;
      if (!inInclusiveRange(producto.costo, cMin, cMax)) return false;
      if (!inInclusiveRange(producto.precio, pMin, pMax)) return false;
      return true;
    }

    const afterAdvanced = productosIndex.filter(({ producto }) =>
      matchesAdvanced(producto),
    );

    const exactos = afterAdvanced
      .filter(
        ({ haystack }) =>
          terms.length === 0 || terms.every((term) => haystack.includes(term)),
      )
      .map(({ producto }) => producto)
      .sort((a, b) =>
        a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }),
      );

    if (terms.length === 0 || exactos.length > 0) {
      return { productosFiltrados: exactos, busquedaAproximada: false };
    }

    const ranked = rankBySimilarity(
      nombreQuery.trim(),
      afterAdvanced,
      (row) => row.haystack,
      { threshold: 0.45, limit: 20 },
    );

    const aproximadosOrdered = [...ranked]
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.item.producto.nombre.localeCompare(
          b.item.producto.nombre,
          "es",
          { sensitivity: "base" },
        );
      })
      .map(({ item }) => item.producto);

    return {
      productosFiltrados: aproximadosOrdered,
      busquedaAproximada: aproximadosOrdered.length > 0,
    };
  }, [
    nombreQuery,
    productosIndex,
    categoriaFiltro,
    ubicacionFiltro,
    stockPreset,
    stockMin,
    stockMax,
    costoMin,
    costoMax,
    precioMin,
    precioMax,
  ]);

  function clearFiltrosAvanzados() {
    setCategoriaFiltro("all");
    setUbicacionFiltro("all");
    setStockPreset("all");
    setStockMin("");
    setStockMax("");
    setCostoMin("");
    setCostoMax("");
    setPrecioMin("");
    setPrecioMax("");
    setNumerosOpen(false);
  }

  function clearTodosLosFiltros() {
    setNombreQuery("");
    clearFiltrosAvanzados();
  }

  const hayRangosNumericos =
    Boolean(stockMin.trim() || stockMax.trim()) ||
    Boolean(costoMin.trim() || costoMax.trim()) ||
    Boolean(precioMin.trim() || precioMax.trim());

  const filtrosActivosChips = useMemo(() => {
    const chips: { key: string; label: string; onClear: () => void }[] = [];
    if (nombreQuery.trim()) {
      chips.push({
        key: "nombre",
        label: `Nombre: ${nombreQuery.trim()}`,
        onClear: () => setNombreQuery(""),
      });
    }
    if (stockPreset !== "all") {
      const preset = STOCK_PRESETS.find((p) => p.value === stockPreset);
      chips.push({
        key: "stock",
        label: preset?.label ?? "Cantidad",
        onClear: () => setStockPreset("all"),
      });
    }
    if (categoriaFiltro !== "all") {
      const cat = categorias.find((c) => String(c.id) === categoriaFiltro);
      chips.push({
        key: "categoria",
        label: `Tipo: ${cat?.nombre ?? "categoría"}`,
        onClear: () => setCategoriaFiltro("all"),
      });
    }
    if (ubicacionFiltro !== "all") {
      chips.push({
        key: "ubicacion",
        label: `Lugar: ${ubicacionFiltro}`,
        onClear: () => setUbicacionFiltro("all"),
      });
    }
    if (stockMin.trim() || stockMax.trim()) {
      chips.push({
        key: "stock-rango",
        label: `Unidades ${stockMin || "…"} a ${stockMax || "…"}`,
        onClear: () => {
          setStockMin("");
          setStockMax("");
        },
      });
    }
    if (costoMin.trim() || costoMax.trim()) {
      chips.push({
        key: "costo",
        label: `Costo ${costoMin || "…"} a ${costoMax || "…"}`,
        onClear: () => {
          setCostoMin("");
          setCostoMax("");
        },
      });
    }
    if (precioMin.trim() || precioMax.trim()) {
      chips.push({
        key: "precio",
        label: `Venta ${precioMin || "…"} a ${precioMax || "…"}`,
        onClear: () => {
          setPrecioMin("");
          setPrecioMax("");
        },
      });
    }
    return chips;
  }, [
    nombreQuery,
    stockPreset,
    categoriaFiltro,
    ubicacionFiltro,
    stockMin,
    stockMax,
    costoMin,
    costoMax,
    precioMin,
    precioMax,
    categorias,
  ]);

  const valorInventario = useMemo(() => {
    let costo = 0;
    let venta = 0;
    for (const p of productos) {
      const qty = p.stock > 0 ? p.stock : 0;
      costo += qty * p.costo;
      venta += qty * p.precio;
    }
    return { costo, venta };
  }, [productos]);

  function openPhoto(p: InventarioProductoRow) {
    const img = getStoragePublicUrl(
      STORAGE_BUCKETS.inventarioImagenes,
      p.imagen_url,
    );
    if (!img) {
      toast.message("Este producto no tiene foto.");
      return;
    }
    setPhotoPreview({ url: img, nombre: p.nombre });
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className="ml-auto text-right tabular-nums"
        aria-label="Valor total del inventario"
      >
        <p className="text-xs text-muted-foreground">
          Costo{" "}
          <span className="font-medium text-foreground">
            {formatCop(valorInventario.costo)}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          Venta{" "}
          <span className="font-medium text-foreground">
            {formatCop(valorInventario.venta)}
          </span>
        </p>
      </div>
      <Tabs defaultValue="productos">
        <TabsList className="w-full max-w-full overflow-x-auto">
          <TabsTrigger value="productos">Productos</TabsTrigger>
          <TabsTrigger value="categorias">Categorías</TabsTrigger>
        </TabsList>

        <TabsContent value="productos" className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1" role="search">
              <label htmlFor="inventario-buscar-nombre" className="sr-only">
                Buscar producto por nombre
              </label>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="inventario-buscar-nombre"
                value={nombreQuery}
                onChange={(e) => setNombreQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && nombreQuery) {
                    e.preventDefault();
                    setNombreQuery("");
                  }
                }}
                placeholder="Buscar por nombre…"
                className="min-h-11 pl-9 pr-9"
                inputMode="search"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                aria-describedby={
                  busquedaAproximada ? "inventario-buscar-status" : undefined
                }
              />
              {nombreQuery ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2"
                  aria-label="Borrar búsqueda"
                  onClick={() => setNombreQuery("")}
                >
                  <X aria-hidden="true" />
                </Button>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                type="button"
                variant={filtrosOpen || filtrosAvanzadosActivos > 0 ? "default" : "outline"}
                className="min-h-11"
                aria-expanded={filtrosOpen}
                aria-controls="inventario-filtros-avanzados"
                onClick={() => setFiltrosOpen((open) => !open)}
              >
                <ListFilter data-icon="inline-start" aria-hidden="true" />
                {filtrosOpen ? "Ocultar filtros" : "Filtrar"}
                {filtrosAvanzadosActivos > 0 ? (
                  <Badge
                    variant="secondary"
                    className="ml-1 tabular-nums"
                  >
                    {filtrosAvanzadosActivos}
                    <span className="sr-only"> activos</span>
                  </Badge>
                ) : null}
              </Button>
              <Button
                className="min-h-11"
                onClick={() => {
                  setEditingProd(null);
                  setProdOpen(true);
                }}
              >
                <Plus data-icon="inline-start" aria-hidden="true" />
                Nuevo producto
              </Button>
            </div>
          </div>

          {filtrosActivosChips.length > 0 ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-muted-foreground">Estás viendo:</p>
                {filtrosActivosChips.map((chip) => (
                  <Button
                    key={chip.key}
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="min-h-11 max-w-full gap-1.5"
                    onClick={chip.onClear}
                    aria-label={`Quitar filtro ${chip.label}`}
                  >
                    <span className="truncate">{chip.label}</span>
                    <X className="size-3.5 shrink-0" aria-hidden="true" />
                  </Button>
                ))}
                {filtrosActivosChips.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="min-h-11"
                    onClick={clearTodosLosFiltros}
                  >
                    Quitar todo
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          <div
            id="inventario-filtros-avanzados"
            hidden={!filtrosOpen}
            className="flex flex-col gap-5 rounded-xl border border-border bg-background p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-foreground">
                  Mostrar solo…
                </h2>
                <p className="text-sm text-muted-foreground">
                  Elige una opción. Si no sabes, deja “Todos”.
                </p>
              </div>
              {filtrosAvanzadosActivos > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={clearFiltrosAvanzados}
                >
                  Quitar filtros
                </Button>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <p
                id="inventario-filtro-stock-label"
                className="text-sm font-medium text-foreground"
              >
                1. ¿Cuántos quedan?
              </p>
              <div
                role="group"
                aria-labelledby="inventario-filtro-stock-label"
                className="grid grid-cols-2 gap-2 sm:grid-cols-4"
              >
                {STOCK_PRESETS.map((preset) => {
                  const pressed = stockPreset === preset.value;
                  return (
                    <Button
                      key={preset.value}
                      type="button"
                      variant={pressed ? "default" : "outline"}
                      className="min-h-12 flex-col gap-0.5 px-2 py-2 text-sm whitespace-normal"
                      aria-pressed={pressed}
                      title={preset.hint}
                      onClick={() => setStockPreset(preset.value)}
                    >
                      <span>{preset.label}</span>
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="inventario-filtro-categoria"
                  className="text-sm font-medium text-foreground"
                >
                  2. ¿Qué tipo de producto?
                </Label>
                <TouchSelect
                  id="inventario-filtro-categoria"
                  aria-label="Qué tipo de producto"
                  value={categoriaFiltro}
                  onChange={setCategoriaFiltro}
                  options={[
                    { value: "all", label: "Todos los tipos" },
                    ...categoriasActivas.map((c) => ({
                      value: String(c.id),
                      label: c.nombre,
                    })),
                  ]}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="inventario-filtro-ubicacion"
                  className="text-sm font-medium text-foreground"
                >
                  3. ¿Dónde está?
                </Label>
                <TouchSelect
                  id="inventario-filtro-ubicacion"
                  aria-label="Dónde está el producto"
                  value={ubicacionFiltro}
                  onChange={setUbicacionFiltro}
                  options={[
                    { value: "all", label: "En cualquier lugar" },
                    ...INVENTARIO_UBICACIONES.map((u) => ({
                      value: u,
                      label: u,
                    })),
                  ]}
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-border pt-4">
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 justify-between px-0 hover:bg-transparent"
                aria-expanded={numerosOpen}
                aria-controls="inventario-filtros-numeros"
                onClick={() => setNumerosOpen((open) => !open)}
              >
                <span className="text-left text-sm font-medium">
                  {numerosOpen
                    ? "Ocultar cantidad y precios"
                    : "También filtrar por cantidad o precios"}
                  {hayRangosNumericos && !numerosOpen ? (
                    <span className="ml-1 text-muted-foreground">(activos)</span>
                  ) : null}
                </span>
                <ChevronDown
                  className={`size-4 shrink-0 transition-transform ${
                    numerosOpen ? "rotate-180" : ""
                  }`}
                  aria-hidden="true"
                />
              </Button>

              <div
                id="inventario-filtros-numeros"
                hidden={!numerosOpen}
                className="flex flex-col gap-3"
              >
                <p className="text-sm text-muted-foreground">
                  Solo si lo necesitas. Si no, déjalos vacíos.
                </p>
                <SimpleRangeRow
                  idPrefix="inventario-filtro-cantidad"
                  question="¿Cuántas unidades?"
                  tip="Ejemplo: desde 1 hasta 5"
                  min={stockMin}
                  max={stockMax}
                  onMinChange={(v) => setStockMin(v.replace(/\D/g, ""))}
                  onMaxChange={(v) => setStockMax(v.replace(/\D/g, ""))}
                  minPlaceholder="Ej. 1"
                  maxPlaceholder="Ej. 5"
                />
                <SimpleRangeRow
                  idPrefix="inventario-filtro-costo"
                  question="¿Cuánto te costó?"
                  tip="En pesos. Déjalos vacíos si no importa."
                  min={costoMin}
                  max={costoMax}
                  onMinChange={(v) => setCostoMin(formatMilesInput(v))}
                  onMaxChange={(v) => setCostoMax(formatMilesInput(v))}
                  inputMode="decimal"
                  minPlaceholder="Ej. 10.000"
                  maxPlaceholder="Ej. 50.000"
                />
                <SimpleRangeRow
                  idPrefix="inventario-filtro-precio"
                  question="¿A cuánto lo vendes?"
                  tip="En pesos. Déjalos vacíos si no importa."
                  min={precioMin}
                  max={precioMax}
                  onMinChange={(v) => setPrecioMin(formatMilesInput(v))}
                  onMaxChange={(v) => setPrecioMax(formatMilesInput(v))}
                  inputMode="decimal"
                  minPlaceholder="Ej. 20.000"
                  maxPlaceholder="Ej. 80.000"
                />
              </div>
            </div>
          </div>

          <p
            id="inventario-buscar-status"
            className="text-sm text-muted-foreground"
            role="status"
          >
            {busquedaAproximada
              ? `No hay coincidencia exacta. Mostrando ${productosFiltrados.length} productos parecidos`
              : hayFiltros
                ? `Quedan ${productosFiltrados.length} de ${productos.length} productos`
                : `${productos.length} productos`}
          </p>
          {busquedaAproximada ? (
            <p className="text-sm text-muted-foreground">
              Parecidos a lo que escribiste. Si no es el producto, prueba otra
              palabra o{" "}
              <button
                type="button"
                className="font-medium text-foreground underline underline-offset-2 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                onClick={clearTodosLosFiltros}
              >
                quita los filtros
              </button>
              .
            </p>
          ) : null}
          {productos.length === 0 ? (
            <Empty className="border border-dashed border-border">
              <EmptyHeader>
                <EmptyTitle>Inventario vacío</EmptyTitle>
                <EmptyDescription>
                  Aún no hay productos. Crea el primero con Nuevo producto.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : productosFiltrados.length === 0 ? (
            <Empty className="border border-dashed border-border">
              <EmptyHeader>
                <EmptyTitle>No aparece nada</EmptyTitle>
                <EmptyDescription>
                  Con lo que elegiste no hay productos.{" "}
                  <button
                    type="button"
                    className="font-medium text-foreground underline underline-offset-2 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    onClick={clearTodosLosFiltros}
                  >
                    Quitar todos los filtros
                  </button>
                  .
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="flex flex-col gap-4">
              {productosFiltrados.map((p) => (
                <li key={p.id}>
                  <ProductoInventarioCard
                    product={p}
                    categoriaNombre={
                      categorias.find((c) => c.id === p.categoria_id)?.nombre
                    }
                    onEdit={() => {
                      setEditingProd(p);
                      setProdOpen(true);
                    }}
                    onDelete={() => setDeletingProd(p)}
                    onNovedades={() => setNovedadesProd(p)}
                    onPhoto={() => openPhoto(p)}
                  />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="categorias" className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1" role="search">
              <label htmlFor="inventario-buscar-categoria" className="sr-only">
                Buscar categoría por nombre
              </label>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="inventario-buscar-categoria"
                value={categoriaQuery}
                onChange={(e) => setCategoriaQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && categoriaQuery) {
                    e.preventDefault();
                    setCategoriaQuery("");
                  }
                }}
                placeholder="Buscar categoría…"
                className="min-h-11 pl-9 pr-9"
                inputMode="search"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              {categoriaQuery ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2"
                  aria-label="Borrar búsqueda"
                  onClick={() => setCategoriaQuery("")}
                >
                  <X aria-hidden="true" />
                </Button>
              ) : null}
            </div>
            <Button
              className="min-h-11 shrink-0"
              onClick={() => {
                setEditingCat(null);
                setCatOpen(true);
              }}
            >
              <Plus data-icon="inline-start" />
              Nueva categoría
            </Button>
          </div>

          {categoriasFiltradas.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>
                  {categoriaQuery.trim()
                    ? "Sin categorías con ese nombre"
                    : "Aún no hay categorías"}
                </EmptyTitle>
                <EmptyDescription>
                  {categoriaQuery.trim()
                    ? "Prueba otro término o borra la búsqueda."
                    : "Crea la primera con Nueva categoría."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
          <div className="hidden overflow-x-auto rounded-lg border border-border lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Orden</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {categoriasFiltradas.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.nombre}</TableCell>
                    <TableCell>{c.slug}</TableCell>
                    <TableCell>{c.orden}</TableCell>
                    <TableCell>
                      <Badge variant={c.activo ? "outline" : "secondary"}>
                        {c.activo ? "Activa" : "Inactiva"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Editar categoría ${c.nombre}`}
                          onClick={() => {
                            setEditingCat(c);
                            setCatOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Eliminar categoría ${c.nombre}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="bg-background">
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                ¿Eliminar categoría?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {c.nombre}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() =>
                                  startTransition(async () => {
                                    try {
                                      await deleteCategoria(c.id);
                                      toast.success("Categoría eliminada.");
                                      refreshInventarioLive(true);
                                      router.refresh();
                                    } catch (e) {
                                      toast.error(
                                        e instanceof Error
                                          ? e.message
                                          : "No se pudo eliminar.",
                                      );
                                    }
                                  })
                                }
                              >
                                Eliminar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 lg:hidden">
            {categoriasFiltradas.map((c) => (
              <div
                key={c.id}
                className="rounded-lg border border-border p-4 text-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{c.nombre}</p>
                  <Badge variant={c.activo ? "outline" : "secondary"}>
                    {c.activo ? "Activa" : "Inactiva"}
                  </Badge>
                </div>
                <dl className="mt-3 flex flex-col gap-1.5">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Slug</dt>
                    <dd>{c.slug}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Orden</dt>
                    <dd>{c.orden}</dd>
                  </div>
                </dl>
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      setEditingCat(c);
                      setCatOpen(true);
                    }}
                  >
                    <Pencil className="mr-1 h-4 w-4" />
                    Editar
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="flex-1">
                        <Trash2 className="mr-1 h-4 w-4" />
                        Eliminar
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="bg-background">
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar categoría?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {c.nombre}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() =>
                            startTransition(async () => {
                              try {
                                await deleteCategoria(c.id);
                                toast.success("Categoría eliminada.");
                                refreshInventarioLive(true);
                                router.refresh();
                              } catch (e) {
                                toast.error(
                                  e instanceof Error
                                    ? e.message
                                    : "No se pudo eliminar.",
                                );
                              }
                            })
                          }
                        >
                          Eliminar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
            </>
          )}
        </TabsContent>

        <CategoriaDialog
          open={catOpen}
          onOpenChange={setCatOpen}
          editing={editingCat}
          pending={pending}
          onSave={(form) =>
            startTransition(async () => {
              try {
                await saveCategoria(form);
                toast.success(
                  editingCat ? "Categoría actualizada." : "Categoría creada.",
                );
                refreshInventarioLive(true);
                router.refresh();
                setCatOpen(false);
              } catch (e) {
                toast.error(
                  e instanceof Error ? e.message : "Error al guardar.",
                );
              }
            })
          }
        />

        <ProductoDialog
          open={prodOpen}
          onOpenChange={setProdOpen}
          editing={editingProd}
          categorias={categorias}
          productos={productos}
          pending={pending}
          onSave={(form) =>
            startTransition(async () => {
              try {
                let imagenUrl = form.imagenUrl;
                if (form.imageFile) {
                  imagenUrl = await uploadImageFile(
                    STORAGE_BUCKETS.inventarioImagenes,
                    productoUploadFolder(form.sku, form.nombre),
                    form.imageFile,
                  );
                }
                const result = await saveProducto({ ...form, imagenUrl });
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                toast.success(
                  editingProd ? "Producto actualizado." : "Producto creado.",
                );
                refreshInventarioLive(true);
                router.refresh();
                setProdOpen(false);
              } catch (e) {
                toast.error(
                  e instanceof Error ? e.message : "Error al guardar.",
                );
              }
            })
          }
        />

        <Dialog
          open={!!photoPreview}
          onOpenChange={(open) => {
            if (!open) setPhotoPreview(null);
          }}
        >
          <DialogContent className="max-w-lg bg-background">
            <DialogHeader>
              <DialogTitle>{photoPreview?.nombre ?? "Foto"}</DialogTitle>
              <DialogDescription>Vista de la foto del producto</DialogDescription>
            </DialogHeader>
            {photoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoPreview.url}
                alt={`Foto de ${photoPreview.nombre}`}
                className="max-h-[70vh] w-full rounded object-contain"
              />
            ) : null}
          </DialogContent>
        </Dialog>

        <DeleteProductoDialog
          product={deletingProd}
          open={!!deletingProd}
          pending={pending}
          onOpenChange={(open) => {
            if (!open) setDeletingProd(null);
          }}
          onConfirm={(form) =>
            startTransition(async () => {
              try {
                await deleteProducto(form);
                toast.success("Producto eliminado.");
                setDeletingProd(null);
                refreshInventarioLive(true);
                router.refresh();
              } catch (e) {
                toast.error(
                  e instanceof Error ? e.message : "No se pudo eliminar.",
                );
              }
            })
          }
        />

        <ProductoNovedadesDialog
          product={novedadesProd}
          open={!!novedadesProd}
          onOpenChange={(open) => {
            if (!open) setNovedadesProd(null);
          }}
        />
      </Tabs>
    </div>
  );
}

function slugFromNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function DeleteProductoDialog({
  product,
  open,
  pending,
  onOpenChange,
  onConfirm,
}: {
  product: InventarioProductoRow | null;
  open: boolean;
  pending: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (form: {
    id: number;
    eliminadoPor: string;
    motivoEliminacion: string;
  }) => void;
}) {
  const formId = useId();
  const porId = `${formId}-eliminado-por`;
  const motivoId = `${formId}-motivo`;
  const [eliminadoPor, setEliminadoPor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [errors, setErrors] = useState<{
    eliminadoPor?: string;
    motivo?: string;
  }>({});

  useEffect(() => {
    if (open) {
      setEliminadoPor("");
      setMotivo("");
      setErrors({});
    }
  }, [open, product?.id]);

  function handleSubmit() {
    if (!product) return;
    const next: { eliminadoPor?: string; motivo?: string } = {};
    if (!eliminadoPor.trim()) {
      next.eliminadoPor = "Escribe quién elimina el producto.";
    }
    if (!motivo.trim()) {
      next.motivo = "Explica por qué lo eliminas.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) {
      if (next.eliminadoPor) document.getElementById(porId)?.focus();
      else document.getElementById(motivoId)?.focus();
      return;
    }
    onConfirm({
      id: product.id,
      eliminadoPor: eliminadoPor.trim(),
      motivoEliminacion: motivo.trim(),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Eliminar producto</DialogTitle>
          <DialogDescription>
            {product
              ? `Vas a eliminar “${product.nombre}”. Indica quién lo elimina y por qué.`
              : "Indica quién elimina y por qué."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field
            id={porId}
            label="Quién lo elimina"
            value={eliminadoPor}
            onChange={setEliminadoPor}
            error={errors.eliminadoPor}
            autoComplete="name"
          />
          <div className="flex flex-col gap-2">
            <Label htmlFor={motivoId}>Por qué lo eliminas</Label>
            <Textarea
              id={motivoId}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              aria-invalid={!!errors.motivo}
              aria-describedby={
                errors.motivo ? `${motivoId}-error` : undefined
              }
              className="min-h-20 touch-manipulation text-base md:text-sm"
            />
            {errors.motivo ? (
              <p
                id={`${motivoId}-error`}
                className="text-sm text-destructive"
                role="alert"
              >
                {errors.motivo}
              </p>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={handleSubmit}
          >
            Eliminar producto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategoriaDialog({
  open,
  onOpenChange,
  editing,
  pending,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: InventarioCategoriaRow | null;
  pending: boolean;
  onSave: (form: {
    id?: number;
    nombre: string;
    slug: string;
    descripcion: string;
    activo: boolean;
    orden?: number;
  }) => void;
}) {
  const formId = useId();
  const nombreId = `${formId}-nombre`;
  const slugId = `${formId}-slug`;
  const descId = `${formId}-desc`;
  const activoId = `${formId}-activo`;

  const [nombre, setNombre] = useState("");
  const [slug, setSlug] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [activo, setActivo] = useState(true);
  const [slugTouched, setSlugTouched] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [errors, setErrors] = useState<{ nombre?: string; slug?: string }>({});

  function load() {
    setNombre(editing?.nombre ?? "");
    setSlug(editing?.slug ?? "");
    setDescripcion(editing?.descripcion ?? "");
    setActivo(editing?.activo ?? true);
    setSlugTouched(!!editing?.slug);
    setMoreOpen(false);
    setErrors({});
  }

  useEffect(() => {
    if (open) load();
  }, [open, editing]);

  function handleNombreChange(value: string) {
    setNombre(value);
    if (!slugTouched) {
      setSlug(slugFromNombre(value));
    }
  }

  function focusField(id: string) {
    document.getElementById(id)?.focus();
  }

  function handleSubmit() {
    const next: { nombre?: string; slug?: string } = {};
    if (!nombre.trim()) {
      next.nombre = "Escribe el nombre de la categoría.";
    }
    let resolvedSlug = slug.trim() || slugFromNombre(nombre);
    if (!resolvedSlug) {
      next.slug = "El código se genera del nombre; revísalo en Más opciones.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) {
      if (next.nombre) focusField(nombreId);
      else if (next.slug) {
        setMoreOpen(true);
        queueMicrotask(() => focusField(slugId));
      }
      return;
    }

    onSave({
      id: editing?.id,
      nombre,
      slug: resolvedSlug,
      descripcion,
      activo,
      ...(editing ? { orden: editing.orden } : {}),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar categoría" : "Nueva categoría"}
          </DialogTitle>
          <DialogDescription>
            Ponle un nombre a la categoría.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field
            id={nombreId}
            label="Nombre"
            value={nombre}
            onChange={handleNombreChange}
            error={errors.nombre}
          />

          <div>
            <Button
              type="button"
              variant="ghost"
              className="h-auto w-full justify-between px-0 py-2 font-medium"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((v) => !v)}
            >
              Más opciones
              <ChevronDown
                className={`h-4 w-4 transition-transform ${moreOpen ? "rotate-180" : ""}`}
              />
            </Button>
            {moreOpen ? (
              <div className="mt-2 grid gap-4">
                <Field
                  id={slugId}
                  label="Código (slug)"
                  value={slug}
                  onChange={(v) => {
                    setSlugTouched(true);
                    setSlug(v);
                  }}
                  error={errors.slug}
                />
                <div className="flex flex-col gap-2">
                  <Label htmlFor={descId}>Descripción</Label>
                  <Textarea
                    id={descId}
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    className="min-h-24 touch-manipulation text-base md:text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id={activoId}
                    checked={activo}
                    onCheckedChange={setActivo}
                  />
                  <Label htmlFor={activoId}>Categoría activa</Label>
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/80"
            disabled={pending}
            onClick={handleSubmit}
          >
            Guardar categoría
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ProductoFormErrors = {
  nombre?: string;
  stock?: string;
  costo?: string;
  precio?: string;
  ubicacion?: string;
  gaveta?: string;
  categoriaId?: string;
  sku?: string;
  editadoPor?: string;
  motivoEdicion?: string;
};

function ProductoDialog({
  open,
  onOpenChange,
  editing,
  categorias,
  productos,
  pending,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: InventarioProductoRow | null;
  categorias: InventarioCategoriaRow[];
  productos: InventarioProductoRow[];
  pending: boolean;
  onSave: (form: {
    id?: number;
    categoriaId: number;
    sku: string;
    nombre: string;
    descripcion: string;
    precio: number;
    costo: number;
    stock: number;
    stockMinimo: number;
    ubicacion: InventarioUbicacion;
    gaveta?: string;
    editadoPor?: string;
    motivoEdicion?: string;
    imagenUrl: string;
    imageFile: File | null;
    compatibleModelos: string[];
    activo: boolean;
  }) => void;
}) {
  const formId = useId();
  const isEditing = editing != null;

  const categoriasOrdenadas = useMemo(
    () =>
      [...categorias].sort((a, b) =>
        a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }),
      ),
    [categorias],
  );

  const otrosProductos = useMemo(
    () =>
      editing
        ? productos.filter((p) => p.id !== editing.id)
        : productos,
    [productos, editing],
  );

  const [categoriaId, setCategoriaId] = useState("");
  const [sku, setSku] = useState("");
  const [skuTouched, setSkuTouched] = useState(false);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [precio, setPrecio] = useState("");
  const [costo, setCosto] = useState("");
  const [stock, setStock] = useState("");
  const [stockMinimo, setStockMinimo] = useState("0");
  const [ubicacion, setUbicacion] = useState<InventarioUbicacion>("Soluciones");
  const [gaveta, setGaveta] = useState("");
  const [editadoPor, setEditadoPor] = useState("");
  const [motivoEdicion, setMotivoEdicion] = useState("");
  const [imagenUrl, setImagenUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [modelos, setModelos] = useState("");
  const [activo, setActivo] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const [errors, setErrors] = useState<ProductoFormErrors>({});

  const nombreId = `${formId}-nombre`;
  const stockId = `${formId}-stock`;
  const costoId = `${formId}-costo`;
  const precioId = `${formId}-precio`;
  const skuId = `${formId}-sku`;
  const ubicacionId = `${formId}-ubicacion`;
  const gavetaId = `${formId}-gaveta`;
  const categoriaFieldId = `${formId}-categoria`;
  const editadoPorId = `${formId}-editado-por`;
  const motivoEdicionId = `${formId}-motivo-edicion`;

  function focusField(id: string) {
    document.getElementById(id)?.focus();
  }

  function load() {
    setCategoriaId(
      String(editing?.categoria_id ?? categoriasOrdenadas[0]?.id ?? ""),
    );
    setSku(editing?.sku ?? "");
    setSkuTouched(!!editing?.sku);
    setNombre(editing?.nombre ?? "");
    setDescripcion(editing?.descripcion ?? "");
    setPrecio(editing ? formatMilesFromNumber(editing.precio) : "");
    setCosto(editing ? formatMilesFromNumber(editing.costo ?? 0) : "");
    setStock(editing ? String(editing.stock) : "");
    setStockMinimo(String(editing?.stock_minimo ?? 0));
    setUbicacion(editing?.ubicacion ?? "Soluciones");
    setGaveta(editing?.gaveta ?? "");
    setEditadoPor("");
    setMotivoEdicion("");
    setImagenUrl(editing?.imagen_url ?? "");
    setImageFile(null);
    setModelos((editing?.compatible_modelos ?? []).join(", "));
    setActivo(editing?.activo ?? true);
    setMoreOpen(false);
    setErrors({});
  }

  useEffect(() => {
    if (open) load();
  }, [open, editing]);

  const resolvedSkuPreview = useMemo(
    () => (sku.trim() || skuFromNombre(nombre)).toUpperCase(),
    [sku, nombre],
  );

  const nombreExactoExistente = useMemo(() => {
    const key = normalizeSearch(nombre.trim());
    if (!key) return null;
    return (
      otrosProductos.find((p) => normalizeSearch(p.nombre) === key) ?? null
    );
  }, [nombre, otrosProductos]);

  const skuExistente = useMemo(() => {
    if (!resolvedSkuPreview) return null;
    return (
      otrosProductos.find(
        (p) => p.sku.trim().toUpperCase() === resolvedSkuPreview,
      ) ?? null
    );
  }, [resolvedSkuPreview, otrosProductos]);

  const nombreSugerencias = useMemo(() => {
    const q = nombre.trim();
    if (q.length < 2) return [];
    return rankBySimilarity(q, otrosProductos, (p) => p.nombre, {
      threshold: 0.4,
      limit: 6,
    }).map((r) => r.item);
  }, [nombre, otrosProductos]);

  const nombreBloqueado =
    nombreExactoExistente != null || skuExistente != null;

  function handleNombreChange(value: string) {
    setNombre(value);
    if (!skuTouched) {
      setSku(skuFromNombre(value));
    }
    if (errors.nombre) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.nombre;
        return next;
      });
    }
  }

  function validate(): ProductoFormErrors {
    const next: ProductoFormErrors = {};
    if (!nombre.trim()) next.nombre = "Escribe el nombre del producto.";
    else if (nombreExactoExistente) {
      next.nombre = `Ya existe «${nombreExactoExistente.nombre}». Usa otro nombre.`;
    } else if (skuExistente) {
      next.nombre = `Ese nombre genera el mismo código que «${skuExistente.nombre}». Cámbialo un poco.`;
    }
    const stockNum = Number(stock.replace(/\D/g, ""));
    if (stock.trim() === "" || !Number.isFinite(stockNum) || stockNum < 0) {
      next.stock = "Indica cuántas unidades hay (0 o más).";
    }
    const costoNum = parseMilesInput(costo);
    if (costo.trim() === "" || !Number.isFinite(costoNum) || costoNum < 0) {
      next.costo = "Indica cuánto te costó (0 o más).";
    }
    const precioNum = parseMilesInput(precio);
    if (precio.trim() === "" || !Number.isFinite(precioNum) || precioNum < 0) {
      next.precio = "Indica a cuánto lo vendes (0 o más).";
    }
    if (!ubicacion) next.ubicacion = "Elige dónde está el producto.";
    if (ubicacion === "Bodega" && !gaveta.trim()) {
      next.gaveta = "Indica el número de gaveta.";
    }
    if (!categoriaId) next.categoriaId = "Elige una categoría.";
    if (isEditing) {
      if (!editadoPor.trim()) {
        next.editadoPor = "Escribe quién hace la edición.";
      }
      if (!motivoEdicion.trim()) {
        next.motivoEdicion = "Explica por qué editas este producto.";
      }
    }
    const resolvedSku = sku.trim() || skuFromNombre(nombre);
    if (!resolvedSku) next.sku = "El SKU se genera del nombre; revísalo en Más opciones.";
    return next;
  }

  function handleSubmit() {
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) {
      if (next.editadoPor) focusField(editadoPorId);
      else if (next.motivoEdicion) focusField(motivoEdicionId);
      else if (next.nombre) focusField(nombreId);
      else if (next.stock) focusField(stockId);
      else if (next.costo) focusField(costoId);
      else if (next.precio) focusField(precioId);
      else if (next.gaveta) focusField(gavetaId);
      else if (next.ubicacion) focusField(ubicacionId);
      else if (next.categoriaId) focusField(categoriaFieldId);
      else if (next.sku) {
        setMoreOpen(true);
        queueMicrotask(() => focusField(skuId));
      }
      return;
    }

    const resolvedSku = (sku.trim() || skuFromNombre(nombre)).toUpperCase();
    onSave({
      id: editing?.id,
      categoriaId: Number(categoriaId),
      sku: resolvedSku,
      nombre,
      descripcion,
      precio: parseMilesInput(precio),
      costo: parseMilesInput(costo),
      stock: Number(stock.replace(/\D/g, "")),
      stockMinimo: Number(stockMinimo) || 0,
      ubicacion,
      gaveta: ubicacion === "Bodega" ? gaveta.trim() : undefined,
      editadoPor: isEditing ? editadoPor.trim() : undefined,
      motivoEdicion: isEditing ? motivoEdicion.trim() : undefined,
      imagenUrl,
      imageFile,
      compatibleModelos: modelos
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean),
      activo,
    });
  }

  const basicosCompletos =
    nombre.trim().length > 0 &&
    !nombreBloqueado &&
    stock.trim() !== "" &&
    costo.trim() !== "" &&
    precio.trim() !== "" &&
    Boolean(categoriaId) &&
    Boolean(ubicacion) &&
    (ubicacion !== "Bodega" || gaveta.trim().length > 0) &&
    (!isEditing ||
      (editadoPor.trim().length > 0 && motivoEdicion.trim().length > 0));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto bg-background sm:max-w-2xl md:max-w-3xl"
        onPointerDownOutside={(e) => {
          const node = e.target as Node | null;
          const el =
            node instanceof Element ? node : node?.parentElement ?? null;
          if (el?.closest("[data-touch-select-portal]")) {
            e.preventDefault();
          }
        }}
        onInteractOutside={(e) => {
          const node = e.target as Node | null;
          const el =
            node instanceof Element ? node : node?.parentElement ?? null;
          if (el?.closest("[data-touch-select-portal]")) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar producto" : "Nuevo producto"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Indica quién edita, por qué y los datos del producto."
              : "Escribe el nombre, cuántas hay, cuánto costó y a cuánto se vende."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-6">
          {isEditing ? (
            <section
              aria-labelledby={`${formId}-sec-edicion`}
              className="grid gap-3 sm:grid-cols-2"
            >
              <h3
                id={`${formId}-sec-edicion`}
                className="text-sm font-medium text-foreground sm:col-span-2"
              >
                Motivo de la edición
              </h3>
              <Field
                id={editadoPorId}
                label="Quién lo edita"
                value={editadoPor}
                onChange={setEditadoPor}
                error={errors.editadoPor}
                autoComplete="name"
              />
              <div className="flex flex-col gap-2">
                <Label htmlFor={motivoEdicionId}>Por qué lo editas</Label>
                <Textarea
                  id={motivoEdicionId}
                  value={motivoEdicion}
                  onChange={(e) => setMotivoEdicion(e.target.value)}
                  aria-invalid={!!errors.motivoEdicion}
                  aria-describedby={
                    errors.motivoEdicion
                      ? `${motivoEdicionId}-error`
                      : undefined
                  }
                  className="min-h-11 touch-manipulation text-base md:text-sm"
                />
                {errors.motivoEdicion ? (
                  <p
                    id={`${motivoEdicionId}-error`}
                    className="text-sm text-destructive"
                    role="alert"
                  >
                    {errors.motivoEdicion}
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}

          <section
            aria-labelledby={`${formId}-sec-datos`}
            className="grid gap-3 sm:grid-cols-2 md:grid-cols-3"
          >
            <h3
              id={`${formId}-sec-datos`}
              className="text-sm font-medium text-foreground sm:col-span-2 md:col-span-3"
            >
              Datos del producto
            </h3>
            <div className="flex flex-col gap-2 sm:col-span-2 md:col-span-3">
              <Label htmlFor={nombreId}>Nombre</Label>
              <Input
                id={nombreId}
                value={nombre}
                onChange={(e) => handleNombreChange(e.target.value)}
                autoComplete="off"
                aria-invalid={!!errors.nombre || nombreBloqueado}
                aria-describedby={
                  errors.nombre || nombreBloqueado
                    ? `${nombreId}-aviso`
                    : nombreSugerencias.length > 0
                      ? `${nombreId}-sugerencias`
                      : undefined
                }
                className="min-h-11 touch-manipulation text-base md:text-sm"
              />
              {nombreExactoExistente ? (
                <p
                  id={`${nombreId}-aviso`}
                  className="text-sm font-medium text-destructive"
                  role="alert"
                >
                  Ya existe «{nombreExactoExistente.nombre}». Pon un nombre
                  diferente o edita ese producto.
                </p>
              ) : skuExistente ? (
                <p
                  id={`${nombreId}-aviso`}
                  className="text-sm font-medium text-destructive"
                  role="alert"
                >
                  Ese nombre genera el mismo código que «{skuExistente.nombre}».
                  Cámbialo un poco (color, lado, modelo…) para distinguirlo.
                </p>
              ) : errors.nombre ? (
                <p
                  id={`${nombreId}-aviso`}
                  className="text-sm text-destructive"
                  role="alert"
                >
                  {errors.nombre}
                </p>
              ) : null}
              {!nombreExactoExistente && nombreSugerencias.length > 0 ? (
                <div
                  id={`${nombreId}-sugerencias`}
                  className="rounded-md border border-border bg-muted/40 px-3 py-2"
                >
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                    Productos parecidos en inventario
                  </p>
                  <ul className="flex flex-col gap-1">
                    {nombreSugerencias.map((p) => (
                      <li
                        key={p.id}
                        className="text-sm leading-snug text-foreground"
                      >
                        <span className="font-medium">{p.nombre}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          · {p.stock} und
                          {p.ubicacion ? ` · ${p.ubicacion}` : ""}
                          {p.gaveta ? ` gav. ${p.gaveta}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
            <Field
              id={stockId}
              label="Cuántas hay"
              value={stock}
              onChange={(v) => setStock(v.replace(/\D/g, ""))}
              inputMode="numeric"
              placeholder="Ej. 5"
              error={errors.stock}
            />
            <Field
              id={costoId}
              label="Cuánto te costó"
              value={costo}
              onChange={(v) => setCosto(formatMilesInput(v))}
              inputMode="numeric"
              placeholder="Ej. 50.000"
              error={errors.costo}
            />
            <Field
              id={precioId}
              label="A cuánto lo vendes"
              value={precio}
              onChange={(v) => setPrecio(formatMilesInput(v))}
              inputMode="numeric"
              placeholder="Ej. 80.000"
              error={errors.precio}
            />
          </section>

          <section
            aria-labelledby={`${formId}-sec-lugar`}
            className="grid gap-3 sm:grid-cols-2 md:grid-cols-3"
          >
            <h3
              id={`${formId}-sec-lugar`}
              className="text-sm font-medium text-foreground sm:col-span-2 md:col-span-3"
            >
              Dónde está
            </h3>
            <div className="flex flex-col gap-2">
              <Label htmlFor={ubicacionId}>Ubicación</Label>
              <TouchSelect
                id={ubicacionId}
                aria-label="Ubicación"
                aria-invalid={!!errors.ubicacion}
                value={ubicacion}
                onChange={(v) => {
                  const next = v as InventarioUbicacion;
                  setUbicacion(next);
                  if (next !== "Bodega") setGaveta("");
                }}
                options={INVENTARIO_UBICACIONES.map((u) => ({
                  value: u,
                  label: u,
                }))}
              />
              {errors.ubicacion ? (
                <p className="text-sm text-destructive" role="alert">
                  {errors.ubicacion}
                </p>
              ) : null}
            </div>
            {ubicacion === "Bodega" ? (
              <Field
                id={gavetaId}
                label="Gaveta número"
                value={gaveta}
                onChange={(v) => setGaveta(v.replace(/\D/g, ""))}
                inputMode="numeric"
                placeholder="Ej. 12"
                error={errors.gaveta}
              />
            ) : null}
            <div className="flex flex-col gap-2 sm:col-span-2 md:col-span-1">
              <Label htmlFor={categoriaFieldId}>Categoría</Label>
              <TouchSelect
                id={categoriaFieldId}
                aria-label="Categoría"
                aria-invalid={!!errors.categoriaId}
                value={categoriaId}
                onChange={setCategoriaId}
                searchable
                searchPlaceholder="Buscar categoría…"
                options={categoriasOrdenadas.map((c) => ({
                  value: String(c.id),
                  label: c.nombre,
                }))}
              />
              {errors.categoriaId ? (
                <p className="text-sm text-destructive" role="alert">
                  {errors.categoriaId}
                </p>
              ) : null}
            </div>
          </section>

          <section aria-labelledby={`${formId}-sec-foto`} className="grid gap-3">
            <h3
              id={`${formId}-sec-foto`}
              className="text-sm font-medium text-foreground"
            >
              Foto
            </h3>
            <ImageFileField
              label="Foto del producto"
              existingUrl={imagenUrl}
              file={imageFile}
              onFileChange={setImageFile}
              disabled={pending}
              enableCamera
              fileInputId="inventario-producto-file"
              cameraInputId="inventario-producto-camera"
            />
          </section>

          <section className="grid gap-2">
            <Button
              type="button"
              variant="ghost"
              className="h-auto w-full justify-between px-0 py-2 font-medium"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((v) => !v)}
            >
              Más opciones
              <ChevronDown
                className={`h-4 w-4 transition-transform ${moreOpen ? "rotate-180" : ""}`}
                aria-hidden
              />
            </Button>
            {moreOpen ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  id={skuId}
                  label="SKU"
                  value={sku}
                  onChange={(v) => {
                    setSkuTouched(true);
                    setSku(v);
                  }}
                  error={errors.sku}
                />
                <Field
                  id={`${formId}-minimo`}
                  label="Aviso cuando queden pocas"
                  value={stockMinimo}
                  onChange={setStockMinimo}
                  type="number"
                />
                <div className="sm:col-span-2">
                  <Field
                    id={`${formId}-modelos`}
                    label="Modelos compatibles (separados por coma)"
                    value={modelos}
                    onChange={setModelos}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor={`${formId}-desc`}>Descripción</Label>
                  <Textarea
                    id={`${formId}-desc`}
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    className="mt-2 min-h-24 touch-manipulation text-base md:text-sm"
                  />
                </div>
                <div className="flex items-center gap-2 sm:col-span-2">
                  <Switch
                    id={`${formId}-activo`}
                    checked={activo}
                    onCheckedChange={setActivo}
                  />
                  <Label htmlFor={`${formId}-activo`}>Activo en tienda</Label>
                </div>
              </div>
            ) : null}
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/80"
            disabled={pending || !basicosCompletos}
            title={
              basicosCompletos
                ? undefined
                : "Completa los campos obligatorios del formulario"
            }
            onClick={handleSubmit}
          >
            {isEditing ? "Guardar cambios" : "Guardar producto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  placeholder,
  autoComplete,
  error,
  className,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  inputMode?: "numeric" | "text" | "decimal" | "tel";
  placeholder?: string;
  autoComplete?: string;
  error?: string;
  className?: string;
}) {
  const errorId = id && error ? `${id}-error` : undefined;
  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={errorId}
        className="min-h-11 touch-manipulation text-base md:text-sm"
      />
      {error ? (
        <p id={errorId} className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
