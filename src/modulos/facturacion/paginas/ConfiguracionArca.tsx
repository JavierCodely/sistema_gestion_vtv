import { PlugZap, Upload } from "lucide-react";
import { useState, type SubmitEvent } from "react";
import { toast } from "sonner";
import { Campo } from "@/compartido/componentes/Campo";
import { Cargando } from "@/compartido/componentes/Cargando";
import { ErrorFormulario } from "@/compartido/componentes/ErrorFormulario";
import { propsError } from "@/compartido/lib/accesibilidad";
import { mensajeDeError } from "@/compartido/lib/errores";
import { formatearFechaHora } from "@/compartido/lib/formato";
import { montoComoTexto } from "@/compartido/lib/validaciones";
import { Alert, AlertDescription, AlertTitle } from "@/compartido/ui/alert";
import { Button } from "@/compartido/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/compartido/ui/card";
import { Input } from "@/compartido/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/compartido/ui/select";
import {
  type ConfiguracionArca as Configuracion,
  type ResultadoPrueba,
  useCondicionesIva,
  useConfiguracionArca,
  useGuardarCertificado,
  useGuardarConfiguracion,
  useProbarConexion,
} from "../api/consultas";
import { formatearCuit } from "../lib/formato";
import {
  type FormularioConfiguracion,
  LARGO_MAXIMO_DOMICILIO,
  LARGO_MAXIMO_IIBB,
  LARGO_MAXIMO_RAZON_SOCIAL,
  validarConfiguracion,
} from "../lib/validaciones";

/** Tamaño máximo de cada archivo PEM (un certificado de ARCA ronda los 2 KB). */
const TAMANO_MAXIMO_PEM = 20_000;

function formularioDesde(c: Configuracion): FormularioConfiguracion {
  return {
    cuit: c.cuit ?? "",
    razonSocial: c.razon_social ?? "",
    domicilio: c.domicilio ?? "",
    inicioActividades: c.inicio_actividades ?? "",
    iibb: c.iibb ?? "",
    puntoVenta: c.punto_venta === null ? "" : String(c.punto_venta),
    ambiente: c.ambiente,
    tope: montoComoTexto(c.tope_identificacion),
  };
}

