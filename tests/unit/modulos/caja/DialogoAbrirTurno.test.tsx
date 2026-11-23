import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DialogoAbrirTurno } from "@/modulos/caja/componentes/DialogoAbrirTurno";
import { renderConQuery } from "@tests/soporte/render";
import {
  argumentosRpc,
  llamadas,
  reiniciarSupabaseFalso,
  responderRpc,
} from "@tests/soporte/supabase-falso";

vi.mock("@/compartido/lib/supabase", async () => ({
  supabase: (await import("@tests/soporte/supabase-falso")).supabaseFalso,
}));

const CAJAS = [
  { id: 1, nombre: "Caja 1", ocupada: true, turno_id: 5, abierto_en: "2026-11-22T11:00:00Z" },
  { id: 2, nombre: "Caja 2", ocupada: false, turno_id: null, abierto_en: null },
  { id: 3, nombre: "Caja 3", ocupada: false, turno_id: null, abierto_en: null },
];

beforeEach(() => {
  reiniciarSupabaseFalso();
  responderRpc("cajas_para_turno", { data: CAJAS });
  responderRpc("abrir_turno", { data: { id: 9, caja_id: 3 } });
});

function abrir() {
  const onCerrar = vi.fn();
  renderConQuery(<DialogoAbrirTurno onCerrar={onCerrar} />);
  return { onCerrar };
}

describe("DialogoAbrirTurno", () => {
  it("abre el turno de la caja, sin elegir quién atiende: la primera libre ya elegida y se puede cambiar", async () => {
    const { onCerrar } = abrir();
    const dialogo = await screen.findByRole("dialog", { name: "Abrir turno" });
    expect(await within(dialogo).findByLabelText("Caja")).toHaveTextContent("Caja 2");
    expect(within(dialogo).queryByLabelText("Atiende")).not.toBeInTheDocument();
    expect(dialogo).toHaveTextContent("Cualquier cajero o administrador va a poder vender");

    await userEvent.click(within(dialogo).getByLabelText("Caja"));
    expect(screen.queryByRole("option", { name: "Caja 1" })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole("option", { name: "Caja 3" }));
    expect(within(dialogo).getByLabelText("Caja")).toHaveTextContent("Caja 3");

    await userEvent.type(within(dialogo).getByLabelText("Efectivo inicial ($)"), "20.000");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Abrir turno" }));
    await waitFor(() => {
      expect(argumentosRpc("abrir_turno")).toEqual({ p_caja_id: 3, p_efectivo_inicial: 20000 });
    });
    await waitFor(() => {
      expect(onCerrar).toHaveBeenCalled();
    });
    // No consulta usuarios ni turnos por persona.
    expect(llamadas.some((l) => l.tabla === "perfiles" || l.tabla === "turnos")).toBe(false);
  });

  it("pide el efectivo inicial antes de enviar", async () => {
    abrir();
    const dialogo = await screen.findByRole("dialog", { name: "Abrir turno" });
    await within(dialogo).findByLabelText("Caja");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Abrir turno" }));
    expect(within(dialogo).queryByText("Elegí una caja.")).not.toBeInTheDocument();
    expect(within(dialogo).getByText("Ingresá el efectivo inicial.")).toBeInTheDocument();
    expect(argumentosRpc("abrir_turno")).toBeUndefined();
  });

  it("sin cajas libres lo explica y no deja enviar", async () => {
    responderRpc("cajas_para_turno", { data: [CAJAS[0]] });
    abrir();
    const dialogo = await screen.findByRole("dialog", { name: "Abrir turno" });
    expect(await within(dialogo).findByText(/^No hay cajas libres:/)).toBeInTheDocument();
    expect(within(dialogo).getByRole("button", { name: "Abrir turno" })).toBeDisabled();
  });

  it("si otro admin la abrió recién, muestra el mensaje de la BD", async () => {
    responderRpc("abrir_turno", {
      error: { code: "P0001", message: 'La caja "Caja 2" ya tiene un turno abierto' },
    });
    abrir();
    const dialogo = await screen.findByRole("dialog", { name: "Abrir turno" });
    await within(dialogo).findByLabelText("Caja");
    await userEvent.type(within(dialogo).getByLabelText("Efectivo inicial ($)"), "1000");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Abrir turno" }));
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
      'La caja "Caja 2" ya tiene un turno abierto',
    );
  });
});
