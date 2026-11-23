import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authDePrueba, perfilDePrueba, renderRuta } from "@tests/soporte/render";
import { reiniciarSupabaseFalso, responder, responderRpc } from "@tests/soporte/supabase-falso";

vi.mock("@/compartido/lib/supabase", async () => ({
  supabase: (await import("@tests/soporte/supabase-falso")).supabaseFalso,
}));

vi.mock("@/compartido/lib/salud", () => ({
  verificarConexion: vi.fn(() => Promise.resolve(true)),
}));

const admin = perfilDePrueba({ rol: "admin", nombre: "Admin Prueba" });
const cajero = perfilDePrueba();

beforeEach(() => {
  reiniciarSupabaseFalso();
  // Sin cajas abiertas (la caja muestra la espera) y sin turnos abiertos (barra del admin).
  responder("v_turnos_abiertos", "select", { data: [] });
  responder("v_turnos", "select", { data: [] });
  responderRpc("cajas_para_turno", { data: [] });
});

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
    expect(
      await screen.findByRole("heading", { name: "No hay cajas abiertas" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Panel admin" })).not.toBeInTheDocument();
  });

  it("el admin ve el menú lateral y puede operar una caja", async () => {
    const { router } = renderRuta("/admin", authDePrueba({ perfil: admin }));
    const menu = await screen.findByRole("navigation", { name: "Menú de administración" });
    expect(menu).toHaveTextContent("Usuarios");
    expect(menu).toHaveTextContent("Fondos");
    expect(menu).not.toHaveTextContent("Caja de efectivo");
    expect(screen.getByRole("button", { name: /Activar modo (oscuro|claro)/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();

    // "Abrir turno" de la barra abre el modal de apertura dentro del panel (no navega); el turno es
    // de la caja: no se elige quién atiende.
    await userEvent.click(await screen.findByRole("button", { name: "Abrir turno" }));
    const dialogo = await screen.findByRole("dialog", { name: "Abrir turno" });
    expect(dialogo).toHaveTextContent("Efectivo inicial ($)");
    expect(within(dialogo).queryByLabelText("Atiende")).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/admin");
  });

  it("con alguna caja abierta, la barra del admin ofrece ir a la caja", async () => {
    responder("v_turnos", "select", {
      data: [
        { id: 1, caja_nombre: "Caja 1", abierto_en: "2026-11-21T12:00:00Z", atendido_por: [] },
      ],
    });
    renderRuta("/admin", authDePrueba({ perfil: admin }));
    expect(await screen.findByRole("link", { name: "Ir a la caja" })).toHaveAttribute(
      "href",
      "/caja",
    );
  });

  it("muestra la página 404 en rutas desconocidas", () => {
    renderRuta("/no-existe");
    expect(screen.getByRole("heading", { name: "Página no encontrada" })).toBeInTheDocument();
  });
});
