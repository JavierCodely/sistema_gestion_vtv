import { useState } from "react";
import { toast } from "sonner";
import { ErrorFormulario } from "@/compartido/componentes/ErrorFormulario";
import { mensajeDeError } from "@/compartido/lib/errores";
import { Badge } from "@/compartido/ui/badge";
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
import {
  MENSAJES_ERROR_CERTIFICADO,
  useFijarDestinosCertificado,
  type CertificadoConStock,
} from "../api/consultas";
import {
  agruparPorCategoria,
  cambiarCategoriaEntera,
  cambiarServicioSuelto,
  destinosParaGuardar,
  resumirDestinos,
  type Destinos,
} from "../lib/destinos";

/**
 * "Se usa en": todos los servicios, o categorías enteras (también los servicios que se agreguen
 * después) y/o servicios sueltos, mezclados. Se guarda de una vez (`fijar_destinos_certificado`).
 */
export function DialogoDestinosCertificado({
  certificado,
  categorias,
  servicios,
  onCerrar,
}: {
  certificado: Pick<
    CertificadoConStock,
    "id" | "nombre" | "todos_servicios" | "categoria_ids" | "servicio_ids"
  >;
  categorias: Categoria[];
  servicios: Servicio[];
  onCerrar: () => void;
}) {
  const fijar = useFijarDestinosCertificado();
  const [destinos, setDestinos] = useState<Destinos>(() => ({
    todos: certificado.todos_servicios,
    categorias: new Set(certificado.categoria_ids),
    servicios: new Set(certificado.servicio_ids),
  }));
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const grupos = agruparPorCategoria(categorias, servicios);

  async function guardar() {
    setErrorServidor(null);
    try {
      await fijar.mutateAsync({ id: certificado.id, ...destinosParaGuardar(destinos) });
      toast.success(`Guardado dónde se usa “${certificado.nombre}”`);
      onCerrar();
    } catch (e) {
      setErrorServidor(mensajeDeError(e, MENSAJES_ERROR_CERTIFICADO));
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
          <DialogTitle>Dónde se usa “{certificado.nombre}”</DialogTitle>
          <DialogDescription>
            Elegí categorías enteras y/o servicios sueltos. En cada venta se usa el certificado
            activo más específico: el del servicio, después el de su categoría y por último el de
            todos los servicios.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between gap-3 rounded-md border p-3">
          <div>
            <Label htmlFor="certificado-todos-servicios" className="font-semibold">
              Todos los servicios
            </Label>
            <p className="text-xs text-muted-foreground">
              Incluye los servicios que se creen más adelante.
            </p>
          </div>
          <Switch
            id="certificado-todos-servicios"
            checked={destinos.todos}
            disabled={fijar.isPending}
            onCheckedChange={(todos) => {
              setDestinos((actual) => ({ ...actual, todos }));
            }}
          />
        </div>
        {!destinos.todos && (
          <div className="flex max-h-[50vh] flex-col gap-4 overflow-y-auto pr-1">
            {grupos.length === 0 && (
              <p className="text-sm text-muted-foreground">Todavía no hay categorías cargadas.</p>
            )}
            {grupos.map(({ categoria, servicios: deCategoria }) => {
              const entera = destinos.categorias.has(categoria.id);
              const idCategoria = `certificado-categoria-${String(categoria.id)}`;
              return (
                <fieldset
                  key={categoria.id}
                  className="rounded-md border"
                  data-testid={`destinos-${categoria.nombre}`}
                >
                  <legend className="sr-only">{categoria.nombre}</legend>
                  <div className="flex items-center justify-between gap-3 border-b bg-muted/40 p-3">
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Label htmlFor={idCategoria} className="font-semibold">
                          {categoria.nombre}
                        </Label>
                        {!categoria.activa && <Badge variant="secondary">Desactivada</Badge>}
                      </div>
                      <span id={`${idCategoria}-ayuda`} className="text-xs text-muted-foreground">
                        Toda la categoría, también los servicios que se agreguen después.
                      </span>
                    </div>
                    <Switch
                      id={idCategoria}
                      aria-label={`Toda la categoría ${categoria.nombre}`}
                      aria-describedby={`${idCategoria}-ayuda`}
                      checked={entera}
                      disabled={fijar.isPending}
                      onCheckedChange={(valor) => {
                        setDestinos((actual) =>
                          cambiarCategoriaEntera(actual, categoria.id, deCategoria, valor),
                        );
                      }}
                    />
                  </div>
                  {deCategoria.length > 0 && (
                    <ul className="divide-y">
                      {deCategoria.map((servicio) => {
                        const idServicio = `certificado-servicio-${String(servicio.id)}`;
                        return (
                          <li
                            key={servicio.id}
                            className="flex items-center justify-between gap-3 px-3 py-2 pl-6"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <Label htmlFor={idServicio} className="font-normal">
                                {servicio.nombre}
                              </Label>
                              {entera && (
                                <span className="text-xs text-muted-foreground">
                                  Incluido por la categoría
                                </span>
                              )}
                              {!servicio.requiere_certificado && (
                                <Badge variant="outline">No usa hoja</Badge>
                              )}
                              {!servicio.activo && <Badge variant="secondary">Desactivado</Badge>}
                            </div>
                            <Switch
                              id={idServicio}
                              checked={entera || destinos.servicios.has(servicio.id)}
                              disabled={entera || fijar.isPending}
                              onCheckedChange={(valor) => {
                                setDestinos((actual) =>
                                  cambiarServicioSuelto(actual, servicio.id, valor),
                                );
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
          </div>
        )}
        <ErrorFormulario mensaje={errorServidor} />
        <DialogFooter>
          <p
            className="mr-auto self-center text-sm text-muted-foreground"
            data-testid="resumen-destinos"
          >
            {resumirDestinos(destinos)}
          </p>
          <Button type="button" disabled={fijar.isPending} onClick={() => void guardar()}>
            {fijar.isPending ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
