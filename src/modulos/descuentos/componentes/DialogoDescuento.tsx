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
  MENSAJES_ERROR_DESCUENTO,
  TIPOS_DESCUENTO,
  useActualizarDescuento,
  useCrearDescuento,
  type Descuento,
  type TipoDescuento,
} from "../api/consultas";
import {
  validarDescuento,
  type ErroresDescuento,
  type FormularioDescuento,
} from "../lib/validaciones";

const TIPOS: TipoDescuento[] = ["porcentaje", "monto_fijo"];

/** Alta (sin `descuento`) o edición. Se monta abierto; el padre lo desmonta al cerrar. */
export function DialogoDescuento({
  descuento,
  onCerrar,
}: {
  descuento?: Descuento;
  onCerrar: () => void;
}) {
  const crear = useCrearDescuento();
  const actualizar = useActualizarDescuento();
  const [formulario, setFormulario] = useState<FormularioDescuento>(() => ({
    nombre: descuento?.nombre ?? "",
    tipo: descuento?.tipo ?? "porcentaje",
    valor: descuento ? montoComoTexto(descuento.valor) : "",
    activo: descuento?.activo ?? true,
  }));
  const [errores, setErrores] = useState<ErroresDescuento>({});
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const guardando = crear.isPending || actualizar.isPending;
  const esPorcentaje = formulario.tipo === "porcentaje";

  function cambiar<K extends keyof FormularioDescuento>(clave: K, valor: FormularioDescuento[K]) {
    setFormulario((actual) => ({ ...actual, [clave]: valor }));
  }

  async function enviar(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    const resultado = validarDescuento(formulario);
    setErrores(resultado.errores ?? {});
    if (!resultado.datos) return;
    setErrorServidor(null);
    try {
      if (descuento) {
        await actualizar.mutateAsync({ id: descuento.id, cambios: resultado.datos });
        toast.success("Cambios guardados");
      } else {
        const creado = await crear.mutateAsync(resultado.datos);
        toast.success(`Descuento “${creado.nombre}” creado`);
      }
      onCerrar();
    } catch (e) {
      setErrorServidor(mensajeDeError(e, MENSAJES_ERROR_DESCUENTO));
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
          <DialogTitle>{descuento ? "Editar descuento" : "Nuevo descuento"}</DialogTitle>
          <DialogDescription>
            {descuento
              ? "Un cambio no modifica las ventas ya registradas: cada venta guarda el descuento que tuvo."
              : "Después elegí en qué servicios se puede usar, con “Servicios”."}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => void enviar(e)} noValidate>
          <Campo id="descuento-nombre" etiqueta="Nombre" error={errores.nombre}>
            <Input
              id="descuento-nombre"
              value={formulario.nombre}
              maxLength={LARGO_MAXIMO_NOMBRE}
              autoFocus
              autoComplete="off"
              placeholder="Ej. Jubilados"
              onChange={(e) => {
                cambiar("nombre", e.target.value);
              }}
              {...propsError("descuento-nombre", errores.nombre)}
            />
          </Campo>
          <Campo id="descuento-tipo" etiqueta="Tipo">
            <Select
              value={formulario.tipo}
              onValueChange={(valor) => {
                const tipo = TIPOS.find((t) => t === valor);
                if (tipo) cambiar("tipo", tipo);
              }}
            >
              <SelectTrigger id="descuento-tipo" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TIPOS_DESCUENTO[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
          <Campo
            id="descuento-valor"
            etiqueta={esPorcentaje ? "Porcentaje (%)" : "Monto ($)"}
            error={errores.valor}
          >
            <Input
              id="descuento-valor"
              value={formulario.valor}
              inputMode="decimal"
              autoComplete="off"
              placeholder={esPorcentaje ? "Ej. 10 o 12,5" : "Ej. 2000 o 2.000,50"}
              onChange={(e) => {
                cambiar("valor", e.target.value);
              }}
              {...propsError("descuento-valor", errores.valor)}
            />
          </Campo>
          <div className="flex items-center justify-between gap-4 rounded-md border p-3">
            <div>
              <Label htmlFor="descuento-activo">Activo</Label>
              <p className="text-xs text-muted-foreground">
                Si está desactivado, no se ofrece en la caja (las ventas que lo usaron lo
                conservan).
              </p>
            </div>
            <Switch
              id="descuento-activo"
              checked={formulario.activo}
              onCheckedChange={(valor) => {
                cambiar("activo", valor);
              }}
            />
          </div>
          <ErrorFormulario mensaje={errorServidor} />
          <DialogFooter>
            <Button type="submit" disabled={guardando}>
              {guardando ? "Guardando…" : descuento ? "Guardar" : "Crear descuento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
