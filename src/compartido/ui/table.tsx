import * as React from "react";
import { cn } from "@/compartido/lib/utils";

/**
 * Tabla apilada (celular, debajo de `md`): sin encabezado y cada fila es una tarjeta. La etiqueta de
 * cada dato sale del `data-label` de la celda (CSS `::before`, sin texto extra en el DOM).
 * - `apilada` (`"lineas"`): una línea por celda, "etiqueta … valor" (todo lo de la celda va a la
 *   derecha, uno debajo del otro).
 * - `apilada="grilla"`: dos columnas, la etiqueta chica arriba del valor (para filas con muchos
 *   datos); `className="max-md:col-span-2"` en una celda la deja a todo el ancho.
 * La celda de botones lleva `data-acciones` (sin etiqueta, separada con una línea arriba).
 * Para ocultar una celda vacía en el celular: `className="max-md:hidden!"`.
 */
// Clases escritas enteras: Tailwind solo genera las que encuentra literales en el código.
const CLASES_APILADA = {
  lineas: [
    "max-md:block",
    "max-md:[&>thead]:hidden",
    "max-md:[&>tbody]:flex max-md:[&>tbody]:flex-col max-md:[&>tbody]:gap-3",
    "max-md:[&>tbody>tr]:rounded-lg max-md:[&>tbody>tr]:border! max-md:[&>tbody>tr]:bg-card max-md:[&>tbody>tr]:px-3 max-md:[&>tbody>tr]:py-2 max-md:[&>tbody>tr]:shadow-xs",
    "max-md:[&>tbody>tr>td]:flex max-md:[&>tbody>tr>td]:min-w-0 max-md:[&>tbody>tr>td]:px-0 max-md:[&>tbody>tr>td]:py-1 max-md:[&>tbody>tr>td]:whitespace-normal max-md:[&>tbody>tr>td]:break-words",
    "max-md:[&>tbody>tr>td]:before:shrink-0 max-md:[&>tbody>tr>td]:before:text-left max-md:[&>tbody>tr>td]:before:font-normal max-md:[&>tbody>tr>td]:before:text-muted-foreground max-md:[&>tbody>tr>td]:before:content-[attr(data-label)]",
    "max-md:[&>tbody>tr]:flex max-md:[&>tbody>tr]:flex-col",
    "max-md:[&>tbody>tr>td[data-acciones]]:mt-1 max-md:[&>tbody>tr>td[data-acciones]]:border-t max-md:[&>tbody>tr>td[data-acciones]]:pt-2 max-md:[&>tbody>tr>td[data-acciones]]:before:hidden",
    "max-md:[&>tbody>tr>td]:grid max-md:[&>tbody>tr>td]:grid-cols-[auto_minmax(0,1fr)] max-md:[&>tbody>tr>td]:items-start max-md:[&>tbody>tr>td]:gap-x-4 max-md:[&>tbody>tr>td]:text-right max-md:[&>tbody>tr>td]:before:col-start-1 max-md:[&>tbody>tr>td]:before:text-sm max-md:[&>tbody>tr>td>*]:col-start-2 max-md:[&>tbody>tr>td>*]:justify-self-end",
  ].join(" "),
  grilla: [
    "max-md:block",
    "max-md:[&>thead]:hidden",
    "max-md:[&>tbody]:flex max-md:[&>tbody]:flex-col max-md:[&>tbody]:gap-3",
    "max-md:[&>tbody>tr]:rounded-lg max-md:[&>tbody>tr]:border! max-md:[&>tbody>tr]:bg-card max-md:[&>tbody>tr]:px-3 max-md:[&>tbody>tr]:py-2 max-md:[&>tbody>tr]:shadow-xs",
    "max-md:[&>tbody>tr>td]:flex max-md:[&>tbody>tr>td]:min-w-0 max-md:[&>tbody>tr>td]:px-0 max-md:[&>tbody>tr>td]:py-1 max-md:[&>tbody>tr>td]:whitespace-normal max-md:[&>tbody>tr>td]:break-words",
    "max-md:[&>tbody>tr>td]:before:shrink-0 max-md:[&>tbody>tr>td]:before:text-left max-md:[&>tbody>tr>td]:before:font-normal max-md:[&>tbody>tr>td]:before:text-muted-foreground max-md:[&>tbody>tr>td]:before:content-[attr(data-label)]",
    "max-md:[&>tbody>tr]:grid max-md:[&>tbody>tr]:grid-cols-2 max-md:[&>tbody>tr]:gap-x-4",
    "max-md:[&>tbody>tr>td[data-acciones]]:col-span-2 max-md:[&>tbody>tr>td[data-acciones]]:mt-1 max-md:[&>tbody>tr>td[data-acciones]]:items-end max-md:[&>tbody>tr>td[data-acciones]]:border-t max-md:[&>tbody>tr>td[data-acciones]]:pt-2 max-md:[&>tbody>tr>td[data-acciones]]:before:hidden",
    "max-md:[&>tbody>tr>td]:flex-col max-md:[&>tbody>tr>td]:items-start max-md:[&>tbody>tr>td]:justify-start max-md:[&>tbody>tr>td]:text-left max-md:[&>tbody>tr>td]:before:text-xs",
  ].join(" "),
};

function Table({
  className,
  apilada,
  ...props
}: React.ComponentProps<"table"> & {
  /** En el celular, cada fila como tarjeta (ver `CLASES_APILADA`). */
  apilada?: boolean | keyof typeof CLASES_APILADA;
}) {
  const apilar = apilada === true ? "lineas" : apilada === false ? undefined : apilada;
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", apilar && CLASES_APILADA[apilar], className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn("[&_tr]:border-b", className)} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn("p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0", className)}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
