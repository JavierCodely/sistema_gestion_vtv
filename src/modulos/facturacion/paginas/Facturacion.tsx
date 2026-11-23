import { RotateCw } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Cargando } from "@/compartido/componentes/Cargando";
import { mensajeDeError } from "@/compartido/lib/errores";
import { formatearFechaHora, formatearMoneda, formatearNumero } from "@/compartido/lib/formato";
import { Alert, AlertDescription } from "@/compartido/ui/alert";
import { Badge } from "@/compartido/ui/badge";
import { Button } from "@/compartido/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/compartido/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/compartido/ui/table";
import {
  type Comprobante,
  type Intento,
  useComprobantesSinAutorizar,
  useEmitir,
  useIntentos,
} from "../api/consultas";
import { ESTADOS, nombreComprobante, numeroComprobante } from "../lib/formato";

const OPERACIONES: Record<string, string> = {
  wsaa: "Ticket de acceso (WSAA)",
  ultimo_autorizado: "Último autorizado",
  solicitar: "Pedido de CAE",
  consultar: "Consulta de comprobante",
  condiciones: "Condiciones IVA",
  probar_conexion: "Prueba de conexión",
};

function FilaSinAutorizar({ c }: { c: Comprobante }) {
  const emitir = useEmitir();
  async function reintentar() {
    try {
      const r = await emitir.mutateAsync(c.id);
      if (r.estado === "autorizado") {
        toast.success(
          `${nombreComprobante(r.cbte_tipo)} ${numeroComprobante(r.punto_venta, r.numero)} autorizada por ARCA`,
        );
      } else {
        toast.error(r.mensaje ?? "ARCA no autorizó el comprobante");
      }
    } catch (e) {
      toast.error(mensajeDeError(e));
    }
  }
  return (
    <TableRow data-testid={`sin-autorizar-${String(c.id)}`}>
      <TableCell>{nombreComprobante(c.cbte_tipo)}</TableCell>
      <TableCell>
        <Link className="underline" to={`/admin/ventas/turnos/${String(c.turno_id)}`}>
          Venta N° {c.venta_id}
        </Link>
      </TableCell>
      <TableCell className="text-right tabular-nums">{formatearMoneda(c.total)}</TableCell>
      <TableCell>
        <Badge variant={c.estado === "rechazado" ? "destructive" : "outline"}>
          {c.a_reconciliar ? "A confirmar con ARCA" : ESTADOS[c.estado]}
        </Badge>
        {c.mensaje && <div className="text-xs text-muted-foreground">{c.mensaje}</div>}
      </TableCell>
      <TableCell className="tabular-nums">{c.intentos}</TableCell>
      <TableCell className="text-right">
        {c.tipo === "factura" && c.estado === "rechazado" ? (
          // Un rechazo suele ser por los datos del cliente: se corrigen al refacturar desde el turno.
          <Button asChild variant="outline" size="sm">
            <Link to={`/admin/ventas/turnos/${String(c.turno_id)}`}>Corregir datos</Link>
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={emitir.isPending}
            aria-label={`Reintentar ${nombreComprobante(c.cbte_tipo)} de la venta N° ${String(c.venta_id)}`}
            onClick={() => void reintentar()}
          >
            <RotateCw aria-hidden />
            {emitir.isPending ? "Emitiendo…" : "Reintentar"}
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

function SinAutorizar() {
  const comprobantes = useComprobantesSinAutorizar();
  const filas = comprobantes.data?.pages.flat() ?? [];
  return (
    <section aria-labelledby="titulo-sin-autorizar" className="flex flex-col gap-3">
      <h2 id="titulo-sin-autorizar" className="text-lg font-semibold">
        Comprobantes sin CAE
      </h2>
      {comprobantes.isPending ? (
        <Cargando />
      ) : comprobantes.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{mensajeDeError(comprobantes.error)}</AlertDescription>
        </Alert>
      ) : filas.length === 0 ? (
        <p className="rounded-md border p-6 text-center text-muted-foreground">
          No hay comprobantes pendientes ni rechazados.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Comprobante</TableHead>
                <TableHead>Venta</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Intentos</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((c) => (
                <FilaSinAutorizar key={c.id} c={c} />
              ))}
            </TableBody>
          </Table>
          {comprobantes.hasNextPage && (
            <Button
              variant="outline"
              className="m-2"
              disabled={comprobantes.isFetchingNextPage}
              onClick={() => void comprobantes.fetchNextPage()}
            >
              {comprobantes.isFetchingNextPage ? "Cargando…" : "Ver más comprobantes"}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

function DetalleIntento({ intento, onCerrar }: { intento: Intento; onCerrar: () => void }) {
  return (
    <Dialog
      open
      onOpenChange={(abierto) => {
        if (!abierto) onCerrar();
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {OPERACIONES[intento.operacion] ?? intento.operacion} ·{" "}
            {formatearFechaHora(intento.creado_en)}
          </DialogTitle>
          <DialogDescription>
            {intento.mensaje ?? "Sin mensaje"} · {formatearNumero(intento.duracion_ms)} ms. El
            token, la firma y el certificado no se guardan.
          </DialogDescription>
        </DialogHeader>
        {(["solicitud", "respuesta"] as const).map((campo) => (
          <div key={campo} className="flex min-w-0 flex-col gap-1">
            <h3 className="text-sm font-medium">
              {campo === "solicitud" ? "Solicitud SOAP" : "Respuesta SOAP"}
            </h3>
            <pre className="max-h-64 overflow-auto rounded-md bg-muted p-2 text-xs whitespace-pre-wrap break-all">
              {intento[campo] ?? "—"}
            </pre>
          </div>
        ))}
      </DialogContent>
    </Dialog>
  );
}

function Log() {
  const intentos = useIntentos();
  const [viendo, setViendo] = useState<Intento | null>(null);
  const filas = intentos.data?.pages.flat() ?? [];
  return (
    <section aria-labelledby="titulo-log" className="flex flex-col gap-3">
      <h2 id="titulo-log" className="text-lg font-semibold">
        Log de comunicaciones con ARCA
      </h2>
      {intentos.isPending ? (
        <Cargando />
      ) : intentos.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{mensajeDeError(intentos.error)}</AlertDescription>
        </Alert>
      ) : filas.length === 0 ? (
        <p className="rounded-md border p-6 text-center text-muted-foreground">
          Todavía no hubo comunicaciones con ARCA.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Operación</TableHead>
                  <TableHead>Resultado</TableHead>
                  <TableHead>Comprobante</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead className="text-right">Duración</TableHead>
                  <TableHead className="text-right">Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((i) => (
                  <TableRow key={i.id} data-testid={`intento-${String(i.id)}`}>
                    <TableCell className="whitespace-nowrap">
                      {formatearFechaHora(i.creado_en)}
                    </TableCell>
                    <TableCell>
                      {OPERACIONES[i.operacion] ?? i.operacion}
                      {i.ambiente === "homologacion" && (
                        <span className="text-xs text-muted-foreground"> · homologación</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={i.exito ? "secondary" : "destructive"}>
                        {i.exito ? "OK" : "Error"}
                      </Badge>
                      {i.mensaje && (
                        <div className="max-w-xs text-xs text-muted-foreground">{i.mensaje}</div>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{i.comprobante_id ?? "—"}</TableCell>
                    <TableCell>{i.perfiles?.nombre_completo ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatearNumero(i.duracion_ms)} ms
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Ver detalle del intento ${String(i.id)}`}
                        onClick={() => {
                          setViendo(i);
                        }}
                      >
                        Ver
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {intentos.hasNextPage && (
            <Button
              variant="outline"
              className="self-center"
              disabled={intentos.isFetchingNextPage}
              onClick={() => void intentos.fetchNextPage()}
            >
              {intentos.isFetchingNextPage ? "Cargando…" : "Ver más"}
            </Button>
          )}
        </>
      )}
      {viendo && (
        <DetalleIntento
          intento={viendo}
          onCerrar={() => {
            setViendo(null);
          }}
        />
      )}
    </section>
  );
}

/** Seguimiento de la facturación (solo admin): comprobantes sin CAE y log de ARCA. */
export function Facturacion() {
  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Facturación</h1>
        <p className="text-sm text-muted-foreground">
          Las ventas se facturan desde el historial del turno. Acá se reintentan los comprobantes
          que ARCA no autorizó y se revisa cada comunicación.
        </p>
      </div>
      <SinAutorizar />
      <Log />
    </section>
  );
}
