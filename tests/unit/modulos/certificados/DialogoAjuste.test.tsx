import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DialogoAjuste } from "@/modulos/certificados/componentes/DialogoAjuste";
import { renderConQuery } from "@tests/soporte/render";
import { argumentosRpc, reiniciarSupabaseFalso, responderRpc } from "@tests/soporte/supabase-falso";
import { certificadoDePrueba } from "./datos";

vi.mock("@/compartido/lib/supabase", async () => ({
  supabase: (await import("@tests/soporte/supabase-falso")).supabaseFalso,
}));

const CERTIFICADO = certificadoDePrueba({ stock_hojas: 1250, semaforo: "ok" });

async function completar(sentido: "Restar hojas" | "Sumar hojas", cantidad: string, nota: string) {
  await userEvent.click(screen.getByLabelText("Tipo de ajuste"));
  await userEvent.click(await screen.findByRole("option", { name: sentido }));
  await userEvent.type(screen.getByLabelText("Cantidad de hojas"), cantidad);
  await userEvent.type(screen.getByLabelText("Motivo"), nota);
  await userEvent.click(screen.getByRole("button", { name: "Ajustar stock" }));
}

beforeEach(() => {
  reiniciarSupabaseFalso();
});

describe("DialogoAjuste", () => {
  it("muestra el stock actual con separador de miles", () => {
    renderConQuery(<DialogoAjuste certificado={CERTIFICADO} onCerrar={vi.fn()} />);
    expect(screen.getByText(/stock actual: 1\.250 hojas/)).toBeInTheDocument();
  });

  it("restar manda las hojas en negativo a la RPC y cierra", async () => {
    responderRpc("ajustar_stock_certificado", { data: { stock_resultante: 1247 } });
    const onCerrar = vi.fn();
    renderConQuery(<DialogoAjuste certificado={CERTIFICADO} onCerrar={onCerrar} />);
    await completar("Restar hojas", "3", " Hojas rotas ");
    await vi.waitFor(() => {
      expect(onCerrar).toHaveBeenCalled();
    });
    expect(argumentosRpc("ajustar_stock_certificado")).toEqual({
      p_certificado_id: 4,
      p_hojas: -3,
      p_nota: "Hojas rotas",
    });
  });

  it("sumar manda las hojas en positivo", async () => {
    responderRpc("ajustar_stock_certificado", { data: { stock_resultante: 2250 } });
    const onCerrar = vi.fn();
    renderConQuery(<DialogoAjuste certificado={CERTIFICADO} onCerrar={onCerrar} />);
    await completar("Sumar hojas", "1.000", "Conteo físico");
    await vi.waitFor(() => {
      expect(onCerrar).toHaveBeenCalled();
    });
    expect(argumentosRpc("ajustar_stock_certificado")).toEqual({
      p_certificado_id: 4,
      p_hojas: 1000,
      p_nota: "Conteo físico",
    });
  });

  it("muestra el rechazo de la BD y no cierra", async () => {
    responderRpc("ajustar_stock_certificado", {
      error: {
        code: "P0001",
        message: "El stock no puede superar las 1.000.000.000 hojas (stock actual: 1250 hojas)",
      },
    });
    const onCerrar = vi.fn();
    renderConQuery(<DialogoAjuste certificado={CERTIFICADO} onCerrar={onCerrar} />);
    await completar("Sumar hojas", "5", "Conteo");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El stock no puede superar las 1.000.000.000 hojas",
    );
    expect(onCerrar).not.toHaveBeenCalled();
  });
});
