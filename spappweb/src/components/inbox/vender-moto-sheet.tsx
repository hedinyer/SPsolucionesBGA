"use client";

import { useEffect, useState, useTransition } from "react";
import { Bike, Printer } from "lucide-react";
import { toast } from "sonner";
import { saveVentaMoto } from "@/lib/actions/venta-moto-actions";
import {
  CONTADO_TIPO_DOC,
  CONTADO_TIPO_DOC_LABELS,
  contadoClienteFotoFolder,
  contadoDocumentoLabel,
  contadoNombreLabel,
  type ContadoClienteMatch,
  type ContadoTipoDocumento,
} from "@/lib/venta-contado/contado-cliente";
import {
  ContadoClienteSuggestInput,
  useContadoClienteSearch,
} from "@/components/venta-contado/contado-cliente-suggest-input";
import { printVentaMotoReceipt } from "@/lib/printing/venta-moto-receipt";
import type { BikeRow } from "@/lib/pipeline/types";
import { STORAGE_BUCKETS } from "@/lib/supabase/storage-buckets";
import { formatCop } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import {
  ImageFileField,
  uploadImageFile,
} from "@/components/ui/image-file-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TouchSelect } from "@/components/ui/touch-select";

type ClienteField =
  | "nombre"
  | "cedula"
  | "celular"
  | "direccion"
  | "correo";

interface VenderMotoSheetProps {
  bikes: BikeRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
  /** Prefill from deep link (?bikeId= / match modelo+color). */
  initialBikeId?: string;
}

