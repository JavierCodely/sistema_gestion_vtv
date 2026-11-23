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
import { Label } from "@/compartido/ui/label";
import { Switch } from "@/compartido/ui/switch";
import type { Categoria, Servicio } from "@/modulos/servicios/api/consultas";
import { SelectorServicios } from "@/modulos/servicios/componentes/SelectorServicios";
import { useFijarServiciosImpuesto, type Impuesto } from "../api/consultas";

/**
 * Servicios alcanzados por un impuesto: "Todos los servicios" (también los que se creen después) o
 * los elegidos con los switches por categoría. Se guarda de una vez (`fijar_servicios_impuesto`).
 */
export function DialogoServiciosImpuesto({
  impuesto,
  categorias,
  servicios,
  onCerrar,
}: {
  impuesto: Impuesto;
  categorias: Categoria[];
  servicios: Servicio[];
  onCerrar: () => void;
}) {
  const fijar = useFijarServiciosImpuesto();
  const [todos, setTodos] = useState(impuesto.todos_servicios);
  const [elegidos, setElegidos] = useState<Set<number>>(() => new Set(impuesto.servicioIds));
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  async function guardar() {
    setErrorServidor(null);
    try {
      await fijar.mutateAsync({
        id: impuesto.id,
        todos,
        servicioIds: [...elegidos].sort((a, b) => a - b),
      });
      toast.success(`Servicios de “${impuesto.nombre}” guardados`);
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
          <DialogTitle>Servicios de “{impuesto.nombre}”</DialogTitle>
          <DialogDescription>
            Elegí a qué servicios se aplica: todos (también los que crees después) o solo algunos.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between gap-3 rounded-md border p-3">
          <div>
            <Label htmlFor="impuesto-todos-servicios" className="font-semibold">
              Todos los servicios
            </Label>
            <p className="text-xs text-muted-foreground">
              Incluye los servicios que se creen más adelante.
            </p>
          </div>
          <Switch
            id="impuesto-todos-servicios"
            checked={todos}
            disabled={fijar.isPending}
            onCheckedChange={setTodos}
          />
        </div>
        {!todos && (
          <div className="flex max-h-[50vh] flex-col gap-4 overflow-y-auto pr-1">
            <SelectorServicios
              idBase="impuesto-servicios"
              categorias={categorias}
              servicios={servicios}
              elegidos={elegidos}
              onCambiar={setElegidos}
              deshabilitado={fijar.isPending}
            />
          </div>
        )}
        <ErrorFormulario mensaje={errorServidor} />
        <DialogFooter>
          <p className="mr-auto self-center text-sm text-muted-foreground">
            {todos
              ? "Todos los servicios"
              : elegidos.size === 1
                ? "1 servicio elegido"
                : `${String(elegidos.size)} servicios elegidos`}
          </p>
          <Button type="button" disabled={fijar.isPending} onClick={() => void guardar()}>
            {fijar.isPending ? "Guardando…" : "Guardar servicios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
