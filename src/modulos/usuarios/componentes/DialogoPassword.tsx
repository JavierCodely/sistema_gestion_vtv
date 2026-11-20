import { useState, type SubmitEvent } from "react";
import { toast } from "sonner";
import { Campo } from "@/compartido/componentes/Campo";
import { ErrorFormulario } from "@/compartido/componentes/ErrorFormulario";
import { propsError } from "@/compartido/lib/accesibilidad";
import { mensajeDeError } from "@/compartido/lib/errores";
import { validarPassword } from "@/compartido/lib/validaciones";
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

export function DialogoPassword({
  usuario,
  onCerrar,
}: {
  usuario: UsuarioAdmin;
  onCerrar: () => void;
}) {
  const mutacion = useAccionUsuario();
  const [password, setPassword] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  async function enviar(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    const errorPassword = validarPassword(password, confirmacion);
    setError(errorPassword);
    if (errorPassword) return;
    setErrorServidor(null);
    try {
      await mutacion.mutateAsync({ accion: "cambiar_password", id: usuario.id, password });
      toast.success(`Contraseña de ${usuario.nombre} actualizada`);
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
          <DialogTitle>Cambiar contraseña</DialogTitle>
          <DialogDescription>{usuario.nombre}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => void enviar(e)} noValidate>
          <Campo id="password-nueva" etiqueta="Nueva contraseña">
            <Input
              id="password-nueva"
              type="password"
              autoComplete="new-password"
              autoFocus
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
              }}
            />
          </Campo>
          <Campo id="password-confirmacion" etiqueta="Repetir contraseña" error={error}>
            <Input
              id="password-confirmacion"
              type="password"
              autoComplete="new-password"
              value={confirmacion}
              onChange={(e) => {
                setConfirmacion(e.target.value);
              }}
              {...propsError("password-confirmacion", error)}
            />
          </Campo>
          <ErrorFormulario mensaje={errorServidor} />
          <DialogFooter>
            <Button type="submit" disabled={mutacion.isPending}>
              {mutacion.isPending ? "Guardando…" : "Cambiar contraseña"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