function DatosFiscales({ configuracion }: { configuracion: Configuracion }) {
  const guardar = useGuardarConfiguracion();
  const [f, setF] = useState(() => formularioDesde(configuracion));
  const [errores, setErrores] = useState<Partial<Record<keyof FormularioConfiguracion, string>>>(
    {},
  );
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  function cambiar<K extends keyof FormularioConfiguracion>(
    campo: K,
    valor: FormularioConfiguracion[K],
  ) {
    setF((actual) => ({ ...actual, [campo]: valor }));
    setErrores((e) => ({ ...e, [campo]: undefined }));
  }

  async function enviar(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    const resultado = validarConfiguracion(f);
    setErrores(resultado.errores ?? {});
    if (!resultado.datos) return;
    setErrorServidor(null);
    try {
      await guardar.mutateAsync(resultado.datos);
      toast.success("Datos fiscales guardados");
    } catch (e) {
      setErrorServidor(mensajeDeError(e));
    }
  }

  const texto = (
    campo: "cuit" | "razonSocial" | "domicilio" | "iibb" | "puntoVenta" | "tope",
    id: string,
    etiqueta: string,
    extra: { maxLength?: number; inputMode?: "numeric" | "decimal"; placeholder?: string } = {},
  ) => (
    <Campo id={id} etiqueta={etiqueta} error={errores[campo]}>
      <Input
        id={id}
        autoComplete="off"
        {...extra}
        value={f[campo]}
        onChange={(e) => {
          cambiar(campo, e.target.value);
        }}
        {...propsError(id, errores[campo])}
      />
    </Campo>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Datos del emisor</h2>
        </CardTitle>
        <CardDescription>
          Responsable Inscripto. Se imprimen en cada comprobante y se usan para pedir el CAE.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => void enviar(e)} noValidate>
          {texto("cuit", "arca-cuit", "CUIT", {
            inputMode: "numeric",
            placeholder: "30-71234567-1",
          })}
          {texto("razonSocial", "arca-razon", "Razón social", {
            maxLength: LARGO_MAXIMO_RAZON_SOCIAL,
          })}
          <div className="sm:col-span-2">
            {texto("domicilio", "arca-domicilio", "Domicilio comercial", {
              maxLength: LARGO_MAXIMO_DOMICILIO,
            })}
          </div>
          <Campo
            id="arca-inicio"
            etiqueta="Inicio de actividades"
            error={errores.inicioActividades}
          >
            <Input
              id="arca-inicio"
              type="date"
              value={f.inicioActividades}
              onChange={(e) => {
                cambiar("inicioActividades", e.target.value);
              }}
              {...propsError("arca-inicio", errores.inicioActividades)}
            />
          </Campo>
          {texto("iibb", "arca-iibb", "Ingresos brutos (opcional)", {
            maxLength: LARGO_MAXIMO_IIBB,
          })}
          {texto("puntoVenta", "arca-pv", "Punto de venta", { inputMode: "numeric" })}
          <Campo id="arca-ambiente" etiqueta="Ambiente">
            <Select
              value={f.ambiente}
              onValueChange={(valor) => {
                cambiar("ambiente", valor === "produccion" ? "produccion" : "homologacion");
              }}
            >
              <SelectTrigger id="arca-ambiente" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="homologacion">Homologación (pruebas)</SelectItem>
                <SelectItem value="produccion">Producción</SelectItem>
              </SelectContent>
            </Select>
          </Campo>
          <div className="sm:col-span-2">
            {texto("tope", "arca-tope", "Tope para identificar al consumidor final ($)", {
              inputMode: "decimal",
            })}
            <p className="mt-1 text-xs text-muted-foreground">
              Desde este importe ARCA exige el DNI o CUIT del cliente. Actualizalo si ARCA lo
              cambia.
            </p>
          </div>
          {f.ambiente === "produccion" && configuracion.ambiente !== "produccion" && (
            <Alert className="sm:col-span-2">
              <AlertTitle>Vas a pasar a producción</AlertTitle>
              <AlertDescription>
                Los comprobantes que se emitan tendrán validez fiscal. Necesitás un certificado de
                producción (el de homologación no sirve).
              </AlertDescription>
            </Alert>
          )}
          <div className="sm:col-span-2">
            <ErrorFormulario mensaje={errorServidor} />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={guardar.isPending}>
              {guardar.isPending ? "Guardando…" : "Guardar datos"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/** Texto del archivo o el motivo por el que no sirve. */
async function leerPem(
  archivo: File | undefined,
  nombre: string,
): Promise<{ texto: string } | { error: string }> {
  if (!archivo) return { error: `Elegí ${nombre}.` };
  if (archivo.size === 0) return { error: `El archivo elegido para ${nombre} está vacío.` };
  if (archivo.size > TAMANO_MAXIMO_PEM) {
    return { error: `El archivo elegido para ${nombre} es demasiado grande: ¿es el correcto?` };
  }
  return { texto: await archivo.text() };
}

function Certificado({ configuracion }: { configuracion: Configuracion }) {
  const guardar = useGuardarCertificado();
  const [certificado, setCertificado] = useState<File | undefined>();
  const [clave, setClave] = useState<File | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const vencido =
    configuracion.certificado_vence !== null &&
    new Date(configuracion.certificado_vence) < new Date();

  async function enviar(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError(null);
    const [pemCertificado, pemClave] = await Promise.all([
      leerPem(certificado, "el certificado (.crt)"),
      leerPem(clave, "la clave privada (.key)"),
    ]);
    if ("error" in pemCertificado || "error" in pemClave) {
      setError(
        [pemCertificado, pemClave]
          .map((r) => ("error" in r ? r.error : ""))
          .filter(Boolean)
          .join(" "),
      );
      return;
    }
    try {
      await guardar.mutateAsync({ certificado: pemCertificado.texto, clave: pemClave.texto });
      toast.success("Certificado guardado");
      setCertificado(undefined);
      setClave(undefined);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(mensajeDeError(e));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Certificado digital</h2>
        </CardTitle>
        <CardDescription>
          Se guarda cifrado en el servidor y nunca vuelve al navegador.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {configuracion.certificado_cuit ? (
          <dl className="grid gap-2 text-sm sm:grid-cols-3" data-testid="certificado-actual">
            <div>
              <dt className="text-muted-foreground">CUIT del certificado</dt>
              <dd className="font-medium">{formatearCuit(configuracion.certificado_cuit)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Vence</dt>
              <dd className={vencido ? "font-medium text-destructive" : "font-medium"}>
                {configuracion.certificado_vence
                  ? formatearFechaHora(configuracion.certificado_vence)
                  : "—"}
                {vencido && " (vencido)"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Cargado</dt>
              <dd className="font-medium">
                {configuracion.certificado_cargado_en
                  ? formatearFechaHora(configuracion.certificado_cargado_en)
                  : "—"}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Todavía no se cargó ningún certificado.</p>
        )}
        <form
          key={version}
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => void enviar(e)}
          noValidate
        >
          <Campo id="arca-crt" etiqueta="Certificado (.crt)">
            <Input
              id="arca-crt"
              type="file"
              accept=".crt,.pem,.cer"
              onChange={(e) => {
                setCertificado(e.target.files?.[0]);
              }}
            />
          </Campo>
          <Campo id="arca-key" etiqueta="Clave privada (.key)">
            <Input
              id="arca-key"
              type="file"
              accept=".key,.pem"
              onChange={(e) => {
                setClave(e.target.files?.[0]);
              }}
            />
          </Campo>
          <div className="sm:col-span-2">
            <ErrorFormulario mensaje={error} />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={guardar.isPending}>
              <Upload aria-hidden />
              {guardar.isPending ? "Guardando…" : "Guardar certificado"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Conexion({ configuracion }: { configuracion: Configuracion }) {
  const probar = useProbarConexion();
  const condiciones = useCondicionesIva();
  const [resultado, setResultado] = useState<ResultadoPrueba | null>(null);

  async function ejecutar() {
    setResultado(null);
    try {
      setResultado(await probar.mutateAsync());
    } catch (e) {
      setResultado({ ok: false, mensaje: mensajeDeError(e) });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Conexión con ARCA</h2>
        </CardTitle>
        <CardDescription>
          Pide un ticket de acceso, actualiza las condiciones frente al IVA y consulta el último
          comprobante del punto de venta.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <Button variant="outline" disabled={probar.isPending} onClick={() => void ejecutar()}>
            <PlugZap aria-hidden />
            {probar.isPending ? "Probando…" : "Probar conexión"}
          </Button>
        </div>
        {resultado && (
          <Alert variant={resultado.ok ? "default" : "destructive"} data-testid="resultado-prueba">
            <AlertTitle>{resultado.ok ? "Conexión correcta" : "No se pudo conectar"}</AlertTitle>
            <AlertDescription>{resultado.mensaje}</AlertDescription>
          </Alert>
        )}
        <div className="text-sm">
          <h3 className="font-medium">Condiciones frente al IVA</h3>
          {condiciones.isPending ? (
            <Cargando texto="Cargando condiciones…" />
          ) : condiciones.isError ? (
            <ErrorFormulario mensaje={mensajeDeError(condiciones.error)} />
          ) : condiciones.data.length === 0 ? (
            <p className="text-muted-foreground">
              Sin cargar: probá la conexión para traerlas de ARCA.
            </p>
          ) : (
            <>
              <ul className="mt-1 list-inside list-disc">
                {condiciones.data.map((c) => (
                  <li key={c.id}>
                    {c.descripcion} · Factura {c.clases.join(" o ")}
                  </li>
                ))}
              </ul>
              {configuracion.condiciones_actualizadas_en && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Actualizadas {formatearFechaHora(configuracion.condiciones_actualizadas_en)}
                </p>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Configuración de la facturación electrónica (solo admin). */
export function ConfiguracionArca() {
  const configuracion = useConfiguracionArca();

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Configuración ARCA</h1>
        <p className="text-sm text-muted-foreground">
          Facturación electrónica (WSFEv1). Cargá los datos, el certificado y probá la conexión.
        </p>
      </div>
      {configuracion.isPending ? (
        <Cargando />
      ) : configuracion.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{mensajeDeError(configuracion.error)}</AlertDescription>
        </Alert>
      ) : (
        <>
          <DatosFiscales configuracion={configuracion.data} />
          <Certificado configuracion={configuracion.data} />
          <Conexion configuracion={configuracion.data} />
        </>
      )}
    </section>
  );
}
