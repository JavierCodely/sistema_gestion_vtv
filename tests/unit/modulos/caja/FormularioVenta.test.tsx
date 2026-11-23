import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FormularioVenta } from "@/modulos/caja/componentes/FormularioVenta";
import {
  useCategorias,
  useServicios,
  type Categoria,
  type Servicio,
} from "@/modulos/servicios/api/consultas";
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
vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));

const CATEGORIAS: Categoria[] = [
  { id: 1, nombre: "Autos", activa: true },
  { id: 2, nombre: "Vieja", activa: false },
  { id: 3, nombre: "Motos", activa: true },
  { id: 4, nombre: "Vacía", activa: true },
];
const servicio = (cambios: Partial<Servicio>): Servicio => ({
  id: 1,
  nombre: "VTV auto",
  categoria_id: 1,
  precio: 30000,
  requiere_certificado: true,
  activo: true,
  ...cambios,
});
const SERVICIOS: Servicio[] = [
  servicio({}),
  servicio({ id: 2, nombre: "Reverificación", requiere_certificado: false, precio: 10000 }),
  servicio({ id: 3, nombre: "Desactivado", activo: false }),
  servicio({ id: 4, nombre: "De categoría vieja", categoria_id: 2 }),
  servicio({
    id: 5,
    nombre: "VTV moto",
    categoria_id: 3,
    precio: 12500.5,
    requiere_certificado: false,
  }),
];

/** formatearMoneda separa "$" con un espacio duro: se compara con espacios normales. */
const normal = (texto: string | null | undefined) => (texto ?? "").replace(/\s/g, " ");

function ultimoAviso(fn: typeof toast.success) {
  const mensaje = vi.mocked(fn).mock.calls.at(-1)?.[0];
  return typeof mensaje === "string" ? normal(mensaje) : "";
}

/** Turno de la caja elegida: toda venta va ahí. */
const TURNO_ID = 5;
const turnoNoDisponible = vi.fn();

function renderFormulario() {
  renderConQuery(
    <FormularioVenta
      turnoId={TURNO_ID}
      onTurnoNoDisponible={turnoNoDisponible}
      categorias={CATEGORIAS}
      servicios={SERVICIOS}
    />,
  );
}

const opciones = (lista: HTMLElement) =>
  within(lista)
    .getAllByRole("option")
    .map((o) => normal(o.textContent));

/** Autos (Enter) → servicio N° `numero` (tecla) → Enter. */
async function elegirServicioDeAutos(numero: string) {
  await screen.findByRole("listbox", { name: "1. Categoría" });
  await userEvent.keyboard("{Enter}");
  await screen.findByRole("listbox", { name: "2. Servicio · Autos" });
  await userEvent.keyboard(`${numero}{Enter}`);
  await screen.findByLabelText("3. Patente");
}

beforeEach(() => {
  reiniciarSupabaseFalso();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.warning).mockClear();
  responderRpc("certificado_para_servicio", { data: null });
  responderRpc("descuentos_para_servicio", { data: [] });
});

