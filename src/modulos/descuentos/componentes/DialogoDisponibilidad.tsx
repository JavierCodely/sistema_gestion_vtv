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
import type { Categoria, Servicio } from "@/modulos/servicios/api/consultas";
import { SelectorServicios } from "@/modulos/servicios/componentes/SelectorServicios";
import { useFijarServiciosDescuento, type Descuento } from "../api/consultas";

/**
 * En qué servicios se puede usar un descuento: todas las categorías con todos sus servicios (los
 * desactivados, marcados), cada uno con su switch. El de la categoría prende o apaga todos sus
 * servicios y muestra si quedó parcial. Se guarda de una vez el conjunto que muestran los switches
 * (`fijar_servicios_descuento`, atómica).
 */
export function DialogoDisponibilidad({
  descuento,
  categorias,
  servicios,
  onCerrar,
}: {
  descuento: Descuento;
  categorias: Categoria[];
  servicios: Servicio[];
  onCerrar: () => void;
}) {
  const fijar = useFijarServiciosDescuento();
  const [elegidos, setElegidos] = useState<Set<number>>(() => new Set(descuento.servicioIds));
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  async function guardar() {
    setErrorServidor(null);
    try {
      await fijar.mutateAsync({
        id: descuento.id,
        servicioIds: [...elegidos].sort((a, b) => a - b),
      });
      toast.success(`Servicios de “${descuento.nombre}” guardados`);
      onCerrar();
    } catch (e) {
      setErrorServidor(mensajeDeError(e));
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(abierto) => {
        if (!abierto && !fijar.isPending) onCerrar();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Servicios de “{descuento.nombre}”</DialogTitle>
          <DialogDescription>
            Elegí en qué servicios se puede usar. Un servicio nuevo no se suma solo: habilitalo acá.
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
          <SelectorServicios
            idBase="disponibilidad"
            categorias={categorias}
            servicios={servicios}
            elegidos={elegidos}
            onCambiar={setElegidos}
            deshabilitado={fijar.isPending}
          />
        </div>
        <ErrorFormulario mensaje={errorServidor} />
        <DialogFooter>
          <p className="mr-auto self-center text-sm text-muted-foreground">
            {elegidos.size === 1
              ? "1 servicio habilitado"
              : `${String(elegidos.size)} servicios habilitados`}
          </p>
          <Button type="button" disabled={fijar.isPending} onClick={() => void guardar()}>
            {fijar.isPending ? "Guardando…" : "Guardar servicios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
