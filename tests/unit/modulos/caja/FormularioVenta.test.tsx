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
  servicio({ id: 6, nombre: "Auto particular", precio: 71000 }),
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

/** Patente (Enter) → Autos (Enter): queda en la lista de servicios. */
async function hastaLosServicios(patente = "AA111AA") {
  await screen.findByLabelText("1. Patente");
  await userEvent.keyboard(`${patente}{Enter}`);
  await screen.findByRole("listbox", { name: "2. Categoría" });
  await userEvent.keyboard("{Enter}");
  await screen.findByRole("listbox", { name: "3. Servicio · Autos" });
}

/** Patente AA111AA → Autos → servicio N° `numero`: queda en el medio de pago (sin descuentos). */
async function elegirServicioDeAutos(numero: string) {
  await hastaLosServicios();
  await userEvent.keyboard(`${numero}{Enter}`);
  await screen.findByRole("listbox", { name: "4. Medio de pago" });
}

/** En la confirmación (patente en grande), Enter registra. */
async function confirmar() {
  await screen.findByTestId("paso-confirmar");
  await userEvent.keyboard("{Enter}");
}

beforeEach(() => {
  reiniciarSupabaseFalso();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.warning).mockClear();
  responderRpc("certificado_para_servicio", { data: null });
  responderRpc("certificado_condicional_para_servicio", { data: null });
  responderRpc("descuentos_para_servicio", { data: [] });
  responderRpc("condicionales_de_patente", { data: [] });
  responderRpc("ventas_anteriores_de_patente", { data: [] });
});

/** El servicio tiene el certificado condicional "Hoja B" (30 días para volver). */
function conCertificadoCondicional() {
  responderRpc("certificado_condicional_para_servicio", { data: 8 });
  responder("certificados", "select", {
    data: { id: 8, nombre: "Hoja B", stock_hojas: 40, dias_vuelta: 30 },
  });
}