describe("FormularioVenta (caja por teclado)", () => {
  it("ofrece solo categorías activas con servicios, numeradas, y sus servicios activos con precio", async () => {
    renderFormulario();
    const categorias = await screen.findByRole("listbox", { name: "1. Categoría" });
    expect(categorias).toHaveFocus();
    expect(opciones(categorias)).toEqual(["1Autos", "2Motos"]);

    await userEvent.keyboard("{Enter}");
    const servicios = await screen.findByRole("listbox", { name: "2. Servicio · Autos" });
    expect(servicios).toHaveFocus();
    expect(opciones(servicios)).toEqual(["1VTV auto$ 30.000,00", "2Reverificación$ 10.000,00"]);
  });

  it("flechas y números marcan; Esc vuelve al paso anterior", async () => {
    renderFormulario();
    const categorias = await screen.findByRole("listbox", { name: "1. Categoría" });
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: "Motos" })).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowUp}");
    expect(screen.getByRole("option", { name: "Autos" })).toHaveAttribute("aria-selected", "true");
    // Un número sin opción no hace nada
    await userEvent.keyboard("9");
    expect(screen.getByRole("option", { name: "Autos" })).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("2");
    expect(categorias).toHaveAttribute(
      "aria-activedescendant",
      screen.getByRole("option", { name: "Motos" }).id,
    );
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByRole("listbox", { name: "2. Servicio · Motos" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(await screen.findByRole("listbox", { name: "1. Categoría" })).toBeInTheDocument();
  });

  it("muestra qué hoja de certificado se va a usar", async () => {
    responderRpc("certificado_para_servicio", { data: 7 });
    responder("certificados", "select", { data: { id: 7, nombre: "Hoja VTV", stock_hojas: 1250 } });
    renderFormulario();
    await elegirServicioDeAutos("1");
    expect(await screen.findByTestId("aviso-certificado")).toHaveTextContent(
      "Usa una hoja de “Hoja VTV” (quedan 1.250).",
    );
    expect(normal(screen.getByTestId("precio").textContent)).toBe("$ 30.000,00");
  });

  it("avisa que no hay certificado configurado (la venta se registra igual)", async () => {
    renderFormulario();
    await elegirServicioDeAutos("1");
    expect(await screen.findByTestId("aviso-certificado")).toHaveTextContent(
      "No hay un certificado configurado para este servicio.",
    );
  });

  it("un servicio sin certificado no consulta stock", async () => {
    reiniciarSupabaseFalso();
    responderRpc("descuentos_para_servicio", { data: [] });
    renderFormulario();
    await elegirServicioDeAutos("2");
    expect(screen.getByText("Este servicio no lleva certificado.")).toBeInTheDocument();
    expect(argumentosRpc("certificado_para_servicio")).toBeUndefined();
  });

  it("patente grande en mayúsculas (solo letras y números) y venta con tarjeta solo con el teclado", async () => {
    responderRpc("registrar_venta", {
      data: { id: 81, servicio_nombre: "VTV auto", precio: 30000, sin_stock: false },
    });
    renderFormulario();
    await elegirServicioDeAutos("1");
    const patente = screen.getByLabelText("3. Patente");
    expect(patente).toHaveFocus();
    await userEvent.keyboard("ab 12-3cd");
    expect(patente).toHaveValue("AB123CD");
    await userEvent.keyboard("{Enter}");

    const medios = await screen.findByRole("listbox", { name: "4. Medio de pago" });
    expect(opciones(medios)).toEqual(["1Efectivo", "2Transferencia", "3Tarjeta", "4Mixto"]);
    await userEvent.keyboard("{ArrowRight}{ArrowRight}{Enter}");
    await waitFor(() => {
      expect(argumentosRpc("registrar_venta")).toEqual({
        p_turno_id: TURNO_ID,
        p_servicio_id: 1,
        p_medio_pago: "tarjeta",
        p_patente: "AB123CD",
        p_precio_esperado: 30000,
      });
    });
    expect(ultimoAviso(toast.success)).toBe("Venta N° 81: VTV auto · $ 30.000,00");
    // Lista para la próxima venta
    expect(await screen.findByRole("listbox", { name: "1. Categoría" })).toHaveFocus();
    expect(screen.getByTestId("ultima-venta")).toHaveTextContent("Última venta · N° 81");
  });

  it("la patente es obligatoria: vacía no avanza y lo avisa; al escribir se va el aviso", async () => {
    renderFormulario();
    await elegirServicioDeAutos("1");
    const patente = screen.getByLabelText("3. Patente");
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Ingresá la patente del vehículo.");
    expect(patente).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("listbox", { name: "4. Medio de pago" })).not.toBeInTheDocument();
    await userEvent.keyboard("AB1");
    expect(screen.queryByText("Ingresá la patente del vehículo.")).not.toBeInTheDocument();
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByRole("listbox", { name: "4. Medio de pago" })).toBeInTheDocument();
  });

  it("efectivo: el monto recibido acepta solo números y muestra el vuelto", async () => {
    responderRpc("registrar_venta", {
      data: { id: 82, servicio_nombre: "VTV auto", precio: 30000, sin_stock: false },
    });
    renderFormulario();
    await elegirServicioDeAutos("1");
    await userEvent.keyboard("AA111AA{Enter}");
    await screen.findByRole("listbox", { name: "4. Medio de pago" });
    await userEvent.keyboard("1{Enter}");

    const recibido = await screen.findByLabelText("5. ¿Cuánto te entregó? ($)");
    expect(recibido).toHaveFocus();
    await userEvent.keyboard("5a0.0,00");
    expect(recibido).toHaveValue("50000");
    expect(normal(screen.getByTestId("vuelto").textContent)).toBe("$ 20.000,00");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => {
      expect(argumentosRpc("registrar_venta")).toEqual({
        p_turno_id: TURNO_ID,
        p_servicio_id: 1,
        p_patente: "AA111AA",
        p_medio_pago: "efectivo",
        p_precio_esperado: 30000,
      });
    });
    expect(normal((await screen.findByTestId("ultima-venta")).textContent)).toContain(
      "Vuelto $ 20.000,00",
    );
  });

  it("efectivo: si no alcanza avisa cuánto falta y no registra", async () => {
    renderFormulario();
    await elegirServicioDeAutos("1");
    await userEvent.keyboard("AA111AA{Enter}");
    await screen.findByRole("listbox", { name: "4. Medio de pago" });
    await userEvent.keyboard("{Enter}");
    await screen.findByLabelText("5. ¿Cuánto te entregó? ($)");
    await userEvent.keyboard("100");
    expect(screen.getByText("Falta")).toBeInTheDocument();
    await userEvent.keyboard("{Enter}");
    expect(normal(screen.getByText(/No alcanza/).textContent)).toBe(
      "No alcanza: faltan $ 29.900,00.",
    );
    expect(argumentosRpc("registrar_venta")).toBeUndefined();
    // Esc vuelve al medio de pago
    await userEvent.keyboard("{Escape}");
    expect(await screen.findByRole("listbox", { name: "4. Medio de pago" })).toBeInTheDocument();
  });

  it("efectivo: Enter con el campo vacío es pago justo; sin hoja avisa con una advertencia", async () => {
    responderRpc("registrar_venta", {
      data: { id: 83, servicio_nombre: "Reverificación", precio: 10000, sin_stock: true },
    });
    renderFormulario();
    await elegirServicioDeAutos("2");
    await userEvent.keyboard("AA111AA{Enter}");
    await screen.findByRole("listbox", { name: "4. Medio de pago" });
    await userEvent.keyboard("{Enter}");
    await screen.findByLabelText("5. ¿Cuánto te entregó? ($)");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => {
      expect(ultimoAviso(toast.warning)).toBe(
        "Venta N° 83: Reverificación · $ 10.000,00 (sin hoja de certificado)",
      );
    });
    expect(toast.success).not.toHaveBeenCalled();
    expect(await screen.findByTestId("ultima-venta")).toHaveTextContent("Pagó justo");
  });

  it("muestra el rechazo de la BD y deja reintentar", async () => {
    responderRpc("registrar_venta", {
      error: { code: "P0001", message: "Necesitás un turno abierto para vender" },
    });
    renderFormulario();
    await elegirServicioDeAutos("2");
    await userEvent.keyboard("AA111AA{Enter}");
    await screen.findByRole("listbox", { name: "4. Medio de pago" });
    await userEvent.keyboard("2{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Necesitás un turno abierto para vender",
    );
    expect(screen.getByRole("listbox", { name: "4. Medio de pago" })).toBeInTheDocument();
  });

  it("también se elige con el mouse", async () => {
    renderFormulario();
    await userEvent.click(await screen.findByRole("option", { name: "Motos" }));
    await userEvent.click(await screen.findByRole("option", { name: /VTV moto/ }));
    expect(await screen.findByLabelText("3. Patente")).toBeInTheDocument();
    expect(normal(screen.getByTestId("precio").textContent)).toBe("$ 12.500,50");
  });
  it("si no se pueden leer los descuentos, la venta sigue sin descuento y lo avisa", async () => {
    responderRpc("descuentos_para_servicio", {
      error: { code: "P0001", message: "Tu usuario está desactivado" },
    });
    renderFormulario();
    await elegirServicioDeAutos("1");
    expect(screen.getByText(/No se pudieron cargar los descuentos/)).toHaveTextContent(
      "Tu usuario está desactivado",
    );
  });
});

