import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Cargando } from "@/compartido/componentes/Cargando";
import { DialogoNombre } from "@/compartido/componentes/DialogoNombre";
import { mensajeDeError } from "@/compartido/lib/errores";
import { Alert, AlertDescription } from "@/compartido/ui/alert";
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
  MENSAJES_ERROR_CAJA,
  useActualizarCaja,
  useCajas,
  useCrearCaja,
  type Caja,
} from "../api/consultas";

export function Cajas() {
  const cajas = useCajas();
  const crear = useCrearCaja();
  const actualizar = useActualizarCaja();
  const [nuevaAbierta, setNuevaAbierta] = useState(false);
  const [editando, setEditando] = useState<Caja | null>(null);

  async function cambiarActiva(caja: Caja, activa: boolean) {
    try {
      await actualizar.mutateAsync({ id: caja.id, cambios: { activa } });
      toast.success(`Caja “${caja.nombre}” ${activa ? "activada" : "desactivada"}`);
    } catch (e) {
      toast.error(mensajeDeError(e));
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Cajas</h1>
          <p className="text-sm text-muted-foreground">
            Puestos de cobro. Una caja desactivada no se puede usar para abrir turnos.
          </p>
        </div>
        <Button
          onClick={() => {
            setNuevaAbierta(true);
          }}
        >
          <Plus aria-hidden />
          Nueva caja
        </Button>
      </div>

      {cajas.isPending ? (
        <Cargando texto="Cargando cajas…" />
      ) : cajas.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{mensajeDeError(cajas.error)}</AlertDescription>
        </Alert>
      ) : cajas.data.length === 0 ? (
        <p className="rounded-md border p-6 text-center text-muted-foreground">
          Todavía no hay cajas. Creá la primera con “Nueva caja”.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Activa</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cajas.data.map((caja) => (
                <TableRow key={caja.id} data-testid={`caja-${caja.nombre}`}>
                  <TableCell className="font-medium">{caja.nombre}</TableCell>
                  <TableCell>
                    <Switch
                      checked={caja.activa}
                      disabled={actualizar.isPending}
                      aria-label={`Caja ${caja.nombre} activa`}
                      onCheckedChange={(activa) => void cambiarActiva(caja, activa)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Editar ${caja.nombre}`}
                      onClick={() => {
                        setEditando(caja);
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
          titulo="Nueva caja"
          descripcion="Por ejemplo: Caja 1, Box 2."
          textoBoton="Crear caja"
          mensajesError={MENSAJES_ERROR_CAJA}
          onGuardar={async (nombre) => {
            const caja = await crear.mutateAsync(nombre);
            toast.success(`Caja “${caja.nombre}” creada`);
          }}
          onCerrar={() => {
            setNuevaAbierta(false);
          }}
        />
      )}
      {editando && (
        <DialogoNombre
          titulo="Editar caja"
          valorInicial={editando.nombre}
          textoBoton="Guardar"
          mensajesError={MENSAJES_ERROR_CAJA}
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
