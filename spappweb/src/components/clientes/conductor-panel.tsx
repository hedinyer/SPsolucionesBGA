"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2, Upload, User } from "lucide-react";
import { toast } from "sonner";
import {
  saveConductorDocumento,
  saveConductorInfo,
} from "@/lib/actions/admin-actions";
import { parseConductorInfo } from "@/lib/admin/conductor";
import type { UserMotoCompraRow } from "@/lib/pipeline/types";
import { STORAGE_BUCKETS } from "@/lib/supabase/storage-buckets";
import { uploadImageFromBrowser } from "@/lib/utils/upload-image-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function DocPreview({
  url,
  label,
  empty,
}: {
  url: string | null;
  label: string;
  empty: string;
}) {
  if (!url) {
    return (
      <div className="flex aspect-[4/3] w-full items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-center text-xs text-muted-foreground">
        {empty}
      </div>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block overflow-hidden rounded-lg border border-border"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={label}
        className="aspect-[4/3] w-full object-cover"
        loading="lazy"
        decoding="async"
      />
    </a>
  );
}

export function ConductorPanel({
  compra,
  userId,
}: {
  compra: UserMotoCompraRow;
  userId: number;
}) {
  const initial = parseConductorInfo(
    (compra.admin_data as Record<string, unknown> | undefined) ?? null,
  );
  const [nombre, setNombre] = useState(initial?.nombre ?? "");
  const [cedula, setCedula] = useState(initial?.cedula ?? "");
  const [celular, setCelular] = useState(initial?.celular ?? "");
  const [notas, setNotas] = useState(initial?.notas ?? "");
  const [cedulaUrl, setCedulaUrl] = useState(initial?.cedula_url ?? null);
  const [fotoUrl, setFotoUrl] = useState(initial?.foto_url ?? null);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState<"cedula" | "foto" | null>(null);
  const cedulaInputRef = useRef<HTMLInputElement>(null);
  const fotoInputRef = useRef<HTMLInputElement>(null);

  function onSaveDatos() {
    startTransition(async () => {
      try {
        await saveConductorInfo({
          compraId: compra.id,
          userId,
          nombre,
          cedula,
          celular: celular || undefined,
          notas: notas || undefined,
        });
        toast.success("Datos del conductor guardados.");
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "No se pudo guardar el conductor.",
        );
      }
    });
  }

  async function onUploadDoc(tipo: "cedula" | "foto", file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Sube una imagen (foto o escaneo).");
      return;
    }
    setUploading(tipo);
    try {
      const url = await uploadImageFromBrowser(
        STORAGE_BUCKETS.userDocuments,
        `${userId}/conductor`,
        file,
      );
      await saveConductorDocumento({
        compraId: compra.id,
        userId,
        tipo,
        url,
      });
      if (tipo === "cedula") setCedulaUrl(url);
      else setFotoUrl(url);
      toast.success(
        tipo === "cedula" ? "Cédula del conductor subida." : "Foto del conductor subida.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al subir.");
    } finally {
      setUploading(null);
      if (tipo === "cedula" && cedulaInputRef.current) {
        cedulaInputRef.current.value = "";
      }
      if (tipo === "foto" && fotoInputRef.current) {
        fotoInputRef.current.value = "";
      }
    }
  }

  const busy = pending || uploading !== null;

  return (
    <Card className="border-border shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <User className="h-4 w-4" />
          Conductor
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Datos y documentos del conductor autorizado (puede ser distinto al
          titular del contrato).
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="conductor-nombre">Nombre completo</Label>
            <Input
              id="conductor-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              disabled={busy}
              className="min-h-11"
              placeholder="Nombre del conductor"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="conductor-cedula">Cédula</Label>
            <Input
              id="conductor-cedula"
              value={cedula}
              onChange={(e) => setCedula(e.target.value)}
              disabled={busy}
              className="min-h-11"
              inputMode="numeric"
              placeholder="Número de cédula"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="conductor-celular">Celular (opcional)</Label>
            <Input
              id="conductor-celular"
              value={celular}
              onChange={(e) => setCelular(e.target.value)}
              disabled={busy}
              className="min-h-11"
              inputMode="tel"
              placeholder="3xx xxx xxxx"
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="conductor-notas">Notas (opcional)</Label>
            <Textarea
              id="conductor-notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              disabled={busy}
              rows={2}
              placeholder="Parentesco, horario, observaciones…"
            />
          </div>
        </div>

        <Button
          type="button"
          className="min-h-11 w-full touch-manipulation sm:w-auto"
          disabled={busy}
          onClick={onSaveDatos}
        >
          {pending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          Guardar datos del conductor
        </Button>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label>Cédula del conductor</Label>
            <DocPreview
              url={cedulaUrl}
              label="Cédula del conductor"
              empty="Sin cédula adjunta"
            />
            <input
              ref={cedulaInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={busy}
              onChange={(e) =>
                void onUploadDoc("cedula", e.target.files?.[0])
              }
            />
            <Button
              type="button"
              variant="outline"
              className="min-h-11 touch-manipulation"
              disabled={busy}
              onClick={() => cedulaInputRef.current?.click()}
            >
              {uploading === "cedula" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {cedulaUrl ? "Reemplazar cédula" : "Subir cédula"}
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Foto del conductor</Label>
            <DocPreview
              url={fotoUrl}
              label="Foto del conductor"
              empty="Sin foto adjunta"
            />
            <input
              ref={fotoInputRef}
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              disabled={busy}
              onChange={(e) => void onUploadDoc("foto", e.target.files?.[0])}
            />
            <Button
              type="button"
              variant="outline"
              className="min-h-11 touch-manipulation"
              disabled={busy}
              onClick={() => fotoInputRef.current?.click()}
            >
              {uploading === "foto" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {fotoUrl ? "Reemplazar foto" : "Subir foto"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
