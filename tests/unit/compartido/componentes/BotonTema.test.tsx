import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { BotonTema } from "@/compartido/componentes/BotonTema";
import { ProveedorTema } from "@/compartido/componentes/ProveedorTema";

function renderBoton() {
  return render(
    <ProveedorTema>
      <BotonTema />
    </ProveedorTema>,
  );
}

describe("BotonTema", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("alterna entre modo claro y oscuro y recuerda la elección", async () => {
    const usuario = userEvent.setup();
    const { unmount } = renderBoton();

    await usuario.click(await screen.findByRole("button", { name: "Activar modo oscuro" }));
    expect(document.documentElement).toHaveClass("dark");
    expect(localStorage.getItem("vtv-tema")).toBe("dark");
    expect(screen.getByRole("button", { name: "Activar modo claro" })).toBeInTheDocument();

    unmount();
    renderBoton();
    expect(await screen.findByRole("button", { name: "Activar modo claro" })).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Activar modo claro" }));
    expect(document.documentElement).not.toHaveClass("dark");
    expect(localStorage.getItem("vtv-tema")).toBe("light");
  });
});
