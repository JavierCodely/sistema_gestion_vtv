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
  MENSAJES_ERROR_IMPUESTO,
  TIPOS_IMPUESTO,
  useActualizarImpuesto,
  type Impuesto,
} from "../api/consultas";
import { formatearMedios, formatearServicios, formatearValorImpuesto } from "../lib/formato";
import { DialogoImpuesto } from "./DialogoImpuesto";
import { DialogoServiciosImpuesto } from "./DialogoServiciosImpuesto";

/**
 * Catálogo de impuestos: alta, edición, activar/desactivar (no se borran: las ventas guardan cuál se
 * les aplicó) y a qué servicios alcanza cada uno.
 */
export function TablaImpuestos({
  impuestos,
  categorias,
  servicios,
}: {
  impuestos: Impuesto[];
  categorias: Categoria[];
  servicios: Servicio[];
}) {
  const actualizar = useActualizarImpuesto();
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const [editando, setEditando] = useState<Impuesto | null>(null);
  const [eligiendoServicios, setEligiendoServicios] = useState<Impuesto | null>(null);

  async function cambiarActivo(impuesto: Impuesto, activo: boolean) {
    try {
      await actualizar.mutateAsync({ id: impuesto.id, cambios: { activo } });
      toast.success(`Impuesto “${impuesto.nombre}” ${activo ? "activado" : "desactivado"}`);
    } catch (e) {
      toast.error(mensajeDeError(e, MENSAJES_ERROR_IMPUESTO));
    }
  }

  return (
    <section aria-labelledby="titulo-lista-impuestos" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="titulo-lista-impuestos" className="text-lg font-semibold">
            Impuestos
          </h2>
          <p className="text-sm text-muted-foreground">
            No cambian lo que paga el cliente: de cada venta de los servicios y medios de pago
            alcanzados, el sistema calcula cuánto corresponde al impuesto y lo suma en el reporte.
          </p>
        </div>
        <Button
          onClick={() => {
            setNuevoAbierto(true);
          }}
        >
          <Plus aria-hidden />
          Nuevo impuesto
        </Button>
      </div>

      {impuestos.length === 0 ? (
        <p className="rounded-md border p-6 text-center text-muted-foreground">
          Todavía no hay impuestos.
        </p>
      ) : (
        <div className="md:overflow-x-auto md:rounded-md md:border">
          <Table apilada>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Medios de pago</TableHead>
                <TableHead>Servicios</TableHead>
                <TableHead>Activo</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {impuestos.map((impuesto) => (
                <TableRow key={impuesto.id} data-testid={`impuesto-${impuesto.nombre}`}>
                  <TableCell data-label="Nombre" className="font-medium">
                    {impuesto.nombre}
                  </TableCell>
                  <TableCell data-label="Tipo">{TIPOS_IMPUESTO[impuesto.tipo]}</TableCell>
                  <TableCell
                    data-label="Valor"
                    className="text-right whitespace-nowrap tabular-nums"
                  >
                    {formatearValorImpuesto(impuesto)}
                  </TableCell>
                  <TableCell data-label="Medios de pago">
                    {formatearMedios(impuesto.medios)}
                  </TableCell>
                  <TableCell data-label="Servicios">{formatearServicios(impuesto)}</TableCell>
                  <TableCell data-label="Activo">
                    <Switch
                      checked={impuesto.activo}
                      disabled={actualizar.isPending}
                      aria-label={`Impuesto ${impuesto.nombre} activo`}
                      onCheckedChange={(activo) => void cambiarActivo(impuesto, activo)}
                    />
                  </TableCell>
                  <TableCell data-acciones="" className="text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Servicios del impuesto ${impuesto.nombre}`}
                        onClick={() => {
                          setEligiendoServicios(impuesto);
                        }}
                      >
                        <ListChecks aria-hidden />
                        Servicios
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Editar impuesto ${impuesto.nombre}`}
                        onClick={() => {
                          setEditando(impuesto);
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
        <DialogoImpuesto
          onCerrar={() => {
            setNuevoAbierto(false);
          }}
        />
      )}
      {editando && (
        <DialogoImpuesto
          impuesto={editando}
          onCerrar={() => {
            setEditando(null);
          }}
        />
      )}
      {eligiendoServicios && (
        <DialogoServiciosImpuesto
          impuesto={eligiendoServicios}
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
