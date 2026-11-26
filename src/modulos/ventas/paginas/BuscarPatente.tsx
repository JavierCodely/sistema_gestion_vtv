import { Search } from "lucide-react";
import { useState, type SubmitEvent } from "react";
import { useSearchParams } from "react-router";
import { Cargando } from "@/compartido/componentes/Cargando";
import { mensajeDeError } from "@/compartido/lib/errores";
import { formatearDia, formatearFechaHora, formatearMoneda } from "@/compartido/lib/formato";
import { cn } from "@/compartido/lib/utils";
import { LARGO_MAXIMO_PATENTE } from "@/compartido/lib/validaciones";
import { Alert, AlertDescription } from "@/compartido/ui/alert";
import { Badge } from "@/compartido/ui/badge";
import { Button } from "@/compartido/ui/button";
import { Input } from "@/compartido/ui/input";
import { Label } from "@/compartido/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/compartido/ui/table";
import { MEDIOS_PAGO, type MedioPago } from "@/modulos/caja/api/consultas";
import {
  MINIMO_BUSQUEDA_PATENTE,
  useVentasPorPatente,
  type VentaDePatente,
} from "../api/consultas";
import { normalizarPatente } from "../lib/patente";

function textoMedio(medio: string): string {
  return medio in MEDIOS_PAGO ? MEDIOS_PAGO[medio as MedioPago] : "Mixto";
}

function Certificado({ venta }: { venta: VentaDePatente }) {
  if (venta.certificado_nombre) {
    return (
      <>
        {venta.certificado_nombre}
        {venta.sin_stock && <span className="block text-xs text-destructive">Sin stock</span>}
      </>
    );
  }
  if (venta.sin_stock) return <span className="text-destructive">Sin certificado configurado</span>;
  return <span className="text-muted-foreground">No lleva</span>;
}

function Condicional({ venta }: { venta: VentaDePatente }) {
  if (venta.vuelta_de !== null) {
    return (
      <Badge variant="secondary">
        {venta.precio === 0 ? "Vuelta sin cargo" : "Vuelta: pagó el 50% restante"} de la N°{" "}
        {String(venta.vuelta_de)}
      </Badge>
    );
  }
  if (venta.condicional_vence === null) return null;
  const saldo = venta.condicional_saldo ?? 0;
  return (
    <div className="flex flex-col gap-1">
      <Badge variant="outline">Condicional hasta {formatearDia(venta.condicional_vence)}</Badge>
      {saldo > 0 && <span className="text-xs">Pagó el 50%: faltan {formatearMoneda(saldo)}</span>}
      <span className="text-xs text-muted-foreground">
        {venta.vuelta_venta_id !== null
          ? `Volvió: venta N° ${String(venta.vuelta_venta_id)}`
          : saldo > 0
            ? `Vuelve a “${venta.condicional_servicio ?? "—"}” pagando el resto`
            : `Vuelve a “${venta.condicional_servicio ?? "—"}” sin cargo`}
      </span>
    </div>
  );
}

/**
 * Historial de una patente (solo admin): cada venta con su servicio, el certificado entregado y la
 * relación condicional ↔ vuelta. Busca las patentes que empiezan con lo escrito; la búsqueda queda en
 * la URL (`?patente=`).
 */
