import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authDePrueba, perfilDePrueba, renderRuta } from "@tests/soporte/render";
import {
  argumentosRpc,
  conFiltro,
  reiniciarSupabaseFalso,
  responder,
  responderRpc,
} from "@tests/soporte/supabase-falso";

vi.mock("@/modulos/dashboard/paginas/Dashboard", () => import("@tests/soporte/dashboard-liviano"));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/compartido/lib/supabase", async () => ({
  supabase: (await import("@tests/soporte/supabase-falso")).supabaseFalso,
}));

const ADMIN = perfilDePrueba({
  id: "a1",
  rol: "admin",
  nombre: "Ana",
  apellido: "Administradora",
  nombre_completo: "Ana Administradora",
});
const admin = () => authDePrueba({ perfil: ADMIN });

const TURNO_CAJA_1 = {
  id: 4,
  caja_nombre: "Caja 1",
  abierto_en: "2026-11-21T11:00:00Z",
  atendido_por: ["Ana Administradora", "Carlos Demo"],
};

function turnosAbiertos(data: unknown[]) {
  responder("v_turnos", "select", { data }, { cuando: conFiltro("eq", "abierto", true) });
}

beforeEach(() => {
  reiniciarSupabaseFalso();
  vi.mocked(toast.success).mockClear();
  turnosAbiertos([]);
  responderRpc("cajas_para_turno", {
    data: [
      { id: 1, nombre: "Caja 1", ocupada: false, turno_id: null, abierto_en: null },
      { id: 2, nombre: "Caja 2", ocupada: false, turno_id: null, abierto_en: null },
    ],
  });
  responderRpc("abrir_turno", { data: { id: 9, caja_id: 1 } });
  responderRpc("cerrar_turno", { data: { id: 4 } });
});

function barra() {
  return screen.getByRole("banner");
}

describe("scroll propio del contenido", () => {
  it("el menú y la barra quedan fijos: solo el contenido se desplaza y vuelve arriba al cambiar de pantalla", async () => {
    // Pantallas livianas (el dashboard carga la librería de gráficos).
    responder("cajas", "select", { data: [] });
    const { router } = renderRuta("/admin/cajas", admin());
    const contenido = await screen.findByTestId("contenido-admin");
    expect(contenido).toHaveClass("md:overflow-y-auto", "md:min-h-0");
    expect(contenido.parentElement?.parentElement).toHaveClass("md:h-svh", "md:overflow-hidden");
    // jsdom no desplaza: se simula que el contenido quedó scrolleado.
    let posicion = 800;
    Object.defineProperty(contenido, "scrollTop", {
      configurable: true,
      get: () => posicion,
      set: (valor: number) => {
        posicion = valor;
      },
    });
    await router.navigate("/admin/ventas/pasadas");
    await waitFor(() => {
      expect(posicion).toBe(0);
    });
  });
});

