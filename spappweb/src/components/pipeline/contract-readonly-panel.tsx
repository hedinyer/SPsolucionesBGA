"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { updateContractHojaVida } from "@/lib/actions/admin-actions";
import { contractStatusLabel } from "@/lib/pipeline/step-logic";
import { getContractPublicUrl } from "@/lib/utils/storage-urls";
import {
  ESTADO_CIVIL,
  ESTADO_CIVIL_LABELS,
  TIPO_IDENTIFICACION,
  TIPO_IDENTIFICACION_LABELS,
  parseHojaVidaForm,
  type EstadoCivil,
  type HojaVidaFormData,
  type TipoIdentificacion,
} from "@/lib/contracts/hoja-vida-schema";
import type { DigitalContractRow } from "@/lib/pipeline/types";
import { formatDate } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TouchSelect } from "@/components/ui/touch-select";

interface ContractReadonlyPanelProps {
  contract: DigitalContractRow | null;
}

export function ContractReadonlyPanel({ contract }: ContractReadonlyPanelProps) {
  if (!contract) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          El contrato se generará cuando asignes moto y placa.
        </CardContent>
      </Card>
    );
  }

  const cacheBust = contract.updated_at
    ? `?v=${encodeURIComponent(contract.updated_at)}`
    : "";
  const hojaPdfRaw = getContractPublicUrl(contract.hoja_vida_pdf_path);
  const contratoPdfRaw = getContractPublicUrl(contract.contrato_pdf_path);
  const hojaPdf = hojaPdfRaw ? `${hojaPdfRaw}${cacheBust}` : null;
  const contratoPdf = contratoPdfRaw ? `${contratoPdfRaw}${cacheBust}` : null;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div>
          <CardTitle>Contrato digital</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Al editar la hoja de vida se actualiza el contrato y se regeneran los PDFs
          </p>
        </div>
        <Badge variant="outline" className="w-fit border-border">
          {contractStatusLabel(contract.status)}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {contract.signed_at && (
          <p>Firmado: {formatDate(contract.signed_at)}</p>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {hojaPdf && <PdfLink href={hojaPdf} label="PDF Hoja de vida" />}
          {contratoPdf && <PdfLink href={contratoPdf} label="PDF Contrato" />}
        </div>
        <HojaVidaAdminEditor contract={contract} />
      </CardContent>
    </Card>
  );
}

