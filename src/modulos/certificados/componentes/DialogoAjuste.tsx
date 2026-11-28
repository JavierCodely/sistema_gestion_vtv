import { useState, type SubmitEvent } from "react";
import { toast } from "sonner";
import { Campo } from "@/compartido/componentes/Campo";
import { ErrorFormulario } from "@/compartido/componentes/ErrorFormulario";
import { propsError } from "@/compartido/lib/accesibilidad";
import { mensajeDeError } from "@/compartido/lib/errores";
import { formatearNumero } from "@/compartido/lib/formato";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/compartido/ui/select";
import { useAjustarStock, type CertificadoConStock } from "../api/consultas";
import { validarAjuste, type ErroresAjuste, type FormularioAjuste } from "../lib/validaciones";
import { useEnvioUnico } from "@/compartido/lib/envio-unico";

/** Ajuste manual de stock (rotura, conteo físico…). Se valúa al costo promedio y no genera gasto. */
export function DialogoAjuste({
  certificado,
  onCerrar,
}: {
  certificado: CertificadoConStock;
  onCerrar: () => void;
}) {
  const ajuste = useAjustarStock();
  const [formulario, setFormulario] = useState<FormularioAjuste>({
    sentido: "restar",
    cantidad: "",
    nota: "",
  });
  const [errores, setErrores] = useState<ErroresAjuste>({});
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  function cambiar<K extends keyof FormularioAjuste>(clave: K, valor: FormularioAjuste[K]) {
    setFormulario((actual) => ({ ...actual, [clave]: valor }));
  }

  const unaVez = useEnvioUnico();

  async function enviar(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    const resultado = validarAjuste(formulario, certificado.stock_hojas);
    setErrores(resultado.errores ?? {});
    if (!resultado.datos) return;
    setErrorServidor(null);
    try {
      const movimiento = await ajuste.mutateAsync({
        certificadoId: certificado.id,
        datos: resultado.datos,
      });
      toast.success(
        `Stock de “${certificado.nombre}” ajustado: quedan ${formatearNumero(movimiento.stock_resultante)} hojas`,
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
          <DialogTitle>Ajustar stock</DialogTitle>
          <DialogDescription>
            {certificado.nombre} · stock actual: {formatearNumero(certificado.stock_hojas)} hojas.
            Para roturas, pérdidas o diferencias de conteo; no genera gasto.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void unaVez(() => enviar(e));
          }}
          noValidate
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="ajuste-sentido" etiqueta="Tipo de ajuste">
              <Select
                value={formulario.sentido}
                onValueChange={(valor) => {
                  cambiar("sentido", valor === "sumar" ? "sumar" : "restar");
                }}
              >
                <SelectTrigger id="ajuste-sentido" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="restar">Restar hojas</SelectItem>
                  <SelectItem value="sumar">Sumar hojas</SelectItem>
                </SelectContent>
              </Select>
            </Campo>
            <Campo id="ajuste-cantidad" etiqueta="Cantidad de hojas" error={errores.cantidad}>
              <Input
                id="ajuste-cantidad"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                value={formulario.cantidad}
                onChange={(e) => {
                  cambiar("cantidad", e.target.value);
                }}
                {...propsError("ajuste-cantidad", errores.cantidad)}
              />
            </Campo>
          </div>
          <Campo id="ajuste-nota" etiqueta="Motivo" error={errores.nota}>
            <Input
              id="ajuste-nota"
              autoComplete="off"
              maxLength={LARGO_MAXIMO_NOTA}
              placeholder="Ej. 3 hojas rotas al imprimir"
              value={formulario.nota}
              onChange={(e) => {
                cambiar("nota", e.target.value);
              }}
              {...propsError("ajuste-nota", errores.nota)}
            />
          </Campo>
          <ErrorFormulario mensaje={errorServidor} />
          <DialogFooter>
            <Button type="submit" disabled={ajuste.isPending}>
              {ajuste.isPending ? "Guardando…" : "Ajustar stock"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
