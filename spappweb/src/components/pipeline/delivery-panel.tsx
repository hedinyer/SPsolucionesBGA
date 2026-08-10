"use client";

import { useTransition } from "react";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import {
  cancelCompra,
  getMotoDocumentoDownloadUrls,
  markDelivered,
  updateDelivery,
  uploadMotoDocumento,
  type MotoDocumentoTipo,
} from "@/lib/actions/admin-actions";
import type { UserMotoCompraRow } from "@/lib/pipeline/types";
import { formatDateOnly } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

interface DeliveryPanelProps {
  compra: UserMotoCompraRow | null;
  userId: number;
  clienteCelular?: string | null;
  clienteNombre?: string | null;
}

const DOC_FIELDS: {
  tipo: MotoDocumentoTipo;
  label: string;
  pathKey: keyof Pick<
    UserMotoCompraRow,
    "doc_tarjeta_propiedad_path" | "doc_soat_path" | "doc_tecno_path"
  >;
}[] = [
  {
    tipo: "tarjeta",
    label: "Tarjeta de propiedad (HD)",
    pathKey: "doc_tarjeta_propiedad_path",
  },
  { tipo: "soat", label: "SOAT", pathKey: "doc_soat_path" },
  { tipo: "tecno", label: "Tecnomecánica", pathKey: "doc_tecno_path" },
];

