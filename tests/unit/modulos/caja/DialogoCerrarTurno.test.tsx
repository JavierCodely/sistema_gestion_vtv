import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TurnoAbiertoResumen } from "@/modulos/caja/api/consultas";
import { DialogoCerrarTurno } from "@/modulos/caja/componentes/DialogoCerrarTurno";
import { renderConQuery } from "@tests/soporte/render";
import {
  argumentosRpc,
  reiniciarSupabaseFalso,
  responderRpc,
  supabaseFalso,
} from "@tests/soporte/supabase-falso";

vi.mock("@/compartido/lib/supabase", async () => ({
  supabase: (await import("@tests/soporte/supabase-falso")).supabaseFalso,
}));

const CAJA_1: TurnoAbiertoResumen = {
  id: 4,
  caja_nombre: "Caja 1",
  abierto_en: "2026-11-21T11:00:00Z",
  atendido_por: ["Ana Administradora", "Carlos Demo"],
};
const CAJA_2: TurnoAbiertoResumen = {
  id: 7,
  caja_nombre: "Caja 2",
  abierto_en: "2026-11-21T12:30:00Z",
  atendido_por: [],
};

beforeEach(() => {
  reiniciarSupabaseFalso();
  responderRpc("cerrar_turno", { data: { id: 7 } });
});

function abrir(turnos: TurnoAbiertoResumen[]) {
  const onCerrar = vi.fn();
  renderConQuery(
    <DialogoCerrarTurno turnos={turnos} descripcion="Elegí el turno." onCerrar={onCerrar} />,
  );
  return { onCerrar, dialogo: screen.getByRole("dialog", { name: "Cerrar turno" }) };
}

describe("DialogoCerrarTurno con elección de turno", () => {
  it("lista los turnos abiertos (caja, desde cuándo, quiénes atendieron) y exige elegir uno", async () => {
    const { dialogo, onCerrar } = abrir([CAJA_1, CAJA_2]);
    const grupo = within(dialogo).getByRole("group", { name: "Turno a cerrar" });
    const opciones = within(grupo).getAllByRole("radio");
    expect(opciones).toHaveLength(2);
    for (const opcion of opciones) expect(opcion).not.toBeChecked();
    expect(grupo).toHaveTextContent("Atendieron: Ana Administradora y Carlos Demo");
    expect(grupo).toHaveTextContent("Todavía nadie vendió ni cargó gastos");
    // Hora argentina (UTC−3)
    expect(grupo).toHaveTextContent(/Desde 21\/11\/2026,? 08:00/);
    // Sin totales
    expect(dialogo).not.toHaveTextContent(/total|\$/i);

    await userEvent.click(within(dialogo).getByRole("button", { name: "Cerrar turno" }));
    expect(within(dialogo).getByText("Elegí el turno que querés cerrar.")).toBeInTheDocument();
    expect(argumentosRpc("cerrar_turno")).toBeUndefined();

    await userEvent.click(within(grupo).getByRole("radio", { name: /Caja 2/ }));
    await userEvent.type(within(dialogo).getByLabelText("Observaciones (opcional)"), "Fin del día");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Cerrar turno" }));
    await waitFor(() => {
      expect(argumentosRpc("cerrar_turno")).toEqual({
        p_observaciones: "Fin del día",
        p_turno_id: 7,
      });
    });
    await waitFor(() => {
      expect(onCerrar).toHaveBeenCalled();
    });
  });

  it("si hay un solo turno abierto, ya queda elegido", async () => {
    const { dialogo } = abrir([CAJA_1]);
    expect(within(dialogo).getByRole("radio", { name: /Caja 1/ })).toBeChecked();
    await userEvent.click(within(dialogo).getByRole("button", { name: "Cerrar turno" }));
    await waitFor(() => {
      expect(argumentosRpc("cerrar_turno")).toEqual({ p_turno_id: 4 });
    });
  });

  it("sin turnos abiertos lo dice y no deja enviar", () => {
    const { dialogo } = abrir([]);
    expect(within(dialogo).getByText("No hay turnos abiertos.")).toBeInTheDocument();
    expect(within(dialogo).getByRole("button", { name: "Cerrar turno" })).toBeDisabled();
  });

  it("muestra el mensaje de la BD si no se puede cerrar", async () => {
    responderRpc("cerrar_turno", {
      error: { code: "P0001", message: "El turno ya está cerrado" },
    });
    const { dialogo } = abrir([CAJA_1]);
    await userEvent.click(within(dialogo).getByRole("button", { name: "Cerrar turno" }));
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent("El turno ya está cerrado");
  });

  it("no se cierra (Esc ni la X) mientras está cerrando el turno", async () => {
    // El cierre queda en curso hasta que el test lo termina.
    let terminar: (respuesta: { data: unknown; error: null }) => void = () => undefined;
    const enCurso = new Promise<{ data: unknown; error: null }>((resolver) => {
      terminar = resolver;
    });
    vi.mocked(supabaseFalso.rpc).mockReturnValueOnce(enCurso);
    const { dialogo, onCerrar } = abrir([CAJA_1]);
    await userEvent.click(within(dialogo).getByRole("button", { name: "Cerrar turno" }));
    expect(await within(dialogo).findByRole("button", { name: "Cerrando…" })).toBeDisabled();

    await userEvent.keyboard("{Escape}");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Cerrar" }));
    expect(onCerrar).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Cerrar turno" })).toBeInTheDocument();

    terminar({ data: { id: 4 }, error: null });
    await waitFor(() => {
      expect(onCerrar).toHaveBeenCalledTimes(1);
    });
  });
});

describe("DialogoCerrarTurno con un turno dado", () => {
  it("cierra ese turno (Cerrar este turno del detalle)", async () => {
    const onCerrar = vi.fn();
    renderConQuery(<DialogoCerrarTurno turnoId={9} descripcion="Caja 3." onCerrar={onCerrar} />);
    const dialogo = screen.getByRole("dialog", { name: "Cerrar turno" });
    expect(
      within(dialogo).queryByRole("group", { name: "Turno a cerrar" }),
    ).not.toBeInTheDocument();
    await userEvent.click(within(dialogo).getByRole("button", { name: "Cerrar turno" }));
    await waitFor(() => {
      expect(argumentosRpc("cerrar_turno")).toEqual({ p_turno_id: 9 });
    });
    await waitFor(() => {
      expect(onCerrar).toHaveBeenCalled();
    });
  });
});
