import { redirect } from "next/navigation";

export default function CrearClientePage() {
  redirect("/clientes?nuevo=1");
}