describe("FormularioVenta (caja por teclado)", () => {
  it("ofrece solo categorías activas con servicios, numeradas, y sus servicios activos con precio", async () => {
    renderFormulario();
    expect(await screen.findByLabelText("1. Patente")).toHaveFocus();
    await userEvent.keyboard("AA111AA{Enter}");
    const categorias = await screen.findByRole("listbox", { name: "2. Categoría" });
    expect(argumentosRpc("condicionales_de_patente")).toEqual({ p_patente: "AA111AA" });
    expect(categorias).toHaveFocus();
    expect(opciones(categorias)).toEqual(["1Autos", "2Motos"]);

    await userEvent.keyboard("{Enter}");
    const servicios = await screen.findByRole("listbox", { name: "3. Servicio · Autos" });
    expect(servicios).toHaveFocus();
    expect(opciones(servicios)).toEqual([
      "1VTV auto$ 30.000,00",
      "2Reverificación$ 10.000,00",
      "3Auto particular$ 71.000,00",
    ]);
  });

  it("flechas y números marcan; Esc vuelve al paso anterior", async () => {
    renderFormulario();
    await screen.findByLabelText("1. Patente");
    await userEvent.keyboard("AA111AA{Enter}");
    const categorias = await screen.findByRole("listbox", { name: "2. Categoría" });
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
    expect(await screen.findByRole("listbox", { name: "3. Servicio · Motos" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(await screen.findByRole("listbox", { name: "2. Categoría" })).toBeInTheDocument();
    // Desde la categoría, Esc vuelve a la patente con lo escrito
    await userEvent.keyboard("{Escape}");
    expect(await screen.findByLabelText("1. Patente")).toHaveValue("AA111AA");
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
    responderRpc("condicionales_de_patente", { data: [] });
    responderRpc("ventas_anteriores_de_patente", { data: [] });
    renderFormulario();
    await elegirServicioDeAutos("2");
    expect(screen.getByText("Este servicio no lleva certificado.")).toBeInTheDocument();
    expect(argumentosRpc("certificado_para_servicio")).toBeUndefined();
    expect(argumentosRpc("certificado_condicional_para_servicio")).toBeUndefined();
  });

  it("patente grande en mayúsculas (solo letras y números) y venta con tarjeta solo con el teclado", async () => {
    responderRpc("registrar_venta", {
      data: {
        id: 81,
        servicio_nombre: "VTV auto",
        precio: 30000,
        sin_stock: false,
        vuelta_de: null,
        condicional_vence: null,
      },
    });
    renderFormulario();
    const patente = await screen.findByLabelText("1. Patente");
    expect(patente).toHaveFocus();
    await userEvent.keyboard("ab 12-3cd");
    expect(patente).toHaveValue("AB123CD");
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("listbox", { name: "2. Categoría" });
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("listbox", { name: "3. Servicio · Autos" });
    await userEvent.keyboard("{Enter}");

    const medios = await screen.findByRole("listbox", { name: "4. Medio de pago" });
    expect(opciones(medios)).toEqual(["1Efectivo", "2Transferencia", "3Tarjeta", "4Mixto"]);
    await userEvent.keyboard("{ArrowRight}{ArrowRight}{Enter}");

    // Antes de registrar: la patente en grande para verificarla
    const paso = await screen.findByTestId("paso-confirmar");
    expect(screen.getByTestId("patente-a-confirmar")).toHaveTextContent("AB123CD");
    expect(normal(paso.textContent)).toContain("Servicio:VTV auto");
    expect(normal(paso.textContent)).toContain("Cobra:$ 30.000,00");
    expect(normal(paso.textContent)).toContain("Medio:Tarjeta");
    expect(screen.getByRole("button", { name: "Confirmar venta" })).toHaveFocus();
    expect(argumentosRpc("registrar_venta")).toBeUndefined();
    // Esc vuelve al medio; Enter de nuevo vuelve a la confirmación
    await userEvent.keyboard("{Escape}");
    await screen.findByRole("listbox", { name: "4. Medio de pago" });
    expect(screen.getByRole("option", { name: "Tarjeta" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await userEvent.keyboard("{Enter}");
    await confirmar();
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
    // Lista para la próxima venta: empieza por la patente, en blanco
    const nueva = await screen.findByLabelText("1. Patente");
    expect(nueva).toHaveFocus();
    expect(nueva).toHaveValue("");
    expect(screen.getByTestId("ultima-venta")).toHaveTextContent("Última venta · N° 81");
    expect(screen.getByTestId("ultima-venta")).toHaveTextContent("AB123CD");
  });

  it("la patente es obligatoria: vacía no avanza y lo avisa; al escribir se va el aviso", async () => {
    renderFormulario();
    const patente = await screen.findByLabelText("1. Patente");
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Ingresá la patente del vehículo.");
    expect(patente).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("listbox", { name: "2. Categoría" })).not.toBeInTheDocument();
    expect(argumentosRpc("condicionales_de_patente")).toBeUndefined();
    await userEvent.keyboard("AB1");
    expect(screen.queryByText("Ingresá la patente del vehículo.")).not.toBeInTheDocument();
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByRole("listbox", { name: "2. Categoría" })).toBeInTheDocument();
  });

  it("efectivo: el monto recibido acepta solo números y muestra el vuelto", async () => {
    responderRpc("registrar_venta", {
      data: {
        id: 82,
        servicio_nombre: "VTV auto",
        precio: 30000,
        sin_stock: false,
        vuelta_de: null,
      },
    });
    renderFormulario();
    await elegirServicioDeAutos("1");
    await userEvent.keyboard("1{Enter}");

    const recibido = await screen.findByLabelText("5. ¿Cuánto te entregó? ($)");
    expect(recibido).toHaveFocus();
    await userEvent.keyboard("5a0.0,00");
    expect(recibido).toHaveValue("50000");
    expect(normal(screen.getByTestId("vuelto").textContent)).toBe("$ 20.000,00");
    await userEvent.keyboard("{Enter}");
    const paso = await screen.findByTestId("paso-confirmar");
    expect(normal(paso.textContent)).toContain("Entregó $ 50.000,00 · Vuelto $ 20.000,00");
    // Esc vuelve a lo entregado, con lo escrito
    await userEvent.keyboard("{Escape}");
    expect(await screen.findByLabelText("5. ¿Cuánto te entregó? ($)")).toHaveValue("50000");
    await userEvent.keyboard("{Enter}");
    await confirmar();
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
      data: {
        id: 83,
        servicio_nombre: "Reverificación",
        precio: 10000,
        sin_stock: true,
        vuelta_de: null,
        condicional_vence: null,
      },
    });
    renderFormulario();
    await elegirServicioDeAutos("2");
    await userEvent.keyboard("{Enter}");
    await screen.findByLabelText("5. ¿Cuánto te entregó? ($)");
    await userEvent.keyboard("{Enter}");
    await confirmar();
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
    await userEvent.keyboard("2{Enter}");
    await confirmar();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Necesitás un turno abierto para vender",
    );
    // Sigue en la confirmación: se puede reintentar
    expect(screen.getByTestId("paso-confirmar")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Confirmar venta" }));
    await waitFor(() => {
      expect(ventasPedidas()).toBe(2);
    });
  });

  it("también se elige con el mouse", async () => {
    renderFormulario();
    await userEvent.type(await screen.findByLabelText("1. Patente"), "AA111AA");
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await userEvent.click(await screen.findByRole("option", { name: "Motos" }));
    await userEvent.click(await screen.findByRole("option", { name: /VTV moto/ }));
    expect(await screen.findByRole("listbox", { name: "4. Medio de pago" })).toBeInTheDocument();
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
  vuelta_de: null,
  condicional_saldo: null,
  condicional_vence: null,
  patente: "AA111AA",
  ...cambios,
});

const CON_JUBILADOS = { precio: 27000, monto_descuento: 3000, descuento_nombre: "Jubilados" };

/** Patente AA111AA → Autos → VTV auto (el descuento N° `descuento` si se pasa) → medio N° `medio`. */
async function hastaElMedio(medio: string, descuento?: string) {
  await hastaLosServicios();
  await userEvent.keyboard("1{Enter}");
  if (descuento) {
    await screen.findByRole("listbox", { name: "Descuento (opcional) · VTV auto" });
    await userEvent.keyboard(`${descuento}{Enter}`);
  }
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
    await hastaLosServicios();
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

    await screen.findByRole("listbox", { name: "4. Medio de pago" });
    expect(normal(screen.getByTestId("precio").textContent)).toBe("$ 27.000,00");
    expect(normal(screen.getByTestId("descuento-en-curso").textContent)).toBe(
      "Lista $ 30.000,00 · Jubilados −$ 3.000,00",
    );
    // Esc desde el medio vuelve al descuento (con el elegido marcado)
    await userEvent.keyboard("{Escape}");
    await screen.findByRole("listbox", { name: "Descuento (opcional) · VTV auto" });
    expect(screen.getByRole("option", { name: /Jubilados/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("listbox", { name: "4. Medio de pago" });
    await userEvent.keyboard("3{Enter}");
    await confirmar();
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
    await hastaLosServicios();
    await userEvent.keyboard("1{Enter}");
    await screen.findByRole("listbox", { name: "Descuento (opcional) · VTV auto" });
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("listbox", { name: "4. Medio de pago" });
    expect(normal(screen.getByTestId("precio").textContent)).toBe("$ 30.000,00");
    expect(screen.queryByTestId("descuento-en-curso")).not.toBeInTheDocument();
    await userEvent.keyboard("2{Enter}");
    await confirmar();
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
    await confirmar();
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
    await confirmar();
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
    const paso = await screen.findByTestId("paso-confirmar");
    expect(normal(paso.textContent)).toContain(
      "Medio:Mixto: Efectivo $ 10.000,50 + Tarjeta $ 19.999,50",
    );
    await confirmar();
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
    await confirmar();
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
    await confirmar();
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

    // Mientras tanto el admin subió el precio a $ 31.000
    responder("servicios", "select", { data: conPrecio(31000) });
    responderRpc("registrar_venta", precioCambiado("31.000,00"));
    await userEvent.keyboard("2{Enter}");
    await confirmar();

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
    // Vuelve a un paso previo (sin descuentos: el medio) con el precio nuevo a la vista
    expect(await screen.findByRole("listbox", { name: "4. Medio de pago" })).toHaveFocus();
    expect(normal(screen.getByTestId("precio").textContent)).toBe("$ 31.000,00");
    expect(ventasPedidas()).toBe(1);
    expect(toast.success).not.toHaveBeenCalled();

    // El cajero confirma otra vez, ahora con el precio nuevo
    responderRpc("registrar_venta", { data: ventaRegistrada({ precio: 31000 }) });
    await userEvent.keyboard("2{Enter}");
    await confirmar();
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
    await confirmar();

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
    await confirmar();
    await waitFor(() => {
      expect(ventasPedidas()).toBe(1);
    });

    expect(await screen.findByRole("listbox", { name: "4. Medio de pago" })).toHaveFocus();
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

  /** Patente AA111AA → Autos → VTV auto → descuento N° 2 → paso del medio de pago. */
  async function conDescuentoHastaElMedio() {
    await hastaLosServicios();
    await userEvent.keyboard("1{Enter}");
    await screen.findByRole("listbox", { name: "Descuento (opcional) · VTV auto" });
    await userEvent.keyboard("2{Enter}");
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
    await screen.findByRole("listbox", { name: "4. Medio de pago" });
    await userEvent.keyboard("3{Enter}");
    await confirmar();
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
    expect(await screen.findByRole("listbox", { name: "4. Medio de pago" })).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "El descuento elegido ya no está disponible y este servicio no tiene otros: la venta sigue sin descuento.",
    );
    expect(ventasPedidas()).toBe(0);
    expect(normal(screen.getByTestId("precio").textContent)).toBe("$ 30.000,00");

    await userEvent.keyboard("2{Enter}");
    await confirmar();
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
    await userEvent.keyboard("3{Enter}");
    await confirmar();
    await waitFor(() => {
      expect(turnoNoDisponible).toHaveBeenCalledWith(
        'El turno de la caja "Caja 1" ya se cerró: elegí una caja abierta',
      );
    });
    expect(argumentosRpc("registrar_venta")).toMatchObject({ p_turno_id: TURNO_ID });
  });
});

/** Condicional sin usar de la patente, como la devuelve `condicionales_de_patente`. */
const condicional = (cambios: Record<string, unknown> = {}) => ({
  venta_id: 70,
  fecha: "2026-11-02",
  condicional_nombre: "Hoja B",
  servicio_id: 1,
  servicio_nombre: "VTV auto",
  vence: "2026-12-02",
  vigente: true,
  pagado: 71000,
  saldo: 0,
  ...cambios,
});

/** Patente → pantalla de la condicional. */
async function patenteConCondicional(patente = "AB123CD") {
  await screen.findByLabelText("1. Patente");
  await userEvent.keyboard(`${patente}{Enter}`);
}

describe("FormularioVenta: certificado condicional", () => {
  /** Patente AA111AA → Autos → Auto particular (N° 3) → certificado condicional (N° 2). */
  async function elegirCondicional() {
    await hastaLosServicios();
    await userEvent.keyboard("3{Enter}");
    await screen.findByRole("listbox", { name: "Certificado · Auto particular" });
    await userEvent.keyboard("2{Enter}");
  }

  it("un servicio sin certificado condicional no pregunta el certificado", async () => {
    renderFormulario();
    await elegirServicioDeAutos("3");
    expect(argumentosRpc("certificado_condicional_para_servicio")).toEqual({ p_servicio_id: 6 });
    expect(screen.queryByRole("listbox", { name: /Certificado/ })).not.toBeInTheDocument();
  });

  it("con certificado condicional ofrece el de siempre o el condicional; el de siempre es una venta común", async () => {
    conCertificadoCondicional();
    responderRpc("registrar_venta", {
      data: ventaRegistrada({ servicio_nombre: "Auto particular", precio: 71000 }),
    });
    renderFormulario();
    await hastaLosServicios();
    await userEvent.keyboard("3{Enter}");
    const lista = await screen.findByRole("listbox", { name: "Certificado · Auto particular" });
    expect(lista).toHaveFocus();
    expect(opciones(lista)).toEqual([
      "1Certificado de siempreAprobado",
      "2Hoja BCondicional · 30 días",
    ]);
    expect(screen.getByRole("option", { name: /siempre/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // Esc vuelve a los servicios
    await userEvent.keyboard("{Escape}");
    await screen.findByRole("listbox", { name: "3. Servicio · Autos" });
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("listbox", { name: "Certificado · Auto particular" });
    await userEvent.keyboard("1{Enter}");
    // El de siempre no pregunta el 50%: va al medio
    await screen.findByRole("listbox", { name: "4. Medio de pago" });
    expect(screen.queryByTestId("condicional-en-curso")).not.toBeInTheDocument();
    // Esc desde el medio vuelve al certificado
    await userEvent.keyboard("{Escape}");
    await screen.findByRole("listbox", { name: "Certificado · Auto particular" });
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("listbox", { name: "4. Medio de pago" });
    await userEvent.keyboard("2{Enter}");
    await confirmar();
    await waitFor(() => {
      expect(argumentosRpc("registrar_venta")).toEqual({
        p_turno_id: TURNO_ID,
        p_servicio_id: 6,
        p_patente: "AA111AA",
        p_medio_pago: "transferencia",
        p_precio_esperado: 71000,
      });
    });
  });

  it("la condicional pregunta si paga el total o el 50%; al 50% cobra la mitad y lo avisa", async () => {
    conCertificadoCondicional();
    responderRpc("registrar_venta", {
      data: ventaRegistrada({
        id: 95,
        servicio_nombre: "Auto particular",
        precio: 35500,
        precio_lista: 71000,
        condicional_saldo: 35500,
        condicional_vence: "2026-12-23",
      }),
    });
    renderFormulario();
    await elegirCondicional();

    const lista = await screen.findByRole("listbox", {
      name: "¿Cuánto paga? · Auto particular",
    });
    expect(lista).toHaveFocus();
    expect(opciones(lista)).toEqual([
      "1Total$ 71.000,00",
      "250% ahora, el resto al volver$ 35.500,00",
    ]);
    expect(screen.getByRole("option", { name: /Total/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("condicional-en-curso")).toHaveTextContent(
      "Condicional · vuelve dentro de 30 días",
    );
    expect(await screen.findByTestId("aviso-certificado")).toHaveTextContent(
      "Usa una hoja de “Hoja B” (quedan 40).",
    );
    await userEvent.keyboard("2{Enter}");

    await screen.findByRole("listbox", { name: "4. Medio de pago" });
    expect(normal(screen.getByTestId("precio").textContent)).toBe("$ 35.500,00");
    expect(normal(screen.getByTestId("mitad-en-curso").textContent)).toBe(
      "Condicional al 50% · al volver: $ 35.500,00",
    );
    // Esc vuelve a elegir cuánto paga, con el 50% marcado
    await userEvent.keyboard("{Escape}");
    expect(await screen.findByRole("option", { name: /50%/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // Y de ahí, al certificado (con el condicional marcado)
    await userEvent.keyboard("{Escape}");
    expect(await screen.findByRole("option", { name: /Hoja B/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("listbox", { name: "¿Cuánto paga? · Auto particular" });
    await userEvent.keyboard("2{Enter}");
    await screen.findByRole("listbox", { name: "4. Medio de pago" });
    await userEvent.keyboard("3{Enter}");

    const paso = await screen.findByTestId("paso-confirmar");
    expect(normal(paso.textContent)).toContain("Cobra:$ 35.500,00");
    expect(normal(paso.textContent)).toContain(
      "Condicional con “Hoja B”: vuelve dentro de 30 días.",
    );
    expect(normal(paso.textContent)).toContain(
      "Condicional al 50%: al volver dentro del plazo paga $ 35.500,00.",
    );
    await confirmar();
    await waitFor(() => {
      expect(argumentosRpc("registrar_venta")).toEqual({
        p_turno_id: TURNO_ID,
        p_servicio_id: 6,
        p_patente: "AA111AA",
        p_medio_pago: "tarjeta",
        p_precio_esperado: 35500,
        p_condicional: true,
        p_condicional_mitad: true,
      });
    });
    expect(ultimoAviso(toast.success)).toBe(
      "Venta N° 95: Auto particular · $ 35.500,00 (condicional al 50%)",
    );
    expect(normal((await screen.findByTestId("ultima-venta")).textContent)).toContain(
      "Condicional al 50%: al volver paga $ 35.500,00.",
    );
  });

  it("al total manda la condicional sin el 50%", async () => {
    conCertificadoCondicional();
    responderRpc("registrar_venta", {
      data: ventaRegistrada({
        servicio_nombre: "Auto particular",
        precio: 71000,
        condicional_saldo: 0,
        condicional_vence: "2026-12-23",
      }),
    });
    renderFormulario();
    await elegirCondicional();
    await screen.findByRole("listbox", { name: "¿Cuánto paga? · Auto particular" });
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("listbox", { name: "4. Medio de pago" });
    expect(normal(screen.getByTestId("precio").textContent)).toBe("$ 71.000,00");
    expect(screen.queryByTestId("mitad-en-curso")).not.toBeInTheDocument();
    await userEvent.keyboard("2{Enter}");
    await confirmar();
    await waitFor(() => {
      expect(argumentosRpc("registrar_venta")).toEqual({
        p_turno_id: TURNO_ID,
        p_servicio_id: 6,
        p_patente: "AA111AA",
        p_medio_pago: "transferencia",
        p_precio_esperado: 71000,
        p_condicional: true,
      });
    });
    expect(ultimoAviso(toast.success)).toBe(
      "Venta N° 90: Auto particular · $ 71.000,00 (condicional)",
    );
  });

  it("con un descuento la condicional se paga completa: no pregunta el 50%", async () => {
    conCertificadoCondicional();
    responderRpc("descuentos_para_servicio", {
      data: [
        {
          ...JUBILADOS,
          precio_lista: 71000,
          monto_descuento: 7100,
          precio_final: 63900,
        },
      ],
    });
    renderFormulario();
    await elegirCondicional();
    await screen.findByRole("listbox", { name: "Descuento (opcional) · Auto particular" });
    expect(
      screen.getByText("Con un descuento la condicional se paga completa (no al 50%)."),
    ).toBeInTheDocument();
    await userEvent.keyboard("2{Enter}");
    await screen.findByRole("listbox", { name: "4. Medio de pago" });
    expect(normal(screen.getByTestId("precio").textContent)).toBe("$ 63.900,00");
    // Esc vuelve al descuento (no hay paso del 50%)
    await userEvent.keyboard("{Escape}");
    await screen.findByRole("listbox", { name: "Descuento (opcional) · Auto particular" });
    // Sin descuento sí pregunta
    await userEvent.keyboard("1{Enter}");
    expect(
      await screen.findByRole("listbox", { name: "¿Cuánto paga? · Auto particular" }),
    ).toBeInTheDocument();
    // Esc desde el descuento vuelve al certificado
    await userEvent.keyboard("{Escape}");
    await screen.findByRole("listbox", { name: "Descuento (opcional) · Auto particular" });
    await userEvent.keyboard("{Escape}");
    await screen.findByRole("listbox", { name: "Certificado · Auto particular" });
  });

  it("si la BD dice que ya hay una condicional vigente, vuelve a la patente con el mensaje", async () => {
    conCertificadoCondicional();
    const mensaje =
      'La patente AA111AA ya tiene una condicional vigente de "Auto particular" (del 02/11/2026): registrá la vuelta';
    responderRpc("registrar_venta", { error: { code: "P0001", message: mensaje } });
    renderFormulario();
    await elegirCondicional();
    await screen.findByRole("listbox", { name: "¿Cuánto paga? · Auto particular" });
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("listbox", { name: "4. Medio de pago" });
    await userEvent.keyboard("3{Enter}");
    await confirmar();
    expect(await screen.findByLabelText("1. Patente")).toHaveValue("AA111AA");
    expect(screen.getByRole("alert")).toHaveTextContent(mensaje);
  });
});

describe("FormularioVenta: vuelve de condicional", () => {
  it("pagada completa: Aprobó registra el servicio aprobado sin cargo, con la patente en grande", async () => {
    responderRpc("condicionales_de_patente", { data: [condicional()] });
    responderRpc("registrar_venta", {
      data: ventaRegistrada({
        id: 91,
        precio: 0,
        precio_lista: 0,
        vuelta_de: 70,
        patente: "AB123CD",
      }),
    });
    renderFormulario();
    await patenteConCondicional("ab123cd");

    const paso = await screen.findByTestId("paso-condicional");
    expect(argumentosRpc("condicionales_de_patente")).toEqual({ p_patente: "AB123CD" });
    expect(normal(paso.textContent)).toContain(
      "La patente AB123CD tiene una condicional de “VTV auto” del 02/11/2026 (certificado “Hoja B”, vence el 02/12/2026). Pagó el total: la vuelta es sin cargo.",
    );
    const lista = screen.getByRole("listbox", { name: "Vuelve de condicional" });
    expect(lista).toHaveFocus();
    expect(opciones(lista)).toEqual(["1Aprobó: VTV autoSin cargo", "2Es otra venta"]);
    await userEvent.keyboard("{Enter}");

    const confirmacion = await screen.findByTestId("paso-confirmar");
    expect(screen.getByTestId("patente-a-confirmar")).toHaveTextContent("AB123CD");
    expect(normal(confirmacion.textContent)).toContain("Cobra:$ 0,00");
    expect(normal(confirmacion.textContent)).toContain("Medio:Sin cargo");
    expect(normal(confirmacion.textContent)).toContain(
      "Vuelta de la condicional del 02/11/2026: sin cargo.",
    );
    expect(screen.getByTestId("vuelta-en-curso")).toHaveTextContent(
      "Vuelta de condicional: sin cargo",
    );
    // Esc vuelve a la pantalla de la condicional
    await userEvent.keyboard("{Escape}");
    await screen.findByTestId("paso-condicional");
    await userEvent.keyboard("{Enter}");
    await confirmar();
    await waitFor(() => {
      expect(argumentosRpc("registrar_venta")).toEqual({
        p_turno_id: TURNO_ID,
        p_servicio_id: 1,
        p_medio_pago: "efectivo",
        p_patente: "AB123CD",
        p_precio_esperado: 0,
      });
    });
    expect(ultimoAviso(toast.success)).toBe(
      "Venta N° 91: VTV auto · $ 0,00 (vuelta de condicional)",
    );
    const ultima = await screen.findByTestId("ultima-venta");
    expect(ultima).toHaveTextContent("Vuelta de condicional: sin cargo.");
    expect(ultima).toHaveTextContent("Sin cargo");
    expect(ultima).not.toHaveTextContent("Pagó justo");
  });

  it("pagada al 50%: la vuelta cobra el resto con el medio que elija", async () => {
    responderRpc("condicionales_de_patente", {
      data: [condicional({ pagado: 35500, saldo: 35500 })],
    });
    responderRpc("registrar_venta", {
      data: ventaRegistrada({ id: 92, precio: 35500, precio_lista: 35500, vuelta_de: 70 }),
    });
    renderFormulario();
    await patenteConCondicional();
    const paso = await screen.findByTestId("paso-condicional");
    expect(normal(paso.textContent)).toContain("Pagó $ 35.500,00 (50%)");
    expect(normal(paso.textContent)).toContain("faltan $ 35.500,00.");
    expect(opciones(screen.getByRole("listbox", { name: "Vuelve de condicional" }))).toEqual([
      "1Aprobó: VTV auto$ 35.500,00",
      "2Es otra venta",
    ]);
    await userEvent.keyboard("{Enter}");

    await screen.findByRole("listbox", { name: "4. Medio de pago" });
    expect(normal(screen.getByTestId("precio").textContent)).toBe("$ 35.500,00");
    expect(screen.getByTestId("vuelta-en-curso")).toHaveTextContent(
      "Vuelta de condicional: el 50% que faltaba",
    );
    await userEvent.keyboard("3{Enter}");
    const confirmacion = await screen.findByTestId("paso-confirmar");
    expect(normal(confirmacion.textContent)).toContain(
      "Vuelta de la condicional del 02/11/2026: cobra el 50% que faltaba.",
    );
    await confirmar();
    await waitFor(() => {
      expect(argumentosRpc("registrar_venta")).toEqual({
        p_turno_id: TURNO_ID,
        p_servicio_id: 1,
        p_medio_pago: "tarjeta",
        p_patente: "AB123CD",
        p_precio_esperado: 35500,
      });
    });
    expect(normal((await screen.findByTestId("ultima-venta")).textContent)).toContain(
      "Vuelta de condicional: pagó el 50% que faltaba.",
    );
  });

  it("“Es otra venta” sigue con la categoría; Esc desde la categoría vuelve a la condicional", async () => {
    responderRpc("condicionales_de_patente", { data: [condicional()] });
    renderFormulario();
    await patenteConCondicional();
    await screen.findByTestId("paso-condicional");
    await userEvent.keyboard("2{Enter}");
    await screen.findByRole("listbox", { name: "2. Categoría" });
    await userEvent.keyboard("{Escape}");
    await screen.findByTestId("paso-condicional");
    await userEvent.keyboard("{Escape}");
    expect(await screen.findByLabelText("1. Patente")).toHaveValue("AB123CD");
  });

  it("si después elige el servicio aprobado, también es la vuelta (lo decide la BD)", async () => {
    responderRpc("condicionales_de_patente", { data: [condicional()] });
    renderFormulario();
    await patenteConCondicional();
    await screen.findByTestId("paso-condicional");
    await userEvent.keyboard("2{Enter}");
    await screen.findByRole("listbox", { name: "2. Categoría" });
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("listbox", { name: "3. Servicio · Autos" });
    await userEvent.keyboard("1{Enter}");
    expect(normal((await screen.findByTestId("paso-confirmar")).textContent)).toContain(
      "Cobra:$ 0,00",
    );
    // Esc vuelve a la lista de servicios
    await userEvent.keyboard("{Escape}");
    expect(await screen.findByRole("listbox", { name: "3. Servicio · Autos" })).toBeInTheDocument();
  });

  it("vencida: modal de que se pasó el límite; otra condicional o cobrar el servicio completo", async () => {
    conCertificadoCondicional();
    responderRpc("condicionales_de_patente", {
      data: [condicional({ vigente: false, vence: "2026-11-10" })],
    });
    responderRpc("registrar_venta", { data: ventaRegistrada() });
    renderFormulario();
    await patenteConCondicional();

    const dialogo = await screen.findByRole("dialog", {
      name: "Se pasó el límite de días de la condicional",
    });
    expect(normal(dialogo.textContent)).toContain(
      "La condicional de “VTV auto” de la patente AB123CD del 02/11/2026 (certificado “Hoja B”) venció el 10/11/2026. Pagó el total ($ 71.000,00): si continúa con el certificado, es sin cargo.",
    );
    const lista = await within(dialogo).findByRole("listbox", {
      name: "¿Qué hacés con la condicional vencida?",
    });
    expect(lista).toHaveFocus();
    expect(opciones(lista)).toEqual([
      "1Continuar con el certificadoSin cargo",
      "2Cobrar VTV auto completo",
      "3Generar otra condicional",
      "4Es otra venta",
    ]);

    // Otra condicional del mismo servicio: va directo a cuánto paga
    await userEvent.keyboard("3{Enter}");
    expect(
      await screen.findByRole("listbox", { name: "¿Cuánto paga? · VTV auto" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("condicional-en-curso")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(await screen.findByRole("option", { name: /Hoja B/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await userEvent.keyboard("{Escape}");
    await screen.findByRole("listbox", { name: "3. Servicio · Autos" });
    await userEvent.keyboard("{Escape}");
    await screen.findByRole("listbox", { name: "2. Categoría" });
    await userEvent.keyboard("{Escape}");
    await screen.findByTestId("paso-condicional-vencida");

    // Cobrar completo: el servicio entero con el certificado de siempre
    await userEvent.keyboard("2{Enter}");
    await screen.findByRole("listbox", { name: "4. Medio de pago" });
    expect(normal(screen.getByTestId("precio").textContent)).toBe("$ 30.000,00");
    expect(screen.queryByTestId("vuelta-en-curso")).not.toBeInTheDocument();
    expect(screen.queryByTestId("condicional-en-curso")).not.toBeInTheDocument();
    await userEvent.keyboard("2{Enter}");
    await confirmar();
    await waitFor(() => {
      expect(argumentosRpc("registrar_venta")).toEqual({
        p_turno_id: TURNO_ID,
        p_servicio_id: 1,
        p_medio_pago: "transferencia",
        p_patente: "AB123CD",
        p_precio_esperado: 30000,
      });
    });
  });

  it("vencida pagada completa: continuar con el certificado es la vuelta fuera de plazo, sin cargo", async () => {
    responderRpc("condicionales_de_patente", {
      data: [condicional({ vigente: false, vence: "2026-11-10" })],
    });
    responderRpc("registrar_venta", {
      data: ventaRegistrada({ id: 93, precio: 0, precio_lista: 0, vuelta_de: 70 }),
    });
    renderFormulario();
    await patenteConCondicional();
    await screen.findByRole("listbox", { name: "¿Qué hacés con la condicional vencida?" });
    await userEvent.keyboard("{Enter}");

    const confirmacion = await screen.findByTestId("paso-confirmar");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(normal(confirmacion.textContent)).toContain("Cobra:$ 0,00");
    expect(normal(confirmacion.textContent)).toContain("Medio:Sin cargo");
    expect(normal(confirmacion.textContent)).toContain(
      "Vuelta fuera de plazo de la condicional del 02/11/2026 (venció el 10/11/2026): sin cargo.",
    );
    expect(screen.getByTestId("vuelta-en-curso")).toHaveTextContent(
      "Vuelta de condicional fuera de plazo: sin cargo",
    );
    // Esc vuelve al aviso de la vencida
    await userEvent.keyboard("{Escape}");
    await screen.findByRole("listbox", { name: "¿Qué hacés con la condicional vencida?" });
    await userEvent.keyboard("1{Enter}");
    await confirmar();
    await waitFor(() => {
      expect(argumentosRpc("registrar_venta")).toEqual({
        p_turno_id: TURNO_ID,
        p_servicio_id: 1,
        p_medio_pago: "efectivo",
        p_patente: "AB123CD",
        p_precio_esperado: 0,
        p_vuelta_vencida: 70,
      });
    });
    expect(ultimoAviso(toast.success)).toBe(
      "Venta N° 93: VTV auto · $ 0,00 (vuelta de condicional fuera de plazo)",
    );
  });

  it("vencida al 50%: continuar cobra lo que faltaba con el medio que elija", async () => {
    responderRpc("condicionales_de_patente", {
      data: [condicional({ vigente: false, vence: "2026-11-10", pagado: 35500, saldo: 35500 })],
    });
    responderRpc("registrar_venta", {
      data: ventaRegistrada({ id: 94, precio: 35500, precio_lista: 35500, vuelta_de: 70 }),
    });
    renderFormulario();
    await patenteConCondicional();
    const dialogo = await screen.findByRole("dialog");
    expect(normal(dialogo.textContent)).toContain(
      "Pagó $ 35.500,00 (50%): si continúa con el certificado, paga los $ 35.500,00 que faltan.",
    );
    expect(
      opciones(
        await screen.findByRole("listbox", { name: "¿Qué hacés con la condicional vencida?" }),
      )[0],
    ).toBe("1Continuar con el certificado$ 35.500,00");
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("listbox", { name: "4. Medio de pago" });
    expect(normal(screen.getByTestId("precio").textContent)).toBe("$ 35.500,00");
    // Esc desde el medio vuelve al aviso
    await userEvent.keyboard("{Escape}");
    await screen.findByRole("listbox", { name: "¿Qué hacés con la condicional vencida?" });
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("listbox", { name: "4. Medio de pago" });
    await userEvent.keyboard("3{Enter}");
    await confirmar();
    await waitFor(() => {
      expect(argumentosRpc("registrar_venta")).toEqual({
        p_turno_id: TURNO_ID,
        p_servicio_id: 1,
        p_medio_pago: "tarjeta",
        p_patente: "AB123CD",
        p_precio_esperado: 35500,
        p_vuelta_vencida: 70,
      });
    });
  });

  it("vencida: Esc vuelve a la patente; Es otra venta sigue con la categoría y no es vuelta", async () => {
    responderRpc("condicionales_de_patente", {
      data: [condicional({ vigente: false, vence: "2026-11-10" })],
    });
    renderFormulario();
    await patenteConCondicional();
    await screen.findByRole("listbox", { name: "¿Qué hacés con la condicional vencida?" });
    await userEvent.keyboard("{Escape}");
    expect(await screen.findByLabelText("1. Patente")).toHaveValue("AB123CD");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await screen.findByRole("listbox", { name: "¿Qué hacés con la condicional vencida?" });
    await userEvent.keyboard("3{Enter}");
    await screen.findByRole("listbox", { name: "2. Categoría" });
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("listbox", { name: "3. Servicio · Autos" });
    await userEvent.keyboard("1{Enter}");
    await screen.findByRole("listbox", { name: "4. Medio de pago" });
    expect(normal(screen.getByTestId("precio").textContent)).toBe("$ 30.000,00");
    expect(screen.queryByTestId("vuelta-en-curso")).not.toBeInTheDocument();
  });

  it("vencida sin certificado condicional en el servicio: no ofrece otra condicional", async () => {
    responderRpc("condicionales_de_patente", {
      data: [condicional({ vigente: false, vence: "2026-11-10" })],
    });
    renderFormulario();
    await patenteConCondicional();
    expect(
      opciones(
        await screen.findByRole("listbox", { name: "¿Qué hacés con la condicional vencida?" }),
      ),
    ).toEqual([
      "1Continuar con el certificadoSin cargo",
      "2Cobrar VTV auto completo",
      "3Es otra venta",
    ]);
  });

  it("si no se puede revisar la condicional, no avanza y lo dice", async () => {
    responderRpc("condicionales_de_patente", {
      error: { code: "P0001", message: "Tu usuario está desactivado" },
    });
    renderFormulario();
    await patenteConCondicional();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo revisar si la patente tiene una condicional: Tu usuario está desactivado",
    );
    expect(screen.queryByRole("listbox", { name: "2. Categoría" })).not.toBeInTheDocument();
  });

  it("si la BD dice que es una vuelta que la caja no vio, vuelve a la patente con el mensaje", async () => {
    const mensaje =
      "La patente AB123CD vuelve de la condicional del 02/11/2026: corresponde cobrar $ 0,00. Revisá la venta.";
    responderRpc("registrar_venta", { error: { code: "P0001", message: mensaje } });
    renderFormulario();
    await hastaLosServicios("AB123CD");
    await userEvent.keyboard("1{Enter}");
    await screen.findByRole("listbox", { name: "4. Medio de pago" });
    await userEvent.keyboard("3{Enter}");
    await confirmar();
    expect(await screen.findByLabelText("1. Patente")).toHaveValue("AB123CD");
    expect(screen.getByRole("alert")).toHaveTextContent(mensaje);
  });
});

/** Venta anterior de la patente, como la devuelve `ventas_anteriores_de_patente`. */
const ventaAnterior = (cambios: Record<string, unknown> = {}) => ({
  venta_id: 40,
  fecha: "2026-03-15",
  servicio_nombre: "VTV auto",
  certificado_nombre: "Hoja E",
  condicional: false,
  vuelta: false,
  ...cambios,
});

describe("FormularioVenta: patente repetida", () => {
  it("avisa con la fecha, el servicio y el certificado de cada venta; Continuar sigue como siempre", async () => {
    responderRpc("ventas_anteriores_de_patente", {
      data: [
        ventaAnterior(),
        ventaAnterior({
          venta_id: 30,
          fecha: "2025-11-02",
          certificado_nombre: "Hoja B",
          condicional: true,
        }),
        ventaAnterior({ venta_id: 10, fecha: "2024-05-20", certificado_nombre: null }),
      ],
    });
    renderFormulario();
    await screen.findByLabelText("1. Patente");
    await userEvent.keyboard("ab123cd{Enter}");

    const dialogo = await screen.findByRole("dialog", {
      name: "La patente AB123CD ya tiene 3 ventas",
    });
    expect(argumentosRpc("ventas_anteriores_de_patente")).toEqual({ p_patente: "AB123CD" });
    const filas = within(dialogo)
      .getAllByRole("row")
      .slice(1)
      .map((f) => normal(f.textContent));
    expect(filas).toEqual([
      "15/03/2026VTV autoHoja E",
      "02/11/2025VTV autoHoja B (condicional)",
      "20/05/2024VTV autoSin certificado",
    ]);
    expect(screen.queryByRole("listbox", { name: "2. Categoría" })).not.toBeInTheDocument();
    expect(within(dialogo).getByRole("button", { name: "Continuar con la venta" })).toHaveFocus();

    // Enter continúa: lo mismo que pasa después de la patente
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByRole("listbox", { name: "2. Categoría" })).toHaveFocus();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("una sola venta: lo dice en singular y marca la vuelta de condicional", async () => {
    responderRpc("ventas_anteriores_de_patente", {
      data: [ventaAnterior({ vuelta: true })],
    });
    renderFormulario();
    await screen.findByLabelText("1. Patente");
    await userEvent.keyboard("AB123CD{Enter}");
    const dialogo = await screen.findByRole("dialog", {
      name: "La patente AB123CD ya tiene una venta",
    });
    expect(dialogo).toHaveTextContent("Hoja E (vuelta de condicional)");
  });

  it("Esc o Cancelar vuelve a la patente sin seguir", async () => {
    responderRpc("ventas_anteriores_de_patente", { data: [ventaAnterior()] });
    renderFormulario();
    await screen.findByLabelText("1. Patente");
    await userEvent.keyboard("AB123CD{Enter}");
    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText("1. Patente")).toHaveValue("AB123CD");
    expect(screen.queryByRole("listbox", { name: "2. Categoría" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    const dialogo = await screen.findByRole("dialog");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText("1. Patente")).toHaveValue("AB123CD");
  });

  it("con una condicional vigente, al continuar muestra la vuelta como siempre", async () => {
    responderRpc("ventas_anteriores_de_patente", {
      data: [ventaAnterior({ venta_id: 70, certificado_nombre: "Hoja B", condicional: true })],
    });
    responderRpc("condicionales_de_patente", { data: [condicional()] });
    renderFormulario();
    await patenteConCondicional();
    const dialogo = await screen.findByRole("dialog");
    expect(screen.queryByTestId("paso-condicional")).not.toBeInTheDocument();
    await userEvent.click(within(dialogo).getByRole("button", { name: "Continuar con la venta" }));
    expect(await screen.findByTestId("paso-condicional")).toBeInTheDocument();
    expect(screen.getByRole("listbox", { name: "Vuelve de condicional" })).toHaveFocus();
  });

  it("sin ventas anteriores no muestra el aviso", async () => {
    renderFormulario();
    await screen.findByLabelText("1. Patente");
    await userEvent.keyboard("AA111AA{Enter}");
    await screen.findByRole("listbox", { name: "2. Categoría" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("si no se pueden revisar las ventas anteriores, no avanza y lo dice", async () => {
    responderRpc("ventas_anteriores_de_patente", {
      error: { code: "P0001", message: "Tu usuario está desactivado" },
    });
    renderFormulario();
    await screen.findByLabelText("1. Patente");
    await userEvent.keyboard("AB123CD{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudieron revisar las ventas anteriores de la patente: Tu usuario está desactivado",
    );
    expect(screen.queryByRole("listbox", { name: "2. Categoría" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
