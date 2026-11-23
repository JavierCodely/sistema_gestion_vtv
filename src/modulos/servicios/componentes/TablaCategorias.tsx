import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DialogoNombre } from "@/compartido/componentes/DialogoNombre";
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
import {
  MENSAJES_ERROR_CATEGORIA,
  useActualizarCategoria,
  useCrearCategoria,
  type Categoria,
  type Servicio,
} from "../api/consultas";

export function TablaCategorias({
  categorias,
  servicios,
}: {
  categorias: Categoria[];
  servicios: Servicio[];
}) {
  const crear = useCrearCategoria();
  const actualizar = useActualizarCategoria();
  const [nuevaAbierta, setNuevaAbierta] = useState(false);
  const [editando, setEditando] = useState<Categoria | null>(null);

  const cantidadServicios = (id: number) => servicios.filter((s) => s.categoria_id === id).length;

  async function cambiarActiva(categoria: Categoria, activa: boolean) {
    try {
      await actualizar.mutateAsync({ id: categoria.id, cambios: { activa } });
      toast.success(`Categoría “${categoria.nombre}” ${activa ? "activada" : "desactivada"}`);
    } catch (e) {
      toast.error(mensajeDeError(e));
    }
  }

  return (
    <section aria-labelledby="titulo-categorias" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="titulo-categorias" className="text-lg font-semibold">
            Categorías
          </h2>
          <p className="text-sm text-muted-foreground">
            Agrupan los servicios. Los servicios de una categoría desactivada no se ofrecen en caja.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setNuevaAbierta(true);
          }}
        >
          <Plus aria-hidden />
          Nueva categoría
        </Button>
      </div>

      {categorias.length === 0 ? (
        <p className="rounded-md border p-6 text-center text-muted-foreground">
          Todavía no hay categorías. Creá una antes de cargar servicios.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead className="text-right">Servicios</TableHead>
                <TableHead>Activa</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categorias.map((categoria) => (
                <TableRow key={categoria.id} data-testid={`categoria-${categoria.nombre}`}>
                  <TableCell className="font-medium">{categoria.nombre}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {cantidadServicios(categoria.id)}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={categoria.activa}
                      disabled={actualizar.isPending}
                      aria-label={`Categoría ${categoria.nombre} activa`}
                      onCheckedChange={(activa) => void cambiarActiva(categoria, activa)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Editar categoría ${categoria.nombre}`}
                      onClick={() => {
                        setEditando(categoria);
                      }}
                    >
                      <Pencil aria-hidden />
                      Editar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {nuevaAbierta && (
        <DialogoNombre
          titulo="Nueva categoría"
          descripcion="Por ejemplo: Vehicular, Motos, Carga."
          textoBoton="Crear categoría"
          mensajesError={MENSAJES_ERROR_CATEGORIA}
          onGuardar={async (nombre) => {
            const categoria = await crear.mutateAsync(nombre);
            toast.success(`Categoría “${categoria.nombre}” creada`);
          }}
          onCerrar={() => {
            setNuevaAbierta(false);
          }}
        />
      )}
      {editando && (
        <DialogoNombre
          titulo="Editar categoría"
          valorInicial={editando.nombre}
          textoBoton="Guardar"
          mensajesError={MENSAJES_ERROR_CATEGORIA}
          onGuardar={async (nombre) => {
            await actualizar.mutateAsync({ id: editando.id, cambios: { nombre } });
            toast.success("Cambios guardados");
          }}
          onCerrar={() => {
            setEditando(null);
          }}
        />
      )}
    </section>
  );
}