export function VenderMotoSheet({
  bikes,
  open,
  onOpenChange,
  onSaved,
  initialBikeId,
}: VenderMotoSheetProps) {
  const [pending, startTransition] = useTransition();
  const [bikeId, setBikeId] = useState("");
  const [tipoDocumento, setTipoDocumento] = useState<ContadoTipoDocumento>("cc");
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteCedula, setClienteCedula] = useState("");
  const [clienteCelular, setClienteCelular] = useState("");
  const [clienteDireccion, setClienteDireccion] = useState("");
  const [clienteCorreo, setClienteCorreo] = useState("");
  const [clienteFoto, setClienteFoto] = useState<File | null>(null);
  const [clienteFotoUrl, setClienteFotoUrl] = useState<string | null>(null);
  const [suggestQuery, setSuggestQuery] = useState("");
  const [suggestField, setSuggestField] = useState<ClienteField | null>(null);
  const [valorVenta, setValorVenta] = useState("");
  const [montoPagado, setMontoPagado] = useState("");
  const { matches } = useContadoClienteSearch(suggestQuery);
  const activeBikes = bikes.filter((b) => b.activo && b.stock > 0);
  const selected = activeBikes.find((b) => String(b.id) === bikeId);
  const esEmpresa = tipoDocumento === "nit";
  const nombreLabel = contadoNombreLabel(tipoDocumento);
  const documentoLabel = contadoDocumentoLabel(tipoDocumento);

  function onClienteField(field: ClienteField, value: string) {
    if (field === "nombre") setClienteNombre(value);
    if (field === "cedula") setClienteCedula(value);
    if (field === "celular") setClienteCelular(value);
    if (field === "direccion") setClienteDireccion(value);
    if (field === "correo") setClienteCorreo(value);
    setSuggestQuery(value);
    setSuggestField(field);
  }

  function hideSuggest(field: ClienteField) {
    window.setTimeout(() => {
      setSuggestField((current) => (current === field ? null : current));
    }, 150);
  }

  function pickCliente(match: ContadoClienteMatch) {
    setClienteNombre(match.clienteNombre);
    setClienteCedula(match.clienteCedula);
    setClienteCelular(match.clienteCelular);
    setClienteDireccion(match.clienteDireccion);
    setClienteCorreo(match.clienteCorreo);
    setTipoDocumento(match.clienteTipoDocumento);
    setClienteFoto(null);
    setClienteFotoUrl(match.clienteFotoUrl);
    setSuggestQuery("");
    setSuggestField(null);
    toast.success(`Datos de ${match.clienteNombre || match.clienteCedula} cargados.`);
  }

  useEffect(() => {
    if (!open || !initialBikeId) return;
    const ok = bikes.some(
      (b) => b.activo && b.stock > 0 && String(b.id) === initialBikeId,
    );
    if (ok) setBikeId(initialBikeId);
  }, [open, initialBikeId, bikes]);

  const valorNum = Number(valorVenta.replace(/\D/g, ""));
  const pagadoNum = Number(montoPagado.replace(/\D/g, ""));
  const saldo =
    valorNum > 0 && pagadoNum >= 0 ? Math.max(0, valorNum - pagadoNum) : null;

  useEffect(() => {
    if (selected?.precio_venta != null && selected.precio_venta > 0) {
      setValorVenta(String(selected.precio_venta));
    } else if (selected) {
      setValorVenta("");
    }
  }, [selected]);

  function resetForm() {
    setBikeId("");
    setTipoDocumento("cc");
    setClienteNombre("");
    setClienteCedula("");
    setClienteCelular("");
    setClienteDireccion("");
    setClienteCorreo("");
    setClienteFoto(null);
    setClienteFotoUrl(null);
    setSuggestQuery("");
    setSuggestField(null);
    setValorVenta("");
    setMontoPagado("");
  }

  function parseCopInput(raw: string): number | undefined {
    const n = Number(raw.replace(/\D/g, ""));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }

  function onBikeChange(id: string) {
    setBikeId(id);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) resetForm();
        onOpenChange(next);
      }}
    >
      <SheetContent
        side="right"
        className="flex flex-col gap-0 overflow-hidden p-0 data-[side=right]:sm:max-w-lg sm:max-w-lg"
      >
        <SheetHeader className="shrink-0 border-b border-border px-4 py-4 sm:px-6">
          <SheetTitle className="flex items-center gap-2">
            <Bike className="h-5 w-5" aria-hidden="true" />
            Vender moto
          </SheetTitle>
        </SheetHeader>

        <form
          id="vender-moto-form"
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            if (!bikeId || !selected) {
              toast.error("Selecciona una moto del catálogo.");
              return;
            }
            const fd = new FormData(e.currentTarget);

            startTransition(async () => {
              try {
                const cedula = clienteCedula.trim();
                let fotoUrl = clienteFotoUrl ?? undefined;
                if (clienteFoto) {
                  fotoUrl = await uploadImageFile(
                    STORAGE_BUCKETS.userDocuments,
                    contadoClienteFotoFolder(cedula || "sin-doc"),
                    clienteFoto,
                  );
                }
                const venta = await saveVentaMoto({
                  bikeId: Number(bikeId),
                  modelo: selected.modelo,
                  color: selected.color,
                  clienteNombre: clienteNombre.trim(),
                  clienteCedula: cedula,
                  clienteCelular: clienteCelular.trim(),
                  clienteTipoDocumento: tipoDocumento,
                  clienteDireccion: clienteDireccion.trim(),
                  clienteCorreo: clienteCorreo.trim() || undefined,
                  clienteFotoUrl: fotoUrl,
                  chasis: String(fd.get("chasis") || "") || undefined,
                  cuotaInicial: selected?.cuota_inicial,
                  valorVenta: parseCopInput(valorVenta),
                  montoPagado: parseCopInput(montoPagado) ?? 0,
                  notas: String(fd.get("notas") || "") || undefined,
                });
                printVentaMotoReceipt(venta).catch(() => {});
                onSaved?.();
                toast.success("Venta guardada.");
                resetForm();
                onOpenChange(false);
              } catch (err) {
                toast.error(
                  err instanceof Error ? err.message : "No se pudo guardar.",
                );
              }
            });
          }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-5 sm:px-6">
            <div className="flex flex-col gap-6">
              <section className="flex flex-col gap-3" aria-labelledby="vender-moto-seccion">
                <h3
                  id="vender-moto-seccion"
                  className="text-sm font-semibold text-foreground"
                >
                  Moto
                </h3>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="vender-moto-catalogo">Moto del catálogo</Label>
                  <TouchSelect
                    id="vender-moto-catalogo"
                    value={bikeId}
                    onChange={onBikeChange}
                    placeholder="Selecciona modelo y color"
                    options={activeBikes.map((b) => ({
                      value: String(b.id),
                      label: `${b.modelo} — ${b.color} (stock ${b.stock})`,
                    }))}
                  />
                  {activeBikes.length === 0 ? (
                    <p className="text-sm text-amber-700" role="status">
                      No hay motos con stock en catálogo.
                    </p>
                  ) : null}
                  {selected ? (
                    <p className="text-sm text-muted-foreground">
                      {selected.precio_venta != null && selected.precio_venta > 0
                        ? `Precio de la moto: ${formatCop(selected.precio_venta)}`
                        : "Sin precio de venta en catálogo — ingrésalo abajo o configúralo en Catálogo."}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="chasis">Chasis</Label>
                  <Input id="chasis" name="chasis" className="min-h-11" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="notas">Notas</Label>
                  <Input id="notas" name="notas" className="min-h-11" />
                </div>
              </section>

              <section
                className="flex flex-col gap-3 rounded-lg border border-border bg-muted/50 p-4"
                aria-labelledby="vender-pago-seccion"
              >
                <h3
                  id="vender-pago-seccion"
                  className="text-sm font-semibold text-foreground"
                >
                  Pago
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="valorVenta">Precio total de la moto</Label>
                    <Input
                      id="valorVenta"
                      inputMode="numeric"
                      placeholder="0"
                      className="min-h-11"
                      value={valorVenta}
                      onChange={(e) => setValorVenta(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="montoPagado">Pagado hoy</Label>
                    <Input
                      id="montoPagado"
                      inputMode="numeric"
                      placeholder="0"
                      className="min-h-11"
                      value={montoPagado}
                      onChange={(e) => setMontoPagado(e.target.value)}
                    />
                  </div>
                </div>
                {saldo != null && valorNum > 0 ? (
                  <p className="text-sm text-muted-foreground" role="status">
                    {pagadoNum >= valorNum
                      ? "Pago de contado."
                      : pagadoNum > 0
                        ? `Abono parcial. Saldo: ${formatCop(saldo)}`
                        : `Sin pago hoy. Saldo: ${formatCop(valorNum)}`}
                  </p>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 w-full"
                  onClick={() => {
                    if (valorNum > 0) setMontoPagado(String(valorNum));
                  }}
                  disabled={valorNum <= 0}
                >
                  Marcar pago de contado
                </Button>
              </section>

              <section className="flex flex-col gap-3" aria-labelledby="vender-cliente-seccion">
                <h3
                  id="vender-cliente-seccion"
                  className="text-sm font-semibold text-foreground"
                >
                  Cliente
                </h3>
                <p className="text-sm text-muted-foreground">
                  Escribe nombre, documento, celular o correo. Si ya compró, elige
                  el cliente para llenar los datos.
                </p>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="clienteNombre">{nombreLabel}</Label>
                  <ContadoClienteSuggestInput
                    id="clienteNombre"
                    value={clienteNombre}
                    onChange={(v) => onClienteField("nombre", v)}
                    matches={matches}
                    showSuggestions={suggestField === "nombre"}
                    onPick={pickCliente}
                    onBlur={() => hideSuggest("nombre")}
                    required
                    autoComplete="off"
                  />
                </div>
                <ImageFileField
                  label={esEmpresa ? "Foto (opcional)" : "Foto del cliente"}
                  file={clienteFoto}
                  onFileChange={(file) => {
                    setClienteFoto(file);
                    if (file) setClienteFotoUrl(null);
                  }}
                  existingUrl={clienteFotoUrl}
                  enableCamera
                  disabled={pending}
                  fileInputId="contado-cliente-foto"
                  cameraInputId="contado-cliente-foto-cam"
                />
                <div className="flex flex-col gap-2">
                  <Label htmlFor="clienteTipoDocumento">Tipo de documento</Label>
                  <TouchSelect
                    id="clienteTipoDocumento"
                    aria-label="Tipo de documento"
                    value={tipoDocumento}
                    onChange={(v) =>
                      setTipoDocumento(
                        CONTADO_TIPO_DOC.includes(v as ContadoTipoDocumento)
                          ? (v as ContadoTipoDocumento)
                          : "cc",
                      )
                    }
                    options={CONTADO_TIPO_DOC.map((t) => ({
                      value: t,
                      label: CONTADO_TIPO_DOC_LABELS[t],
                    }))}
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="clienteCedula">{documentoLabel}</Label>
                    <ContadoClienteSuggestInput
                      id="clienteCedula"
                      value={clienteCedula}
                      onChange={(v) => onClienteField("cedula", v)}
                      matches={matches}
                      showSuggestions={suggestField === "cedula"}
                      onPick={pickCliente}
                      onBlur={() => hideSuggest("cedula")}
                      inputMode={esEmpresa ? "text" : "numeric"}
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="clienteCelular">Celular</Label>
                    <ContadoClienteSuggestInput
                      id="clienteCelular"
                      value={clienteCelular}
                      onChange={(v) => onClienteField("celular", v)}
                      matches={matches}
                      showSuggestions={suggestField === "celular"}
                      onPick={pickCliente}
                      onBlur={() => hideSuggest("celular")}
                      inputMode="tel"
                      required
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="clienteDireccion">
                    {esEmpresa ? "Dirección" : "Dirección de residencia"}
                  </Label>
                  <ContadoClienteSuggestInput
                    id="clienteDireccion"
                    value={clienteDireccion}
                    onChange={(v) => onClienteField("direccion", v)}
                    matches={matches}
                    showSuggestions={suggestField === "direccion"}
                    onPick={pickCliente}
                    onBlur={() => hideSuggest("direccion")}
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="clienteCorreo">Correo electrónico</Label>
                  <ContadoClienteSuggestInput
                    id="clienteCorreo"
                    value={clienteCorreo}
                    onChange={(v) => onClienteField("correo", v)}
                    matches={matches}
                    showSuggestions={suggestField === "correo"}
                    onPick={pickCliente}
                    onBlur={() => hideSuggest("correo")}
                    type="email"
                    inputMode="email"
                    placeholder="Opcional"
                  />
                </div>
              </section>
            </div>
          </div>

          <SheetFooter className="shrink-0 border-t border-border bg-background px-4 py-4 sm:px-6">
            <Button
              type="submit"
              form="vender-moto-form"
              disabled={pending || !bikeId || activeBikes.length === 0}
              className="min-h-11 w-full gap-2"
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              {pending ? "Guardando…" : "Guardar e imprimir"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
