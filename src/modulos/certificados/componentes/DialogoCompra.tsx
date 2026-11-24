import { useState, type SubmitEvent } from "react";
import { toast } from "sonner";
import { Campo } from "@/compartido/componentes/Campo";
import { ErrorFormulario } from "@/compartido/componentes/ErrorFormulario";
import { propsError } from "@/compartido/lib/accesibilidad";
import { mensajeDeError } from "@/compartido/lib/errores";
import { formatearMoneda, formatearNumero } from "@/compartido/lib/formato";
import {
  LARGO_MAXIMO_NOTA,
  LARGO_MAXIMO_PROVEEDOR,
  montoComoTexto,
  parsearEntero,
} from "@/compartido/lib/validaciones";
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
import { useSaldoEfectivo } from "@/modulos/fondos/api/efectivo";
import {
  useCorregirCompra,
  useRegistrarCompra,
  type CertificadoConStock,
  type Compra,
  type FuenteFondos,
} from "../api/consultas";
import {
  describirPresentacion,
  MAXIMO_UNIDADES_COMPRA,
  UNIDADES,
  validarCompra,
  validarCorreccion,
  type ErroresCorreccion,
  type FormularioCorreccion,
} from "../lib/validaciones";

const esFuente = (valor: string): valor is FuenteFondos =>
  valor === "efectivo" || valor === "transferencia";

/** Compra nueva: propone el costo vigente del certificado. Corrección: los datos de la original. */
function formularioInicial(
  original?: Compra,
  certificado?: CertificadoConStock,
): FormularioCorreccion {
  if (!original) {
    const costo = certificado?.costo_unidad ?? null;
    return {
      unidades: "",
      costoUnidad: costo === null ? "" : montoComoTexto(costo),
      fuente: "",
      proveedor: "",
      motivo: "",
    };
  }
  return {
    unidades: String(original.unidades),
    costoUnidad: montoComoTexto(original.costo_unidad),
    fuente: original.fuente,
    proveedor: original.proveedor ?? "",
    motivo: "",
  };
}

type Props =
  | { certificado: CertificadoConStock; original?: undefined; onCerrar: () => void }
  | { original: Compra; certificado?: undefined; onCerrar: () => void };

/**
 * Registra una compra nueva (`certificado`) o corrige una existente (`original`). En los dos
 * casos la BD hace todo: hojas, costo promedio, gasto y efectivo; al corregir, además revierte
 * la compra original y la deja anulada con el motivo.
 */
export function DialogoCompra({ certificado, original, onCerrar }: Props) {
  const registrar = useRegistrarCompra();
  const corregir = useCorregirCompra();
  const saldo = useSaldoEfectivo();
  const [formulario, setFormulario] = useState(() => formularioInicial(original, certificado));
  const [errores, setErrores] = useState<ErroresCorreccion>({});
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const enviando = registrar.isPending || corregir.isPending;

  const presentacion = original
    ? {
        nombre: original.certificado,
        unidad_compra: original.unidad_compra,
        hojas_por_unidad: original.hojas_por_unidad,
      }
    : certificado;
  const unidad = UNIDADES[presentacion.unidad_compra];

  // Solo informativo: cuántas hojas entran (entero). El costo lo calcula la BD.
  const unidades = parsearEntero(formulario.unidades, {
    minimo: 1,
    maximo: MAXIMO_UNIDADES_COMPRA,
    nombre: "la cantidad",
  });
  const hojasQueEntran =
    unidades.valor === undefined ? null : unidades.valor * presentacion.hojas_por_unidad;

  function cambiar<K extends keyof FormularioCorreccion>(clave: K, valor: FormularioCorreccion[K]) {
    setFormulario((actual) => ({ ...actual, [clave]: valor }));
  }

  async function enviar(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    let guardar: () => Promise<{ hojas: number; costo_total: number }>;
    if (original) {
      const resultado = validarCorreccion(formulario, presentacion.unidad_compra);
      setErrores(resultado.errores ?? {});
      if (!resultado.datos) return;
      const { datos, motivo } = resultado;
      guardar = () => corregir.mutateAsync({ compraId: original.id, datos, motivo });
    } else {
      const resultado = validarCompra(formulario, presentacion.unidad_compra);
      setErrores(resultado.errores ?? {});
      if (!resultado.datos) return;
      const { datos } = resultado;
      guardar = () => registrar.mutateAsync({ certificadoId: certificado.id, datos });
    }
    setErrorServidor(null);
    try {
      const compra = await guardar();
      toast.success(
        `${original ? "Compra corregida" : "Compra registrada"}: ${formatearNumero(compra.hojas)} hojas de “${presentacion.nombre}” por ${formatearMoneda(compra.costo_total)}`,
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
          <DialogTitle>
            {original ? `Editar compra #${String(original.id)}` : "Registrar compra"}
          </DialogTitle>
          <DialogDescription>
            {presentacion.nombre} ·{" "}
            {describirPresentacion(presentacion.unidad_compra, presentacion.hojas_por_unidad)}.{" "}
            {original
              ? "La compra original se anula (vuelven sus hojas, su costo y, si fue en efectivo, su dinero) y se registra esta en su lugar."
              : "La compra se registra también como gasto."}
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
                {original?.fuente === "efectivo" &&
                  ` (antes se devuelven ${formatearMoneda(original.costo_total)} de la compra original)`}
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

          {original && (
            <Campo id="compra-motivo" etiqueta="Motivo de la corrección" error={errores.motivo}>
              <Input
                id="compra-motivo"
                autoComplete="off"
                maxLength={LARGO_MAXIMO_NOTA}
                placeholder="Ej. Se cargó mal la cantidad"
                value={formulario.motivo}
                onChange={(e) => {
                  cambiar("motivo", e.target.value);
                }}
                {...propsError("compra-motivo", errores.motivo)}
              />
            </Campo>
          )}

          <ErrorFormulario mensaje={errorServidor} />
          <DialogFooter>
            <Button type="submit" disabled={enviando}>
              {enviando ? "Guardando…" : original ? "Guardar corrección" : "Registrar compra"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