function HojaVidaAdminEditor({ contract }: { contract: DigitalContractRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<HojaVidaFormData>(() =>
    parseHojaVidaForm(contract.hoja_vida_data ?? {}),
  );

  useEffect(() => {
    if (!editing) {
      setForm(parseHojaVidaForm(contract.hoja_vida_data ?? {}));
    }
  }, [contract.hoja_vida_data, contract.updated_at, editing]);

  const hasHojaData = Object.keys(contract.hoja_vida_data ?? {}).length > 0;
  const tipo = form.tipo_identificacion;
  const tipoLabel =
    tipo && tipo in TIPO_IDENTIFICACION_LABELS
      ? TIPO_IDENTIFICACION_LABELS[tipo]
      : null;
  const estado = form.estado_civil;
  const estadoLabel =
    estado && estado in ESTADO_CIVIL_LABELS
      ? ESTADO_CIVIL_LABELS[estado]
      : null;

  function patch<K extends keyof HojaVidaFormData>(
    key: K,
    value: HojaVidaFormData[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function patchRef(
    index: 0 | 1,
    key: "nombre" | "celular",
    value: string,
  ) {
    setForm((prev) => {
      const referencias = [...prev.referencias] as HojaVidaFormData["referencias"];
      referencias[index] = { ...referencias[index], [key]: value };
      return { ...prev, referencias };
    });
  }

  function onCancel() {
    setForm(parseHojaVidaForm(contract.hoja_vida_data ?? {}));
    setEditing(false);
  }

  function onSave() {
    startTransition(async () => {
      const result = await updateContractHojaVida({
        contractId: contract.id,
        userId: contract.user_id,
        hojaVida: form,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Hoja de vida, contrato y PDFs actualizados.");
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-border bg-muted/50 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">Datos de hoja de vida</p>
        {!editing ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 touch-manipulation"
            onClick={() => setEditing(true)}
          >
            {hasHojaData ? "Editar" : "Completar"}
          </Button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11 touch-manipulation"
              disabled={pending}
              onClick={onCancel}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              className="min-h-11 touch-manipulation"
              disabled={pending}
              onClick={onSave}
            >
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        )}
      </div>

      {!hasHojaData && !editing ? (
        <p className="text-muted-foreground">
          {contract.status !== "firmado"
            ? "Esperando al cliente para completar la hoja de vida."
            : "Sin datos de hoja de vida."}
        </p>
      ) : editing ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre">
            <Input
              value={form.nombre_completo}
              onChange={(e) => patch("nombre_completo", e.target.value)}
              disabled={pending}
              className="min-h-11 bg-background"
            />
          </Field>
          <Field label="Tipo identificación">
            <TouchSelect
              aria-label="Tipo identificación"
              value={form.tipo_identificacion ?? ""}
              disabled={pending}
              onChange={(v) =>
                patch(
                  "tipo_identificacion",
                  (v || null) as TipoIdentificacion | null,
                )
              }
              options={[
                { value: "", label: "Sin tipo" },
                ...TIPO_IDENTIFICACION.map((t) => ({
                  value: t,
                  label: TIPO_IDENTIFICACION_LABELS[t],
                })),
              ]}
            />
          </Field>
          <Field label="Número identificación">
            <Input
              value={form.numero_identificacion}
              onChange={(e) => patch("numero_identificacion", e.target.value)}
              disabled={pending}
              className="min-h-11 bg-background"
            />
          </Field>
          <Field label="Fecha nacimiento">
            <Input
              value={form.fecha_nacimiento}
              onChange={(e) => patch("fecha_nacimiento", e.target.value)}
              placeholder="DD/MM/AAAA"
              disabled={pending}
              className="min-h-11 bg-background"
            />
          </Field>
          <Field label="Celular">
            <Input
              value={form.celular}
              onChange={(e) => patch("celular", e.target.value)}
              disabled={pending}
              className="min-h-11 bg-background"
            />
          </Field>
          <Field label="Correo">
            <Input
              type="email"
              value={form.correo}
              onChange={(e) => patch("correo", e.target.value)}
              disabled={pending}
              className="min-h-11 bg-background"
            />
          </Field>
          <Field label="Dirección">
            <Input
              value={form.direccion}
              onChange={(e) => patch("direccion", e.target.value)}
              disabled={pending}
              className="min-h-11 bg-background"
            />
          </Field>
          <Field label="Barrio">
            <Input
              value={form.barrio}
              onChange={(e) => patch("barrio", e.target.value)}
              disabled={pending}
              className="min-h-11 bg-background"
            />
          </Field>
          <Field label="Estado civil">
            <TouchSelect
              aria-label="Estado civil"
              value={form.estado_civil ?? ""}
              disabled={pending}
              onChange={(v) =>
                patch("estado_civil", (v || null) as EstadoCivil | null)
              }
              options={[
                { value: "", label: "Sin estado" },
                ...ESTADO_CIVIL.map((e) => ({
                  value: e,
                  label: ESTADO_CIVIL_LABELS[e],
                })),
              ]}
            />
          </Field>
          <Field label="Empresa">
            <Input
              value={form.nombre_empresa}
              onChange={(e) => patch("nombre_empresa", e.target.value)}
              disabled={pending}
              className="min-h-11 bg-background"
            />
          </Field>
          <Field label="Oficio" className="sm:col-span-2">
            <Input
              value={form.habilidad}
              onChange={(e) => patch("habilidad", e.target.value)}
              disabled={pending}
              className="min-h-11 bg-background"
            />
          </Field>
          <Field label="Cónyuge">
            <Input
              value={form.nombre_conyuge}
              onChange={(e) => patch("nombre_conyuge", e.target.value)}
              disabled={pending}
              className="min-h-11 bg-background"
            />
          </Field>
          <Field label="Celular cónyuge">
            <Input
              value={form.celular_conyuge}
              onChange={(e) => patch("celular_conyuge", e.target.value)}
              disabled={pending}
              className="min-h-11 bg-background"
            />
          </Field>
          <Field label="Referencia 1 — nombre">
            <Input
              value={form.referencias[0]?.nombre ?? ""}
              onChange={(e) => patchRef(0, "nombre", e.target.value)}
              disabled={pending}
              className="min-h-11 bg-background"
            />
          </Field>
          <Field label="Referencia 1 — celular">
            <Input
              value={form.referencias[0]?.celular ?? ""}
              onChange={(e) => patchRef(0, "celular", e.target.value)}
              disabled={pending}
              className="min-h-11 bg-background"
            />
          </Field>
          <Field label="Referencia 2 — nombre">
            <Input
              value={form.referencias[1]?.nombre ?? ""}
              onChange={(e) => patchRef(1, "nombre", e.target.value)}
              disabled={pending}
              className="min-h-11 bg-background"
            />
          </Field>
          <Field label="Referencia 2 — celular">
            <Input
              value={form.referencias[1]?.celular ?? ""}
              onChange={(e) => patchRef(1, "celular", e.target.value)}
              disabled={pending}
              className="min-h-11 bg-background"
            />
          </Field>
        </div>
      ) : (
        <>
          <dl className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["Nombre", form.nombre_completo],
                [
                  "Identificación",
                  tipoLabel && form.numero_identificacion
                    ? `${tipoLabel} ${form.numero_identificacion}`
                    : form.numero_identificacion,
                ],
                ["Fecha nacimiento", form.fecha_nacimiento],
                ["Celular", form.celular],
                ["Correo", form.correo],
                ["Dirección", form.direccion],
                ["Barrio", form.barrio],
                ["Estado civil", estadoLabel],
                ["Empresa", form.nombre_empresa],
                ["Oficio", form.habilidad],
                ["Cónyuge", form.nombre_conyuge],
                ["Celular cónyuge", form.celular_conyuge],
              ] as [string, unknown][]
            ).map(([key, val]) =>
              val ? (
                <div key={key}>
                  <dt className="text-muted-foreground">{key}</dt>
                  <dd>{String(val)}</dd>
                </div>
              ) : null,
            )}
          </dl>
          {form.referencias.some((r) => r.nombre || r.celular) && (
            <div className="mt-4 flex flex-col gap-2">
              <p className="font-medium">Referencias</p>
              {form.referencias.map((r, i) =>
                r.nombre || r.celular ? (
                  <p key={i} className="text-foreground">
                    {i + 1}. {r.nombre || "—"} · {r.celular || "—"}
                  </p>
                ) : null,
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={["flex flex-col gap-1.5", className].filter(Boolean).join(" ")}>
      <Label className="text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function PdfLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      target="_blank"
      className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-3 hover:border-foreground/30"
    >
      <ExternalLink className="h-4 w-4" strokeWidth={1.75} />
      {label}
    </Link>
  );
}
