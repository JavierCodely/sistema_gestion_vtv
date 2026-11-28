import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DialogoGasto } from "@/modulos/gastos/componentes/DialogoGasto";
import { renderConQuery } from "@tests/soporte/render";
import {
  argumentosRpc,
  llamadas,
  reiniciarSupabaseFalso,
  responder,
  responderRpc,
} from "@tests/soporte/supabase-falso";

vi.mock("@/compartido/lib/supabase", async () => ({
  supabase: (await import("@tests/soporte/supabase-falso")).supabaseFalso,
}));

const base = { habilitada_caja: false, activa: true, sistema: null };

beforeEach(() => {
  reiniciarSupabaseFalso();
  responder("categorias_gasto", "select", {
    data: [
      { ...base, id: 1, nombre: "Insumos", padre_id: null },
      { ...base, id: 2, nombre: "Papelería", padre_id: 1, habilitada_caja: true },
      { ...base, id: 3, nombre: "Tóner", padre_id: 1 },
    ],
  });
});

async function completar() {
  await userEvent.click(await screen.findByLabelText("Categoría"));
  await userEvent.click(await screen.findByRole("option", { name: "Papelería" }));
  await userEvent.type(screen.getByLabelText("Monto ($)"), "2.500,50");
  await userEvent.click(screen.getByLabelText("Pagado con"));
  await userEvent.click(await screen.findByRole("option", { name: "Efectivo (de la caja)" }));
  await userEvent.type(screen.getByLabelText("Nota"), "Resma A4");
  await userEvent.click(screen.getByRole("button", { name: "Registrar gasto" }));
}

describe("DialogoGasto", () => {
  it("en la caja solo ofrece las subcategorías habilitadas para el cajero", async () => {
    renderConQuery(<DialogoGasto soloCaja turnoId={5} descripcion="Caja 1" onCerrar={vi.fn()} />);
    await userEvent.click(await screen.findByLabelText("Categoría"));
    expect(await screen.findByRole("option", { name: "Papelería" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Tóner" })).not.toBeInTheDocument();
  });

  it("valida antes de enviar", async () => {
    renderConQuery(<DialogoGasto soloCaja turnoId={5} descripcion="Caja 1" onCerrar={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "Registrar gasto" }));
    expect(screen.getByText("Elegí una categoría.")).toBeInTheDocument();
    expect(screen.getByText("Ingresá un monto.")).toBeInTheDocument();
    expect(screen.getByText("Elegí de dónde sale el dinero.")).toBeInTheDocument();
    expect(screen.getByText("Escribí una nota.")).toBeInTheDocument();
    expect(argumentosRpc("registrar_gasto")).toBeUndefined();
  });

  it("un doble clic o doble Enter registra un solo gasto", async () => {
    responderRpc("registrar_gasto", { data: { id: 7, monto: 2500.5 } });
    const onCerrar = vi.fn();
    renderConQuery(<DialogoGasto soloCaja turnoId={5} descripcion="Caja 1" onCerrar={onCerrar} />);
    await userEvent.click(await screen.findByLabelText("Categoría"));
    await userEvent.click(await screen.findByRole("option", { name: "Papelería" }));
    await userEvent.type(screen.getByLabelText("Monto ($)"), "2.500,50");
    await userEvent.click(screen.getByLabelText("Pagado con"));
    await userEvent.click(await screen.findByRole("option", { name: "Efectivo (de la caja)" }));
    await userEvent.type(screen.getByLabelText("Nota"), "Resma A4");
    const boton = screen.getByRole("button", { name: "Registrar gasto" });
    // Los tres llegan antes de que React vuelva a dibujar (el botón sigue habilitado).
    act(() => {
      fireEvent.click(boton);
      fireEvent.click(boton);
      fireEvent.click(boton);
    });
    await waitFor(() => {
      expect(onCerrar).toHaveBeenCalled();
    });
    expect(llamadas.filter((l) => l.tabla === "rpc:registrar_gasto")).toHaveLength(1);
  });

  it("registra el gasto en el turno de la caja elegida y cierra", async () => {
    responderRpc("registrar_gasto", { data: { id: 7, monto: 2500.5 } });
    const onCerrar = vi.fn();
    renderConQuery(<DialogoGasto soloCaja turnoId={5} descripcion="Caja 1" onCerrar={onCerrar} />);
    await completar();
    await waitFor(() => {
      expect(onCerrar).toHaveBeenCalled();
    });
    expect(argumentosRpc("registrar_gasto")).toEqual({
      p_categoria_id: 2,
      p_monto: 2500.5,
      p_fuente: "efectivo",
      p_nota: "Resma A4",
      p_turno_id: 5,
    });
  });

  it("desde la pantalla de Gastos (admin) el efectivo sale de la caja de cambio, sin turno", async () => {
    responderRpc("registrar_gasto", { data: { id: 8, monto: 2500.5 } });
    const onCerrar = vi.fn();
    renderConQuery(<DialogoGasto soloCaja={false} descripcion="Admin" onCerrar={onCerrar} />);
    await userEvent.click(await screen.findByLabelText("Categoría"));
    await userEvent.click(await screen.findByRole("option", { name: "Tóner" }));
    await userEvent.type(screen.getByLabelText("Monto ($)"), "2.500,50");
    await userEvent.click(screen.getByLabelText("Pagado con"));
    await userEvent.click(await screen.findByRole("option", { name: "Efectivo (caja de cambio)" }));
    await userEvent.type(screen.getByLabelText("Nota"), "Tóner negro");
    await userEvent.click(screen.getByRole("button", { name: "Registrar gasto" }));
    await waitFor(() => {
      expect(onCerrar).toHaveBeenCalled();
    });
    // Sin turno: no manda p_turno_id (la BD lo paga con la caja de cambio).
    expect(argumentosRpc("registrar_gasto")).toEqual({
      p_categoria_id: 3,
      p_monto: 2500.5,
      p_fuente: "efectivo",
      p_nota: "Tóner negro",
    });
  });

  it("muestra el rechazo de la BD tal cual", async () => {
    responderRpc("registrar_gasto", {
      error: {
        code: "P0001",
        message: "No hay suficiente efectivo en la caja para este gasto. Avisale al administrador",
      },
    });
    const onCerrar = vi.fn();
    renderConQuery(<DialogoGasto soloCaja turnoId={5} descripcion="Caja 1" onCerrar={onCerrar} />);
    await completar();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No hay suficiente efectivo en la caja para este gasto. Avisale al administrador",
    );
    expect(onCerrar).not.toHaveBeenCalled();
  });
});
