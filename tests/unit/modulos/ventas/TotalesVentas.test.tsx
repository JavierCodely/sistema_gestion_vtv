import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TotalesVentas } from "@/modulos/ventas/componentes/TotalesVentas";

const VALORES = {
  ventas_efectivo: 30000,
  ventas_transferencia: 20000,
  ventas_total: 50000,
  gastos_total: 5000,
  neto: 45000,
};

const normal = (texto: string | null) => (texto ?? "").replace(/\s/g, " ");

describe("TotalesVentas", () => {
  it("en un turno abierto muestra el efectivo en caja dentro de los totales", () => {
    render(
      <TotalesVentas
        titulo="Totales del turno"
        valores={VALORES}
        prefijoTestId="vivo"
        efectivoEnCaja={35000}
      />,
    );
    const tarjeta = screen
      .getByRole("heading", { name: "Totales del turno" })
      .closest("[data-slot=card]");
    expect(tarjeta).not.toBeNull();
    const cajon = within(tarjeta as HTMLElement).getByTestId("vivo-efectivo-en-caja");
    expect(normal(cajon.textContent)).toBe("$ 35.000,00");
    expect(within(tarjeta as HTMLElement).getByText("Efectivo en caja")).toBeInTheDocument();
  });

  it("un efectivo en caja negativo se marca en rojo", () => {
    render(<TotalesVentas titulo="T" valores={VALORES} efectivoEnCaja={-100} />);
    expect(screen.getByTestId("total-efectivo-en-caja")).toHaveClass("text-destructive");
  });

  it("sin efectivo en caja (historial, totales del período) no lo muestra", () => {
    render(<TotalesVentas titulo="Totales del período" valores={VALORES} />);
    expect(screen.queryByText("Efectivo en caja")).not.toBeInTheDocument();
    render(<TotalesVentas titulo="Otro" valores={VALORES} efectivoEnCaja={null} />);
    expect(screen.queryByText("Efectivo en caja")).not.toBeInTheDocument();
  });
});
