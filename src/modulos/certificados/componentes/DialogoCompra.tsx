import { useState, type SubmitEvent } from "react";
import { toast } from "sonner";
import { Campo } from "@/compartido/componentes/Campo";
import { ErrorFormulario } from "@/compartido/componentes/ErrorFormulario";
import { propsError } from "@/compartido/lib/accesibilidad";
import { mensajeDeError } from "@/compartido/lib/errores";
import { formatearMoneda, formatearNumero } from "@/compartido/lib/formato";
import { LARGO_MAXIMO_PROVEEDOR, parsearEntero } from "@/compartido/lib/validaciones";
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
import { useSaldoEfectivo } from "@/modulos/efectivo/api/consultas";
import { useRegistrarCompra, type CertificadoConStock, type FuenteFondos } from "../api/consultas";
import {
  describirPresentacion,
  MAXIMO_UNIDADES_COMPRA,
  UNIDADES,
  validarCompra,
  type ErroresCompra,
  type FormularioCompra,
} from "../lib/validaciones";

const esFuente = (valor: string): valor is FuenteFondos =>
  valor === "efectivo" || valor === "transferencia";

const VACIO: FormularioCompra = { unidades: "", costoUnidad: "", fuente: "", proveedor: "" };

/** Registra una compra: suma hojas, recalcula el costo promedio y crea el gasto (todo en la BD). */
export function DialogoCompra({
  certificado,
  onCerrar,
}: {
  certificado: CertificadoConStock;
  onCerrar: () => void;
}) {
  const compra = useRegistrarCompra();
  const saldo = useSaldoEfectivo();
  const [formulario, setFormulario] = useState<FormularioCompra>(VACIO);
  const [errores, setErrores] = useState<ErroresCompra>({});
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const unidad = UNIDADES[certificado.unidad_compra];

  // Solo informativo: cuántas hojas entran (entero). El costo lo calcula la BD.
  const unidades = parsearEntero(formulario.unidades, {
    minimo: 1,
    maximo: MAXIMO_UNIDADES_COMPRA,
    nombre: "la cantidad",
  });
  const hojasQueEntran =
    unidades.valor === undefined ? null : unidades.valor * certificado.hojas_por_unidad;

  function cambiar<K extends keyof FormularioCompra>(clave: K, valor: FormularioCompra[K]) {
    setFormulario((actual) => ({ ...actual, [clave]: valor }));
  }

  async function enviar(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    const resultado = validarCompra(formulario, certificado.unidad_compra);
    setErrores(resultado.errores ?? {});
    if (!resultado.datos) return;
    setErrorServidor(null);
    try {
      const registrada = await compra.mutateAsync({
        certificadoId: certificado.id,
        datos: resultado.datos,
      });
      toast.success(
        `Compra registrada: ${formatearNumero(registrada.hojas)} hojas de “${certificado.nombre}” por ${formatearMoneda(registrada.costo_total)}`,
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
          <DialogTitle>Registrar compra</DialogTitle>
          <DialogDescription>
            {certificado.nombre} ·{" "}
            {describirPresentacion(certificado.unidad_compra, certificado.hojas_por_unidad)}. La
            compra se registra también como gasto.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => void enviar(e)} noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              id="compra-unidades"
              etiqueta={`Cantidad de ${unidad.plural}`}
              error={errores.unidades}
            >
              <Input
                id="compra-unidades"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                value={formulario.unidades}
                onChange={(e) => {
                  cambiar("unidades", e.target.value);
                }}
                {...propsError("compra-unidades", errores.unidades)}
              />
            </Campo>
            <Campo
              id="compra-costo"
              etiqueta={`Costo por ${unidad.singular} ($)`}
              error={errores.costoUnidad}
            >
              <Input
                id="compra-costo"
                inputMode="decimal"
                autoComplete="off"
                placeholder="Ej. 50.000"
                value={formulario.costoUnidad}
                onChange={(e) => {
                  cambiar("costoUnidad", e.target.value);
                }}
                {...propsError("compra-costo", errores.costoUnidad)}
              />
            </Campo>
          </div>
          {hojasQueEntran !== null && (
            <p className="text-sm text-muted-foreground" data-testid="hojas-que-entran">
              Entran {formatearNumero(hojasQueEntran)} hojas al stock.
            </p>
          )}

          <Campo id="compra-fuente" etiqueta="Se pagó con" error={errores.fuente}>
            <Select
              value={formulario.fuente}
              onValueChange={(valor) => {
                if (esFuente(valor)) cambiar("fuente", valor);
              }}
            >
              <SelectTrigger
                id="compra-fuente"
                className="w-full"
                {...propsError("compra-fuente", errores.fuente)}
              >
                <SelectValue placeholder="Elegí cómo se pagó" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="transferencia">Transferencia</SelectItem>
                <SelectItem value="efectivo">Efectivo (caja de cambio)</SelectItem>
              </SelectContent>
            </Select>
            {formulario.fuente === "efectivo" && saldo.data !== undefined && (
              <p className="text-xs text-muted-foreground">
                Saldo de la caja de cambio: {formatearMoneda(saldo.data)}
              </p>
            )}
          </Campo>

          <Campo id="compra-proveedor" etiqueta="Proveedor (opcional)" error={errores.proveedor}>
            <Input
              id="compra-proveedor"
              autoComplete="off"
              maxLength={LARGO_MAXIMO_PROVEEDOR}
              value={formulario.proveedor}
              onChange={(e) => {
                cambiar("proveedor", e.target.value);
              }}
              {...propsError("compra-proveedor", errores.proveedor)}
            />
          </Campo>

          <ErrorFormulario mensaje={errorServidor} />
          <DialogFooter>
            <Button type="submit" disabled={compra.isPending}>
              {compra.isPending ? "Registrando…" : "Registrar compra"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