const JUBILADOS = {
  id: 4,
  nombre: "Jubilados",
  tipo: "porcentaje",
  valor: 10,
  precio_lista: 30000,
  monto_descuento: 3000,
  precio_final: 27000,
};

/** Venta que devuelve la BD (solo las columnas que usa la pantalla). */
const ventaRegistrada = (cambios: Record<string, unknown> = {}) => ({
  id: 90,
  servicio_nombre: "VTV auto",
  precio: 30000,
  precio_lista: 30000,
  monto_descuento: 0,
  descuento_nombre: null,
  sin_stock: false,
  ...cambios,
});

const CON_JUBILADOS = { precio: 27000, monto_descuento: 3000, descuento_nombre: "Jubilados" };

/** Autos → VTV auto (el descuento N° `descuento` si se pasa) → patente AA111AA → medio N° `medio`. */
async function hastaElMedio(medio: string, descuento?: string) {
  await screen.findByRole("listbox", { name: "1. Categoría" });
  await userEvent.keyboard("{Enter}");
  await screen.findByRole("listbox", { name: "2. Servicio · Autos" });
  await userEvent.keyboard("1{Enter}");
  if (descuento) {
    await screen.findByRole("listbox", { name: "Descuento (opcional) · VTV auto" });
    await userEvent.keyboard(`${descuento}{Enter}`);
  }
  await screen.findByLabelText("3. Patente");
  await userEvent.keyboard("AA111AA{Enter}");
  await screen.findByRole("listbox", { name: "4. Medio de pago" });
  await userEvent.keyboard(`${medio}{Enter}`);
}

