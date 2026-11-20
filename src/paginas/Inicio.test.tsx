import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderRuta } from "@/test/render";

vi.mock("@/lib/salud", () => ({ verificarConexion: vi.fn() }));
const { verificarConexion } = await import("@/lib/salud");
const verificar = vi.mocked(verificarConexion);

describe("página de inicio", () => {
  beforeEach(() => {
    verificar.mockReset();
  });

  it("muestra Conectado cuando el servidor responde", async () => {
    verificar.mockResolvedValue(true);
    renderRuta("/");
    expect(screen.getByRole("heading", { name: "Sistema VTV" })).toBeInTheDocument();
    expect(await screen.findByText("Conectado")).toBeInTheDocument();
  });

  it("muestra Sin conexión cuando el servidor no responde", async () => {
    verificar.mockResolvedValue(false);
    renderRuta("/");
    expect(await screen.findByText("Sin conexión")).toBeInTheDocument();
  });

  it("muestra la página 404 en rutas desconocidas", () => {
    renderRuta("/no-existe");
    expect(screen.getByRole("heading", { name: "Página no encontrada" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver al inicio" })).toHaveAttribute("href", "/");
  });
});
