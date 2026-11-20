import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { authDePrueba, perfilDePrueba, renderRuta } from "@tests/soporte/render";

vi.mock("@/compartido/lib/salud", () => ({
  verificarConexion: vi.fn(() => Promise.resolve(true)),
}));

const admin = perfilDePrueba({ rol: "admin", nombre: "Admin Prueba" });
const cajero = perfilDePrueba();

describe("rutas protegidas", () => {
  it("sin sesión, una ruta privada manda al login recordando el destino", async () => {
    const { router } = renderRuta("/admin/usuarios");
    expect(await screen.findByRole("button", { name: "Ingresar" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.state).toEqual({ desde: "/admin/usuarios" });
  });

  it("mientras carga la sesión muestra un indicador", () => {
    renderRuta("/admin", authDePrueba({ cargando: true }));
    expect(screen.getByRole("status")).toHaveTextContent("Cargando");
  });

  it("/ lleva al admin al panel y al cajero a la caja", async () => {
    const r1 = renderRuta("/", authDePrueba({ perfil: admin }));
    await waitFor(() => {
      expect(r1.router.state.location.pathname).toBe("/admin");
    });
    r1.unmount();

    const r2 = renderRuta("/", authDePrueba({ perfil: cajero }));
    await waitFor(() => {
      expect(r2.router.state.location.pathname).toBe("/caja");
    });
  });

  it("un cajero no puede entrar al panel de administración", async () => {
    const { router } = renderRuta("/admin/usuarios", authDePrueba({ perfil: cajero }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/caja");
    });
    expect(await screen.findByRole("heading", { name: "Caja" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Panel admin" })).not.toBeInTheDocument();
  });

  it("el admin ve el menú lateral y puede operar una caja", async () => {
    renderRuta("/admin", authDePrueba({ perfil: admin }));
    const menu = await screen.findByRole("navigation", { name: "Menú de administración" });
    expect(menu).toHaveTextContent("Usuarios");
    expect(menu).toHaveTextContent("Caja de efectivo");
    expect(screen.getByRole("link", { name: "Operar caja" })).toHaveAttribute("href", "/caja");
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
  });

  it("muestra la página 404 en rutas desconocidas", () => {
    renderRuta("/no-existe");
    expect(screen.getByRole("heading", { name: "Página no encontrada" })).toBeInTheDocument();
  });
});
