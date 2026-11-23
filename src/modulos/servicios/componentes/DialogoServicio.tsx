import { useState, type SubmitEvent } from "react";
import { toast } from "sonner";
import { Campo } from "@/compartido/componentes/Campo";
import { ErrorFormulario } from "@/compartido/componentes/ErrorFormulario";
import { propsError } from "@/compartido/lib/accesibilidad";
import { mensajeDeError } from "@/compartido/lib/errores";
import { LARGO_MAXIMO_NOMBRE, montoComoTexto } from "@/compartido/lib/validaciones";
import { Button } from "@/compartido/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/compartido/ui/dialog";
import { Input } from "@/compartido/ui/input";
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
  MENSAJES_ERROR_SERVICIO,
  useActualizarServicio,
  useCrearServicio,
  type Categoria,
  type Servicio,
} from "../api/consultas";
import {
  validarServicio,
  type ErroresServicio,
  type FormularioServicio,
} from "../lib/validaciones";

/** Alta (sin `servicio`) o edición de un servicio. Se monta abierto; el padre lo desmonta al cerrar. */
export function DialogoServicio({
  servicio,
  categorias,
  categoriaInicial,
  onCerrar,
}: {
  servicio?: Servicio;
  categorias: Categoria[];
  categoriaInicial?: number;
  onCerrar: () => void;
}) {
  const crear = useCrearServicio();
  const actualizar = useActualizarServicio();
  // Solo categorías activas, salvo la que ya tiene el servicio (para no perderla al editar).
  const opciones = categorias.filter((c) => c.activa || c.id === servicio?.categoria_id);
  const idInicial = servicio?.categoria_id ?? categoriaInicial;
  const [formulario, setFormulario] = useState<FormularioServicio>(() => ({
    nombre: servicio?.nombre ?? "",
    // Una categoría que no se puede elegir (ej. desactivada) no se preselecciona.
    categoriaId: opciones.some((c) => c.id === idInicial) ? String(idInicial) : "",
    precio: servicio ? montoComoTexto(servicio.precio) : "",
    requiereCertificado: servicio?.requiere_certificado ?? true,
  }));
  const [errores, setErrores] = useState<ErroresServicio>({});
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const guardando = crear.isPending || actualizar.isPending;

  function cambiar<K extends keyof FormularioServicio>(clave: K, valor: FormularioServicio[K]) {
    setFormulario((actual) => ({ ...actual, [clave]: valor }));
  }

  async function enviar(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    const resultado = validarServicio(formulario);
    setErrores(resultado.errores ?? {});
    if (!resultado.datos) return;
    setErrorServidor(null);
    try {
      if (servicio) {
        await actualizar.mutateAsync({ id: servicio.id, cambios: resultado.datos });
        toast.success("Cambios guardados");
      } else {
        const creado = await crear.mutateAsync(resultado.datos);
        toast.success(`Servicio “${creado.nombre}” creado`);
      }
      onCerrar();
    } catch (e) {
      setErrorServidor(mensajeDeError(e, MENSAJES_ERROR_SERVICIO));
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(abierto) => {
        if (!abierto) onCerrar();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{servicio ? "Editar servicio" : "Nuevo servicio"}</DialogTitle>
          <DialogDescription>
            {servicio
              ? "Un cambio de precio no modifica las ventas ya registradas."
              : "Lo que se cobra en caja."}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => void enviar(e)} noValidate>
          <Campo id="servicio-nombre" etiqueta="Nombre" error={errores.nombre}>
            <Input
              id="servicio-nombre"
              value={formulario.nombre}
              maxLength={LARGO_MAXIMO_NOMBRE}
              autoFocus
              autoComplete="off"
              onChange={(e) => {
                cambiar("nombre", e.target.value);
              }}
              {...propsError("servicio-nombre", errores.nombre)}
            />
          </Campo>
          <Campo id="servicio-categoria" etiqueta="Categoría" error={errores.categoriaId}>
            <Select
              value={formulario.categoriaId}
              onValueChange={(valor) => {
                cambiar("categoriaId", valor);
              }}
            >
              <SelectTrigger
                id="servicio-categoria"
                className="w-full"
                {...propsError("servicio-categoria", errores.categoriaId)}
              >
                <SelectValue placeholder="Elegí una categoría" />
              </SelectTrigger>
              <SelectContent>
                {opciones.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.nombre}
                    {!c.activa && " (desactivada)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
          <Campo id="servicio-precio" etiqueta="Precio ($)" error={errores.precio}>
            <Input
              id="servicio-precio"
              value={formulario.precio}
              inputMode="decimal"
              autoComplete="off"
              placeholder="Ej. 20000 o 20.000,50"
              onChange={(e) => {
                cambiar("precio", e.target.value);
              }}
              {...propsError("servicio-precio", errores.precio)}
            />
          </Campo>
          <div className="flex items-center justify-between gap-4 rounded-md border p-3">
            <div>
              <Label htmlFor="servicio-certificado">Usa hoja de certificado</Label>
              <p className="text-xs text-muted-foreground">
                Si está activo, cada venta descuenta una hoja del stock.
              </p>
            </div>
            <Switch
              id="servicio-certificado"
              checked={formulario.requiereCertificado}
              onCheckedChange={(valor) => {
                cambiar("requiereCertificado", valor);
              }}
            />
          </div>
          <ErrorFormulario mensaje={errorServidor} />
          <DialogFooter>
            <Button type="submit" disabled={guardando}>
              {guardando ? "Guardando…" : servicio ? "Guardar" : "Crear servicio"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