describe("FormularioVenta: descuentos", () => {
  it("ofrece los descuentos del servicio con lo que descuenta y el precio final de la BD", async () => {
    responderRpc("descuentos_para_servicio", {
      data: [
        JUBILADOS,
        {
          ...JUBILADOS,
          id: 5,
          nombre: "Promo fija",
          tipo: "monto_fijo",
          valor: 5000,
          monto_descuento: 5000,
          precio_final: 25000,
        },
      ],
    });
    responderRpc("registrar_venta", { data: ventaRegistrada(CON_JUBILADOS) });
    renderFormulario();
    await screen.findByRole("listbox", { name: "1. Categoría" });
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("listbox", { name: "2. Servicio · Autos" });
    await userEvent.keyboard("1{Enter}");

    const lista = await screen.findByRole("listbox", { name: "Descuento (opcional) · VTV auto" });
    expect(lista).toHaveFocus();
    expect(argumentosRpc("descuentos_para_servicio")).toEqual({ p_servicio_id: 1 });
    expect(opciones(lista)).toEqual([
      "1Sin descuento$ 30.000,00",
      "2Jubilados−$ 3.000,00$ 27.000,00",
      "3Promo fija−$ 5.000,00$ 25.000,00",
    ]);
    // "Sin descuento" viene marcado
    expect(screen.getByRole("option", { name: /Sin descuento/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await userEvent.keyboard("2{Enter}");

    await screen.findByLabelText("3. Patente");
    expect(normal(screen.getByTestId("precio").textContent)).toBe("$ 27.000,00");
    expect(normal(screen.getByTestId("descuento-en-curso").textContent)).toBe(
      "Lista $ 30.000,00 · Jubilados −$ 3.000,00",
    );
    // Esc desde la patente vuelve al descuento (con el elegido marcado)
    await userEvent.keyboard("{Escape}");
    await screen.findByRole("listbox", { name: "Descuento (opcional) · VTV auto" });
    expect(screen.getByRole("option", { name: /Jubilados/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await userEvent.keyboard("{Enter}");
    await screen.findByLabelText("3. Patente");
    await userEvent.keyboard("AA111AA{Enter}");
    await screen.findByRole("listbox", { name: "4. Medio de pago" });
    await userEvent.keyboard("3{Enter}");
    await waitFor(() => {
      expect(argumentosRpc("registrar_venta")).toEqual({
        p_turno_id: TURNO_ID,
        p_servicio_id: 1,
        p_patente: "AA111AA",
        p_medio_pago: "tarjeta",
        p_descuento_id: 4,
        p_precio_esperado: 27000,
      });
    });
    const ultima = normal((await screen.findByTestId("ultima-venta")).textContent);
    expect(ultima).toContain("VTV auto · $ 27.000,00");
    expect(ultima).toContain("Descuento Jubilados: −$ 3.000,00");
  });

  it("“Sin descuento” no manda descuento", async () => {
    responderRpc("descuentos_para_servicio", { data: [JUBILADOS] });
    responderRpc("registrar_venta", { data: ventaRegistrada() });
    renderFormulario();
    await screen.findByRole("listbox", { name: "1. Categoría" });
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("listbox", { name: "2. Servicio · Autos" });
    await userEvent.keyboard("1{Enter}");
    await screen.findByRole("listbox", { name: "Descuento (opcional) · VTV auto" });
    await userEvent.keyboard("{Enter}");
    await screen.findByLabelText("3. Patente");
    expect(normal(screen.getByTestId("precio").textContent)).toBe("$ 30.000,00");
    expect(screen.queryByTestId("descuento-en-curso")).not.toBeInTheDocument();
    await userEvent.keyboard("AA111AA{Enter}");
    await screen.findByRole("listbox", { name: "4. Medio de pago" });
    await userEvent.keyboard("2{Enter}");
    await waitFor(() => {
      expect(argumentosRpc("registrar_venta")).toEqual({
        p_turno_id: TURNO_ID,
        p_servicio_id: 1,
        p_patente: "AA111AA",
        p_medio_pago: "transferencia",
        p_precio_esperado: 30000,
      });
    });
  });

  it("el vuelto se calcula sobre el precio final con descuento", async () => {
    responderRpc("descuentos_para_servicio", { data: [JUBILADOS] });
    responderRpc("registrar_venta", { data: ventaRegistrada(CON_JUBILADOS) });
    renderFormulario();
    await hastaElMedio("1", "2");
    await screen.findByLabelText("5. ¿Cuánto te entregó? ($)");
    await userEvent.keyboard("27500");
    expect(normal(screen.getByTestId("vuelto").textContent)).toBe("$ 500,00");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => {
      expect(argumentosRpc("registrar_venta")).toEqual({
        p_turno_id: TURNO_ID,
        p_servicio_id: 1,
        p_patente: "AA111AA",
        p_medio_pago: "efectivo",
        p_descuento_id: 4,
        p_precio_esperado: 27000,
      });
    });
    expect(normal((await screen.findByTestId("ultima-venta")).textContent)).toContain(
      "Vuelto $ 500,00",
    );
  });

  it("la última venta usa el precio que devolvió la BD y avisa si el vuelto da negativo", async () => {
    // La pantalla tenía $ 30.000 en caché; la BD registró $ 31.000 (el admin cambió el precio).
    responderRpc("registrar_venta", { data: ventaRegistrada({ precio: 31000 }) });
    renderFormulario();
    await hastaElMedio("1");
    await screen.findByLabelText("5. ¿Cuánto te entregó? ($)");
    await userEvent.keyboard("30000{Enter}");
    const ultima = await screen.findByTestId("ultima-venta");
    expect(normal(ultima.textContent)).toContain("VTV auto · $ 31.000,00");
    expect(normal(within(ultima).getByRole("alert").textContent)).toBe(
      "Atención: lo entregado no alcanza. Faltan cobrar $ 1.000,00.",
    );
    expect(ultimoAviso(toast.warning)).toBe(
      "Lo entregado no alcanza para lo registrado: faltan cobrar $ 1.000,00.",
    );
  });
});

describe("FormularioVenta: pago mixto", () => {
  it("se escribe el efectivo, el resto se calcula solo y se elige con 1/2 o flechas", async () => {
    responderRpc("registrar_venta", { data: ventaRegistrada() });
    renderFormulario();
    await hastaElMedio("4");
    const efectivo = await screen.findByLabelText("5. Pago mixto: ¿cuánto paga en efectivo? ($)");
    expect(efectivo).toHaveFocus();
    expect(screen.getByTestId("resto-mixto")).toHaveTextContent("—");

    // Sin efectivo, mal escrito o que cubre todo el precio: no sigue
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("Escribí cuánto paga en efectivo.");
    await userEvent.keyboard("1,2,3{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("El monto no es válido.");
    await userEvent.clear(efectivo);
    await userEvent.keyboard("30.000{Enter}");
    expect(normal(screen.getByRole("alert").textContent)).toBe(
      "El efectivo tiene que ser menor que el precio ($ 30.000,00). Si paga todo en efectivo, volvé y elegí Efectivo.",
    );

    await userEvent.clear(efectivo);
    await userEvent.keyboard("10.000,50");
    expect(normal(screen.getByTestId("resto-mixto").textContent)).toBe("$ 19.999,50");
    await userEvent.keyboard("{Enter}");

    const resto = await screen.findByRole("listbox", { name: "5. ¿Con qué paga el resto?" });
    expect(resto).toHaveFocus();
    expect(opciones(resto)).toEqual(["1Transferencia$ 19.999,50", "2Débito / Crédito$ 19.999,50"]);
    // Flechas y números marcan; Esc vuelve a corregir el efectivo con lo escrito
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("option", { name: /Débito/ })).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("1");
    expect(screen.getByRole("option", { name: /Transferencia/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await userEvent.keyboard("{Escape}");
    expect(
      await screen.findByLabelText("5. Pago mixto: ¿cuánto paga en efectivo? ($)"),
    ).toHaveValue("10.000,50");
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("listbox", { name: "5. ¿Con qué paga el resto?" });
    await userEvent.keyboard("2{Enter}");

    // Después pide cuánto entregó en efectivo; pagó justo
    expect(await screen.findByLabelText("6. ¿Cuánto te entregó en efectivo? ($)")).toHaveFocus();
    expect(normal(screen.getByTestId("efectivo-a-cobrar").textContent)).toBe(
      "Efectivo a cobrar: $ 10.000,50",
    );
    await userEvent.keyboard("{Enter}");
    await waitFor(() => {
      expect(argumentosRpc("registrar_venta")).toEqual({
        p_turno_id: TURNO_ID,
        p_servicio_id: 1,
        p_patente: "AA111AA",
        p_pagos: [
          { medio: "efectivo", monto: 10000.5 },
          { medio: "tarjeta", monto: 19999.5 },
        ],
        p_precio_esperado: 30000,
      });
    });
    const ultima = normal((await screen.findByTestId("ultima-venta")).textContent);
    expect(ultima).toContain("Mixto");
    expect(ultima).toContain("Efectivo $ 10.000,50 + Tarjeta $ 19.999,50");
  });

  it("con descuento: el resto sale del precio final y da el vuelto sobre el efectivo", async () => {
    responderRpc("descuentos_para_servicio", { data: [JUBILADOS] });
    responderRpc("registrar_venta", { data: ventaRegistrada(CON_JUBILADOS) });
    renderFormulario();
    await hastaElMedio("4", "2");

    // Precio final con descuento: $ 27.000
    await userEvent.type(
      await screen.findByLabelText("5. Pago mixto: ¿cuánto paga en efectivo? ($)"),
      "5000",
    );
    expect(normal(screen.getByTestId("resto-mixto").textContent)).toBe("$ 22.000,00");
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await userEvent.click(await screen.findByRole("option", { name: /Transferencia/ }));

    const recibido = await screen.findByLabelText("6. ¿Cuánto te entregó en efectivo? ($)");
    await userEvent.keyboard("2000{Enter}");
    expect(normal(screen.getByText(/No alcanza/).textContent)).toBe(
      "No alcanza: faltan $ 3.000,00.",
    );
    await userEvent.clear(recibido);
    await userEvent.keyboard("10000");
    expect(normal(screen.getByTestId("vuelto").textContent)).toBe("$ 5.000,00");
    // Esc vuelve a elegir el medio del resto, con el elegido marcado
    await userEvent.keyboard("{Escape}");
    expect(await screen.findByRole("option", { name: /Transferencia/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await userEvent.keyboard("{Enter}");
    await screen.findByLabelText("6. ¿Cuánto te entregó en efectivo? ($)");
    await userEvent.keyboard("10000{Enter}");
    await waitFor(() => {
      expect(argumentosRpc("registrar_venta")).toEqual({
        p_turno_id: TURNO_ID,
        p_servicio_id: 1,
        p_patente: "AA111AA",
        p_pagos: [
          { medio: "efectivo", monto: 5000 },
          { medio: "transferencia", monto: 22000 },
        ],
        p_descuento_id: 4,
        p_precio_esperado: 27000,
      });
    });
    const ultima = normal((await screen.findByTestId("ultima-venta")).textContent);
    expect(ultima).toContain("Vuelto $ 5.000,00");
  });

  it("muestra el rechazo de la BD del reparto", async () => {
    responderRpc("registrar_venta", {
      error: { code: "22023", message: "Los pagos no suman el precio de la venta" },
    });
    renderFormulario();
    await hastaElMedio("4");
    await screen.findByLabelText("5. Pago mixto: ¿cuánto paga en efectivo? ($)");
    await userEvent.keyboard("10000{Enter}");
    await screen.findByRole("listbox", { name: "5. ¿Con qué paga el resto?" });
    await userEvent.keyboard("{Enter}");
    await screen.findByLabelText("6. ¿Cuánto te entregó en efectivo? ($)");
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByText("Los pagos no suman el precio de la venta")).toBeInTheDocument();
  });
});

const ventasPedidas = () => llamadas.filter((l) => l.tabla === "rpc:registrar_venta").length;

/** Como la página de la caja: el catálogo sale de las consultas (así se ve cuando se relee). */
function CajaConCatalogo() {
  const categorias = useCategorias();
  const servicios = useServicios();
  if (!categorias.data || !servicios.data) return <p>Cargando…</p>;
  return (
    <FormularioVenta
      turnoId={TURNO_ID}
      onTurnoNoDisponible={turnoNoDisponible}
      categorias={categorias.data}
      servicios={servicios.data}
    />
  );
}

function renderCaja() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CajaConCatalogo />
    </QueryClientProvider>,
  );
  return queryClient;
}

const precioCambiado = (precio: string) => ({
  error: { code: "P0001", message: `El precio cambió: ahora es $ ${precio}. Revisá la venta.` },
});

/** El catálogo con otro precio para "VTV auto". */
const conPrecio = (precio: number) => SERVICIOS.map((s) => (s.id === 1 ? { ...s, precio } : s));

describe("FormularioVenta: precio esperado", () => {
  beforeEach(() => {
    responder("categorias_servicio", "select", { data: CATEGORIAS });
    responder("servicios", "select", { data: SERVICIOS });
  });

  it("manda el precio que ve el cajero; si cambió, relee el catálogo, muestra el precio nuevo y no reintenta", async () => {
    renderCaja();
    await elegirServicioDeAutos("1");
    expect(normal(screen.getByTestId("precio").textContent)).toBe("$ 30.000,00");
    await userEvent.keyboard("AA111AA{Enter}");
    await screen.findByRole("listbox", { name: "4. Medio de pago" });

    // Mientras tanto el admin subió el precio a $ 31.000
    responder("servicios", "select", { data: conPrecio(31000) });
    responderRpc("registrar_venta", precioCambiado("31.000,00"));
    await userEvent.keyboard("2{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El precio cambió: ahora es $ 31.000,00. Revisá la venta.",
    );
    expect(argumentosRpc("registrar_venta")).toEqual({
      p_turno_id: TURNO_ID,
      p_servicio_id: 1,
      p_patente: "AA111AA",
      p_medio_pago: "transferencia",
      p_precio_esperado: 30000,
    });
    // Vuelve a un paso previo (sin descuentos: la patente) con el precio nuevo a la vista
    expect(await screen.findByLabelText("3. Patente")).toHaveFocus();
    expect(normal(screen.getByTestId("precio").textContent)).toBe("$ 31.000,00");
    expect(ventasPedidas()).toBe(1);
    expect(toast.success).not.toHaveBeenCalled();

    // El cajero confirma otra vez, ahora con el precio nuevo
    responderRpc("registrar_venta", { data: ventaRegistrada({ precio: 31000 }) });
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("listbox", { name: "4. Medio de pago" });
    await userEvent.keyboard("2{Enter}");
    await waitFor(() => {
      expect(argumentosRpc("registrar_venta")).toEqual({
        p_turno_id: TURNO_ID,
        p_servicio_id: 1,
        p_patente: "AA111AA",
        p_medio_pago: "transferencia",
        p_precio_esperado: 31000,
      });
    });
    expect(ventasPedidas()).toBe(2);
  });

  it("con descuento: vuelve al descuento con los precios releídos y el reparto mixto en blanco", async () => {
    responderRpc("descuentos_para_servicio", { data: [JUBILADOS] });
    renderCaja();
    await hastaElMedio("4", "2");
    await userEvent.type(
      await screen.findByLabelText("5. Pago mixto: ¿cuánto paga en efectivo? ($)"),
      "7000",
    );
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("listbox", { name: "5. ¿Con qué paga el resto?" });
    await userEvent.keyboard("2{Enter}");
    await screen.findByLabelText("6. ¿Cuánto te entregó en efectivo? ($)");

    // El admin cambió el precio: el mismo descuento ahora deja $ 27.900
    responder("servicios", "select", { data: conPrecio(31000) });
    responderRpc("descuentos_para_servicio", {
      data: [{ ...JUBILADOS, precio_lista: 31000, monto_descuento: 3100, precio_final: 27900 }],
    });
    responderRpc("registrar_venta", precioCambiado("27.900,00"));
    await userEvent.keyboard("{Enter}");

    const lista = await screen.findByRole("listbox", { name: "Descuento (opcional) · VTV auto" });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "El precio cambió: ahora es $ 27.900,00. Revisá la venta.",
    );
    expect(opciones(lista)).toEqual([
      "1Sin descuento$ 31.000,00",
      "2Jubilados−$ 3.100,00$ 27.900,00",
    ]);
    expect(screen.getByRole("option", { name: /Jubilados/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(normal(screen.getByTestId("precio").textContent)).toBe("$ 27.900,00");
    expect(ventasPedidas()).toBe(1);

    // El reparto anterior no sirve para el precio nuevo
    await userEvent.keyboard("{Enter}");
    await screen.findByLabelText("3. Patente");
    await userEvent.keyboard("AA111AA{Enter}");
    await screen.findByRole("listbox", { name: "4. Medio de pago" });
    await userEvent.keyboard("4{Enter}");
    expect(
      await screen.findByLabelText("5. Pago mixto: ¿cuánto paga en efectivo? ($)"),
    ).toHaveValue("");
    await userEvent.keyboard("7000");
    expect(normal(screen.getByTestId("resto-mixto").textContent)).toBe("$ 20.900,00");
    expect(ventasPedidas()).toBe(1);
  });

  it("si con el precio nuevo el descuento elegido ya no se ofrece, lo quita y lo avisa", async () => {
    responderRpc("descuentos_para_servicio", { data: [JUBILADOS] });
    renderCaja();
    await hastaElMedio("1", "2");
    await screen.findByLabelText("5. ¿Cuánto te entregó? ($)");

    responder("servicios", "select", { data: conPrecio(31000) });
    responderRpc("descuentos_para_servicio", { data: [] });
    responderRpc("registrar_venta", precioCambiado("27.900,00"));
    await userEvent.keyboard("{Enter}");
    await waitFor(() => {
      expect(ventasPedidas()).toBe(1);
    });

    expect(await screen.findByLabelText("3. Patente")).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "El precio cambió: ahora es $ 27.900,00. Revisá la venta. El descuento elegido ya no está disponible y este servicio no tiene otros",
    );
    expect(normal(screen.getByTestId("precio").textContent)).toBe("$ 31.000,00");
    expect(screen.queryByTestId("descuento-en-curso")).not.toBeInTheDocument();
    expect(screen.queryByTestId("descuento-perdido")).not.toBeInTheDocument();
  });
});

describe("FormularioVenta: descuento que deja de estar disponible", () => {
  const PROMO = {
    ...JUBILADOS,
    id: 5,
    nombre: "Promo",
    monto_descuento: 5000,
    precio_final: 25000,
  };

  /** Autos → VTV auto → descuento N° 2 → patente AA111AA → paso del medio de pago. */
  async function conDescuentoHastaElMedio() {
    await screen.findByRole("listbox", { name: "1. Categoría" });
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("listbox", { name: "2. Servicio · Autos" });
    await userEvent.keyboard("1{Enter}");
    await screen.findByRole("listbox", { name: "Descuento (opcional) · VTV auto" });
    await userEvent.keyboard("2{Enter}");
    await screen.findByLabelText("3. Patente");
    await userEvent.keyboard("AA111AA{Enter}");
    await screen.findByRole("listbox", { name: "4. Medio de pago" });
  }

  function renderConCliente() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <FormularioVenta
          turnoId={TURNO_ID}
          onTurnoNoDisponible={turnoNoDisponible}
          categorias={CATEGORIAS}
          servicios={SERVICIOS}
        />
      </QueryClientProvider>,
    );
    return queryClient;
  }

  it("no registra sin descuento: avisa, lo quita y vuelve a elegir entre los que quedan", async () => {
    responderRpc("descuentos_para_servicio", { data: [JUBILADOS, PROMO] });
    responderRpc("registrar_venta", { data: ventaRegistrada({ precio: 25000 }) });
    const queryClient = renderConCliente();
    await conDescuentoHastaElMedio();

    // El admin desactivó "Jubilados" y la lista se relee
    responderRpc("descuentos_para_servicio", { data: [PROMO] });
    await queryClient.invalidateQueries({ queryKey: ["descuentos"] });
    expect(await screen.findByTestId("descuento-perdido")).toBeInTheDocument();

    await userEvent.keyboard("3{Enter}");
    const lista = await screen.findByRole("listbox", { name: "Descuento (opcional) · VTV auto" });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "El descuento elegido ya no está disponible: elegí otro.",
    );
    expect(ventasPedidas()).toBe(0);
    expect(opciones(lista)).toEqual(["1Sin descuento$ 30.000,00", "2Promo−$ 5.000,00$ 25.000,00"]);
    expect(screen.getByRole("option", { name: /Sin descuento/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByTestId("descuento-perdido")).not.toBeInTheDocument();

    await userEvent.keyboard("2{Enter}");
    expect(await screen.findByLabelText("3. Patente")).toHaveValue("AA111AA");
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("listbox", { name: "4. Medio de pago" });
    await userEvent.keyboard("3{Enter}");
    await waitFor(() => {
      expect(argumentosRpc("registrar_venta")).toEqual({
        p_turno_id: TURNO_ID,
        p_servicio_id: 1,
        p_patente: "AA111AA",
        p_medio_pago: "tarjeta",
        p_descuento_id: 5,
        p_precio_esperado: 25000,
      });
    });
  });

  it("si no quedan descuentos, avisa que sigue sin descuento y el cajero confirma con el precio de lista", async () => {
    responderRpc("descuentos_para_servicio", { data: [JUBILADOS] });
    responderRpc("registrar_venta", { data: ventaRegistrada() });
    const queryClient = renderConCliente();
    await conDescuentoHastaElMedio();

    responderRpc("descuentos_para_servicio", { data: [] });
    await queryClient.invalidateQueries({ queryKey: ["descuentos"] });
    await screen.findByTestId("descuento-perdido");

    await userEvent.keyboard("2{Enter}");
    expect(await screen.findByLabelText("3. Patente")).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "El descuento elegido ya no está disponible y este servicio no tiene otros: la venta sigue sin descuento.",
    );
    expect(ventasPedidas()).toBe(0);
    expect(normal(screen.getByTestId("precio").textContent)).toBe("$ 30.000,00");

    await userEvent.keyboard("{Enter}");
    await screen.findByRole("listbox", { name: "4. Medio de pago" });
    await userEvent.keyboard("2{Enter}");
    await waitFor(() => {
      expect(argumentosRpc("registrar_venta")).toEqual({
        p_turno_id: TURNO_ID,
        p_servicio_id: 1,
        p_patente: "AA111AA",
        p_medio_pago: "transferencia",
        p_precio_esperado: 30000,
      });
    });
  });
});

describe("FormularioVenta: caja cerrada", () => {
  it("si el turno de la caja ya se cerró, avisa para volver a elegir la caja", async () => {
    turnoNoDisponible.mockClear();
    responderRpc("registrar_venta", {
      error: {
        code: "P0001",
        message: 'El turno de la caja "Caja 1" ya se cerró: elegí una caja abierta',
      },
    });
    renderFormulario();
    await elegirServicioDeAutos("1");
    await screen.findByLabelText("3. Patente");
    await userEvent.keyboard("AA111AA{Enter}");
    await screen.findByRole("listbox", { name: "4. Medio de pago" });
    await userEvent.keyboard("3{Enter}");
    await waitFor(() => {
      expect(turnoNoDisponible).toHaveBeenCalledWith(
        'El turno de la caja "Caja 1" ya se cerró: elegí una caja abierta',
      );
    });
    expect(argumentosRpc("registrar_venta")).toMatchObject({ p_turno_id: TURNO_ID });
  });
});
