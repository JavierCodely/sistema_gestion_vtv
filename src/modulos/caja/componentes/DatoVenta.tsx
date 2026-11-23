import type { ReactNode } from "react";

/** Un dato de la venta en curso (etiqueta chica, valor grande), dentro de un `<dl>`. */
export function DatoVenta({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-base text-muted-foreground">{etiqueta}</dt>
      <dd className="text-2xl font-semibold md:text-3xl">{children}</dd>
    </div>
  );
}
