import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AbrirTurno } from "@/modulos/caja/componentes/AbrirTurno";
import { renderConQuery } from "@tests/soporte/render";
import { argumentosRpc, reiniciarSupabaseFalso, responderRpc } from "@tests/soporte/supabase-falso";

vi.mock("@/compartido/lib/supabase", async () => ({
  supabase: (await import("@tests/soporte/supabase-falso")).supabaseFalso,
}));

beforeEach(() => {
  reiniciarSupabaseFalso();
  responderRpc("cajas_para_turno", {
    data: [
      { id: 1, nombre: "Caja 1", ocupada: true, ocupada_por: "Ana" },
      { id: 2, nombre: "Caja 2", ocupada: false, ocupada_por: null },
    ],
  });
});

describe("AbrirTurno", () => {
  it("las cajas ocupadas no se pueden elegir y dicen por quién", async () => {
    renderConQuery(<AbrirTurno />);
    expect(await screen.findByRole("radio", { name: /Caja 1/ })).toBeDisabled();
    expect(screen.getByText("Ocupada por Ana")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Caja 2/ })).toBeEnabled();
  });

  it("pide elegir una caja antes de abrir", async () => {
    renderConQuery(<AbrirTurno />);
    await userEvent.click(await screen.findByRole("button", { name: "Abrir turno" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Elegí una caja.");
    const grupo = screen.getByRole("radiogroup", { name: "Cajas" });
    expect(grupo).toHaveAttribute("aria-invalid", "true");
    expect(grupo).toHaveAccessibleDescription("Elegí una caja.");
    expect(argumentosRpc("abrir_turno")).toBeUndefined();
  });

  it("abre el turno en la caja elegida", async () => {
    responderRpc("abrir_turno", { data: { id: 10, caja_id: 2 } });
    renderConQuery(<AbrirTurno />);
    await userEvent.click(await screen.findByRole("radio", { name: /Caja 2/ }));
    await userEvent.click(screen.getByRole("button", { name: "Abrir turno" }));
    await vi.waitFor(() => {
      expect(argumentosRpc("abrir_turno")).toEqual({ p_caja_id: 2 });
    });
  });

  it("si otro la ocupó recién, muestra el mensaje de la BD", async () => {
    responderRpc("abrir_turno", {
      error: { code: "P0001", message: 'La caja "Caja 2" acaba de ser ocupada por otro usuario' },
    });
    renderConQuery(<AbrirTurno />);
    await userEvent.click(await screen.findByRole("radio", { name: /Caja 2/ }));
    await userEvent.click(screen.getByRole("button", { name: "Abrir turno" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      'La caja "Caja 2" acaba de ser ocupada por otro usuario',
    );
  });
});
