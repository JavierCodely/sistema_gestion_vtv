import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("qrcode", () => ({
  default: { toString: vi.fn(() => Promise.reject(new Error("demasiado largo"))) },
}));
const { CodigoQr } = await import("@/modulos/facturacion/componentes/CodigoQr");

describe("CodigoQr", () => {
  it("si no se puede generar el QR ofrece verificar en ARCA con el enlace", async () => {
    render(<CodigoQr texto="https://www.arca.gob.ar/fe/qr/?p=x" etiqueta="QR" />);
    expect(await screen.findByRole("link", { name: "Verificar en ARCA" })).toHaveAttribute(
      "href",
      "https://www.arca.gob.ar/fe/qr/?p=x",
    );
  });
});
