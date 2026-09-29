import { notFound } from "next/navigation";
import { getAllProductos } from "@/lib/pipeline/queries";
import { getMecanicos, getOrdenTaller } from "@/lib/taller/queries";
import { TallerOrdenDetail } from "@/components/taller/taller-orden-detail";

export const dynamic = "force-dynamic";

export default async function TallerOrdenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [orden, mecanicos, productos] = await Promise.all([
    getOrdenTaller(id),
    getMecanicos(false),
    getAllProductos(),
  ]);

  if (!orden) notFound();

  return (
    <TallerOrdenDetail
      orden={orden}
      mecanicos={mecanicos}
      productos={productos.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        sku: p.sku,
        stock: p.stock,
        precio: p.precio,
        imagen_url: p.imagen_url,
      }))}
    />
  );
}
