import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DialogoNombre } from "@/compartido/componentes/DialogoNombre";

function renderDialogo(onGuardar: (nombre: string) => Promise<void>) {
  const onCerrar = vi.fn();
  render(
    <DialogoNombre
      titulo="Nueva caja"
      valorInicial="  "
      textoBoton="Crear caja"
      mensajesError={{ repetido: "Ya existe una caja con ese nombre." }}
      onGuardar={onGuardar}
      onCerrar={onCerrar}
    />,
  );
  return { onCerrar };
}

describe("DialogoNombre", () => {
  it("valida el nombre antes de guardar", async () => {
    const onGuardar = vi.fn(() => Promise.resolve());
    renderDialogo(onGuardar);
    await userEvent.click(screen.getByRole("button", { name: "Crear caja" }));
    expect(screen.getByText("Ingresá el nombre.")).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre")).toHaveAttribute("aria-invalid", "true");
    expect(onGuardar).not.toHaveBeenCalled();
  });

  it("guarda el nombre sin espacios sobrantes y cierra", async () => {
    const onGuardar = vi.fn(() => Promise.resolve());
    const { onCerrar } = renderDialogo(onGuardar);
    await userEvent.type(screen.getByLabelText("Nombre"), "Caja 3 ");
    await userEvent.click(screen.getByRole("button", { name: "Crear caja" }));
    expect(onGuardar).toHaveBeenCalledWith("Caja 3");
    expect(onCerrar).toHaveBeenCalled();
  });

  it("muestra el error del servidor traducido y no cierra", async () => {
    // supabase-js lanza PostgrestError (subclase de Error) con el código de Postgres.
    const errorPostgres = Object.assign(new Error("duplicate key value"), { code: "23505" });
    const onGuardar = vi.fn(() => Promise.reject(errorPostgres));
    const { onCerrar } = renderDialogo(onGuardar);
    await userEvent.type(screen.getByLabelText("Nombre"), "Caja 1");
    await userEvent.click(screen.getByRole("button", { name: "Crear caja" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ya existe una caja con ese nombre.",
    );
    expect(onCerrar).not.toHaveBeenCalled();
  });
});