function downloadFromUrl(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function shareMotoDocsWhatsApp(opts: {
  compraId: string;
  userId: number;
  celular: string | null | undefined;
  nombre: string | null | undefined;
  placa: string | null;
}) {
  const { items, placa } = await getMotoDocumentoDownloadUrls(
    opts.compraId,
    opts.userId,
  );

  for (const item of items) {
    downloadFromUrl(item.url, item.filename);
    // ponytail: espaciar descargas para que el navegador no las colapse
    await new Promise((r) => setTimeout(r, 250));
  }

  const digits = (opts.celular ?? "").replace(/\D/g, "");
  const nombre = opts.nombre?.trim() || "cliente";
  const placaTxt = placa ?? opts.placa ?? "";
  const docs = items.map((i) => i.label).join(", ");
  const mensaje = `Hola ${nombre}, te enviamos los documentos de tu moto${placaTxt ? ` placa ${placaTxt}` : ""}: ${docs}. Descárgalos e imprímelos.`;
  const waBase = digits ? `https://wa.me/57${digits}` : "https://wa.me/";
  const waUrl = `${waBase}?text=${encodeURIComponent(mensaje)}`;

  window.open(waUrl, "_blank", "noopener,noreferrer");
  toast.info("Adjunta los PDFs descargados en WhatsApp.");
}

function MotoDocsSection({
  compra,
  userId,
  clienteCelular,
  clienteNombre,
}: {
  compra: UserMotoCompraRow;
  userId: number;
  clienteCelular?: string | null;
  clienteNombre?: string | null;
}) {
  const [pending, startTransition] = useTransition();

  const hasAnyDoc = DOC_FIELDS.some((f) => compra[f.pathKey]);

  function onUpload(tipo: MotoDocumentoTipo, file: File | undefined, input: HTMLInputElement) {
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error("Solo se aceptan archivos PDF.");
      input.value = "";
      return;
    }
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("compraId", compra.id);
        fd.set("userId", String(userId));
        fd.set("tipo", tipo);
        fd.set("file", file);
        await uploadMotoDocumento(fd);
        toast.success("Documento subido.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al subir.");
      } finally {
        input.value = "";
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documentos de la moto</CardTitle>
        <p className="text-sm text-muted-foreground">
          Sube los PDF (tarjeta de propiedad HD, SOAT y tecnomecánica) para
          enviárselos al cliente por WhatsApp cuando los necesite.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 text-sm">
          <p className="font-medium">Moto entregada</p>
          {compra.placa && <p>Placa: {compra.placa}</p>}
          {compra.fecha_entrega && (
            <p>Fecha: {formatDateOnly(compra.fecha_entrega)}</p>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {DOC_FIELDS.map((field) => {
            const loaded = Boolean(compra[field.pathKey]);
            return (
              <div key={field.tipo} className="flex flex-col gap-2">
                <Label htmlFor={`moto-doc-${field.tipo}`}>{field.label}</Label>
                <p className="text-xs text-muted-foreground">
                  {loaded ? "PDF cargado — puedes reemplazarlo." : "Sin archivo."}
                </p>
                <Input
                  id={`moto-doc-${field.tipo}`}
                  type="file"
                  accept="application/pdf"
                  disabled={pending}
                  onChange={(e) =>
                    onUpload(
                      field.tipo,
                      e.target.files?.[0] ?? undefined,
                      e.currentTarget,
                    )
                  }
                />
              </div>
            );
          })}
        </div>

        <Button
          type="button"
          size="lg"
          className="w-full bg-green-600 text-white hover:bg-green-700 sm:w-auto"
          disabled={pending || !hasAnyDoc}
          onClick={() =>
            startTransition(async () => {
              try {
                await shareMotoDocsWhatsApp({
                  compraId: compra.id,
                  userId,
                  celular: clienteCelular,
                  nombre: clienteNombre,
                  placa: compra.placa,
                });
              } catch (e) {
                toast.error(
                  e instanceof Error ? e.message : "No se pudo preparar el envío.",
                );
              }
            })
          }
        >
          <MessageCircle className="mr-1.5 h-4 w-4" />
          Enviar por WhatsApp
        </Button>
      </CardContent>
    </Card>
  );
}

export function DeliveryPanel({
  compra,
  userId,
  clienteCelular,
  clienteNombre,
}: DeliveryPanelProps) {
  const [pending, startTransition] = useTransition();

  if (!compra) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Aún no hay moto seleccionada.
        </CardContent>
      </Card>
    );
  }

  if (compra.estado === "entregada" || compra.estado === "saldada") {
    return (
      <MotoDocsSection
        compra={compra}
        userId={userId}
        clienteCelular={clienteCelular}
        clienteNombre={clienteNombre}
      />
    );
  }

  if (compra.estado === "cancelada") {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Compra cancelada.
        </CardContent>
      </Card>
    );
  }

  if (compra.estado === "pendiente_pago") {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Confirma los pagos antes de preparar el retiro.
        </CardContent>
      </Card>
    );
  }

  function run(action: () => Promise<unknown>, success: string) {
    startTransition(async () => {
      try {
        await action();
        toast.success(success);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al guardar.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Retiro y entrega</CardTitle>
        <p className="text-sm text-muted-foreground">
          Registra los datos de la moto y marca como entregada.
        </p>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run(
              () =>
                updateDelivery({
                  compraId: compra.id,
                  userId,
                  placa: String(fd.get("placa")),
                  chasis: String(fd.get("chasis")),
                  referencia: String(fd.get("referencia") || ""),
                  fechaEntrega: String(fd.get("fechaEntrega")),
                }),
              "Datos de retiro guardados.",
            );
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="placa">Placa</Label>
              <Input
                id="placa"
                name="placa"
                defaultValue={compra.placa ?? ""}
                required
                placeholder="ABC123"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="chasis">Chasis</Label>
              <Input
                id="chasis"
                name="chasis"
                defaultValue={compra.chasis ?? ""}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="referencia">Referencia (opcional)</Label>
              <Input
                id="referencia"
                name="referencia"
                defaultValue={compra.referencia ?? ""}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="fechaEntrega">Fecha de entrega</Label>
              <Input
                id="fechaEntrega"
                name="fechaEntrega"
                type="date"
                required
                defaultValue={
                  compra.fecha_entrega
                    ? compra.fecha_entrega.slice(0, 10)
                    : undefined
                }
              />
            </div>
          </div>
          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:flex-wrap">
            <Button
              type="submit"
              variant="outline"
              size="lg"
              className="w-full sm:w-auto"
              disabled={pending}
            >
              Guardar datos
            </Button>
            <Button
              type="button"
              size="lg"
              className="w-full bg-primary text-primary-foreground hover:bg-primary/80 sm:w-auto"
              disabled={pending || !compra.placa}
              onClick={() =>
                run(
                  () => markDelivered(compra.id, userId),
                  "Moto entregada.",
                )
              }
            >
              Marcar entregada
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full sm:w-auto"
                  disabled={pending}
                >
                  Cancelar compra
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-background">
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Cancelar compra?</AlertDialogTitle>
                  <AlertDialogDescription>
                    El cliente verá la selección cancelada en la app.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Volver</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() =>
                      run(
                        () => cancelCompra(compra.id, userId),
                        "Compra cancelada.",
                      )
                    }
                  >
                    Sí, cancelar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
