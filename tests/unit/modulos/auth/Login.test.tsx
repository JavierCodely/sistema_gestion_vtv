import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MENSAJE_DESACTIVADO } from "@/modulos/auth/lib/errores-login";
import { authDePrueba, perfilDePrueba, renderRuta } from "@tests/soporte/render";

vi.mock("@/modulos/dashboard/paginas/Dashboard", () => import("@tests/soporte/dashboard-liviano"));
vi.mock("@/compartido/lib/salud", () => ({
  verificarConexion: vi.fn(() => Promise.resolve(true)),
}));

describe("login", () => {
  it("pide email y contraseña antes de enviar", async () => {
    const auth = authDePrueba();
    renderRuta("/login", auth);
    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));
    expect(screen.getByText("Ingresá tu email y tu contraseña.")).toBeInTheDocument();
    expect(auth.iniciarSesion).not.toHaveBeenCalled();
  });

  it("envía las credenciales y muestra el error del servidor", async () => {
    const auth = authDePrueba({
      iniciarSesion: vi.fn(() => Promise.reject(new Error("Email o contraseña incorrectos."))),
    });
    renderRuta("/login", auth);
    await userEvent.type(screen.getByLabelText("Email"), "ana@vtv.com");
    await userEvent.type(screen.getByLabelText("Contraseña"), "secreta123");
    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));
    expect(auth.iniciarSesion).toHaveBeenCalledWith("ana@vtv.com", "secreta123");
    expect(await screen.findByText("Email o contraseña incorrectos.")).toBeInTheDocument();
  });

  it("muestra el aviso de usuario desactivado", () => {
    renderRuta("/login", authDePrueba({ aviso: MENSAJE_DESACTIVADO }));
    expect(screen.getByText(MENSAJE_DESACTIVADO)).toBeInTheDocument();
  });

  it("muestra el estado de conexión con el servidor", async () => {
    renderRuta("/login");
    await waitFor(() => {
      expect(screen.getByTestId("estado-conexion")).toHaveTextContent("Conectado");
    });
  });

  it("con sesión iniciada redirige al destino previo", async () => {
    const auth = authDePrueba({ perfil: perfilDePrueba({ rol: "admin" }) });
    const { router } = renderRuta("/login", auth);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/admin");
    });
  });
});
