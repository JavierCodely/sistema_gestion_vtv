import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TAMANO_PAGINA } from "@/compartido/lib/paginacion";
import { mesActual } from "@/compartido/lib/rango-fechas";
import { CLAVE_PESTANA } from "@/modulos/fondos/lib/pestanas";
import { authDePrueba, perfilDePrueba, renderRuta } from "@tests/soporte/render";
import {
  argumentosDe,
  argumentosRpc,
  conFiltro,
  llamadas,
  reiniciarSupabaseFalso,
  responder,
  responderRpc,
} from "@tests/soporte/supabase-falso";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/compartido/lib/supabase", async () => ({
  supabase: (await import("@tests/soporte/supabase-falso")).supabaseFalso,
}));

const admin = authDePrueba({ perfil: perfilDePrueba({ rol: "admin" }) });
const normal = (texto: string | null) => (texto ?? "").replace(/\s/g, " ");

/** Fila de `v_movimientos_fondos` con lo mínimo; `cambios` pisa lo que haga falta. */
function movimiento(cambios: Record<string, unknown>) {
  return {
    cuenta: "transferencia",
    clave: "venta:0000000000000000001:transferencia",
    fecha: "2026-11-21T13:00:00.123456+00:00",
    fecha_local: "2026-11-21",
    origen: "venta",
    tipo: "venta",
    sentido: "ingreso",
    descripcion: "VTV auto — AB123CD",
    nota: null,
    monto: 18000,
    usuario_nombre: "Carlos Demo",
    venta_id: 1,
    gasto_id: null,
    compra_id: null,
    movimiento_id: null,
    caja_nombre: "Caja 1",
    pago_mixto: false,
    venta_pasada: false,
    ...cambios,
  };
}

const LIBRO_TRANSFERENCIA = [
  movimiento({
    clave: "gasto_anulado:0000000000000000007",
    fecha: "2026-11-21T15:00:00.5+00:00",
    origen: "gasto_anulado",
    sentido: "egreso",
    descripcion: "Anulación de gasto: Servicios › Luz",
    nota: "Cargado dos veces",
    monto: 4000,
    venta_id: null,
    gasto_id: 7,
  }),
  movimiento({
    clave: "gasto:0000000000000000007",
    fecha: "2026-11-21T14:00:00+00:00",
    origen: "gasto",
    sentido: "egreso",
    descripcion: "Servicios › Luz",
    monto: -4000,
    venta_id: null,
    gasto_id: 7,
  }),
  movimiento({
    clave: "venta:0000000000000000002:transferencia",
    origen: "venta",
    descripcion: "VTV moto",
    monto: 5000,
    pago_mixto: true,
    venta_id: 2,
  }),
];

