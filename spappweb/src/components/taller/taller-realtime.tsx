"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/browser";

/** Refresca la página cuando cambian órdenes / repuestos / tiempos del taller. */
export function TallerRealtimeRefresh({
  onRejectVibrate,
}: {
  onRejectVibrate?: boolean;
} = {}) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createBrowserClient();
    let lastRejectAt = 0;

    const channel = supabase
      .channel("taller_live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ordenes_taller" },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orden_taller_repuestos" },
        (payload) => {
          const next = payload.new as { estado?: string } | null;
          if (
            onRejectVibrate &&
            next?.estado === "rechazado" &&
            Date.now() - lastRejectAt > 1500
          ) {
            lastRejectAt = Date.now();
            try {
              navigator.vibrate?.(80);
            } catch {
              /* ignore */
            }
          }
          router.refresh();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orden_taller_zonas" },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orden_taller_tiempos" },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mecanicos" },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router, onRejectVibrate]);

  return null;
}
