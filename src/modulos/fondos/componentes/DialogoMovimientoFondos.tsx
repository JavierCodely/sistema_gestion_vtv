import { useState, type SubmitEvent } from "react";
import { toast } from "sonner";
import { Campo } from "@/compartido/componentes/Campo";
import { ErrorFormulario } from "@/compartido/componentes/ErrorFormulario";
import { propsError } from "@/compartido/lib/accesibilidad";
import { mensajeDeError } from "@/compartido/lib/errores";
import { formatearMoneda } from "@/compartido/lib/formato";
import { LARGO_MAXIMO_NOTA } from "@/compartido/lib/validaciones";
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
import { useMovimientoFondos } from "../api/consultas";
import { useMovimientoEfectivo } from "../api/efectivo";
import {
  descripcionMovimiento,
  NOMBRE_CUENTA_FRASE,
  nombreMovimiento,
  type Cuenta,
  type TipoMovimientoManual,
} from "../lib/fondos";
import {
  validarMovimiento,
  type ErroresMovimiento,
  type FormularioMovimiento,
} from "../lib/validaciones";

/**
 * Movimiento manual de una cuenta de Fondos (fondo/saldo inicial, ingreso o retiro). En efectivo usa
 * `movimiento_efectivo` (devuelve el saldo, que se muestra al confirmar); en transferencia y
 * crédito/débito, `movimiento_fondos`. Los errores de la BD (ej. "No alcanza el saldo…") se muestran
 * en el diálogo.
 */
export function DialogoMovimientoFondos({
  cuenta,
  tipo,
  onCerrar,
}: {
  cuenta: Cuenta;
  tipo: TipoMovimientoManual;
  onCerrar: () => void;
}) {
  const moverEfectivo = useMovimientoEfectivo();
  const moverFondos = useMovimientoFondos();
  const guardando = moverEfectivo.isPending || moverFondos.isPending;
  const [formulario, setFormulario] = useState<FormularioMovimiento>({ monto: "", nota: "" });
  const [errores, setErrores] = useState<ErroresMovimiento>({});
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const titulo = nombreMovimiento(cuenta, tipo);

  async function enviar(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    const resultado = validarMovimiento(formulario);
    setErrores(resultado.errores ?? {});
    if (!resultado.datos) return;
    setErrorServidor(null);
    try {
      if (cuenta === "efectivo") {
        const movimiento = await moverEfectivo.mutateAsync({ tipo, ...resultado.datos });
        toast.success(
          `${titulo} registrado. Saldo: ${formatearMoneda(movimiento.saldo_resultante)}`,
        );
      } else {
        await moverFondos.mutateAsync({ cuenta, tipo, ...resultado.datos });
        toast.success(`${titulo} registrado en ${NOMBRE_CUENTA_FRASE[cuenta]}.`);
      }
      onCerrar();
    } catch (e) {
      setErrorServidor(mensajeDeError(e));
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(abierto) => {
        // Con la escritura en curso no se cierra (Esc, la X o clic afuera).
        if (!abierto && !guardando) onCerrar();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descripcionMovimiento(cuenta, tipo)}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => void enviar(e)} noValidate>
          <Campo id="movimiento-monto" etiqueta="Monto ($)" error={errores.monto}>
            <Input
              id="movimiento-monto"
              inputMode="decimal"
              autoComplete="off"
              autoFocus
              value={formulario.monto}
              onChange={(e) => {
                setFormulario((f) => ({ ...f, monto: e.target.value }));
              }}
              {...propsError("movimiento-monto", errores.monto)}
            />
          </Campo>
          <Campo id="movimiento-nota" etiqueta="Nota" error={errores.nota}>
            <Input
              id="movimiento-nota"
              autoComplete="off"
              maxLength={LARGO_MAXIMO_NOTA}
              value={formulario.nota}
              onChange={(e) => {
                setFormulario((f) => ({ ...f, nota: e.target.value }));
              }}
              {...propsError("movimiento-nota", errores.nota)}
            />
          </Campo>
          <ErrorFormulario mensaje={errorServidor} />
          <DialogFooter>
            <Button type="submit" disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
