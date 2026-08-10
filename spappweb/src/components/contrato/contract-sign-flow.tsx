"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useTransition,
} from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { signContract } from "@/lib/actions/contract-actions";
import {
  clearDraft,
  readDraft,
  writeDraft,
} from "@/lib/client/form-draft-storage";
import {
  contratoDraftKey,
  type ContratoSignDraft,
} from "@/lib/client/hojadevida-draft";
import { retryAsync } from "@/lib/client/retry-async";
import {
  EMPRESA_PROPIETARIA,
  blocks,
  colombiaDateParts,
  renderClausulaTexto,
  renderFirma,
  renderIntro,
  type ContratoData,
} from "@/lib/contracts/contrato-renting-clausulas";
import {
  FieldBlock,
  FlowProgress,
  PrimaryAction,
  SecondaryAction,
  StepCard,
  StickyActions,
  fieldInputClass,
} from "@/components/hojadevida/flow-shell";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { TouchSelect } from "@/components/ui/touch-select";
import {
  listCiudades,
  listDepartamentos,
} from "@/lib/colombia-locations";

interface ContractSignFlowProps {
  contractId: string;
  prefill: {
    nombre: string;
    cedula: string;
    direccion: string;
    departamento: string;
    ciudad: string;
    tipoDocumento: string;
  };
  resumen: { nombre: string; documento: string; celular: string; correo: string };
  comercial: Omit<
    ContratoData,
    | "nombreContratante"
    | "cedulaContratante"
    | "tipoDocumentoContratante"
    | "direccionNotificaciones"
    | "ciudadContratante"
    | "departamentoContratante"
    | "fechaFirmaDia"
    | "fechaFirmaMes"
    | "fechaFirmaAnio"
  >;
}

// Pasos: datos, encabezado, un paso por bloque de clausulas, confirmar, firmar.
const TOTAL_STEPS = 2 + blocks.length + 2;

const departamentoOptions = listDepartamentos().map((d) => ({
  value: d,
  label: d,
}));

