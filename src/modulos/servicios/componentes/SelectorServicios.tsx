import { formatearMoneda } from "@/compartido/lib/formato";
import { cn } from "@/compartido/lib/utils";
import { Badge } from "@/compartido/ui/badge";
import { Label } from "@/compartido/ui/label";
import { Switch } from "@/compartido/ui/switch";
import type { Categoria, Servicio } from "../api/consultas";
import {
  agruparServicios,
  cambiarCategoria,
  cambiarServicio,
  estadoCategoria,
} from "../lib/seleccion-servicios";

/**
 * Todas las categorías con todos sus servicios (los desactivados, marcados), cada uno con su switch.
 * El de la categoría prende o apaga todos sus servicios y muestra si quedó parcial. Controlado:
 * `elegidos` y `onCambiar`. `idBase` arma los ids de los switches y los `data-testid` de cada
 * categoría (`<idBase>-<categoría>`). Lo usan descuentos e impuestos.
 */
export function SelectorServicios({
  categorias,
  servicios,
  elegidos,
  onCambiar,
  deshabilitado = false,
  idBase,
}: {
  categorias: Categoria[];
  servicios: Servicio[];
  elegidos: ReadonlySet<number>;
  onCambiar: (elegidos: Set<number>) => void;
  deshabilitado?: boolean;
  idBase: string;
}) {
  const grupos = agruparServicios(categorias, servicios);
  if (grupos.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no hay servicios cargados.</p>;
  }
  return (
    <>
      {grupos.map(({ categoria, servicios: deCategoria }) => {
        const estado = estadoCategoria(deCategoria, elegidos);
        const habilitados = deCategoria.filter((s) => elegidos.has(s.id)).length;
        const idCategoria = `${idBase}-categoria-${String(categoria.id)}`;
        return (
          <fieldset
            key={categoria.id}
            className="rounded-md border"
            data-testid={`${idBase}-${categoria.nombre}`}
          >
            <legend className="sr-only">{categoria.nombre}</legend>
            <div className="flex items-center justify-between gap-3 border-b bg-muted/40 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor={idCategoria} className="font-semibold">
                  {categoria.nombre}
                </Label>
                {!categoria.activa && <Badge variant="secondary">Desactivada</Badge>}
                <span id={`${idCategoria}-estado`} className="text-xs text-muted-foreground">
                  {deCategoria.length === 0
                    ? "Sin servicios"
                    : estado === "parcial"
                      ? `Parcial: ${String(habilitados)} de ${String(deCategoria.length)}`
                      : estado === "todos"
                        ? "Todos"
                        : "Ninguno"}
                </span>
              </div>
              <Switch
                id={idCategoria}
                aria-label={`Todos los servicios de ${categoria.nombre}`}
                aria-describedby={`${idCategoria}-estado`}
                data-parcial={estado === "parcial" || undefined}
                className={cn(estado === "parcial" && "data-unchecked:bg-primary/40")}
                checked={estado === "todos" && deCategoria.length > 0}
                disabled={deCategoria.length === 0 || deshabilitado}
                onCheckedChange={(habilitar) => {
                  onCambiar(cambiarCategoria(elegidos, deCategoria, habilitar));
                }}
              />
            </div>
            {deCategoria.length > 0 && (
              <ul className="divide-y">
                {deCategoria.map((servicio) => {
                  const idServicio = `${idBase}-servicio-${String(servicio.id)}`;
                  return (
                    <li
                      key={servicio.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 pl-6"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Label htmlFor={idServicio} className="font-normal">
                          {servicio.nombre}
                        </Label>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {formatearMoneda(servicio.precio)}
                        </span>
                        {!servicio.activo && <Badge variant="secondary">Desactivado</Badge>}
                      </div>
                      <Switch
                        id={idServicio}
                        checked={elegidos.has(servicio.id)}
                        disabled={deshabilitado}
                        onCheckedChange={(habilitar) => {
                          onCambiar(cambiarServicio(elegidos, servicio.id, habilitar));
                        }}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </fieldset>
        );
      })}
    </>
  );
}