beforeEach(() => {
  vi.clearAllMocks();
  reiniciarSupabaseFalso();
  localStorage.clear();
  responder("caja_efectivo", "select", { data: { saldo: 12500.5 } });
  responderRpc("resumen_fondos", {
    data: [
      {
        cuenta: "efectivo",
        saldo: 12500.5,
        ingresos: 14000.5,
        egresos: 1500,
        neto: 12500.5,
        cantidad_movimientos: 2,
      },
      {
        cuenta: "transferencia",
        saldo: -2500,
        ingresos: 23000,
        egresos: 25500,
        neto: -2500,
        cantidad_movimientos: 4,
      },
    ],
  });
  responder("v_movimientos_fondos", "select", {
    data: [
      movimiento({
        cuenta: "efectivo",
        clave: "efectivo:0000000000000000002",
        origen: "gasto",
        sentido: "egreso",
        descripcion: "Insumos › Café",
        nota: "Café",
        monto: -1500,
        movimiento_id: 2,
        venta_id: null,
        caja_nombre: null,
      }),
      movimiento({
        cuenta: "efectivo",
        clave: "efectivo:0000000000000000001",
        fecha: "2026-11-21T12:00:00+00:00",
        origen: "manual",
        sentido: "ingreso",
        descripcion: "Fondo inicial",
        nota: "Fondo",
        monto: 14000.5,
        movimiento_id: 1,
        venta_id: null,
        caja_nombre: null,
        usuario_nombre: "Ana Administradora",
      }),
    ],
  });
  responder(
    "v_movimientos_fondos",
    "select",
    { data: LIBRO_TRANSFERENCIA },
    { cuando: conFiltro("eq", "cuenta", "transferencia") },
  );
  responder("v_movimientos_efectivo", "select", {
    data: [
      { id: 2, saldo_resultante: 12500.5 },
      { id: 1, saldo_resultante: 14000.5 },
    ],
  });
  responderRpc("resumen_ventas_mixtas", {
    data: [
      {
        cantidad_ventas: 1,
        total: 18000,
        total_efectivo: 5000,
        total_transferencia: 13000,
        incluido_en_cuentas: true,
      },
    ],
  });
  responder("v_ventas_mixtas", "select", {
    data: [
      {
        id: 9,
        creado_en: "2026-11-21T13:30:00Z",
        caja_nombre: "Caja 1",
        servicio_nombre: "VTV auto",
        patente: "AB123CD",
        usuario_nombre: "Carlos Demo",
        precio: 18000,
        pago_efectivo: 5000,
        pago_transferencia: 13000,
        anulada: false,
        anulada_motivo: null,
      },
      {
        id: 8,
        creado_en: "2026-11-21T13:00:00Z",
        caja_nombre: "Caja 1",
        servicio_nombre: "VTV moto",
        patente: null,
        usuario_nombre: "Carlos Demo",
        precio: 9000,
        pago_efectivo: 4000,
        pago_transferencia: 5000,
        anulada: true,
        anulada_motivo: "Error de carga",
      },
    ],
  });
});