export function ContractSignFlow({
  contractId,
  prefill,
  resumen,
  comercial,
}: ContractSignFlowProps) {
  const [step, setStep] = useState(0);
  const [nombre, setNombre] = useState(prefill.nombre);
  const [cedula, setCedula] = useState(prefill.cedula);
  const [direccion, setDireccion] = useState(prefill.direccion);
  const [departamento, setDepartamento] = useState(prefill.departamento);
  const [ciudad, setCiudad] = useState(prefill.ciudad);
  const [aceptaClausulas, setAceptaClausulas] = useState(false);
  const [aceptaFirma, setAceptaFirma] = useState(false);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const [hydrated, setHydrated] = useState(false);
  const sigRef = useRef<SignaturePadHandle>(null);
  const draftKey = contratoDraftKey(contractId);
  const signatureStep = TOTAL_STEPS - 1;

  useEffect(() => {
    const draft = readDraft<ContratoSignDraft>(draftKey);
    if (draft) {
      setStep(draft.step);
      setNombre(draft.nombre);
      setCedula(draft.cedula);
      setDireccion(draft.direccion);
      setDepartamento(draft.departamento);
      setCiudad(draft.ciudad);
      setAceptaClausulas(draft.aceptaClausulas);
      setAceptaFirma(draft.aceptaFirma);
      if (draft.step === signatureStep) {
        toast.message("Debes volver a firmar en el recuadro.");
      }
    }
    setHydrated(true);
  }, [draftKey, signatureStep]);

  useEffect(() => {
    if (!hydrated || done) return;
    writeDraft<ContratoSignDraft>(draftKey, {
      step,
      nombre,
      cedula,
      direccion,
      departamento,
      ciudad,
      aceptaClausulas,
      aceptaFirma,
    });
  }, [
    hydrated,
    done,
    draftKey,
    step,
    nombre,
    cedula,
    direccion,
    departamento,
    ciudad,
    aceptaClausulas,
    aceptaFirma,
  ]);

  const fecha = colombiaDateParts();
  const ciudadOptions = listCiudades(departamento).map((c) => ({
    value: c,
    label: c,
  }));
  const formData: ContratoData = {
    nombreContratante: nombre,
    cedulaContratante: cedula,
    tipoDocumentoContratante: prefill.tipoDocumento || "C.C.",
    direccionNotificaciones: direccion,
    ciudadContratante: ciudad,
    departamentoContratante: departamento,
    fechaFirmaDia: fecha.dia,
    fechaFirmaMes: fecha.mes,
    fechaFirmaAnio: fecha.anio,
    ...comercial,
  };

  const isLast = step === TOTAL_STEPS - 1;
  const isConfirm = step === TOTAL_STEPS - 2;

  function handleDepartamentoChange(value: string) {
    setDepartamento(value);
    const ciudades = listCiudades(value);
    setCiudad((prev) => (ciudades.includes(prev) ? prev : (ciudades[0] ?? "")));
  }

  function next() {
    if (step === 0) {
      if (!nombre.trim() || !cedula.trim() || !direccion.trim() || !departamento || !ciudad) {
        toast.error("Completa nombre, cédula, dirección, departamento y ciudad.");
        return;
      }
    }
    if (isConfirm && !aceptaClausulas) {
      toast.error("Debes aceptar las cláusulas para continuar.");
      return;
    }
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  }

  function back() {
    setStep((s) => Math.max(s - 1, 0));
  }

  function submit() {
    if (!aceptaFirma) {
      toast.error("Confirma que aceptas los documentos.");
      return;
    }
    const dataUrl = sigRef.current?.export();
    if (!dataUrl) {
      toast.error("Diligencia tu firma en el recuadro e intenta de nuevo.");
      return;
    }
    startTransition(async () => {
      try {
        await retryAsync(
          () =>
            signContract({
              contractId,
              nombre: nombre.trim(),
              cedula: cedula.trim(),
              direccion: direccion.trim(),
              departamento,
              ciudad,
              firmaPngBase64: dataUrl,
            }),
          {
            onRetry: () => {
              toast.message("Reintentando envío…");
            },
          },
        );
        clearDraft(draftKey);
        setDone(true);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo firmar.");
      }
    });
  }

  if (done) {
    return (
      <div className="flex flex-col items-center rounded-2xl border-2 border-green-500 bg-green-50 p-8 text-center">
        <CheckCircle2 className="h-16 w-16 text-green-600" strokeWidth={1.5} />
        <h2 className="mt-4 text-2xl font-bold text-foreground">¡Contrato firmado!</h2>
        <p className="mt-3 text-base leading-relaxed text-foreground">
          Tus documentos fueron firmados y guardados correctamente.
        </p>
        <a
          href={`/moto/${contractId}`}
          className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-6 text-base font-semibold text-primary-foreground"
        >
          Elegir mi moto
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <FlowProgress step={step + 1} total={TOTAL_STEPS} title="Contrato de Renting" />

      {step === 0 && (
        <StepCard
          title="Tus datos como contratante"
          instruction="Revisa tus datos. Ya vienen de tu hoja de vida; corrígelos solo si algo cambió."
        >
          <FieldBlock label="Nombre completo" example="Juan Pérez García">
            <Input
              className={fieldInputClass}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </FieldBlock>
          <FieldBlock label="Cédula">
            <Input
              className={fieldInputClass}
              inputMode="numeric"
              value={cedula}
              onChange={(e) => setCedula(e.target.value)}
            />
          </FieldBlock>
          <FieldBlock label="Dirección para notificaciones">
            <Textarea
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              rows={2}
            />
          </FieldBlock>
          <FieldBlock label="Departamento">
            <TouchSelect
              value={departamento}
              onChange={handleDepartamentoChange}
              options={departamentoOptions}
              className={fieldInputClass}
              aria-label="Departamento"
            />
          </FieldBlock>
          <FieldBlock label="Ciudad o municipio">
            <TouchSelect
              value={ciudad}
              onChange={setCiudad}
              options={ciudadOptions}
              className={fieldInputClass}
              aria-label="Ciudad o municipio"
            />
          </FieldBlock>
          <div className="rounded-lg border border-border bg-muted/50 p-4 text-sm leading-relaxed text-foreground">
            <p className="font-semibold text-foreground">Tu moto</p>
            <p className="mt-1">
              {comercial.marca} {comercial.modelo} · {comercial.color}
            </p>
            <p>Placa {comercial.placa} · Chasis {comercial.chasis}</p>
            <p className="mt-2">
              Cuota inicial {comercial.cuotaInicial} ·{" "}
              {comercial.frecuenciaPago.toLowerCase()}: {comercial.valorCuota}
            </p>
          </div>
        </StepCard>
      )}

      {step === 1 && (
        <StepCard
          title="Inicio del contrato"
          instruction="Lee con calma. Desliza hacia abajo para ver todo el texto."
        >
          <LegalBox title="Encabezado del contrato" body={renderIntro(formData)} />
        </StepCard>
      )}

      {step >= 2 && step < 2 + blocks.length && (
        <StepCard
          title={blocks[step - 2].title}
          instruction="Texto legal del contrato. Tómate tu tiempo."
        >
          {blocks[step - 2].clausulas.map((c) => (
            <LegalBox
              key={c.titulo}
              title={c.titulo}
              body={renderClausulaTexto(c.texto, formData)}
            />
          ))}
        </StepCard>
      )}

      {isConfirm && (
        <StepCard
          title="Confirmación final"
          instruction="Al marcar la casilla confirmas que leíste todo el contrato."
        >
          <LegalBox title="Firma del contrato" body={renderFirma(formData)} />
          <FirmaParty
            title="LA PROPIETARIA"
            sigSrc={`/${EMPRESA_PROPIETARIA.firmaFile}`}
            sigAlt={`Firma de ${EMPRESA_PROPIETARIA.representante}`}
            lines={[
              EMPRESA_PROPIETARIA.representante,
              EMPRESA_PROPIETARIA.cedula,
              "Representante legal",
              EMPRESA_PROPIETARIA.razonSocial,
              `Nit: ${EMPRESA_PROPIETARIA.nit}`,
            ]}
          />
          <label className="flex items-start gap-3 rounded-xl border border-border p-4">
            <Checkbox
              checked={aceptaClausulas}
              onCheckedChange={(v) => setAceptaClausulas(v === true)}
              className="mt-0.5"
            />
            <span className="text-base leading-relaxed text-foreground">
              He leído y acepto todas las cláusulas del CONTRATO DE RENTING
            </span>
          </label>
        </StepCard>
      )}

      {isLast && (
        <StepCard
          title="Revisar y firmar"
          instruction="Si algo está mal, vuelve atrás y corrígelo antes de firmar."
        >
          <SummarySection
            title="Hoja de Vida"
            lines={[
              `Nombre: ${resumen.nombre}`,
              `Documento: ${resumen.documento}`,
              `Celular: ${resumen.celular}`,
              `Correo: ${resumen.correo}`,
            ]}
          />
          <SummarySection
            title="Contrato de Renting"
            lines={[
              `Contratante: ${nombre}`,
              `Cédula: ${cedula}`,
              `Dirección: ${direccion}`,
              `Ciudad: ${ciudad}, ${departamento}`,
            ]}
          />
          <div>
            <p className="mb-2 text-base font-semibold text-foreground">Tu firma</p>
            <p className="mb-3 text-sm text-muted-foreground">
              Dibuja tu firma con el dedo o el mouse en el recuadro blanco.
            </p>
            <SignaturePad ref={sigRef} disabled={pending} />
          </div>
          <label className="flex items-start gap-3 rounded-xl border border-border p-4">
            <Checkbox
              checked={aceptaFirma}
              onCheckedChange={(v) => setAceptaFirma(v === true)}
              disabled={pending}
              className="mt-0.5"
            />
            <span className="text-base leading-relaxed text-foreground">
              Confirmo que la información es correcta y firmo los documentos.
            </span>
          </label>
        </StepCard>
      )}

      <StickyActions
        primary={
          isLast ? (
            <PrimaryAction onClick={submit} disabled={pending || !aceptaFirma}>
              {pending ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" /> Firmando…
                </span>
              ) : (
                "Firmar y enviar"
              )}
            </PrimaryAction>
          ) : (
            <PrimaryAction onClick={next}>Entendido, continuar</PrimaryAction>
          )
        }
        secondary={
          step > 0 && !pending ? (
            <SecondaryAction onClick={back}>Atrás</SecondaryAction>
          ) : undefined
        }
      />
    </div>
  );
}

