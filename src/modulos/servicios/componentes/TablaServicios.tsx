import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { formatearMoneda } from "@/compartido/lib/formato";
import { mensajeDeError } from "@/compartido/lib/errores";
import { Badge } from "@/compartido/ui/badge";
import { Button } from "@/compartido/ui/button";
import { Label } from "@/compartido/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/compartido/ui/select";
import { Switch } from "@/compartido/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/compartido/ui/table";
import { useActualizarServicio, type Categoria, type Servicio } from "../api/consultas";
import { DialogoServicio } from "./DialogoServicio";

const TODAS = "todas";

export function TablaServicios({
  categorias,
  servicios,
}: {
  categorias: Categoria[];
  servicios: Servicio[];
}) {
  const actualizar = useActualizarServicio();
  const [filtro, setFiltro] = useState(TODAS);
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const [editando, setEditando] = useState<Servicio | null>(null);

  const categoriaPorId = new Map(categorias.map((c) => [c.id, c]));
  const visibles =
    filtro === TODAS ? servicios : servicios.filter((s) => String(s.categoria_id) === filtro);
  const hayCategoriasActivas = categorias.some((c) => c.activa);

  async function cambiarActivo(servicio: Servicio, activo: boolean) {
    try {
      await actualizar.mutateAsync({ id: servicio.id, cambios: { activo } });
      toast.success(`Servicio “${servicio.nombre}” ${activo ? "activado" : "desactivado"}`);
    } catch (e) {
      toast.error(mensajeDeError(e));
    }
  }

  return (
    <section aria-labelledby="titulo-servicios" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="titulo-servicios" className="text-lg font-semibold">
            Servicios
          </h2>
          <p className="text-sm text-muted-foreground">
            Lo que se cobra en caja. Un servicio desactivado deja de ofrecerse, pero sus ventas
            quedan en el historial.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="filtro-categoria" className="text-xs text-muted-foreground">
              Filtrar por categoría
            </Label>
            <Select value={filtro} onValueChange={setFiltro}>
              <SelectTrigger id="filtro-categoria" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Todas</SelectItem>
                {categorias.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            disabled={!hayCategoriasActivas}
            {...(!hayCategoriasActivas && { "aria-describedby": "sin-categorias-activas" })}
            onClick={() => {
              setNuevoAbierto(true);
            }}
          >
            <Plus aria-hidden />
            Nuevo servicio
          </Button>
        </div>
      </div>
      {!hayCategoriasActivas && (
        <p id="sin-categorias-activas" className="text-sm text-muted-foreground">
          Para cargar servicios, primero creá o activá una categoría.
        </p>
      )}

      {visibles.length === 0 ? (
        <p className="rounded-md border p-6 text-center text-muted-foreground">
          {servicios.length === 0
            ? "Todavía no hay servicios."
            : "No hay servicios en esta categoría."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead>Hoja</TableHead>
                <TableHead>Activo</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibles.map((servicio) => {
                const categoria = categoriaPorId.get(servicio.categoria_id);
                return (
                  <TableRow key={servicio.id} data-testid={`servicio-${servicio.nombre}`}>
                    <TableCell className="font-medium">{servicio.nombre}</TableCell>
                    <TableCell>
                      {categoria?.nombre}
                      {categoria && !categoria.activa && (
                        <span className="text-muted-foreground"> (desactivada)</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatearMoneda(servicio.precio)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={servicio.requiere_certificado ? "default" : "secondary"}>
                        {servicio.requiere_certificado ? "Usa hoja" : "Sin hoja"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={servicio.activo}
                        disabled={actualizar.isPending}
                        aria-label={`Servicio ${servicio.nombre} activo`}
                        onCheckedChange={(activo) => void cambiarActivo(servicio, activo)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Editar servicio ${servicio.nombre}`}
                        onClick={() => {
                          setEditando(servicio);
                        }}
                      >
                        <Pencil aria-hidden />
                        Editar
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {nuevoAbierto && (
        <DialogoServicio
          categorias={categorias}
          {...(filtro !== TODAS && { categoriaInicial: Number(filtro) })}
          onCerrar={() => {
            setNuevoAbierto(false);
          }}
        />
      )}
      {editando && (
        <DialogoServicio
          servicio={editando}
          categorias={categorias}
          onCerrar={() => {
            setEditando(null);
          }}
        />
      )}
    </section>
  );
}
