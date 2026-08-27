"use server";

import { requireAdminSession } from "@/lib/auth/session";
import {
  getAllCategorias,
  getAllProductos,
} from "@/lib/pipeline/queries";

export async function refreshInventarioData() {
  await requireAdminSession();
  const [categorias, productos] = await Promise.all([
    getAllCategorias(),
    getAllProductos(),
  ]);
  return { categorias, productos };
}
