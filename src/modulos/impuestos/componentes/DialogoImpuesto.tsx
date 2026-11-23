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
  MEDIOS,
  MENSAJES_ERROR_IMPUESTO,
  NOMBRES_MEDIOS,
  TIPOS_IMPUESTO,
  useActualizarImpuesto,
  useCrearImpuesto,
  type Impuesto,
  type TipoImpuesto,
} from "../api/consultas";
import {
  validarImpuesto,
  type ErroresImpuesto,
  type FormularioImpuesto,
} from "../lib/validaciones";

const TIPOS: TipoImpuesto[] = ["porcentaje", "monto_fijo"];

/** Alta (sin `impuesto`) o edición. Se monta abierto; el padre lo desmonta al cerrar. */
export function DialogoImpuesto({
  impuesto,
  onCerrar,
}: {
  impuesto?: Impuesto;
  onCerrar: () => void;
}) {
  const crear = useCrearImpuesto();
  const actualizar = useActualizarImpuesto();
  const [formulario, setFormulario] = useState<FormularioImpuesto>(() => ({
    nombre: impuesto?.nombre ?? "",
    tipo: impuesto?.tipo ?? "porcentaje",
    valor: impuesto ? montoComoTexto(impuesto.valor) : "",
    medios: impuesto ? [...impuesto.medios] : [...MEDIOS],
    activo: impuesto?.activo ?? true,
  }));
  const [errores, setErrores] = useState<ErroresImpuesto>({});
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const guardando = crear.isPending || actualizar.isPending;
  const esPorcentaje = formulario.tipo === "porcentaje";
  const todosLosMedios = MEDIOS.every((m) => formulario.medios.includes(m));

  function cambiar<K extends keyof FormularioImpuesto>(clave: K, valor: FormularioImpuesto[K]) {
    setFormulario((actual) => ({ ...actual, [clave]: valor }));
  }

  function cambiarMedio(medio: (typeof MEDIOS)[number], incluir: boolean) {
    setFormulario((actual) => ({
      ...actual,
      medios: incluir
        ? MEDIOS.filter((m) => m === medio || actual.medios.includes(m))
        : actual.medios.filter((m) => m !== medio),
    }));
  }

  async function enviar(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    const resultado = validarImpuesto(formulario);
    setErrores(resultado.errores ?? {});
    if (!resultado.datos) return;
    setErrorServidor(null);
    try {
      if (impuesto) {
        await actualizar.mutateAsync({ id: impuesto.id, cambios: resultado.datos });
        toast.success("Cambios guardados");
      } else {
        const creado = await crear.mutateAsync(resultado.datos);
        toast.success(`Impuesto “${creado.nombre}” creado`);
      }
      onCerrar();
    } catch (e) {
      setErrorServidor(mensajeDeError(e, MENSAJES_ERROR_IMPUESTO));
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(abierto) => {
        if (!abierto && !guardando) onCerrar();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{impuesto ? "Editar impuesto" : "Nuevo impuesto"}</DialogTitle>
          <DialogDescription>
            {impuesto
              ? "Un cambio rige para las ventas que vienen: cada venta guarda el impuesto que tuvo."
              : "No cambia lo que paga el cliente: el sistema calcula cuánto de cada venta corresponde al impuesto. Después elegí los servicios con “Servicios”."}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => void enviar(e)} noValidate>
          <Campo id="impuesto-nombre" etiqueta="Nombre" error={errores.nombre}>
            <Input
              id="impuesto-nombre"
              value={formulario.nombre}
              maxLength={LARGO_MAXIMO_NOMBRE}
              autoFocus
              autoComplete="off"
              placeholder="Ej. Ingresos brutos"
              onChange={(e) => {
                cambiar("nombre", e.target.value);
              }}
              {...propsError("impuesto-nombre", errores.nombre)}
            />
          </Campo>
          <Campo id="impuesto-tipo" etiqueta="Tipo">
            <Select
              value={formulario.tipo}
              onValueChange={(valor) => {
                const tipo = TIPOS.find((t) => t === valor);
                if (tipo) cambiar("tipo", tipo);
              }}
            >
              <SelectTrigger id="impuesto-tipo" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TIPOS_IMPUESTO[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
          <Campo
            id="impuesto-valor"
            etiqueta={esPorcentaje ? "Porcentaje (%)" : "Monto por venta ($)"}
            error={errores.valor}
          >
            <Input
              id="impuesto-valor"
              value={formulario.valor}
              inputMode="decimal"
              autoComplete="off"
              placeholder={esPorcentaje ? "Ej. 3 o 3,5" : "Ej. 150 o 1.500,50"}
              onChange={(e) => {
                cambiar("valor", e.target.value);
              }}
              {...propsError("impuesto-valor", errores.valor)}
            />
          </Campo>

          <fieldset
            className="flex flex-col gap-2 rounded-md border p-3"
            aria-describedby={errores.medios ? "impuesto-medios-error" : undefined}
          >
            <legend className="px-1 text-sm font-medium">Medios de pago alcanzados</legend>
            <div className="flex items-center justify-between gap-3 border-b pb-2">
              <Label htmlFor="impuesto-medios-todos" className="font-semibold">
                Todos los medios de pago
              </Label>
              <Switch
                id="impuesto-medios-todos"
                checked={todosLosMedios}
                onCheckedChange={(todos) => {
                  cambiar("medios", todos ? [...MEDIOS] : []);
                }}
              />
            </div>
            {MEDIOS.map((medio) => (
              <div key={medio} className="flex items-center justify-between gap-3 pl-3">
                <Label htmlFor={`impuesto-medio-${medio}`} className="font-normal">
                  {NOMBRES_MEDIOS[medio]}
                </Label>
                <Switch
                  id={`impuesto-medio-${medio}`}
                  checked={formulario.medios.includes(medio)}
                  onCheckedChange={(incluir) => {
                    cambiarMedio(medio, incluir);
                  }}
                />
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              En un pago mixto se calcula sobre lo pagado con estos medios.
            </p>
            {errores.medios && (
              <p id="impuesto-medios-error" role="alert" className="text-sm text-destructive">
                {errores.medios}
              </p>
            )}
          </fieldset>

          <div className="flex items-center justify-between gap-4 rounded-md border p-3">
            <div>
              <Label htmlFor="impuesto-activo">Activo</Label>
              <p className="text-xs text-muted-foreground">
                Si está desactivado, no se calcula en las ventas nuevas (las anteriores lo
                conservan).
              </p>
            </div>
            <Switch
              id="impuesto-activo"
              checked={formulario.activo}
              onCheckedChange={(valor) => {
                cambiar("activo", valor);
              }}
            />
          </div>
          <ErrorFormulario mensaje={errorServidor} />
          <DialogFooter>
            <Button type="submit" disabled={guardando}>
              {guardando ? "Guardando…" : impuesto ? "Guardar" : "Crear impuesto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
