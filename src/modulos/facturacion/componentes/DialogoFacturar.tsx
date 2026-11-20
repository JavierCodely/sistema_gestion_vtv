import { useState, type SubmitEvent } from "react";
import { toast } from "sonner";
import { Campo } from "@/compartido/componentes/Campo";
import { Cargando } from "@/compartido/componentes/Cargando";
import { ErrorFormulario } from "@/compartido/componentes/ErrorFormulario";
import { propsError } from "@/compartido/lib/accesibilidad";
import { mensajeDeError } from "@/compartido/lib/errores";
import { formatearMoneda } from "@/compartido/lib/formato";
import { cn } from "@/compartido/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/compartido/ui/alert";
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
import { type Comprobante, useCondicionesIva, useEmitir, useFacturar } from "../api/consultas";
import { nombreComprobante, numeroComprobante, TIPOS_DOCUMENTO } from "../lib/formato";
import {
  claseParaCondicion,
  CONSUMIDOR_FINAL,
  type FormularioCliente,
  LARGO_MAXIMO_RECEPTOR,
  validarCliente,
} from "../lib/validaciones";

/** Lo mínimo de una venta para facturarla (sin depender del módulo caja). */
export interface VentaParaFacturar {
  id: number;
  servicio_nombre: string;
  precio: number;
}

const DOCUMENTOS = ["99", "96", "80"] as const;

function formularioInicial(comprobante: Comprobante | undefined): FormularioCliente {
  if (!comprobante) {
    return { condicionIvaId: String(CONSUMIDOR_FINAL), docTipo: "99", docNro: "", nombre: "" };
  }
  return {
    condicionIvaId: "",
    docTipo: String(comprobante.doc_tipo) as FormularioCliente["docTipo"],
    docNro: comprobante.doc_tipo === 99 ? "" : String(comprobante.doc_nro),
    nombre: comprobante.receptor_nombre ?? "",
  };
}

function avisarResultado(c: Comprobante) {
  const nombre = `${nombreComprobante(c.cbte_tipo)} ${numeroComprobante(c.punto_venta, c.numero)}`;
  if (c.estado === "autorizado") toast.success(`${nombre} autorizada por ARCA`);
}

/**
 * Factura una venta (o reintenta su factura). Si el comprobante quedó a confirmar con ARCA,
 * solo se reintenta la emisión: los datos no se pueden cambiar hasta saber si se emitió.
 */
