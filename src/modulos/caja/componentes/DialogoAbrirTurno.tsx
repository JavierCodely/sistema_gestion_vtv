import { useState, type SubmitEvent } from "react";
import { toast } from "sonner";
import { Campo } from "@/compartido/componentes/Campo";
import { Cargando } from "@/compartido/componentes/Cargando";
import { ErrorFormulario } from "@/compartido/componentes/ErrorFormulario";
import { propsError } from "@/compartido/lib/accesibilidad";
import { mensajeDeError } from "@/compartido/lib/errores";
import { formatearMoneda } from "@/compartido/lib/formato";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/compartido/ui/select";
import { useAbrirTurno, useCajasParaTurno } from "../api/consultas";
import {
  validarAperturaTurno,
  type ErroresAperturaTurno,
  type FormularioAperturaTurno,
} from "../lib/validaciones";

/**
 * Apertura de turno (solo admin): una caja libre y el efectivo inicial para cambio, que sale de la caja
 * de cambio. No se elige quién atiende: el turno es de la caja y cualquier usuario activo trabaja en
 * ella (migración 33). Ya queda elegida la primera caja libre (orden de `cajas_para_turno`); se puede
 * cambiar. Después de abrir se queda donde está.
 */
export function DialogoAbrirTurno({ onCerrar }: { onCerrar: () => void }) {
  const cajas = useCajasParaTurno();
  const abrir = useAbrirTurno();
  const [formulario, setFormulario] = useState<FormularioAperturaTurno>({
    cajaId: "",
    efectivoInicial: "",
  });
  const [errores, setErrores] = useState<ErroresAperturaTurno>({});
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  function cambiar<K extends keyof FormularioAperturaTurno>(
    clave: K,
    valor: FormularioAperturaTurno[K],
  ) {
    setFormulario((actual) => ({ ...actual, [clave]: valor }));
  }

  const cajasLibres = cajas.data?.filter((c) => !c.ocupada) ?? [];
  // Queda elegida la primera caja libre, salvo que se haya elegido otra que siga libre (si la
  // elegida se ocupó mientras tanto, vuelve a la primera libre).
  const cajaId = cajasLibres.some((c) => String(c.id) === formulario.cajaId)
    ? formulario.cajaId
    : (cajasLibres[0]?.id.toString() ?? "");
  const sinCajas = cajasLibres.length === 0;

  async function enviar(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    const resultado = validarAperturaTurno({ ...formulario, cajaId });
    setErrores(resultado.errores ?? {});
    if (!resultado.datos) return;
    setErrorServidor(null);
    try {
      const datos = resultado.datos;
      await abrir.mutateAsync(datos);
      const nombreCaja = cajas.data?.find((c) => c.id === datos.cajaId)?.nombre ?? "";
      toast.success(
        `Turno abierto en “${nombreCaja}” con ${formatearMoneda(datos.efectivoInicial)} de efectivo inicial`,
      );
      onCerrar();
    } catch (e) {
      setErrorServidor(mensajeDeError(e));
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
          <DialogTitle>Abrir turno</DialogTitle>
          <DialogDescription>
            Cualquier cajero o administrador va a poder vender en la caja abierta. El efectivo
            inicial es el dinero para cambio con el que arranca: sale de la caja de cambio y, al
            cerrar el turno, vuelve con las ventas en efectivo menos los gastos en efectivo.
          </DialogDescription>
        </DialogHeader>
        {cajas.isPending ? (
          <Cargando texto="Cargando cajas…" />
        ) : cajas.isError ? (
          <ErrorFormulario mensaje={mensajeDeError(cajas.error)} />
        ) : (
          <form className="flex flex-col gap-4" onSubmit={(e) => void enviar(e)} noValidate>
            <Campo
              id="turno-caja"
              etiqueta="Caja"
              error={
                errores.cajaId ??
                (sinCajas
                  ? "No hay cajas libres: todas tienen un turno abierto o no hay cajas activas. Cerrá un turno o activá una caja en Cajas."
                  : undefined)
              }
            >
              <Select
                disabled={sinCajas}
                value={cajaId}
                onValueChange={(valor) => {
                  cambiar("cajaId", valor);
                }}
              >
                <SelectTrigger
                  id="turno-caja"
                  className="w-full"
                  {...propsError("turno-caja", errores.cajaId)}
                >
                  <SelectValue placeholder={sinCajas ? "No hay cajas libres" : "Elegí una caja"} />
                </SelectTrigger>
                <SelectContent>
                  {cajasLibres.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
            <Campo
              id="turno-efectivo"
              etiqueta="Efectivo inicial ($)"
              error={errores.efectivoInicial}
            >
              <Input
                id="turno-efectivo"
                inputMode="decimal"
                autoComplete="off"
                autoFocus
                placeholder="Ej. 50.000"
                value={formulario.efectivoInicial}
                onChange={(e) => {
                  cambiar("efectivoInicial", e.target.value);
                }}
                {...propsError("turno-efectivo", errores.efectivoInicial)}
              />
            </Campo>
            <ErrorFormulario mensaje={errorServidor} />
            <DialogFooter>
              <Button type="submit" disabled={abrir.isPending || sinCajas}>
                {abrir.isPending ? "Abriendo…" : "Abrir turno"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
