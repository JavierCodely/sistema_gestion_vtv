import { useState, type SubmitEvent } from "react";
import { toast } from "sonner";
import { Campo } from "@/compartido/componentes/Campo";
import { ErrorFormulario } from "@/compartido/componentes/ErrorFormulario";
import { propsError } from "@/compartido/lib/accesibilidad";
import { mensajeDeError } from "@/compartido/lib/errores";
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
import { Switch } from "@/compartido/ui/switch";
import {
  MENSAJES_ERROR_CATEGORIA_GASTO,
  useActualizarCategoriaGasto,
  useCrearCategoriaGasto,
  type CategoriaGasto,
} from "../api/consultas";

export type ModoCategoria =
  | { tipo: "rubro" }
  | { tipo: "subcategoria"; rubro: CategoriaGasto }
  | { tipo: "editar"; categoria: CategoriaGasto };

const TITULOS: Record<ModoCategoria["tipo"], string> = {
  rubro: "Nuevo rubro",
  subcategoria: "Nueva subcategoría",
  editar: "Renombrar categoría",
};

/** Alta de rubro o subcategoría, o cambio de nombre. Activar/desactivar se hace en la lista. */
export function DialogoCategoriaGasto({
  modo,
  onCerrar,
}: {
  modo: ModoCategoria;
  onCerrar: () => void;
}) {
  const crear = useCrearCategoriaGasto();
  const actualizar = useActualizarCategoriaGasto();
  const [nombre, setNombre] = useState(modo.tipo === "editar" ? modo.categoria.nombre : "");
  const [habilitadaCaja, setHabilitadaCaja] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const pendiente = crear.isPending || actualizar.isPending;

  async function enviar(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    const errorNombre = validarNombre(nombre);
    setError(errorNombre);
    if (errorNombre) return;
    setErrorServidor(null);
    try {
      if (modo.tipo === "editar") {
        const categoria = await actualizar.mutateAsync({
          id: modo.categoria.id,
          cambios: { nombre },
        });
        toast.success(`Categoría «${categoria.nombre}» guardada`);
      } else {
        const categoria = await crear.mutateAsync({
          nombre,
          padre_id: modo.tipo === "subcategoria" ? modo.rubro.id : null,
          habilitada_caja: modo.tipo === "subcategoria" && habilitadaCaja,
        });
        toast.success(`Categoría «${categoria.nombre}» creada`);
      }
      onCerrar();
    } catch (e) {
      setErrorServidor(mensajeDeError(e, MENSAJES_ERROR_CATEGORIA_GASTO));
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
          <DialogTitle>{TITULOS[modo.tipo]}</DialogTitle>
          <DialogDescription>
            {modo.tipo === "rubro"
              ? "Un rubro agrupa subcategorías. Los gastos se cargan siempre en una subcategoría."
              : modo.tipo === "subcategoria"
                ? `Dentro del rubro ${modo.rubro.nombre}.`
                : modo.categoria.nombre}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => void enviar(e)} noValidate>
          <Campo id="categoria-gasto-nombre" etiqueta="Nombre" error={error}>
            <Input
              id="categoria-gasto-nombre"
              autoComplete="off"
              autoFocus
              maxLength={LARGO_MAXIMO_NOMBRE}
              value={nombre}
              onChange={(e) => {
                setNombre(e.target.value);
              }}
              {...propsError("categoria-gasto-nombre", error)}
            />
          </Campo>
          {modo.tipo === "subcategoria" && (
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={habilitadaCaja} onCheckedChange={setHabilitadaCaja} />
              El cajero puede cargar gastos en esta subcategoría
            </label>
          )}
          <ErrorFormulario mensaje={errorServidor} />
          <DialogFooter>
            <Button type="submit" disabled={pendiente}>
              {pendiente ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