export function BuscarPatente() {
  const [parametros, setParametros] = useSearchParams();
  const buscada = normalizarPatente(parametros.get("patente") ?? "");
  const [texto, setTexto] = useState(buscada);
  const [error, setError] = useState<string | null>(null);
  const ventas = useVentasPorPatente(buscada);
  const filas = ventas.data ?? [];

  function buscar(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (texto.length < MINIMO_BUSQUEDA_PATENTE) {
      setError(`Escribí al menos ${String(MINIMO_BUSQUEDA_PATENTE)} caracteres de la patente.`);
      return;
    }
    setError(null);
    setParametros({ patente: texto });
  }

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Patentes</h1>
        <p className="text-sm text-muted-foreground">
          Todas las ventas de una patente, con el servicio y el certificado que se entregó. Las
          condicionales muestran hasta cuándo vuelven sin cargo y con qué venta volvieron.
        </p>
      </div>
      <form className="flex flex-wrap items-end gap-2" noValidate onSubmit={buscar}>
        <div className="flex flex-col gap-1">
          <Label htmlFor="buscar-patente">Patente</Label>
          <Input
            id="buscar-patente"
            className="w-56 uppercase"
            autoComplete="off"
            spellCheck={false}
            autoFocus
            maxLength={LARGO_MAXIMO_PATENTE}
            placeholder="AB123CD"
            value={texto}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "buscar-patente-error" : undefined}
            onChange={(e) => {
              setError(null);
              setTexto(normalizarPatente(e.target.value));
            }}
          />
        </div>
        <Button type="submit">
          <Search aria-hidden />
          Buscar
        </Button>
      </form>
      {error && (
        <p id="buscar-patente-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {buscada.length >= MINIMO_BUSQUEDA_PATENTE &&
        (ventas.isPending ? (
          <Cargando />
        ) : ventas.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{mensajeDeError(ventas.error)}</AlertDescription>
          </Alert>
        ) : filas.length === 0 ? (
          <p className="rounded-md border p-6 text-center text-muted-foreground">
            No hay ventas de patentes que empiecen con “{buscada}”.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground" data-testid="cantidad-ventas-patente">
              {filas.length === 1 ? "1 venta" : `${String(filas.length)} ventas`}
            </p>
            <div className="md:overflow-x-auto md:rounded-md md:border">
              <Table apilada>
                <TableHeader>
                  <TableRow>
                    <TableHead>N°</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Patente</TableHead>
                    <TableHead>Servicio</TableHead>
                    <TableHead>Certificado entregado</TableHead>
                    <TableHead className="text-right">Precio</TableHead>
                    <TableHead>Medio</TableHead>
                    <TableHead>Caja · Vendió</TableHead>
                    <TableHead>Condicional</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filas.map((venta) => {
                    const tachada = cn(
                      venta.anulada && "text-muted-foreground line-through max-md:no-underline",
                    );
                    return (
                      <TableRow key={venta.id} data-testid={`venta-patente-${String(venta.id)}`}>
                        <TableCell
                          data-label="Venta N°"
                          className="tabular-nums max-md:font-semibold"
                        >
                          {venta.id}
                        </TableCell>
                        <TableCell data-label="Fecha" className={cn("whitespace-nowrap", tachada)}>
                          <div>
                            {formatearFechaHora(venta.creado_en)}
                            {venta.venta_pasada && (
                              <span className="block text-xs text-muted-foreground no-underline">
                                Fecha pasada
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell
                          data-label="Patente"
                          className={cn("font-medium max-md:text-base", tachada)}
                        >
                          {venta.patente}
                        </TableCell>
                        <TableCell data-label="Servicio" className={tachada}>
                          <div>
                            {venta.servicio_nombre}
                            <span className="block text-xs text-muted-foreground">
                              {venta.categoria_nombre}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell data-label="Certificado" className={tachada}>
                          <div>
                            <Certificado venta={venta} />
                          </div>
                        </TableCell>
                        <TableCell
                          data-label="Precio"
                          className={cn(
                            "text-right tabular-nums max-md:text-base max-md:font-semibold",
                            tachada,
                          )}
                        >
                          {formatearMoneda(venta.precio)}
                        </TableCell>
                        <TableCell data-label="Medio" className={tachada}>
                          {textoMedio(venta.medio)}
                        </TableCell>
                        <TableCell data-label="Caja · Vendió" className={tachada}>
                          <div>
                            {venta.caja_nombre}
                            <span className="block text-xs text-muted-foreground">
                              {venta.usuario_nombre}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell data-label="Condicional">
                          <div className="flex flex-col items-end gap-1 md:items-start">
                            {venta.anulada && (
                              <Badge variant="destructive" className="md:self-start">
                                Anulada
                              </Badge>
                            )}
                            <Condicional venta={venta} />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        ))}
    </section>
  );
}