describe("menú en el celular", () => {
  it("se abre con 'Abrir el menú' de la barra y se cierra al elegir una pantalla", async () => {
    responder("cajas", "select", { data: [] });
    const { router } = renderRuta("/admin/ventas/pasadas", admin());
    const abrir = await within(await screen.findByRole("banner")).findByRole("button", {
      name: "Abrir el menú",
    });
    expect(abrir).toHaveClass("md:hidden");
    expect(abrir).toHaveAttribute("aria-expanded", "false");
    // El menú fijo de la izquierda solo se ve desde md.
    expect(screen.getByRole("complementary")).toHaveClass("hidden", "md:block");

    await userEvent.click(abrir);
    const panel = await screen.findByRole("dialog", { name: "Sistema VTV" });
    expect(abrir).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(within(panel).getByRole("link", { name: "Cajas" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(router.state.location.pathname).toBe("/admin/cajas");
  });
});

describe("barra fija del admin", () => {
  it("es sticky y tiene siempre Abrir turno y Cerrar turno (sin turnos abiertos, deshabilitado y explicado)", async () => {
    renderRuta("/admin", admin());
    const header = await screen.findByRole("banner");
    expect(header).toHaveClass("sticky", "top-0");
    expect(within(header).getByRole("button", { name: "Abrir turno" })).toBeEnabled();
    const cerrar = within(header).getByRole("button", { name: "Cerrar turno" });
    await waitFor(() => {
      expect(cerrar).toBeDisabled();
    });
    expect(cerrar).toHaveAttribute("title", "No hay turnos abiertos para cerrar");
    expect(cerrar).toHaveAccessibleDescription("No hay turnos abiertos para cerrar");
    // Sin cajas abiertas no ofrece ir a la caja
    expect(within(header).queryByRole("link", { name: "Ir a la caja" })).not.toBeInTheDocument();
  });

  it("con alguna caja abierta ofrece 'Ir a la caja' (solo con la consulta ya respondida)", async () => {
    turnosAbiertos([TURNO_CAJA_1]);
    renderRuta("/admin", admin());
    const header = await screen.findByRole("banner");
    // Primer render: la consulta todavía no respondió
    expect(within(header).queryByRole("link", { name: "Ir a la caja" })).not.toBeInTheDocument();
    expect(await within(header).findByRole("link", { name: "Ir a la caja" })).toHaveAttribute(
      "href",
      "/caja",
    );
  });

  it("abre el turno de una caja sin elegir quién atiende y se queda en el panel", async () => {
    const { router } = renderRuta("/admin", admin());
    await userEvent.click(await screen.findByRole("button", { name: "Abrir turno" }));
    const dialogo = await screen.findByRole("dialog", { name: "Abrir turno" });
    // La primera caja libre ya está elegida
    expect(await within(dialogo).findByLabelText("Caja")).toHaveTextContent("Caja 1");
    expect(within(dialogo).queryByLabelText("Atiende")).not.toBeInTheDocument();
    await userEvent.type(within(dialogo).getByLabelText("Efectivo inicial ($)"), "10.000");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Abrir turno" }));
    await waitFor(() => {
      expect(argumentosRpc("abrir_turno")).toEqual({ p_caja_id: 1, p_efectivo_inicial: 10000 });
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(router.state.location.pathname).toBe("/admin");
  });

  it("Cerrar turno lista los turnos abiertos con quiénes atendieron y cierra el elegido", async () => {
    turnosAbiertos([TURNO_CAJA_1]);
    renderRuta("/admin", admin());
    const cerrar = within(await screen.findByRole("banner")).getByRole("button", {
      name: "Cerrar turno",
    });
    await waitFor(() => {
      expect(cerrar).toBeEnabled();
    });
    await userEvent.click(cerrar);
    const dialogo = await screen.findByRole("dialog", { name: "Cerrar turno" });
    // Uno solo: ya queda elegido
    const opcion = within(dialogo).getByRole("radio", { name: /Caja 1/ });
    expect(opcion).toBeChecked();
    expect(dialogo).toHaveTextContent("Atendieron: Ana Administradora y Carlos Demo");
    await userEvent.type(within(dialogo).getByLabelText("Observaciones (opcional)"), "Cierre");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Cerrar turno" }));
    await waitFor(() => {
      expect(argumentosRpc("cerrar_turno")).toEqual({ p_observaciones: "Cierre", p_turno_id: 4 });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Turno de Caja 1 cerrado");
    });
  });

  it("la barra sigue disponible en las pantallas del panel", async () => {
    responder("v_turnos", "select", { data: [] });
    renderRuta("/admin/ventas", admin());
    expect(await screen.findByRole("heading", { name: "Ventas" })).toBeInTheDocument();
    expect(within(barra()).getByRole("button", { name: "Abrir turno" })).toBeInTheDocument();
    expect(within(barra()).getByRole("button", { name: "Cerrar turno" })).toBeInTheDocument();
  });
});
