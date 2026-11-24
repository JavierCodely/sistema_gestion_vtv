import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InputPassword } from "@/compartido/componentes/InputPassword";

function Formulario({ onEnviar }: { onEnviar: () => void }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onEnviar();
      }}
    >
      <label htmlFor="clave">Contraseña</label>
      <InputPassword id="clave" defaultValue="secreta123" />
    </form>
  );
}

describe("InputPassword", () => {
  it("oculta la contraseña y el ojo la muestra y la vuelve a ocultar", async () => {
    render(<Formulario onEnviar={vi.fn()} />);
    const campo = screen.getByLabelText("Contraseña");
    expect(campo).toHaveAttribute("type", "password");

    const ver = screen.getByRole("button", { name: "Mostrar contraseña" });
    expect(ver).toHaveAttribute("aria-pressed", "false");
    expect(ver).toHaveAttribute("aria-controls", "clave");
    await userEvent.click(ver);
    expect(campo).toHaveAttribute("type", "text");
    expect(campo).toHaveValue("secreta123");

    const ocultar = screen.getByRole("button", { name: "Ocultar contraseña" });
    expect(ocultar).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(ocultar);
    expect(campo).toHaveAttribute("type", "password");
  });

  it("el ojo no envía el formulario", async () => {
    const onEnviar = vi.fn();
    render(<Formulario onEnviar={onEnviar} />);
    await userEvent.click(screen.getByRole("button", { name: "Mostrar contraseña" }));
    expect(onEnviar).not.toHaveBeenCalled();
  });
});
