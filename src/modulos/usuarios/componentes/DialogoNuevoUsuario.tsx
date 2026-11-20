import { useState, type ChangeEvent, type SubmitEvent } from "react";
import { toast } from "sonner";
import { Campo } from "@/compartido/componentes/Campo";
import { ErrorFormulario } from "@/compartido/componentes/ErrorFormulario";
import { propsError } from "@/compartido/lib/accesibilidad";
import { mensajeDeError } from "@/compartido/lib/errores";
import {
  hayErrores,
  LARGO_MAXIMO_EMAIL,
  LARGO_MAXIMO_NOMBRE,
  type Errores,
} from "@/compartido/lib/validaciones";
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
import { useAccionUsuario } from "../api/consultas";
import { validarUsuarioNuevo, type DatosUsuarioNuevo } from "../lib/validaciones";
import { SelectorRol } from "./SelectorRol";

const VACIO: DatosUsuarioNuevo = { nombre: "", email: "", password: "" };

export function DialogoNuevoUsuario({
  abierto,
  onCambiarAbierto,
}: {
  abierto: boolean;
  onCambiarAbierto: (abierto: boolean) => void;
}) {
  const mutacion = useAccionUsuario();
  const [datos, setDatos] = useState<DatosUsuarioNuevo>(VACIO);
  const [rol, setRol] = useState<Rol>("cajero");
  const [errores, setErrores] = useState<Errores<keyof DatosUsuarioNuevo>>({});
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  function cambiarAbierto(valor: boolean) {
    if (!valor) {
      setDatos(VACIO);
      setRol("cajero");
      setErrores({});
      setErrorServidor(null);
    }
    onCambiarAbierto(valor);
  }

  async function enviar(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    const nuevos = validarUsuarioNuevo(datos);
    setErrores(nuevos);
    if (hayErrores(nuevos)) return;
    setErrorServidor(null);
    try {
      const usuario = await mutacion.mutateAsync({ accion: "crear", ...datos, rol });
      toast.success(`Usuario ${usuario.nombre} creado`);
      cambiarAbierto(false);
    } catch (e) {
      setErrorServidor(mensajeDeError(e));
    }
  }

  const campo = (clave: keyof DatosUsuarioNuevo) => ({
    id: `nuevo-${clave}`,
    value: datos[clave],
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      setDatos({ ...datos, [clave]: e.target.value });
    },
    ...propsError(`nuevo-${clave}`, errores[clave]),
  });

  return (
    <Dialog open={abierto} onOpenChange={cambiarAbierto}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo usuario</DialogTitle>
          <DialogDescription>Podrá ingresar con este email y contraseña.</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => void enviar(e)} noValidate>
          <Campo id="nuevo-nombre" etiqueta="Nombre" error={errores.nombre}>
            <Input {...campo("nombre")} autoFocus maxLength={LARGO_MAXIMO_NOMBRE} />
          </Campo>
          <Campo id="nuevo-email" etiqueta="Email" error={errores.email}>
            <Input
              {...campo("email")}
              type="email"
              autoComplete="off"
              maxLength={LARGO_MAXIMO_EMAIL}
            />
          </Campo>
          <Campo id="nuevo-password" etiqueta="Contraseña" error={errores.password}>
            <Input {...campo("password")} type="password" autoComplete="new-password" />
          </Campo>
          <Campo id="nuevo-rol" etiqueta="Rol">
            <SelectorRol id="nuevo-rol" valor={rol} onCambio={setRol} />
          </Campo>
          <ErrorFormulario mensaje={errorServidor} />
          <DialogFooter>
            <Button type="submit" disabled={mutacion.isPending}>
              {mutacion.isPending ? "Creando…" : "Crear usuario"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