function LegalBox({ title, body }: { title: string; body: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-300 bg-background shadow-sm">
      <div className="border-b border-slate-700 bg-slate-900 px-4 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-white">
          {title}
        </p>
      </div>
      <p className="whitespace-pre-line px-4 py-4 font-serif text-sm leading-relaxed text-slate-800">
        {body}
      </p>
    </div>
  );
}

function FirmaParty({
  title,
  sigSrc,
  sigAlt,
  lines,
}: {
  title: string;
  sigSrc: string;
  sigAlt: string;
  lines: string[];
}) {
  return (
    <div className="rounded-lg border border-slate-300 bg-background p-4 shadow-sm">
      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-900">
        {title}
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={sigSrc} alt={sigAlt} className="mb-2 h-20 w-auto object-contain" />
      <div className="mb-3 border-b border-slate-400" />
      {lines.map((line, i) => (
        <p
          key={line}
          className={
            i === 0
              ? "text-sm font-semibold text-slate-900"
              : "text-xs text-slate-600"
          }
        >
          {line}
        </p>
      ))}
    </div>
  );
}

function SummarySection({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-xl border border-border bg-muted/50 p-4">
      <p className="mb-2 text-sm font-semibold text-foreground">{title}</p>
      {lines.map((line) => (
        <p key={line} className="text-sm text-foreground">
          {line}
        </p>
      ))}
    </div>
  );
}

