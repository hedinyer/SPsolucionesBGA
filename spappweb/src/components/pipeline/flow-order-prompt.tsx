"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { setEntregaAntesVisita } from "@/lib/actions/admin-actions";
import { canChooseFlowOrder } from "@/lib/pipeline/step-logic";
import type { UserMotoCompraRow, VisitaRow } from "@/lib/pipeline/types";
import { Button } from "@/components/ui/button";
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

interface FlowOrderPromptProps {
  compra: UserMotoCompraRow | null;
  visita: VisitaRow | null;
  userId: number;
}

export function FlowOrderPrompt({
  compra,
  visita,
  userId,
}: FlowOrderPromptProps) {
  const [pending, startTransition] = useTransition();

  if (!canChooseFlowOrder(compra, visita)) return null;

  function choose(entregaAntesVisita: boolean) {
    if (!compra) return;
    startTransition(async () => {
      try {
        await setEntregaAntesVisita(compra.id, userId, entregaAntesVisita);
        toast.success(
          entregaAntesVisita
            ? "Flujo: entrega antes de visita."
            : "Flujo habitual: visita antes de entrega.",
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al guardar.");
      }
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={pending}>
          ¿Entregar antes de la visita?
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="bg-background">
        <AlertDialogHeader>
          <AlertDialogTitle>Orden visita / entrega</AlertDialogTitle>
          <AlertDialogDescription>
            ¿Esta venta requiere entregar la moto antes de la visita
            domiciliaria?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => choose(false)}>
            No, visita primero
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => choose(true)}>
            Sí, entregar primero
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
