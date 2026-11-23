import { ListChecks, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { mensajeDeError } from "@/compartido/lib/errores";
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
import type { Categoria, Servicio } from "@/modulos/servicios/api/consultas";
import {
  MENSAJES_ERROR_DESCUENTO,
  TIPOS_DESCUENTO,
  useActualizarDescuento,
  type Descuento,
} from "../api/consultas";
import { formatearValorDescuento } from "../lib/formato";
import { DialogoDescuento } from "./DialogoDescuento";
import { DialogoDisponibilidad } from "./DialogoDisponibilidad";

/**
 * Catálogo de descuentos: alta, edición, activar/desactivar (no se borran: las ventas guardan cuál
 * usaron) y en qué servicios se puede usar cada uno.
 */
export function TablaDescuentos({
  descuentos,
  categorias,
  servicios,
}: {
  descuentos: Descuento[];
  categorias: Categoria[];
  servicios: Servicio[];
}) {
  const actualizar = useActualizarDescuento();
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const [editando, setEditando] = useState<Descuento | null>(null);
  const [eligiendoServicios, setEligiendoServicios] = useState<Descuento | null>(null);

  async function cambiarActivo(descuento: Descuento, activo: boolean) {
    try {
      await actualizar.mutateAsync({ id: descuento.id, cambios: { activo } });
      toast.success(`Descuento “${descuento.nombre}” ${activo ? "activado" : "desactivado"}`);
    } catch (e) {
      toast.error(mensajeDeError(e, MENSAJES_ERROR_DESCUENTO));
    }
  }

  return (
    <section aria-labelledby="titulo-lista-descuentos" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="titulo-lista-descuentos" className="text-lg font-semibold">
            Descuentos
          </h2>
          <p className="text-sm text-muted-foreground">
            Se ofrecen en la caja solo si están activos y habilitados para el servicio. Un descuento
            desactivado deja de ofrecerse, pero las ventas que lo usaron lo conservan.
          </p>
        </div>
        <Button
          onClick={() => {
            setNuevoAbierto(true);
          }}
        >
          <Plus aria-hidden />
          Nuevo descuento
        </Button>
      </div>

      {descuentos.length === 0 ? (
        <p className="rounded-md border p-6 text-center text-muted-foreground">
          Todavía no hay descuentos.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Servicios</TableHead>
                <TableHead>Activo</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {descuentos.map((descuento) => (
                <TableRow key={descuento.id} data-testid={`descuento-${descuento.nombre}`}>
                  <TableCell className="font-medium">{descuento.nombre}</TableCell>
                  <TableCell>{TIPOS_DESCUENTO[descuento.tipo]}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatearValorDescuento(descuento)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {descuento.servicioIds.length}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={descuento.activo}
                      disabled={actualizar.isPending}
                      aria-label={`Descuento ${descuento.nombre} activo`}
                      onCheckedChange={(activo) => void cambiarActivo(descuento, activo)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Servicios del descuento ${descuento.nombre}`}
                        onClick={() => {
                          setEligiendoServicios(descuento);
                        }}
                      >
                        <ListChecks aria-hidden />
                        Servicios
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Editar descuento ${descuento.nombre}`}
                        onClick={() => {
                          setEditando(descuento);
                        }}
                      >
                        <Pencil aria-hidden />
                        Editar
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {nuevoAbierto && (
        <DialogoDescuento
          onCerrar={() => {
            setNuevoAbierto(false);
          }}
        />
      )}
      {editando && (
        <DialogoDescuento
          descuento={editando}
          onCerrar={() => {
            setEditando(null);
          }}
        />
      )}
      {eligiendoServicios && (
        <DialogoDisponibilidad
          descuento={eligiendoServicios}
          categorias={categorias}
          servicios={servicios}
          onCerrar={() => {
            setEligiendoServicios(null);
          }}
        />
      )}
    </section>
  );
}