interface SignaturePadHandle {
  export: () => string | null;
}

const SignaturePad = forwardRef<SignaturePadHandle, { disabled?: boolean }>(
  function SignaturePad({ disabled }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);
    const hasInk = useRef(false);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, rect.width, rect.height);
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    }, []);

    function pos(e: React.PointerEvent<HTMLCanvasElement>) {
      const rect = e.currentTarget.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function start(e: React.PointerEvent<HTMLCanvasElement>) {
      if (disabled) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      drawing.current = true;
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      const { x, y } = pos(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
    }

    function move(e: React.PointerEvent<HTMLCanvasElement>) {
      if (!drawing.current) return;
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      const { x, y } = pos(e);
      ctx.lineTo(x, y);
      ctx.stroke();
      hasInk.current = true;
    }

    function end() {
      drawing.current = false;
    }

    function clear() {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const rect = canvas.getBoundingClientRect();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, rect.width, rect.height);
      hasInk.current = false;
    }

    useImperativeHandle(ref, () => ({
      export: () => (hasInk.current ? (canvasRef.current?.toDataURL("image/png") ?? null) : null),
    }));

    return (
      <div className="flex flex-col gap-2">
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          className="h-44 w-full touch-none rounded-xl border border-border bg-background"
        />
        <button
          type="button"
          onClick={clear}
          disabled={disabled}
          className="text-sm font-medium text-muted-foreground underline disabled:opacity-50"
        >
          Limpiar firma
        </button>
      </div>
    );
  },
);
