import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/compartido/ui/card";

/** Tarjeta de un número grande (KPI). */
export function Dato({
  etiqueta,
  valor,
  detalle,
  id,
}: {
  etiqueta: string;
  valor: string;
  detalle?: ReactNode;
  id: string;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{etiqueta}</CardDescription>
        <CardTitle className="text-2xl tabular-nums" data-testid={`dato-${id}`}>
          {valor}
        </CardTitle>
        {detalle && <p className="text-xs text-muted-foreground">{detalle}</p>}
      </CardHeader>
    </Card>
  );
}

/** Bloque con título, descripción y su contenido o el estado vacío. */
export function Bloque({
  titulo,
  descripcion,
  vacio,
  children,
}: {
  titulo: string;
  descripcion: string;
  vacio: string | null;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h3>{titulo}</h3>
        </CardTitle>
        <CardDescription>{descripcion}</CardDescription>
      </CardHeader>
      <CardContent>
        {vacio ? <p className="py-6 text-center text-muted-foreground">{vacio}</p> : children}
      </CardContent>
    </Card>
  );
}
