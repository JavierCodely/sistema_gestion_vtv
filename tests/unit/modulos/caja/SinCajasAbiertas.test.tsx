import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SinCajasAbiertas } from "@/modulos/caja/componentes/SinCajasAbiertas";
import { validarAperturaTurno } from "@/modulos/caja/lib/validaciones";
import { renderConQuery } from "@tests/soporte/render";
import { argumentosRpc, reiniciarSupabaseFalso, responderRpc } from "@tests/soporte/supabase-falso";

vi.mock("@/compartido/lib/supabase", async () => ({
  supabase: (await import("@tests/soporte/supabase-falso")).supabaseFalso,
}));

beforeEach(() => {
  reiniciarSupabaseFalso();
  responderRpc("cajas_para_turno", {
    data: [
      { id: 1, nombre: "Caja 1", ocupada: true, turno_id: 5, abierto_en: "2026-11-22T11:00:00Z" },
      { id: 2, nombre: "Caja 2", ocupada: false, turno_id: null, abierto_en: null },
    ],
  });
});

async function abrirModal() {
  await userEvent.click(screen.getByRole("button", { name: "Abrir turno" }));
  return screen.findByRole("dialog", { name: "Abrir turno" });
}

describe("SinCajasAbiertas", () => {
  it("el cajero no abre turnos: espera que el admin abra una caja", () => {
    renderConQuery(<SinCajasAbiertas esAdmin={false} />);
    expect(screen.getByRole("heading", { name: "No hay cajas abiertas" })).toBeInTheDocument();
    expect(
      screen.getByText(
        /Esperá que el administrador abra una caja\. Esta pantalla se actualiza sola/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Abrir/ })).not.toBeInTheDocument();
  });

  it("el admin abre una caja desde acá: sin elegir quién atiende, con efectivo inicial obligatorio", async () => {
    responderRpc("abrir_turno", { data: { id: 10, caja_id: 2 } });
    renderConQuery(<SinCajasAbiertas esAdmin />);
    const dialogo = await abrirModal();
    expect(await within(dialogo).findByLabelText("Caja")).toHaveTextContent("Caja 2");
    expect(within(dialogo).queryByText("Atiende")).not.toBeInTheDocument();

    await userEvent.click(within(dialogo).getByRole("button", { name: "Abrir turno" }));
    expect(within(dialogo).getByText("Ingresá el efectivo inicial.")).toBeInTheDocument();
    expect(argumentosRpc("abrir_turno")).toBeUndefined();

    await userEvent.type(within(dialogo).getByLabelText("Efectivo inicial ($)"), "50.000");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Abrir turno" }));
    await waitFor(() => {
      expect(argumentosRpc("abrir_turno")).toEqual({ p_caja_id: 2, p_efectivo_inicial: 50000 });
    });
  });

  it("si la caja de cambio no alcanza, muestra el mensaje de la BD", async () => {
    responderRpc("abrir_turno", {
      error: {
        code: "P0001",
        message:
          "No hay suficiente efectivo en la caja de cambio (disponible: $1.000,00, necesario: $50.000,00)",
      },
    });
    renderConQuery(<SinCajasAbiertas esAdmin />);
    const dialogo = await abrirModal();
    await within(dialogo).findByLabelText("Caja");
    await userEvent.type(within(dialogo).getByLabelText("Efectivo inicial ($)"), "50.000");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Abrir turno" }));
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
      "No hay suficiente efectivo en la caja de cambio (disponible: $1.000,00, necesario: $50.000,00)",
    );
  });
});

describe("validarAperturaTurno", () => {
  it("exige caja y efectivo inicial mayor a cero", () => {
    expect(validarAperturaTurno({ cajaId: "", efectivoInicial: "" }).errores).toEqual({
      cajaId: "Elegí una caja.",
      efectivoInicial: "Ingresá el efectivo inicial.",
    });
    expect(validarAperturaTurno({ cajaId: "3", efectivoInicial: "1,555" }).errores).toEqual({
      efectivoInicial: "El monto no puede tener más de 2 decimales.",
    });
    expect(validarAperturaTurno({ cajaId: "3", efectivoInicial: "0" }).errores).toHaveProperty(
      "efectivoInicial",
    );
  });

  it("acepta el formato argentino", () => {
    expect(validarAperturaTurno({ cajaId: "3", efectivoInicial: "20.000,50" })).toEqual({
      datos: { cajaId: 3, efectivoInicial: 20000.5 },
    });
  });
});
