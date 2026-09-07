"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  updateVentaMoto,
  type VentaMotoRow,
} from "@/lib/actions/venta-moto-actions";
import {
  CONTADO_TIPO_DOC,
  CONTADO_TIPO_DOC_LABELS,
  contadoClienteFotoFolder,
  type ContadoTipoDocumento,
} from "@/lib/venta-contado/contado-cliente";
import { STORAGE_BUCKETS } from "@/lib/supabase/storage-buckets";
import { formatCop, formatDate } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ImageFileField,
  uploadImageFile,
} from "@/components/ui/image-file-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TouchSelect } from "@/components/ui/touch-select";

interface EditarVentaContadoDialogProps {
  venta: VentaMotoRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

function parseCopInput(raw: string): number | undefined {
  const n = Number(raw.replace(/\D/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function EditarVentaContadoDialog({
  venta,
  open,
  onOpenChange,
  onSuccess,
}: EditarVentaContadoDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteTipoDocumento, setClienteTipoDocumento] =
    useState<ContadoTipoDocumento>("cc");
  const [clienteCedula, setClienteCedula] = useState("");
  const [clienteCelular, setClienteCelular] = useState("");
  const [clienteDireccion, setClienteDireccion] = useState("");
  const [clienteCorreo, setClienteCorreo] = useState("");
  const [clienteFoto, setClienteFoto] = useState<File | null>(null);
  const [chasis, setChasis] = useState("");
  const [placa, setPlaca] = useState("");
  const [valorVenta, setValorVenta] = useState("");
  const [montoPagado, setMontoPagado] = useState("");
  const [notas, setNotas] = useState("");

  const valorNum = Number(valorVenta.replace(/\D/g, ""));
  const pagadoNum = Number(montoPagado.replace(/\D/g, ""));

  useEffect(() => {
    if (!open || !venta) return;
    setClienteNombre(venta.clienteNombre);
    setClienteTipoDocumento(venta.clienteTipoDocumento ?? "cc");
    setClienteCedula(venta.clienteCedula);
    setClienteCelular(venta.clienteCelular);
    setClienteDireccion(venta.clienteDireccion ?? "");
    setClienteCorreo(venta.clienteCorreo ?? "");
    setClienteFoto(null);
    setChasis(venta.chasis ?? "");
    setPlaca(venta.placa ?? "");
    setValorVenta(venta.valorVenta != null ? String(venta.valorVenta) : "");
    setMontoPagado(String(venta.montoPagado));
    setNotas(venta.notas ?? "");
  }, [open, venta]);

  function submit() {
    if (!venta) return;

    const valor = parseCopInput(valorVenta);
    const pagado = Number.isFinite(pagadoNum) && pagadoNum >= 0 ? pagadoNum : -1;

    if (!clienteNombre.trim()) {
      toast.error("Indica el nombre del cliente.");
      return;
    }
    if (clienteCedula.trim().length < 5) {
      toast.error("Indica un documento válido.");
      return;
    }
    if (clienteCelular.trim().length < 10) {
      toast.error("Indica un celular válido.");
      return;
    }
    if (!clienteDireccion.trim()) {
      toast.error("Indica la dirección de residencia.");
      return;
    }
    if (pagado < 0) {
      toast.error("Indica un monto pagado válido.");
      return;
    }
    if (pagado > 0 && !valor) {
      toast.error("Indica el valor total de la venta.");
      return;
    }
    if (valor != null && pagado > valor) {
      toast.error("El pago no puede superar el valor de venta.");
      return;
    }

    startTransition(async () => {
      try {
        let clienteFotoUrl = venta.clienteFotoUrl ?? undefined;
        if (clienteFoto) {
          clienteFotoUrl = await uploadImageFile(
            STORAGE_BUCKETS.userDocuments,
            contadoClienteFotoFolder(clienteCedula.trim() || "sin-doc"),
            clienteFoto,
          );
        }
        await updateVentaMoto({
          id: venta.id,
          clienteNombre: clienteNombre.trim(),
          clienteCedula: clienteCedula.trim(),
          clienteCelular: clienteCelular.trim(),
          clienteTipoDocumento,
          clienteDireccion: clienteDireccion.trim(),
          clienteCorreo: clienteCorreo.trim() || undefined,
          clienteFotoUrl,
          chasis: chasis.trim() || undefined,
          valorVenta: valor,
          montoPagado: pagado,
          placa: placa.trim(),
          notas: notas.trim() || undefined,
        });
        toast.success("Venta actualizada.");
        onOpenChange(false);
        onSuccess?.();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo guardar.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto bg-background sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar venta de contado</DialogTitle>
          {venta ? (
            <p className="text-sm text-muted-foreground">
              {venta.modelo} · {venta.color} · {formatDate(venta.createdAt)}
            </p>
          ) : null}
        </DialogHeader>

        {venta ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-cliente-nombre">Nombre del cliente</Label>
              <Input
                id="edit-cliente-nombre"
                value={clienteNombre}
                onChange={(e) => setClienteNombre(e.target.value)}
              />
            </div>

            <ImageFileField
              label="Foto del cliente"
              file={clienteFoto}
              onFileChange={setClienteFoto}
              existingUrl={venta.clienteFotoUrl ?? venta.selfieUrl}
              enableCamera
              enableDialogPaste
              disabled={pending}
              fileInputId="edit-contado-cliente-foto"
              cameraInputId="edit-contado-cliente-foto-cam"
            />

            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-cliente-tipo-doc">Tipo de documento</Label>
              <TouchSelect
                id="edit-cliente-tipo-doc"
                aria-label="Tipo de documento"
                value={clienteTipoDocumento}
                onChange={(v) =>
                  setClienteTipoDocumento(
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

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="edit-cliente-cedula">Número de documento</Label>
                <Input
                  id="edit-cliente-cedula"
                  inputMode="numeric"
                  value={clienteCedula}
                  onChange={(e) => setClienteCedula(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="edit-cliente-celular">Celular</Label>
                <Input
                  id="edit-cliente-celular"
                  inputMode="tel"
                  value={clienteCelular}
                  onChange={(e) => setClienteCelular(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-cliente-direccion">
                Dirección de residencia
              </Label>
              <Input
                id="edit-cliente-direccion"
                value={clienteDireccion}
                onChange={(e) => setClienteDireccion(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-cliente-correo">Correo electrónico</Label>
              <Input
                id="edit-cliente-correo"
                type="email"
                inputMode="email"
                value={clienteCorreo}
                onChange={(e) => setClienteCorreo(e.target.value)}
                placeholder="Opcional"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="edit-chasis">Chasis</Label>
                <Input
                  id="edit-chasis"
                  value={chasis}
                  onChange={(e) => setChasis(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="edit-placa">Placa</Label>
                <Input
                  id="edit-placa"
                  value={placa}
                  onChange={(e) => setPlaca(e.target.value.toUpperCase())}
                  className="uppercase"
                  placeholder="Opcional"
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/50 p-3">
              <p className="text-sm font-medium">Pago</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="edit-valor-venta">Precio total</Label>
                  <Input
                    id="edit-valor-venta"
                    inputMode="numeric"
                    value={valorVenta}
                    onChange={(e) => setValorVenta(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="edit-monto-pagado">Pagado</Label>
                  <Input
                    id="edit-monto-pagado"
                    inputMode="numeric"
                    value={montoPagado}
                    onChange={(e) => setMontoPagado(e.target.value)}
                  />
                </div>
              </div>
              {valorNum > 0 && pagadoNum >= 0 ? (
                <p className="text-sm text-muted-foreground">
                  {pagadoNum >= valorNum
                    ? "Pago de contado."
                    : pagadoNum > 0
                      ? `Abono parcial. Saldo: ${formatCop(Math.max(0, valorNum - pagadoNum))}`
                      : `Sin pago. Saldo: ${formatCop(valorNum)}`}
                </p>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                disabled={valorNum <= 0}
                onClick={() => setMontoPagado(String(valorNum))}
              >
                Marcar pago de contado
              </Button>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-notas">Notas</Label>
              <Input
                id="edit-notas"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
              />
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="bg-primary text-primary-foreground hover:bg-primary/80"
            onClick={submit}
            disabled={pending || !venta}
          >
            {pending ? "Guardando…" : "Guardar cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
