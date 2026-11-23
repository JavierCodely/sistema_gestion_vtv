import { useState, type SubmitEvent } from "react";
import { toast } from "sonner";
import { Campo } from "@/compartido/componentes/Campo";
import { ErrorFormulario } from "@/compartido/componentes/ErrorFormulario";
import { propsError } from "@/compartido/lib/accesibilidad";
import { mensajeDeError } from "@/compartido/lib/errores";
import { LARGO_MAXIMO_NOMBRE, validarNombre } from "@/compartido/lib/validaciones";
import type { Rol } from "@/compartido/tipos";
import { Button } from "@/compartido/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/compartido/ui/dialog";
import { Input } from "@/compartido/ui/input";
import type { UsuarioAdmin } from "../api/admin-usuarios";
import { useAccionUsuario } from "../api/consultas";
import { validarApellido } from "../lib/validaciones";
import { SelectorRol } from "./SelectorRol";

export function DialogoEditarUsuario({
  usuario,
  esYo,
  onCerrar,
}: {
  usuario: UsuarioAdmin;
  esYo: boolean;
  onCerrar: () => void;
}) {
  const mutacion = useAccionUsuario();
  const [nombre, setNombre] = useState(usuario.nombre);
  const [apellido, setApellido] = useState(usuario.apellido ?? "");
  const [rol, setRol] = useState<Rol>(usuario.rol);
  const [error, setError] = useState<string | undefined>();
  const [errorApellido, setErrorApellido] = useState<string | undefined>();
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  async function enviar(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    const errorNombre = validarNombre(nombre);
    const errorDeApellido = validarApellido(apellido);
    setError(errorNombre);
    setErrorApellido(errorDeApellido);
    if (errorNombre || errorDeApellido) return;
    setErrorServidor(null);
    try {
      await mutacion.mutateAsync({
        accion: "actualizar",
        id: usuario.id,
        nombre,
        apellido,
        rol,
      });
      toast.success("Cambios guardados");
      onCerrar();
    } catch (e) {
      setErrorServidor(mensajeDeError(e));
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(abierto) => {
        if (!abierto) onCerrar();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar usuario</DialogTitle>
          <DialogDescription>{usuario.email}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => void enviar(e)} noValidate>
          <Campo id="editar-nombre" etiqueta="Nombre" error={error}>
            <Input
              id="editar-nombre"
              maxLength={LARGO_MAXIMO_NOMBRE}
              value={nombre}
              autoFocus
              onChange={(e) => {
                setNombre(e.target.value);
              }}
              {...propsError("editar-nombre", error)}
            />
          </Campo>
          <Campo id="editar-apellido" etiqueta="Apellido" error={errorApellido}>
            <Input
              id="editar-apellido"
              maxLength={LARGO_MAXIMO_NOMBRE}
              value={apellido}
              onChange={(e) => {
                setApellido(e.target.value);
              }}
              {...propsError("editar-apellido", errorApellido)}
            />
          </Campo>
          <Campo id="editar-rol" etiqueta="Rol">
            <SelectorRol id="editar-rol" valor={rol} onCambio={setRol} deshabilitado={esYo} />
            {esYo && (
              <p className="text-xs text-muted-foreground">No podés cambiar tu propio rol.</p>
            )}
          </Campo>
          <ErrorFormulario mensaje={errorServidor} />
          <DialogFooter>
            <Button type="submit" disabled={mutacion.isPending}>
              {mutacion.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
