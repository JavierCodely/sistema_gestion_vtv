import { formatearMoneda } from "@/compartido/lib/formato";
import { calcularVuelto } from "../lib/vuelto";

/** Resumen de la venta recién registrada, con los montos que devolvió la BD. */
export interface UltimaVenta {
  id: number;
  servicio: string;
  patente: string;
  /** Vuelta de una condicional (cobra lo que faltaba, con la hoja del aprobado). */
  vuelta: boolean;
  /** Condicional al 50%: lo que se cobra al volver (0 si no). */
  saldoCondicional: number;
  /** Lo cobrado (`ventas.precio`, ya con el descuento). */
  precio: number;
  descuento: { nombre: string; monto: number } | null;
  /** "Efectivo", "Tarjeta"… o "Mixto". */
  medio: string;
  /** Detalle de un pago mixto ("Efectivo $ 5.000,00 + Tarjeta $ 13.000,00"). */
  detallePagos: string | null;
  /** Lo que se cobró en efectivo (el precio o la parte en efectivo); null si no hubo efectivo. */
  efectivo: number | null;
  /** Cuánto entregó en efectivo; null = pagó justo. */
  recibido: number | null;
  sinStock: boolean;
}

/** Vuelto de la última venta; negativo si lo entregado no alcanza para lo que registró la BD. */
function vueltoDeUltimaVenta(venta: UltimaVenta): number | null {
  if (venta.efectivo === null || venta.recibido === null) return null;
  return calcularVuelto(venta.efectivo, venta.recibido);
}

export function UltimaVentaRegistrada({ venta }: { venta: UltimaVenta }) {
  const vuelto = vueltoDeUltimaVenta(venta);
  return (
    <section
      aria-labelledby="titulo-ultima-venta"
      className="flex flex-col gap-2 rounded-lg border p-5"
      data-testid="ultima-venta"
    >
      <h2 id="titulo-ultima-venta" className="text-xl font-semibold text-muted-foreground">
        Última venta · N° {venta.id}
      </h2>
      <p className="text-2xl font-semibold">
        {venta.servicio} · {formatearMoneda(venta.precio)}
      </p>
      <p className="font-mono text-xl font-bold tracking-widest">{venta.patente}</p>
      {venta.vuelta && (
        <p className="text-base">
          {venta.precio === 0
            ? "Vuelta de condicional: sin cargo."
            : "Vuelta de condicional: pagó el 50% que faltaba."}
        </p>
      )}
      {venta.saldoCondicional > 0 && (
        <p className="text-base">
          Condicional al 50%: al volver paga {formatearMoneda(venta.saldoCondicional)}.
        </p>
      )}
      {venta.descuento && (
        <p className="text-base">
          Descuento {venta.descuento.nombre}: −{formatearMoneda(venta.descuento.monto)}
        </p>
      )}
      <p className="text-xl">{venta.medio}</p>
      {venta.detallePagos && <p className="text-base">{venta.detallePagos}</p>}
      {venta.efectivo !== null &&
        (vuelto === null ? (
          <p className="text-3xl font-bold tabular-nums">Pagó justo</p>
        ) : vuelto < 0 ? (
          <p role="alert" className="text-2xl font-bold text-destructive tabular-nums">
            Atención: lo entregado no alcanza. Faltan cobrar {formatearMoneda(-vuelto)}.
          </p>
        ) : (
          <p className="text-3xl font-bold tabular-nums">Vuelto {formatearMoneda(vuelto)}</p>
        ))}
      {venta.sinStock && <p className="text-base text-destructive">Sin hoja de certificado.</p>}
    </section>
  );
}
