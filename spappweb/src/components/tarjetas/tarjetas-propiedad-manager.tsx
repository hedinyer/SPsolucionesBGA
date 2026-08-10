"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import {
  createTarjetaPropiedad,
  deleteTarjetaPropiedad,
} from "@/lib/actions/tarjeta-propiedad-actions";
import type { TarjetaPropiedadRow } from "@/lib/pipeline/types";
import { STORAGE_BUCKETS } from "@/lib/supabase/storage-buckets";
import { uploadImageFromBrowser } from "@/lib/utils/upload-image-client";
import { ImageFileField } from "@/components/ui/image-file-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

export function TarjetasPropiedadManager({
  tarjetas,
}: {
  tarjetas: TarjetaPropiedadRow[];
}) {
  const router = useRouter();
  const [frente, setFrente] = useState<File | null>(null);
  const [reverso, setReverso] = useState<File | null>(null);
  const [placa, setPlaca] = useState("");
  const [savePending, startSave] = useTransition();

  function resetForm() {
    setFrente(null);
    setReverso(null);
    setPlaca("");
  }

  function save() {
    if (!frente) {
      toast.error("Sube la foto del frente.");
      return;
    }
    if (!reverso) {
      toast.error("Sube la foto del reverso.");
      return;
    }
    const placaTrim = placa.trim().toUpperCase().replace(/\s+/g, "");
    if (placaTrim.length < 5) {
      toast.error("Indica una placa válida.");
      return;
    }

    startSave(async () => {
      try {
        const [imagenUrl, imagenReversoUrl] = await Promise.all([
          uploadImageFromBrowser(
            STORAGE_BUCKETS.garajeImagenes,
            "tarjetas/frente",
            frente,
          ),
          uploadImageFromBrowser(
            STORAGE_BUCKETS.garajeImagenes,
            "tarjetas/reverso",
            reverso,
          ),
        ]);
        await createTarjetaPropiedad({
          placa: placaTrim,
          imagen_url: imagenUrl,
          imagen_reverso_url: imagenReversoUrl,
        });
        toast.success("Tarjeta guardada.");
        resetForm();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
      }
    });
  }

  function remove(id: string) {
    startSave(async () => {
      try {
        await deleteTarjetaPropiedad(id);
        toast.success("Tarjeta eliminada.");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo eliminar.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4 rounded-lg border p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Nueva tarjeta</h2>
            <p className="text-sm text-muted-foreground">
              Sube frente y reverso, escribe la placa y guarda.
            </p>
          </div>
          <Button
            type="button"
            disabled={!frente || !reverso || savePending}
            onClick={save}
          >
            {savePending ? <Loader2 className="size-4 animate-spin" /> : null}
            Guardar
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <ImageFileField
            label="Frente (anverso)"
            file={frente}
            onFileChange={setFrente}
            enableCamera
            disabled={savePending}
            fileInputId="tp-frente-file"
            cameraInputId="tp-frente-camera"
          />
          <ImageFileField
            label="Reverso"
            file={reverso}
            onFileChange={setReverso}
            enableCamera
            disabled={savePending}
            fileInputId="tp-reverso-file"
            cameraInputId="tp-reverso-camera"
          />
        </div>

        <div className="flex max-w-xs flex-col gap-1.5">
          <Label htmlFor="tp-placa">Placa</Label>
          <Input
            id="tp-placa"
            value={placa}
            onChange={(e) => setPlaca(e.target.value.toUpperCase())}
            placeholder="ABC12D"
            disabled={savePending}
            className="uppercase"
            autoComplete="off"
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Registradas</h2>
        {tarjetas.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Sin tarjetas</EmptyTitle>
              <EmptyDescription>
                Guarda la primera tarjeta con frente, reverso y placa.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Fotos</TableHead>
                  <TableHead>Placa</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tarjetas.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <div className="flex gap-1">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={t.imagen_url}
                          alt={`${t.placa ?? "tarjeta"} frente`}
                          className="size-12 rounded object-cover"
                        />
                        {t.imagen_reverso_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={t.imagen_reverso_url}
                            alt={`${t.placa ?? "tarjeta"} reverso`}
                            className="size-12 rounded object-cover"
                          />
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {t.placa ?? "—"}
                    </TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={savePending}
                            aria-label="Eliminar"
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Eliminar tarjeta</AlertDialogTitle>
                            <AlertDialogDescription>
                              Se borrará el registro de{" "}
                              {t.placa ?? "esta tarjeta"}. Las imágenes en
                              storage no se eliminan.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => remove(t.id)}>
                              Eliminar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
