import { KeyRound, Pencil, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/modulos/auth/contexto";
import { Cargando } from "@/compartido/componentes/Cargando";
import { Alert, AlertDescription } from "@/compartido/ui/alert";
import { Badge } from "@/compartido/ui/badge";
import { Button } from "@/compartido/ui/button";
import { Switch } from "@/compartido/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/compartido/ui/table";
import { mensajeDeError } from "@/compartido/lib/errores";
import type { UsuarioAdmin } from "../api/admin-usuarios";
import { useAccionUsuario, useUsuarios } from "../api/consultas";
import { DialogoEditarUsuario } from "../componentes/DialogoEditarUsuario";
import { DialogoNuevoUsuario } from "../componentes/DialogoNuevoUsuario";
import { DialogoPassword } from "../componentes/DialogoPassword";

export function Usuarios() {
  const { perfil } = useAuth();
  const usuarios = useUsuarios();
  const accion = useAccionUsuario();
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const [editando, setEditando] = useState<UsuarioAdmin | null>(null);
  const [cambiandoPassword, setCambiandoPassword] = useState<UsuarioAdmin | null>(null);

  async function cambiarActivo(usuario: UsuarioAdmin, activo: boolean) {
    try {
      await accion.mutateAsync({ accion: "activar", id: usuario.id, activo });
      toast.success(`${usuario.nombre_completo} ${activo ? "activado" : "desactivado"}`);
    } catch (e) {
      toast.error(mensajeDeError(e));
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Usuarios</h1>
        <Button
          onClick={() => {
            setNuevoAbierto(true);
          }}
        >
          <UserPlus aria-hidden />
          Nuevo usuario
        </Button>
      </div>

      {usuarios.isPending ? (
        <Cargando texto="Cargando usuarios…" />
      ) : usuarios.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{mensajeDeError(usuarios.error)}</AlertDescription>
        </Alert>
      ) : (
        <div className="md:overflow-x-auto md:rounded-md md:border">
          <Table apilada>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre y apellido</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Activo</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usuarios.data.map((u) => {
                const esYo = u.id === perfil?.id;
                return (
                  <TableRow key={u.id} data-testid={`usuario-${u.email ?? u.id}`}>
                    <TableCell data-label="Nombre y apellido" className="font-medium">
                      {u.nombre_completo}
                      {esYo && <span className="text-muted-foreground"> (vos)</span>}
                      {u.apellido === null && (
                        <Badge
                          variant="outline"
                          className="ml-2 border-amber-500 text-amber-700 dark:text-amber-400"
                        >
                          Falta el apellido
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell data-label="Email">{u.email}</TableCell>
                    <TableCell data-label="Rol">
                      <Badge variant={u.rol === "admin" ? "default" : "secondary"}>
                        {u.rol === "admin" ? "Administrador" : "Cajero"}
                      </Badge>
                    </TableCell>
                    <TableCell data-label="Activo">
                      <Switch
                        checked={u.activo}
                        disabled={esYo || accion.isPending}
                        aria-label={`Usuario ${u.nombre_completo} activo`}
                        onCheckedChange={(activo) => void cambiarActivo(u, activo)}
                      />
                    </TableCell>
                    <TableCell data-acciones="">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Editar ${u.nombre_completo}`}
                          onClick={() => {
                            setEditando(u);
                          }}
                        >
                          <Pencil aria-hidden />
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Cambiar contraseña de ${u.nombre_completo}`}
                          onClick={() => {
                            setCambiandoPassword(u);
                          }}
                        >
                          <KeyRound aria-hidden />
                          Contraseña
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <DialogoNuevoUsuario abierto={nuevoAbierto} onCambiarAbierto={setNuevoAbierto} />
      {editando && (
        <DialogoEditarUsuario
          usuario={editando}
          esYo={editando.id === perfil?.id}
          onCerrar={() => {
            setEditando(null);
          }}
        />
      )}
      {cambiandoPassword && (
        <DialogoPassword
          usuario={cambiandoPassword}
          onCerrar={() => {
            setCambiandoPassword(null);
          }}
        />
      )}
    </section>
  );
}