export function DialogoFacturar({
  venta,
  comprobante,
  onCerrar,
}: {
  venta: VentaParaFacturar;
  comprobante?: Comprobante;
  onCerrar: () => void;
}) {
  const condiciones = useCondicionesIva();
  const facturar = useFacturar();
  const emitir = useEmitir();
  const [resultado, setResultado] = useState<Comprobante | undefined>();
  // El de las props se refresca tras cada intento (la lista se invalida): si emitir falló después
  // de preparar, llega acá ya "a confirmar" y el diálogo pasa a solo reintentar la emisión.
  const actual = comprobante ?? resultado;
  const [formulario, setFormulario] = useState<FormularioCliente>(() =>
    formularioInicial(comprobante),
  );
  const [errores, setErrores] = useState<Partial<Record<keyof FormularioCliente, string>>>({});
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const soloReintentar =
    actual !== undefined && (actual.a_reconciliar || actual.estado === "procesando");
  const ocupado = facturar.isPending || emitir.isPending;

  // La condición del comprobante existente se elige por descripción (la vista no trae el id).
  const lista = condiciones.data ?? [];
  const idCondicion =
    formulario.condicionIvaId ||
    String(lista.find((c) => c.descripcion === actual?.condicion_iva_receptor)?.id ?? "");
  const condicion = lista.find((c) => String(c.id) === idCondicion);
  const clase = claseParaCondicion(condicion);

  function cambiar<K extends keyof FormularioCliente>(campo: K, valor: FormularioCliente[K]) {
    setFormulario((f) => ({ ...f, condicionIvaId: idCondicion, [campo]: valor }));
    setErrores((e) => ({ ...e, [campo]: undefined }));
  }

  function elegirCondicion(valor: string) {
    const nueva = lista.find((c) => String(c.id) === valor);
    const claseNueva = claseParaCondicion(nueva);
    setFormulario((f) => ({
      ...f,
      condicionIvaId: valor,
      // Ajusta el documento a lo que admite la condición.
      docTipo:
        claseNueva === "A"
          ? "80"
          : nueva?.id === CONSUMIDOR_FINAL
            ? f.docTipo
            : f.docTipo === "99"
              ? "96"
              : f.docTipo,
    }));
    setErrores({});
  }

  async function enviar(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErrorServidor(null);
    try {
      let r: Comprobante;
      if (soloReintentar) {
        r = await emitir.mutateAsync(actual.id);
      } else {
        const validacion = validarCliente({ ...formulario, condicionIvaId: idCondicion }, lista);
        setErrores(validacion.errores ?? {});
        if (!validacion.datos) return;
        r = await facturar.mutateAsync({ ventaId: venta.id, cliente: validacion.datos });
      }
      setResultado(r);
      avisarResultado(r);
      if (r.estado === "autorizado") onCerrar();
    } catch (e) {
      setErrorServidor(mensajeDeError(e));
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(abierto) => {
        if (!abierto && !ocupado) onCerrar();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Facturar venta N° {venta.id}</DialogTitle>
          <DialogDescription>
            {venta.servicio_nombre} · {formatearMoneda(venta.precio)} (IVA 21 % incluido).
          </DialogDescription>
        </DialogHeader>

        {actual && actual.estado !== "autorizado" && actual.mensaje && (
          <Alert variant={actual.estado === "rechazado" ? "destructive" : "default"}>
            <AlertTitle>
              {actual.estado === "rechazado"
                ? "ARCA rechazó la factura"
                : actual.a_reconciliar
                  ? "Falta confirmar con ARCA"
                  : "La factura quedó pendiente"}
            </AlertTitle>
            <AlertDescription>{actual.mensaje}</AlertDescription>
          </Alert>
        )}

        {condiciones.isPending ? (
          <Cargando texto="Cargando condiciones frente al IVA…" />
        ) : condiciones.isError ? (
          <ErrorFormulario mensaje={mensajeDeError(condiciones.error)} />
        ) : lista.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no se cargaron las condiciones frente al IVA de ARCA. Pedile al administrador
            que pruebe la conexión en Configuración ARCA.
          </p>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={(e) => void enviar(e)} noValidate>
            <fieldset disabled={soloReintentar || ocupado} className="flex flex-col gap-4">
              <Campo
                id="factura-condicion"
                etiqueta="Condición frente al IVA"
                error={errores.condicionIvaId}
              >
                <Select value={idCondicion} onValueChange={elegirCondicion}>
                  <SelectTrigger
                    id="factura-condicion"
                    className="w-full"
                    {...propsError("factura-condicion", errores.condicionIvaId)}
                  >
                    <SelectValue placeholder="Elegí la condición" />
                  </SelectTrigger>
                  <SelectContent>
                    {lista
                      .filter((c) => claseParaCondicion(c))
                      .map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.descripcion}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {clase && (
                  <p className="text-sm text-muted-foreground" data-testid="clase-factura">
                    Se emite Factura {clase}
                    {clase === "A" && " (requiere CUIT)"}.
                  </p>
                )}
              </Campo>

              <fieldset
                role="radiogroup"
                aria-labelledby="factura-documento-titulo"
                className="flex flex-col gap-2"
                {...propsError("factura-documento", errores.docTipo)}
              >
                <legend id="factura-documento-titulo" className="mb-2 text-sm font-medium">
                  Documento del cliente
                </legend>
                <div className="grid grid-cols-3 gap-2">
                  {DOCUMENTOS.map((doc) => {
                    const deshabilitado =
                      (doc === "99" && condicion?.id !== CONSUMIDOR_FINAL) ||
                      (clase === "A" && doc !== "80");
                    return (
                      <label
                        key={doc}
                        className={cn(
                          "flex cursor-pointer items-center justify-center rounded-md border p-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                          deshabilitado && "cursor-not-allowed opacity-50",
                        )}
                      >
                        <input
                          type="radio"
                          name="factura-documento"
                          className="sr-only"
                          value={doc}
                          disabled={deshabilitado}
                          checked={formulario.docTipo === doc}
                          onChange={() => {
                            cambiar("docTipo", doc);
                          }}
                        />
                        {TIPOS_DOCUMENTO[Number(doc)]}
                      </label>
                    );
                  })}
                </div>
                {errores.docTipo && (
                  <p id="factura-documento-error" className="text-sm text-destructive">
                    {errores.docTipo}
                  </p>
                )}
              </fieldset>

              {formulario.docTipo !== "99" && formulario.docTipo !== "" && (
                <>
                  <Campo
                    id="factura-numero"
                    etiqueta={formulario.docTipo === "80" ? "Número de CUIT" : "Número de DNI"}
                    error={errores.docNro}
                  >
                    <Input
                      id="factura-numero"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder={formulario.docTipo === "80" ? "30-71234567-1" : "30111222"}
                      value={formulario.docNro}
                      onChange={(e) => {
                        cambiar("docNro", e.target.value);
                      }}
                      {...propsError("factura-numero", errores.docNro)}
                    />
                  </Campo>
                  <Campo
                    id="factura-nombre"
                    etiqueta="Nombre o razón social"
                    error={errores.nombre}
                  >
                    <Input
                      id="factura-nombre"
                      autoComplete="off"
                      maxLength={LARGO_MAXIMO_RECEPTOR}
                      value={formulario.nombre}
                      onChange={(e) => {
                        cambiar("nombre", e.target.value);
                      }}
                      {...propsError("factura-nombre", errores.nombre)}
                    />
                  </Campo>
                </>
              )}
            </fieldset>

            <ErrorFormulario mensaje={errorServidor} />
            <DialogFooter>
              <Button type="submit" disabled={ocupado}>
                {ocupado
                  ? "Emitiendo en ARCA…"
                  : soloReintentar
                    ? "Reintentar con ARCA"
                    : actual
                      ? "Reintentar factura"
                      : "Emitir factura"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
