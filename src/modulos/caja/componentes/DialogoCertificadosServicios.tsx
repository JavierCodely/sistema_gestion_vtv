import { ClipboardList } from "lucide-react";
import { useState } from "react";
import { Cargando } from "@/compartido/componentes/Cargando";
import { mensajeDeError } from "@/compartido/lib/errores";
import { formatearMoneda } from "@/compartido/lib/formato";
import { cn } from "@/compartido/lib/utils";
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
  useCertificadosServiciosDeTurno,
  type CertificadoDelTurno,
  type ServicioDelTurno,
} from "../api/consultas";

function TablaCertificados({ certificados }: { certificados: CertificadoDelTurno[] }) {
  if (certificados.length === 0) {
    return <p className="text-muted-foreground">No se entregaron certificados en este turno.</p>;
  }
  return (
    <div className="md:overflow-x-auto md:rounded-md md:border">
      <Table apilada>
        <TableHeader>
          <TableRow>
            <TableHead>Certificado</TableHead>
            <TableHead className="text-right">Entregados</TableHead>
            <TableHead className="text-right">De ventas anuladas</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {certificados.map((c) => (
            <TableRow key={c.id} data-testid={`certificado-turno-${String(c.id)}`}>
              <TableCell data-label="Certificado" className="font-medium">
                <span className="flex flex-wrap items-center gap-2">
                  {c.nombre}
                  {c.condicional && <Badge variant="outline">Condicional</Badge>}
                </span>
              </TableCell>
              <TableCell data-label="Entregados" className="text-right tabular-nums">
                {c.cantidad}
              </TableCell>
              <TableCell
                data-label="De ventas anuladas"
                className={cn(
                  "text-right tabular-nums",
                  c.anuladas === 0 && "text-muted-foreground",
                )}
              >
                {c.anuladas}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function TablaServicios({ servicios }: { servicios: ServicioDelTurno[] }) {
  if (servicios.length === 0) {
    return <p className="text-muted-foreground">No hay servicios activos.</p>;
  }
  // El admin recibe los totales en $; al cajero la BD se los manda en null (no ve totales).
  const conTotales = servicios.some((s) => s.efectivoTotal !== null);
  return (
    <div className="md:overflow-x-auto md:rounded-md md:border">
      <Table apilada="grilla">
        <TableHeader>
          <TableRow>
            <TableHead>Servicio</TableHead>
            <TableHead className="text-right">Precio</TableHead>
            <TableHead className="text-right">Efectivo</TableHead>
            <TableHead className="text-right">Transferencia</TableHead>
            {conTotales && (
              <>
                <TableHead className="text-right">Cobrado en efectivo</TableHead>
                <TableHead className="text-right">Cobrado por transferencia</TableHead>
              </>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {servicios.map((s) => (
            <TableRow key={s.id} data-testid={`servicio-turno-${String(s.id)}`}>
              <TableCell data-label="Servicio" className="max-md:col-span-2">
                <span className="flex flex-col">
                  <span className="font-medium">{s.nombre}</span>
                  <span className="text-sm text-muted-foreground">{s.categoria}</span>
                </span>
              </TableCell>
              <TableCell data-label="Precio" className="text-right tabular-nums">
                {formatearMoneda(s.precio)}
              </TableCell>
              <TableCell data-label="Efectivo" className="text-right tabular-nums">
                {s.efectivoCantidad}
              </TableCell>
              <TableCell data-label="Transferencia" className="text-right tabular-nums">
                {s.transferenciaCantidad}
              </TableCell>
              {conTotales && (
                <>
                  <TableCell data-label="Cobrado en efectivo" className="text-right tabular-nums">
                    {formatearMoneda(s.efectivoTotal ?? 0)}
                  </TableCell>
                  <TableCell
                    data-label="Cobrado por transferencia"
                    className="text-right tabular-nums"
                  >
                    {formatearMoneda(s.transferenciaTotal ?? 0)}
                  </TableCell>
                </>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Contenido({ turnoId, abierta }: { turnoId: number; abierta: boolean }) {
  const datos = useCertificadosServiciosDeTurno(turnoId, abierta);
  if (datos.isPending) return <Cargando texto="Cargando certificados y servicios…" />;
  if (datos.isError) return <p className="text-destructive">{mensajeDeError(datos.error)}</p>;
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="titulo-certificados-turno" className="flex flex-col gap-2">
        <h3 id="titulo-certificados-turno" className="text-lg font-semibold">
          Certificados
        </h3>
        <p className="text-sm text-muted-foreground">
          Hojas entregadas en el turno. Las de ventas anuladas van aparte: la hoja no vuelve al
          stock.
        </p>
        <TablaCertificados certificados={datos.data.certificados} />
      </section>
      <section aria-labelledby="titulo-servicios-turno" className="flex flex-col gap-2">
        <h3 id="titulo-servicios-turno" className="text-lg font-semibold">
          Servicios
        </h3>
        <p className="text-sm text-muted-foreground">
          Cuántas ventas de cada servicio se cobraron en efectivo y por transferencia, sin las
          anuladas. Las de pago mixto no se cuentan.
        </p>
        <TablaServicios servicios={datos.data.servicios} />
      </section>
    </div>
  );
}

/**
 * Botón "Certificados y servicios" y su ventana (migración 53, decisión 2026-11-27): qué certificados
 * se entregaron en el turno y cuántas ventas de cada servicio se cobraron en efectivo y por
 * transferencia, con el precio. Todo lo calcula la BD. La ven el cajero en la caja (turno abierto) y
 * el admin en cada turno; solo el admin ve los totales en $.
 */
export function DialogoCertificadosServicios({
  turnoId,
  grande = false,
}: {
  turnoId: number;
  grande?: boolean;
}) {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={grande ? "lg" : "default"}
        className={cn(grande && "h-auto self-stretch text-base")}
        onClick={() => {
          setAbierta(true);
        }}
      >
        <ClipboardList aria-hidden />
        Certificados y servicios
      </Button>
      <Dialog open={abierta} onOpenChange={setAbierta}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Certificados y servicios</DialogTitle>
            <DialogDescription>Lo que se hizo en este turno.</DialogDescription>
          </DialogHeader>
          {abierta && <Contenido turnoId={turnoId} abierta={abierta} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
