import { useState, type SubmitEvent } from "react";
import { toast } from "sonner";
import { Campo } from "@/compartido/componentes/Campo";
import { ErrorFormulario } from "@/compartido/componentes/ErrorFormulario";
import { propsError } from "@/compartido/lib/accesibilidad";
import { mensajeDeError } from "@/compartido/lib/errores";
import { LARGO_MAXIMO_NOMBRE } from "@/compartido/lib/validaciones";
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
  MENSAJES_ERROR_CERTIFICADO,
  useActualizarCertificado,
  useCrearCertificado,
  type CertificadoConStock,
} from "../api/consultas";
import {
  DIAS_VUELTA_MAXIMO,
  DIAS_VUELTA_POR_DEFECTO,
  UNIDADES,
  validarCertificado,
  type ErroresCertificado,
  type FormularioCertificado,
  type UnidadCompra,
} from "../lib/validaciones";

function formularioInicial(certificado?: CertificadoConStock): FormularioCertificado {
  if (!certificado) {
    return {
      nombre: "",
      unidadCompra: "caja",
      hojasPorUnidad: "",
      stockMinimo: "0",
      condicional: false,
      diasVuelta: DIAS_VUELTA_POR_DEFECTO,
    };
  }
  return {
    nombre: certificado.nombre,
    unidadCompra: certificado.unidad_compra,
    hojasPorUnidad: String(certificado.hojas_por_unidad),
    stockMinimo: String(certificado.stock_minimo),
    condicional: certificado.condicional,
    diasVuelta:
      certificado.dias_vuelta === null ? DIAS_VUELTA_POR_DEFECTO : String(certificado.dias_vuelta),
  };
}

const esUnidad = (valor: string): valor is UnidadCompra => valor in UNIDADES;

/**
 * Alta o edición de los datos de un certificado. Dónde se usa se elige en "Se usa en"
 * (`DialogoDestinosCertificado`): al crear uno, `onCreado` recibe su id y nombre para seguir por ahí.
 * Se monta abierto; el padre lo desmonta al cerrar.
 */
export function DialogoCertificado({
  certificado,
  onCerrar,
  onCreado,
}: {
  certificado?: CertificadoConStock;
  onCerrar: () => void;
  onCreado?: (id: number, nombre: string) => void;
}) {
  const crear = useCrearCertificado();
  const actualizar = useActualizarCertificado();
  const [formulario, setFormulario] = useState(() => formularioInicial(certificado));
  const [errores, setErrores] = useState<ErroresCertificado>({});
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const guardando = crear.isPending || actualizar.isPending;

  function cambiar<K extends keyof FormularioCertificado>(
    clave: K,
    valor: FormularioCertificado[K],
  ) {
    setFormulario((actual) => ({ ...actual, [clave]: valor }));
  }

  async function enviar(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    const resultado = validarCertificado(formulario);
    setErrores(resultado.errores ?? {});
    if (!resultado.datos) return;
    setErrorServidor(null);
    try {
      if (certificado) {
        await actualizar.mutateAsync({ id: certificado.id, cambios: resultado.datos });
        toast.success("Cambios guardados");
      } else {
        const creado = await crear.mutateAsync(resultado.datos);
        toast.success(`Certificado “${creado.nombre}” creado`);
        if (onCreado) {
          onCreado(creado.id, creado.nombre);
          return;
        }
      }
      onCerrar();
    } catch (e) {
      setErrorServidor(mensajeDeError(e, MENSAJES_ERROR_CERTIFICADO));
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
          <DialogTitle>{certificado ? "Editar certificado" : "Nuevo certificado"}</DialogTitle>
          <DialogDescription>
            La hoja que se entrega con cada servicio. En qué categorías y servicios se usa lo elegís
            con “Se usa en”.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => void enviar(e)} noValidate>
          <Campo id="certificado-nombre" etiqueta="Nombre" error={errores.nombre}>
            <Input
              id="certificado-nombre"
              value={formulario.nombre}
              maxLength={LARGO_MAXIMO_NOMBRE}
              autoFocus
              autoComplete="off"
              onChange={(e) => {
                cambiar("nombre", e.target.value);
              }}
              {...propsError("certificado-nombre", errores.nombre)}
            />
          </Campo>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="certificado-unidad" etiqueta="Se compra por">
              <Select
                value={formulario.unidadCompra}
                onValueChange={(valor) => {
                  if (esUnidad(valor)) cambiar("unidadCompra", valor);
                }}
              >
                <SelectTrigger id="certificado-unidad" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="caja">Caja</SelectItem>
                  <SelectItem value="libreta">Libreta</SelectItem>
                  <SelectItem value="unidad">Hoja suelta</SelectItem>
                </SelectContent>
              </Select>
            </Campo>
            <Campo
              id="certificado-hojas"
              etiqueta="Hojas por unidad"
              error={errores.hojasPorUnidad}
            >
              <Input
                id="certificado-hojas"
                inputMode="numeric"
                autoComplete="off"
                disabled={formulario.unidadCompra === "unidad"}
                value={formulario.unidadCompra === "unidad" ? "1" : formulario.hojasPorUnidad}
                onChange={(e) => {
                  cambiar("hojasPorUnidad", e.target.value);
                }}
                {...propsError("certificado-hojas", errores.hojasPorUnidad)}
              />
            </Campo>
          </div>

          <Campo
            id="certificado-minimo"
            etiqueta="Stock mínimo (hojas)"
            error={errores.stockMinimo}
          >
            <Input
              id="certificado-minimo"
              inputMode="numeric"
              autoComplete="off"
              value={formulario.stockMinimo}
              onChange={(e) => {
                cambiar("stockMinimo", e.target.value);
              }}
              {...propsError("certificado-minimo", errores.stockMinimo)}
            />
            <p className="text-xs text-muted-foreground">
              Cuando una venta deja el stock en este número o menos, se genera una alerta.
            </p>
          </Campo>

          <div className="flex flex-col gap-3 rounded-md border p-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="certificado-condicional">Es un certificado de condicional</Label>
                <p className="text-xs text-muted-foreground">
                  En la caja, el servicio ofrece este certificado o el de siempre. Se cobra el
                  precio del servicio, entero o al 50%; si vuelve dentro del plazo y aprueba, paga
                  lo que falta y se entrega el certificado de siempre.
                </p>
              </div>
              <Switch
                id="certificado-condicional"
                checked={formulario.condicional}
                onCheckedChange={(valor) => {
                  cambiar("condicional", valor);
                }}
              />
            </div>
            {formulario.condicional && (
              <Campo
                id="certificado-dias-vuelta"
                etiqueta="Días para volver"
                error={errores.diasVuelta}
              >
                <Input
                  id="certificado-dias-vuelta"
                  value={formulario.diasVuelta}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={String(DIAS_VUELTA_MAXIMO).length}
                  onChange={(e) => {
                    cambiar("diasVuelta", e.target.value);
                  }}
                  {...propsError("certificado-dias-vuelta", errores.diasVuelta)}
                />
                <p className="text-xs text-muted-foreground">
                  Cambiarlo no modifica las condicionales ya vendidas.
                </p>
              </Campo>
            )}
          </div>

          <ErrorFormulario mensaje={errorServidor} />
          <DialogFooter>
            <Button type="submit" disabled={guardando}>
              {guardando ? "Guardando…" : certificado ? "Guardar" : "Crear certificado"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