describe("Fondos (admin)", () => {
  it("muestra el resumen de cada cuenta del mes actual; el saldo negativo, en rojo", async () => {
    renderRuta("/admin/fondos", admin);
    expect(await screen.findByRole("heading", { name: "Fondos", level: 1 })).toBeInTheDocument();
    const { desde, hasta } = mesActual();
    expect(screen.getByLabelText("Desde")).toHaveValue(desde);
    expect(screen.getByLabelText("Hasta")).toHaveValue(hasta);

    const transferencia = await screen.findByTestId("resumen-transferencia-saldo");
    expect(normal(transferencia.textContent)).toBe("-$ 2.500,00");
    expect(transferencia).toHaveClass("text-destructive");
    expect(normal(screen.getByTestId("resumen-transferencia-ingresos").textContent)).toBe(
      "$ 23.000,00",
    );
    expect(normal(screen.getByTestId("resumen-transferencia-egresos").textContent)).toBe(
      "$ 25.500,00",
    );
    expect(screen.getByTestId("resumen-transferencia-neto")).toHaveClass("text-destructive");
    // Sin Crédito/Débito (migración 54): solo efectivo y transferencia.
    expect(screen.queryByTestId("resumen-tarjeta-saldo")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Crédito/Débito" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Efectivo",
      "Transferencia",
      "Mixto",
    ]);
    // El saldo de efectivo sale de la caja de cambio (useSaldoEfectivo).
    expect(normal((await screen.findByTestId("resumen-efectivo-saldo")).textContent)).toBe(
      "$ 12.500,50",
    );
    expect(argumentosRpc("resumen_fondos")).toEqual({ p_desde: desde, p_hasta: hasta });
  });

  it("arranca en Efectivo: saldo, libro con el saldo después de cada movimiento y botones de siempre", async () => {
    renderRuta("/admin/fondos", admin);
    expect(await screen.findByRole("tab", { name: "Efectivo" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(normal((await screen.findByTestId("saldo-efectivo")).textContent)).toBe("$ 12.500,50");
    const gasto = await screen.findByTestId("movimiento-efectivo:0000000000000000002");
    expect(normal(gasto.textContent)).toContain("Gasto");
    expect(normal(gasto.textContent)).toContain("−$ 1.500,00");
    expect(normal(gasto.textContent)).toContain("Carlos Demo");
    await waitFor(() => {
      expect(normal(gasto.textContent)).toContain("$ 12.500,50");
    });
    const fondo = screen.getByTestId("movimiento-efectivo:0000000000000000001");
    expect(normal(fondo.textContent)).toContain("Fondo inicial");
    expect(normal(fondo.textContent)).toContain("+$ 14.000,50");
    for (const nombre of ["Fondo inicial", "Ingreso", "Retiro"]) {
      expect(screen.getByRole("button", { name: nombre })).toBeInTheDocument();
    }
  });

  it("el libro respeta el período elegido y dice cuál muestra", async () => {
    renderRuta("/admin/fondos?pestana=transferencia", admin);
    await screen.findByTestId("movimiento-gasto:0000000000000000007");
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-10-31" } });
    expect(await screen.findByTestId("periodo-libro-transferencia")).toHaveTextContent(
      "Del 01/10/2026 al 31/10/2026",
    );
    await waitFor(() => {
      expect(argumentosDe("v_movimientos_fondos", "select", "gte")).toEqual([
        "fecha_local",
        "2026-10-01",
      ]);
    });
    expect(argumentosDe("v_movimientos_fondos", "select", "lte")).toEqual([
      "fecha_local",
      "2026-10-31",
    ]);
    expect(argumentosRpc("resumen_fondos")).toEqual({
      p_desde: "2026-10-01",
      p_hasta: "2026-10-31",
    });

    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-12-01" } });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La fecha “desde” no puede ser posterior a “hasta”.",
    );
  });

  it("Transferencia: ingresos en verde, egresos en rojo, reversos y ventas mixtas marcados", async () => {
    renderRuta("/admin/fondos", admin);
    await userEvent.click(await screen.findByRole("tab", { name: "Transferencia" }));

    const gasto = await screen.findByTestId("movimiento-gasto:0000000000000000007");
    expect(normal(gasto.textContent)).toContain("Gasto");
    expect(normal(gasto.textContent)).toContain("Servicios › Luz");
    expect(within(gasto).getByText(/4\.000/)).toHaveClass("text-destructive");
    expect(normal(gasto.textContent)).toContain("−$ 4.000,00");
    expect(within(gasto).queryByText("Reverso")).not.toBeInTheDocument();

    const reverso = screen.getByTestId("movimiento-gasto_anulado:0000000000000000007");
    expect(normal(reverso.textContent)).toContain("Gasto anulado");
    expect(within(reverso).getByText("Reverso")).toBeInTheDocument();
    expect(normal(reverso.textContent)).toContain("+$ 4.000,00");
    expect(normal(reverso.textContent)).toContain("Cargado dos veces");

    const mixta = screen.getByTestId("movimiento-venta:0000000000000000002:transferencia");
    expect(within(mixta).getByText("Mixto")).toBeInTheDocument();
    expect(within(mixta).getByText(/5\.000/)).toHaveClass("text-emerald-700");

    // Sin columna de saldo (es solo de efectivo) y con los botones de movimiento manual.
    expect(screen.queryByRole("columnheader", { name: "Saldo" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Saldo inicial" })).toBeInTheDocument();
    expect(normal((await screen.findByTestId("saldo-transferencia")).textContent)).toBe(
      "-$ 2.500,00",
    );
  });

  it("recuerda la pestaña elegida en la URL y para la próxima vez", async () => {
    const { router } = renderRuta("/admin/fondos", admin);
    await userEvent.click(await screen.findByRole("tab", { name: "Transferencia" }));
    await waitFor(() => {
      expect(router.state.location.search).toBe("?pestana=transferencia");
    });
    expect(localStorage.getItem(CLAVE_PESTANA)).toBe("transferencia");
    expect(screen.getByRole("tab", { name: "Transferencia" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("vuelve a la última pestaña elegida si se entra sin parámetro", async () => {
    localStorage.setItem(CLAVE_PESTANA, "mixto");
    renderRuta("/admin/fondos", admin);
    expect(await screen.findByRole("tab", { name: "Mixto" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("'Ver más' pide la página siguiente con el cursor (fecha, clave) de la última fila", async () => {
    const pagina = Array.from({ length: TAMANO_PAGINA }, (_, i) =>
      movimiento({
        clave: `venta:${String(1000 - i).padStart(19, "0")}:transferencia`,
        fecha: "2026-11-21T13:00:00.123456+00:00",
      }),
    );
    responder(
      "v_movimientos_fondos",
      "select",
      { data: pagina },
      { cuando: conFiltro("eq", "cuenta", "transferencia") },
    );
    responder(
      "v_movimientos_fondos",
      "select",
      { data: [movimiento({ clave: "venta:0000000000000000001:transferencia", monto: 777 })] },
      { cuando: (l) => l.cadena.some((c) => c.metodo === "or") },
    );
    renderRuta("/admin/fondos?pestana=transferencia", admin);
    await userEvent.click(await screen.findByRole("button", { name: "Ver más movimientos" }));
    expect(
      await screen.findByTestId("movimiento-venta:0000000000000000001:transferencia"),
    ).toHaveTextContent("777");
    const ultima = pagina[pagina.length - 1];
    expect(argumentosDe("v_movimientos_fondos", "select", "or")).toEqual([
      `fecha.lt."2026-11-21T13:00:00.123456+00:00",and(fecha.eq."2026-11-21T13:00:00.123456+00:00",clave.lt."${String(ultima?.clave)}")`,
    ]);
    expect(screen.queryByRole("button", { name: "Ver más movimientos" })).not.toBeInTheDocument();
  });

  it("registra un saldo inicial de transferencias con movimiento_fondos", async () => {
    responderRpc("movimiento_fondos", { data: movimiento({ origen: "manual", monto: 50000 }) });
    renderRuta("/admin/fondos?pestana=transferencia", admin);
    await userEvent.click(await screen.findByRole("button", { name: "Saldo inicial" }));
    const dialogo = await screen.findByRole("dialog", { name: "Saldo inicial" });
    expect(dialogo).toHaveTextContent("transferencias");
    await userEvent.type(within(dialogo).getByLabelText("Monto ($)"), "50.000");
    await userEvent.type(within(dialogo).getByLabelText("Nota"), "Saldo del banco");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(argumentosRpc("movimiento_fondos")).toEqual({
      p_cuenta: "transferencia",
      p_tipo: "fondo_inicial",
      p_monto: 50000,
      p_nota: "Saldo del banco",
    });
  });

  it("valida el movimiento manual antes de llamar a la BD", async () => {
    renderRuta("/admin/fondos?pestana=transferencia", admin);
    await userEvent.click(await screen.findByRole("button", { name: "Ingreso" }));
    const dialogo = await screen.findByRole("dialog", { name: "Ingreso" });
    await userEvent.type(within(dialogo).getByLabelText("Monto ($)"), "12,345");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    expect(within(dialogo).getByLabelText("Monto ($)")).toHaveAttribute("aria-invalid", "true");
    expect(within(dialogo).getByText("Escribí una nota.")).toBeInTheDocument();
    expect(llamadas.some((l) => l.tabla === "rpc:movimiento_fondos")).toBe(false);
  });

  it("un retiro mayor al saldo muestra el rechazo de la BD (P0001) en el diálogo", async () => {
    responderRpc("movimiento_fondos", {
      error: {
        code: "P0001",
        message:
          "No alcanza el saldo de transferencias: hay $ 1.000,00 y el retiro es de $ 5.000,00",
      },
    });
    renderRuta("/admin/fondos?pestana=transferencia", admin);
    await userEvent.click(await screen.findByRole("button", { name: "Retiro" }));
    const dialogo = await screen.findByRole("dialog", { name: "Retiro" });
    await userEvent.type(within(dialogo).getByLabelText("Monto ($)"), "5.000");
    await userEvent.type(within(dialogo).getByLabelText("Nota"), "Pago a proveedor");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    expect(
      await within(dialogo).findByText(
        "No alcanza el saldo de transferencias: hay $ 1.000,00 y el retiro es de $ 5.000,00",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Retiro" })).toBeInTheDocument();
  });

  it("en Efectivo, un retiro usa movimiento_efectivo y muestra el saldo resultante", async () => {
    responderRpc("movimiento_efectivo", { data: { id: 3, saldo_resultante: 2500.5 } });
    renderRuta("/admin/fondos", admin);
    await userEvent.click(await screen.findByRole("button", { name: "Retiro" }));
    const dialogo = await screen.findByRole("dialog", { name: "Retiro" });
    await userEvent.type(within(dialogo).getByLabelText("Monto ($)"), "10.000");
    await userEvent.type(within(dialogo).getByLabelText("Nota"), "Depósito en banco");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(normal(vi.mocked(toast.success).mock.lastCall?.[0] as string)).toBe(
      "Retiro registrado. Saldo: $ 2.500,50",
    );
    expect(argumentosRpc("movimiento_efectivo")).toEqual({
      p_tipo: "retiro",
      p_monto: 10000,
      p_nota: "Depósito en banco",
    });
    expect(llamadas.some((l) => l.tabla === "rpc:movimiento_fondos")).toBe(false);
  });

  it("Mixto: avisa que ya está incluido, muestra los totales y las ventas con el reparto", async () => {
    renderRuta("/admin/fondos?pestana=mixto", admin);
    const aviso = await screen.findByTestId("aviso-mixto");
    expect(aviso).toHaveTextContent("Ya están incluidas en las otras pestañas");
    expect(aviso).toHaveTextContent("no se suman a los de las cuentas");

    expect(await screen.findByTestId("mixtas-cantidad")).toHaveTextContent("1");
    expect(normal(screen.getByTestId("mixtas-total").textContent)).toBe("$ 18.000,00");
    expect(normal(screen.getByTestId("mixtas-efectivo").textContent)).toBe("$ 5.000,00");
    expect(normal(screen.getByTestId("mixtas-transferencia").textContent)).toBe("$ 13.000,00");
    expect(screen.queryByTestId("mixtas-tarjeta")).not.toBeInTheDocument();

    const venta = await screen.findByTestId("venta-mixta-9");
    expect(normal(venta.textContent)).toContain("VTV auto — AB123CD");
    expect(normal(venta.textContent)).toContain("$ 5.000,00");
    expect(normal(venta.textContent)).toContain("$ 13.000,00");
    const anulada = screen.getByTestId("venta-mixta-8");
    expect(within(anulada).getByText("Anulada")).toBeInTheDocument();
    expect(within(anulada).getByText("Error de carga")).toBeInTheDocument();
    expect(within(anulada).getByText("$ 9.000,00", { normalizer: normal })).toHaveClass(
      "line-through",
    );
    // Sin saldo ni movimientos manuales.
    expect(screen.queryByRole("button", { name: "Ingreso" })).not.toBeInTheDocument();
  });

  it("la dirección vieja /admin/efectivo lleva a Fondos, pestaña Efectivo", async () => {
    localStorage.setItem(CLAVE_PESTANA, "transferencia");
    const { router } = renderRuta("/admin/efectivo", admin);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/admin/fondos");
    });
    expect(router.state.location.search).toBe("?pestana=efectivo");
    expect(await screen.findByRole("tab", { name: "Efectivo" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("un cajero no llega a la pantalla", async () => {
    const { router } = renderRuta("/admin/fondos", authDePrueba({ perfil: perfilDePrueba() }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/caja");
    });
    expect(screen.queryByTestId("saldo-efectivo")).not.toBeInTheDocument();
  });
});
