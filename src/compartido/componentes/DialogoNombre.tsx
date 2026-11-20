import { useState, type SubmitEvent } from "react";
import { Campo } from "@/compartido/componentes/Campo";
import { ErrorFormulario } from "@/compartido/componentes/ErrorFormulario";
import { propsError } from "@/compartido/lib/accesibilidad";
import { mensajeDeError, type MensajesPorCodigo } from "@/compartido/lib/errores";
import { LARGO_MAXIMO_NOMBRE, validarNombre } from "@/compartido/lib/validaciones";
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

/**
 * Alta/edición de un registro de catálogo que solo tiene nombre (cajas, categorías…).
 * Se monta abierto: para cerrarlo, el padre deja de renderizarlo (así el estado se reinicia).
 */
export function DialogoNombre({
  titulo,
  descripcion,
  valorInicial = "",
  textoBoton,
  mensajesError,
  onGuardar,
  onCerrar,
}: {
  titulo: string;
  descripcion?: string;
  valorInicial?: string;
  textoBoton: string;
  mensajesError?: MensajesPorCodigo;
  /** Debe lanzar el error si falla: se muestra en el formulario. */
  onGuardar: (nombre: string) => Promise<void>;
  onCerrar: () => void;
}) {
  const [nombre, setNombre] = useState(valorInicial);
  const [error, setError] = useState<string | undefined>();
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function enviar(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    const errorNombre = validarNombre(nombre);
    setError(errorNombre);
    if (errorNombre) return;
    setErrorServidor(null);
    setGuardando(true);
    try {
      await onGuardar(nombre.trim());
      onCerrar();
    } catch (e) {
      setErrorServidor(mensajeDeError(e, mensajesError));
    } finally {
      setGuardando(false);
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
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descripcion ?? "Completá el nombre."}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => void enviar(e)} noValidate>
          <Campo id="dialogo-nombre" etiqueta="Nombre" error={error}>
            <Input
              id="dialogo-nombre"
              value={nombre}
              maxLength={LARGO_MAXIMO_NOMBRE}
              autoFocus
              autoComplete="off"
              onChange={(e) => {
                setNombre(e.target.value);
              }}
              {...propsError("dialogo-nombre", error)}
            />
          </Campo>
          <ErrorFormulario mensaje={errorServidor} />
          <DialogFooter>
            <Button type="submit" disabled={guardando}>
              {guardando ? "Guardando…" : textoBoton}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
