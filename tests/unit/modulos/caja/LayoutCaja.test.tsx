import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authDePrueba, perfilDePrueba, renderRuta } from "@tests/soporte/render";
import { reiniciarSupabaseFalso, responder } from "@tests/soporte/supabase-falso";

vi.mock("@/compartido/lib/supabase", async () => ({
  supabase: (await import("@tests/soporte/supabase-falso")).supabaseFalso,
}));

const cajero = () => authDePrueba({ perfil: perfilDePrueba() });
const admin = () => authDePrueba({ perfil: perfilDePrueba({ id: "a1", rol: "admin" }) });

const CAJA_1 = { id: 5, caja_id: 1, caja_nombre: "Caja 1", abierto_en: "2026-11-20T12:00:00Z" };

beforeEach(() => {
  reiniciarSupabaseFalso();
  localStorage.clear();
  responder("v_comprobantes", "select", { data: [] });
  responder("ventas", "select", { data: [] });
  responder("categorias_servicio", "select", { data: [] });
  responder("servicios", "select", { data: [] });
  responder("v_turnos_abiertos", "select", { data: [CAJA_1] });
});

describe("fondo de la caja", () => {
  it("muestra la imagen de fondo con una capa del 90% encima", async () => {
    renderRuta("/caja", cajero());
    await screen.findByRole("heading", { name: "Caja 1" });
    const fondo = screen.getByTestId("fondo-caja");
    expect(fondo.style.backgroundImage).toMatch(/cajaimagen.*\.webp/);
    expect(fondo).toHaveClass("fixed", "inset-0", "-z-10", "bg-cover");
    expect(fondo).toHaveAttribute("aria-hidden");
    const velo = screen.getByTestId("velo-caja");
    expect(velo).toHaveClass("fixed", "inset-0", "-z-10", "bg-background/90");
    // El velo va después de la imagen: queda pintado encima.
    expect(fondo.compareDocumentPosition(velo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("barra fija de la caja", () => {
  it("muestra el nombre y apellido de quien atiende bien grande", async () => {
    renderRuta("/caja", cajero());
    await screen.findByRole("heading", { name: "Caja 1" });
    const nombre = within(screen.getByRole("banner")).getByTestId("usuario-caja");
    expect(nombre).toHaveTextContent("Cajero Prueba");
    expect(nombre).toHaveClass("text-2xl", "sm:text-3xl", "md:text-4xl", "font-bold");
  });

  it("el cajero no abre ni cierra turnos: la barra no tiene acciones de turno", async () => {
    renderRuta("/caja", cajero());

    expect(await screen.findByRole("heading", { name: "Caja 1" })).toBeInTheDocument();
    const barra = screen.getByRole("banner");
    expect(barra).toHaveClass("sticky", "top-0");
    expect(within(barra).queryByRole("button", { name: "Abrir turno" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cerrar turno" })).not.toBeInTheDocument();
    expect(within(barra).queryByRole("link", { name: "Panel admin" })).not.toBeInTheDocument();
  });

  it("el admin en la caja ve abrir y cerrar turno, como en el panel, y el acceso al panel", async () => {
    responder("v_turnos", "select", {
      data: [
        { id: 5, caja_nombre: "Caja 1", abierto_en: CAJA_1.abierto_en, atendido_por: ["Admin"] },
      ],
    });
    responder("v_movimientos_caja", "select", { data: [] });
    renderRuta("/caja", admin());
    expect(await screen.findByRole("heading", { name: "Caja 1" })).toBeInTheDocument();
    const barra = screen.getByRole("banner");
    expect(within(barra).getByRole("button", { name: "Abrir turno" })).toBeInTheDocument();
    await waitFor(() => {
      expect(within(barra).getByRole("button", { name: "Cerrar turno" })).toBeEnabled();
    });
    // Ya está en la caja: no ofrece "Ir a la caja"
    expect(within(barra).queryByRole("link", { name: "Ir a la caja" })).not.toBeInTheDocument();
    expect(within(barra).getByRole("link", { name: "Panel admin" })).toHaveAttribute(
      "href",
      "/admin",
    );
  });
});
