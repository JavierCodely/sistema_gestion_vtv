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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/compartido/ui/select";
import {
  MENSAJES_ERROR_CERTIFICADO,
  useActualizarCertificado,
  useCrearCertificado,
  type CertificadoConStock,
} from "../api/consultas";
import {
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
    };
  }
  return {
    nombre: certificado.nombre,
    unidadCompra: certificado.unidad_compra,
    hojasPorUnidad: String(certificado.hojas_por_unidad),
    stockMinimo: String(certificado.stock_minimo),
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
