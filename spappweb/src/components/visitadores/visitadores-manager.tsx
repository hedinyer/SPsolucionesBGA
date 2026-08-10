"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, User } from "lucide-react";
import { deleteVisitador, saveVisitador } from "@/lib/actions/admin-actions";
import type { VisitadorRow } from "@/lib/pipeline/types";
import { getStoragePublicUrl } from "@/lib/utils/storage-urls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
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
import {
  ImageFileField,
  uploadImageFile,
  visitadorUploadFolder,
} from "@/components/ui/image-file-field";
import {
  ShareVisitadorLink,
  visitadorUsername,
} from "@/components/visitadores/share-visitador-link";
import { STORAGE_BUCKETS } from "@/lib/supabase/storage-buckets";

function VisitadorPhoto({ visitador }: { visitador: VisitadorRow }) {
  const src = getStoragePublicUrl(
    STORAGE_BUCKETS.visitadorFotos,
    visitador.foto_url,
  );
  return (
    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border border-border bg-muted/50">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={visitador.nombre}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          <User className="h-6 w-6" />
        </div>
      )}
    </div>
  );
}

export function VisitadoresManager({
  visitadores,
}: {
  visitadores: VisitadorRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<VisitadorRow | null>(null);
  const [pending, startTransition] = useTransition();

  function openCreate() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(v: VisitadorRow) {
    setEditing(v);
    setOpen(true);
  }

  function onSave(form: {
    nombre: string;
    telefono: string;
    fotoUrl: string;
    activo: boolean;
    photoFile: File | null;
    username: string;
    password: string;
  }) {
    startTransition(async () => {
      try {
        let fotoUrl = form.fotoUrl;

        if (form.photoFile) {
          fotoUrl = await uploadImageFile(
            STORAGE_BUCKETS.visitadorFotos,
            visitadorUploadFolder(editing?.id, form.nombre),
            form.photoFile,
          );
        }

        await saveVisitador({
          id: editing?.id,
          nombre: form.nombre,
          telefono: form.telefono,
          fotoUrl,
          activo: form.activo,
          username: editing ? undefined : form.username,
          password: form.password || undefined,
        });
        toast.success(editing ? "Visitador actualizado." : "Visitador creado.");
        router.refresh();
        setOpen(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al guardar.");
      }
    });
  }

  return (
    <>
      <div className="flex justify-end">
        <Button
          onClick={openCreate}
          className="bg-primary text-primary-foreground hover:bg-primary/80"
        >
          <Plus className="mr-2 h-4 w-4" />
          Nuevo visitador
        </Button>
      </div>

      <div className="hidden rounded-lg border border-border lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Link portal</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visitadores.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No hay visitadores. Crea uno para asignar visitas.
                </TableCell>
              </TableRow>
            ) : (
              visitadores.map((v) => {
                const username = visitadorUsername(v);
                return (
                  <TableRow key={v.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <VisitadorPhoto visitador={v} />
                        <span className="font-medium">{v.nombre}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {username ? (
                        <span className="font-mono text-sm">{username}</span>
                      ) : (
                        <Badge variant="secondary">Sin cuenta</Badge>
                      )}
                    </TableCell>
                    <TableCell>{v.telefono ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={v.activo ? "outline" : "secondary"}>
                        {v.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {username ? (
                        <ShareVisitadorLink
                          nombre={v.nombre}
                          username={username}
                          telefono={v.telefono}
                          compact
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">Sin cuenta</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(v)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="bg-background">
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                ¿Eliminar visitador?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {v.nombre}
                                {v.telefono ? ` · ${v.telefono}` : ""}. Se
                                eliminará también su cuenta de acceso. Las visitas
                                asignadas quedarán sin visitador.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() =>
                                  startTransition(async () => {
                                    try {
                                      await deleteVisitador(v.id);
                                      toast.success("Visitador eliminado.");
                                      router.refresh();
                                    } catch (e) {
                                      toast.error(
                                        e instanceof Error
                                          ? e.message
                                          : "No se pudo eliminar.",
                                      );
                                    }
                                  })
                                }
                              >
                                Eliminar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 lg:hidden">
        {visitadores.length === 0 ? (
          <Empty className="border border-dashed border-border">
            <EmptyHeader>
              <EmptyTitle>Sin visitadores</EmptyTitle>
              <EmptyDescription>
                Crea uno para asignar visitas domiciliarias.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          visitadores.map((v) => {
            const username = visitadorUsername(v);
            return (
              <div
                key={v.id}
                className="rounded-lg border border-border p-4 text-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <VisitadorPhoto visitador={v} />
                    <p className="font-medium">{v.nombre}</p>
                  </div>
                  <Badge variant={v.activo ? "outline" : "secondary"}>
                    {v.activo ? "Activo" : "Inactivo"}
                  </Badge>
                </div>
                <dl className="mt-3 flex flex-col gap-1.5">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Usuario</dt>
                    <dd>
                      {username ? (
                        <span className="font-mono">{username}</span>
                      ) : (
                        <Badge variant="secondary">Sin cuenta</Badge>
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Teléfono</dt>
                    <dd>{v.telefono ?? "—"}</dd>
                  </div>
                </dl>
                {username ? (
                  <div className="mt-3">
                    <ShareVisitadorLink
                      nombre={v.nombre}
                      username={username}
                      telefono={v.telefono}
                    />
                  </div>
                ) : null}
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-11 flex-1 touch-manipulation"
                    onClick={() => openEdit(v)}
                  >
                    <Pencil className="mr-1 h-4 w-4" />
                    Editar
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="flex-1">
                        <Trash2 className="mr-1 h-4 w-4" />
                        Eliminar
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="bg-background">
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar visitador?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {v.nombre}
                          {v.telefono ? ` · ${v.telefono}` : ""}. Se eliminará
                          también su cuenta de acceso.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() =>
                            startTransition(async () => {
                              try {
                                await deleteVisitador(v.id);
                                toast.success("Visitador eliminado.");
                                router.refresh();
                              } catch (e) {
                                toast.error(
                                  e instanceof Error
                                    ? e.message
                                    : "No se pudo eliminar.",
                                );
                              }
                            })
                          }
                        >
                          Eliminar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            );
          })
        )}
      </div>

      <VisitadorDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        pending={pending}
        onSave={onSave}
      />
    </>
  );
}

function VisitadorDialog({
  open,
  onOpenChange,
  editing,
  pending,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: VisitadorRow | null;
  pending: boolean;
  onSave: (form: {
    nombre: string;
    telefono: string;
    fotoUrl: string;
    activo: boolean;
    photoFile: File | null;
    username: string;
    password: string;
  }) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [fotoUrl, setFotoUrl] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [activo, setActivo] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!open) return;
    setNombre(editing?.nombre ?? "");
    setTelefono(editing?.telefono ?? "");
    setFotoUrl(editing?.foto_url ?? "");
    setPhotoFile(null);
    setActivo(editing?.activo ?? true);
    setUsername(editing ? (visitadorUsername(editing) ?? "") : "");
    setPassword("");
  }, [open, editing]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar visitador" : "Nuevo visitador"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="nombre">Nombre</Label>
            <Input
              id="nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="min-h-11 touch-manipulation text-base md:text-sm"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="telefono">Teléfono</Label>
            <Input
              id="telefono"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className="min-h-11 touch-manipulation text-base md:text-sm"
            />
          </div>
          {!editing && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="username">Usuario de acceso</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
                className="min-h-11 touch-manipulation text-base md:text-sm"
              />
            </div>
          )}
          {editing && username && (
            <div className="flex flex-col gap-2">
              <Label>Usuario de acceso</Label>
              <Input value={username} disabled />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">
              {editing ? "Nueva contraseña (opcional)" : "Contraseña"}
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="min-h-11 touch-manipulation text-base md:text-sm"
            />
          </div>
          <ImageFileField
            label="Foto del visitador"
            existingUrl={fotoUrl}
            file={photoFile}
            onFileChange={setPhotoFile}
            disabled={pending}
            enableCamera
            fileInputId="visitador-foto-file"
            cameraInputId="visitador-foto-camera"
          />
          <div className="flex items-center gap-2">
            <Switch checked={activo} onCheckedChange={setActivo} />
            <Label>Activo</Label>
          </div>
          {editing && username && (
            <ShareVisitadorLink
              nombre={nombre}
              username={username}
              telefono={telefono}
            />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/80"
            disabled={
              pending ||
              nombre.trim().length < 2 ||
              (!editing && (username.trim().length < 3 || password.length < 4))
            }
            onClick={() =>
              onSave({
                nombre,
                telefono,
                fotoUrl,
                activo,
                photoFile,
                username,
                password,
              })
            }
          >
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
