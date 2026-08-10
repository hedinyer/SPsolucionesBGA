"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { usePollingRefresh } from "@/hooks/use-polling-refresh";
import { updateSolicitudEstado } from "@/lib/actions/admin-actions";
import {
  SOLICITUD_ESTADO_LABELS,
  SOLICITUD_TIPO_LABELS,
  type SolicitudTallerEstado,
  type SolicitudTallerRow,
  type SolicitudTallerTipo,
} from "@/lib/pipeline/types";
import { formatCop, formatDateOnly } from "@/lib/utils/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { TouchSelect } from "@/components/ui/touch-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

export function SolicitudesManager({
  solicitudes,
}: {
  solicitudes: SolicitudTallerRow[];
}) {
  const [tipoFilter, setTipoFilter] = useState<string>("all");
  const [estadoFilter, setEstadoFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(
    solicitudes[0]?.id ?? null,
  );
  const [notasAdmin, setNotasAdmin] = useState("");
  const [notasDirty, setNotasDirty] = useState(false);
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  const [mobileShowDetail, setMobileShowDetail] = useState(false);
  const [pending, startTransition] = useTransition();
  const knownIdsRef = useRef<Set<string> | null>(null);

  usePollingRefresh({ intervalMs: 30_000, enabled: !pending });

  useEffect(() => {
    const currentIds = new Set(solicitudes.map((s) => s.id));

    if (knownIdsRef.current !== null) {
      const newOnes = solicitudes.filter((s) => !knownIdsRef.current!.has(s.id));
      if (newOnes.length > 0) {
        for (const solicitud of newOnes) {
          const cliente =
            solicitud.users?.user ?? `Cliente ${solicitud.user_id}`;
          toast.info(
            `Nueva solicitud de ${SOLICITUD_TIPO_LABELS[solicitud.tipo].toLowerCase()} de ${cliente}`,
          );
        }
        setHighlightedIds((prev) => {
          const next = new Set(prev);
          for (const solicitud of newOnes) {
            next.add(solicitud.id);
          }
          return next;
        });
      }
    }

    knownIdsRef.current = currentIds;
  }, [solicitudes]);

  const filtered = useMemo(() => {
    return solicitudes.filter((s) => {
      if (tipoFilter !== "all" && s.tipo !== tipoFilter) return false;
      if (estadoFilter !== "all" && s.estado !== estadoFilter) return false;
      return true;
    });
  }, [solicitudes, tipoFilter, estadoFilter]);

  const selected =
    filtered.find((s) => s.id === selectedId) ?? filtered[0] ?? null;

  useEffect(() => {
    if (!selected || notasDirty) return;
    setNotasAdmin(selected.notas_admin ?? "");
  }, [selected?.id, selected?.notas_admin, notasDirty]);

  function selectSolicitud(solicitud: SolicitudTallerRow) {
    setSelectedId(solicitud.id);
    setMobileShowDetail(true);
    setNotasAdmin(solicitud.notas_admin ?? "");
    setNotasDirty(false);
    setHighlightedIds((prev) => {
      if (!prev.has(solicitud.id)) return prev;
      const next = new Set(prev);
      next.delete(solicitud.id);
      return next;
    });
  }

  function updateEstado(estado: SolicitudTallerEstado) {
    if (!selected) return;
    startTransition(async () => {
      try {
        await updateSolicitudEstado({
          solicitudId: selected.id,
          estado,
          notasAdmin,
        });
        setNotasDirty(false);
        toast.success(`Solicitud marcada como ${SOLICITUD_ESTADO_LABELS[estado].toLowerCase()}.`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al actualizar.");
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div
        className={`flex flex-col gap-4 lg:col-span-2 ${mobileShowDetail ? "hidden lg:block" : ""}`}
      >
        <div className="grid w-full gap-2 sm:flex sm:flex-wrap">
          <TouchSelect
            aria-label="Filtrar por tipo"
            value={tipoFilter}
            onChange={setTipoFilter}
            options={[
              { value: "all", label: "Todos los tipos" },
              ...(Object.keys(SOLICITUD_TIPO_LABELS) as SolicitudTallerTipo[]).map(
                (t) => ({
                  value: t,
                  label: SOLICITUD_TIPO_LABELS[t],
                }),
              ),
            ]}
          />
          <TouchSelect
            aria-label="Filtrar por estado"
            value={estadoFilter}
            onChange={setEstadoFilter}
            options={[
              { value: "all", label: "Todos" },
              ...(Object.keys(SOLICITUD_ESTADO_LABELS) as SolicitudTallerEstado[]).map(
                (e) => ({
                  value: e,
                  label: SOLICITUD_ESTADO_LABELS[e],
                }),
              ),
            ]}
          />
        </div>

        <div className="flex flex-col gap-2">
          {filtered.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => selectSolicitud(s)}
              className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                selected?.id === s.id
                  ? "border-primary bg-muted/50"
                  : highlightedIds.has(s.id)
                    ? "border-blue-400 bg-blue-50 hover:border-blue-500"
                    : "border-border hover:border-neutral-400"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  {s.users?.user ?? `Cliente ${s.user_id}`}
                </span>
                <div className="flex items-center gap-2">
                  {highlightedIds.has(s.id) && (
                    <Badge className="bg-blue-600 text-white hover:bg-blue-600">
                      Nueva
                    </Badge>
                  )}
                  <Badge variant="outline">{SOLICITUD_TIPO_LABELS[s.tipo]}</Badge>
                </div>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatDateOnly(s.created_at)} ·{" "}
                {SOLICITUD_ESTADO_LABELS[s.estado]}
              </p>
            </button>
          ))}
          {filtered.length === 0 && (
            <Empty className="border border-dashed border-border py-8">
              <EmptyHeader>
                <EmptyTitle>Sin solicitudes</EmptyTitle>
                <EmptyDescription>
                  No hay solicitudes con estos filtros.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </div>

      <div
        className={`lg:col-span-3 ${!mobileShowDetail ? "hidden lg:block" : ""}`}
      >
        {selected ? (
          <Card className="border-border shadow-none">
            <CardHeader>
              <Button
                variant="ghost"
                className="mb-2 gap-2 px-0 lg:hidden"
                onClick={() => setMobileShowDetail(false)}
              >
                <ChevronLeft className="h-4 w-4" />
                Volver a la lista
              </Button>
              <CardTitle className="text-lg">
                {SOLICITUD_TIPO_LABELS[selected.tipo]}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Cliente: {selected.users?.user ?? selected.user_id}
                {selected.user_moto_compra?.modelo
                  ? ` · ${selected.user_moto_compra.modelo}`
                  : ""}
                {selected.user_moto_compra?.placa
                  ? ` · Placa ${selected.user_moto_compra.placa}`
                  : ""}
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <p>
                  <span className="text-muted-foreground">Estado: </span>
                  {SOLICITUD_ESTADO_LABELS[selected.estado]}
                </p>
                <p>
                  <span className="text-muted-foreground">Creada: </span>
                  {formatDateOnly(selected.created_at)}
                </p>
                {selected.tipo === "repuestos" && (
                  <p>
                    <span className="text-muted-foreground">Total: </span>
                    {formatCop(selected.total_estimado)}
                  </p>
                )}
                {selected.fecha_preferida && (
                  <p>
                    <span className="text-muted-foreground">Fecha preferida: </span>
                    {formatDateOnly(selected.fecha_preferida)}
                  </p>
                )}
              </div>

              {selected.notas_cliente && (
                <div className="rounded-lg bg-muted/50 p-3 text-sm">
                  <p className="font-medium">Notas del cliente</p>
                  <p className="mt-1 text-foreground">{selected.notas_cliente}</p>
                </div>
              )}

              {selected.descripcion_falla && (
                <div className="rounded-lg bg-muted/50 p-3 text-sm">
                  <p className="font-medium">Descripción de la falla</p>
                  <p className="mt-1 text-foreground">
                    {selected.descripcion_falla}
                  </p>
                </div>
              )}

              {selected.tipo === "repuestos" &&
                (selected.solicitud_repuesto_items?.length ?? 0) > 0 && (
                  <>
                    <div className="hidden overflow-x-auto rounded-lg border border-border lg:block">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Producto</TableHead>
                            <TableHead>Cant.</TableHead>
                            <TableHead>Precio</TableHead>
                            <TableHead>Subtotal</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selected.solicitud_repuesto_items!.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell>
                                {item.inventario_productos?.nombre ?? item.producto_id}
                              </TableCell>
                              <TableCell>{item.cantidad}</TableCell>
                              <TableCell>{formatCop(item.precio_unitario)}</TableCell>
                              <TableCell>{formatCop(item.subtotal)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="flex flex-col gap-2 lg:hidden">
                      {selected.solicitud_repuesto_items!.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-lg border border-border p-3 text-sm"
                        >
                          <p className="font-medium">
                            {item.inventario_productos?.nombre ?? item.producto_id}
                          </p>
                          <p className="mt-1 text-muted-foreground">
                            {item.cantidad} × {formatCop(item.precio_unitario)} ={" "}
                            {formatCop(item.subtotal)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </>
                )}

              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Notas internas</p>
                <Textarea
                  value={notasAdmin}
                  onChange={(e) => {
                    setNotasAdmin(e.target.value);
                    setNotasDirty(true);
                  }}
                  placeholder="Notas para el equipo de taller..."
                />
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {selected.estado === "pendiente" && (
                  <Button
                    disabled={pending}
                    onClick={() => updateEstado("en_proceso")}
                  >
                    Marcar en proceso
                  </Button>
                )}
                {(selected.estado === "pendiente" ||
                  selected.estado === "en_proceso") && (
                  <Button
                    disabled={pending}
                    onClick={() => updateEstado("completada")}
                  >
                    Completar
                  </Button>
                )}
                {selected.estado !== "cancelada" &&
                  selected.estado !== "completada" && (
                    <Button
                      variant="outline"
                      disabled={pending}
                      onClick={() => updateEstado("cancelada")}
                    >
                      Cancelar
                    </Button>
                  )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border shadow-none">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Selecciona una solicitud para ver el detalle.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
