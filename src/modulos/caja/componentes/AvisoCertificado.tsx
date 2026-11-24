import { mensajeDeError } from "@/compartido/lib/errores";
import { formatearNumero } from "@/compartido/lib/formato";
import type { Servicio } from "@/modulos/servicios/api/consultas";
import { useCertificadoDeServicio } from "../api/consultas";

/**
 * Qué hoja de certificado se va a usar con el servicio elegido (la decide la BD): la de siempre o,
 * en una condicional, la del certificado condicional.
 */
export function AvisoCertificado({
  servicio,
  condicional = false,
}: {
  servicio: Servicio;
  condicional?: boolean;
}) {
  const certificado = useCertificadoDeServicio(
    servicio.requiere_certificado ? servicio.id : null,
    condicional,
  );
  if (!servicio.requiere_certificado) {
    return <p className="text-base text-muted-foreground">Este servicio no lleva certificado.</p>;
  }
  if (certificado.isPending) {
    return <p className="text-base text-muted-foreground">Buscando el certificado…</p>;
  }
  if (certificado.isError) {
    return <p className="text-base text-destructive">{mensajeDeError(certificado.error)}</p>;
  }
  if (certificado.data === null) {
    return (
      <p className="text-base text-destructive" data-testid="aviso-certificado">
        {condicional
          ? "Este servicio ya no tiene un certificado condicional: volvé y elegí el de siempre."
          : "No hay un certificado configurado para este servicio. La venta se registra igual y se avisa al administrador."}
      </p>
    );
  }
  const { nombre, stock_hojas } = certificado.data;
  return stock_hojas > 0 ? (
    <p className="text-base text-muted-foreground" data-testid="aviso-certificado">
      Usa una hoja de “{nombre}” (quedan {formatearNumero(stock_hojas)}).
    </p>
  ) : (
    <p className="text-base text-destructive" data-testid="aviso-certificado">
      No quedan hojas de “{nombre}”. La venta se registra igual y se avisa al administrador.
    </p>
  );
}
