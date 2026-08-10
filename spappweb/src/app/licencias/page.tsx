import type { Metadata } from "next";
import { Download, Search } from "lucide-react";
import { getTarjetaPropiedadByPlaca } from "@/lib/pipeline/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata: Metadata = {
  title: "Licencias de tránsito",
  description: "Consulta y descarga la tarjeta de propiedad por placa.",
};

export default async function LicenciasPage({
  searchParams,
}: {
  searchParams: Promise<{ placa?: string }>;
}) {
  const { placa: raw } = await searchParams;
  const placa = (raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
  const searched = placa.length >= 5;
  const tarjeta = searched ? await getTarjetaPropiedadByPlaca(placa) : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-8 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <header className="flex flex-col items-center gap-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/beralogo.jpg"
            alt="Bera"
            className="h-auto w-full max-w-[220px] object-contain"
          />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Licencias de tránsito
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Busca por placa para ver y descargar frente y reverso.
            </p>
          </div>
        </header>

        <form method="get" className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="placa">Placa</Label>
            <Input
              id="placa"
              name="placa"
              defaultValue={placa}
              placeholder="ABC12D"
              className="uppercase"
              autoComplete="off"
              autoFocus
              required
              minLength={5}
            />
          </div>
          <Button type="submit" className="w-full">
            <Search data-icon="inline-start" />
            Buscar
          </Button>
        </form>

        {searched && !tarjeta ? (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            No hay tarjeta registrada para{" "}
            <span className="font-medium text-foreground">{placa}</span>.
          </p>
        ) : null}

        {tarjeta ? (
          <section className="flex flex-col gap-4">
            <h2 className="text-center text-lg font-semibold tracking-wide">
              {tarjeta.placa}
            </h2>
            <div className="grid gap-4">
              <FotoDescarga
                label="Frente"
                url={tarjeta.imagen_url}
                filename={`${tarjeta.placa}-frente`}
              />
              {tarjeta.imagen_reverso_url ? (
                <FotoDescarga
                  label="Reverso"
                  url={tarjeta.imagen_reverso_url}
                  filename={`${tarjeta.placa}-reverso`}
                />
              ) : null}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}

/** Supabase Storage: ?download=nombre fuerza Content-Disposition attachment. */
function storageDownloadHref(url: string, filename: string): string {
  const parsed = new URL(url);
  const ext =
    parsed.pathname.match(/\.(jpe?g|png|webp|gif)$/i)?.[1]?.toLowerCase() ??
    "jpg";
  parsed.searchParams.set("download", `${filename}.${ext}`);
  return parsed.toString();
}

function FotoDescarga({
  label,
  url,
  filename,
}: {
  label: string;
  url: string;
  filename: string;
}) {
  return (
    <figure className="flex flex-col gap-2 overflow-hidden rounded-lg border">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={`${filename}`}
        className="max-h-[420px] w-full bg-muted object-contain"
      />
      <figcaption className="flex items-center justify-between gap-2 px-3 pb-3">
        <span className="text-sm font-medium">{label}</span>
        <Button asChild size="sm" variant="outline">
          <a href={storageDownloadHref(url, filename)}>
            <Download data-icon="inline-start" />
            Descargar
          </a>
        </Button>
      </figcaption>
    </figure>
  );
}
