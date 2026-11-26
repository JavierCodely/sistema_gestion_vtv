import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Table, TableBody, TableCell, TableRow } from "@/compartido/ui/table";

function tabla(apilada?: boolean | "grilla") {
  render(
    <Table apilada={apilada}>
      <TableBody>
        <TableRow>
          <TableCell data-label="Patente">AB123CD</TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  );
  return screen.getByRole("table");
}

describe("Table apilada (celular)", () => {
  it("sin apilar es la tabla de siempre", () => {
    expect(tabla().className).not.toContain("max-md:");
  });

  it("en líneas: sin encabezado, fila como tarjeta y la etiqueta del data-label a la izquierda", () => {
    const t = tabla(true);
    expect(t).toHaveClass(
      "max-md:[&>thead]:hidden",
      "max-md:[&>tbody>tr]:flex-col",
      "max-md:[&>tbody>tr>td]:grid",
      "max-md:[&>tbody>tr>td]:before:content-[attr(data-label)]",
      "max-md:[&>tbody>tr>td[data-acciones]]:before:hidden",
    );
    expect(t).not.toHaveClass("max-md:[&>tbody>tr]:grid-cols-2");
  });

  it("en grilla: dos columnas con la etiqueta arriba; los botones a todo el ancho", () => {
    const t = tabla("grilla");
    expect(t).toHaveClass(
      "max-md:[&>tbody>tr]:grid-cols-2",
      "max-md:[&>tbody>tr>td]:flex-col",
      "max-md:[&>tbody>tr>td[data-acciones]]:col-span-2",
    );
  });
});
