import { useState } from "react";
import { toast } from "sonner";
import { ErrorFormulario } from "@/compartido/componentes/ErrorFormulario";
import { mensajeDeError } from "@/compartido/lib/errores";
import { Button } from "@/compartido/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/compartido/ui/dialog";
import { useEliminarCategoriaGasto, type CategoriaGasto } from "../api/consultas";

/**
 * Confirma la eliminación de un rubro (con sus subcategorías) o una subcategoría. Solo se puede si
 * no tiene gastos: si tiene, la BD lo rechaza y el mensaje dice que se desactive.
 */
export function DialogoEliminarCategoriaGasto({
  categoria,
  subcategorias,
  onCerrar,
}: {
  categoria: CategoriaGasto;
  /** Las subcategorías del rubro (vacío en una subcategoría). */
  subcategorias: readonly CategoriaGasto[];
  onCerrar: () => void;
}) {
  const eliminar = useEliminarCategoriaGasto();
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const esRubro = categoria.padre_id === null;
  const nombre = `${esRubro ? "el rubro" : "la subcategoría"} “${categoria.nombre}”`;

  async function confirmar() {
    setErrorServidor(null);
    try {
      await eliminar.mutateAsync(categoria.id);
      toast.success(
        esRubro
          ? `Rubro ${categoria.nombre} eliminado`
          : `Subcategoría ${categoria.nombre} eliminada`,
      );
      onCerrar();
    } catch (e) {
      setErrorServidor(mensajeDeError(e));
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(abierto) => {
        if (!abierto && !eliminar.isPending) onCerrar();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eliminar {esRubro ? "rubro" : "subcategoría"}</DialogTitle>
          <DialogDescription>
            ¿Eliminar {nombre}?
            {esRubro &&
              subcategorias.length > 0 &&
              ` También se eliminan sus ${String(subcategorias.length)} subcategorías.`}{" "}
            Solo se puede si no tiene gastos; si ya se usó, desactivala.
          </DialogDescription>
        </DialogHeader>
        <ErrorFormulario mensaje={errorServidor} />
        <DialogFooter>
          <Button variant="outline" disabled={eliminar.isPending} onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={eliminar.isPending}
            onClick={() => void confirmar()}
          >
            {eliminar.isPending ? "Eliminando…" : "Eliminar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
