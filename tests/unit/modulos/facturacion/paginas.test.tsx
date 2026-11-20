import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authDePrueba, perfilDePrueba, renderRuta } from "@tests/soporte/render";
import { argumentosDe, reiniciarSupabaseFalso, responder } from "@tests/soporte/supabase-falso";
import { comprobanteDePrueba, CONDICIONES, CONFIGURACION } from "./datos";

vi.mock("@/compartido/lib/supabase", async () => ({
  supabase: (await import("@tests/soporte/supabase-falso")).supabaseFalso,
}));
const invocarFuncion = vi.fn();
vi.mock("@/compartido/lib/funciones", () => ({ invocarFuncion }));

const admin = () => authDePrueba({ perfil: perfilDePrueba({ rol: "admin" }) });
const cajero = () => authDePrueba({ perfil: perfilDePrueba() });
const normal = (texto: string | null) => (texto ?? "").replace(/\s/g, " ");

beforeEach(() => {
  reiniciarSupabaseFalso();
  invocarFuncion.mockReset();
  responder("arca_configuracion", "select", { data: CONFIGURACION });
  responder("arca_condiciones_iva", "select", { data: CONDICIONES });
});

describe("VerComprobante", () => {
  it("el cajero ve la factura B con IVA contenido, CAE y QR", async () => {
    // La configuración actual cambió después de emitir: el impreso usa los datos guardados.
    responder("v_comprobantes", "select", { data: comprobanteDePrueba() });
    renderRuta("/comprobantes/10", cajero());

    const impreso = await screen.findByRole("article", { name: "Factura B 00003-00000041" });
    expect(within(impreso).getByText("VTV Emitida SA")).toBeInTheDocument();
    expect(within(impreso).queryByText("VTV Pruebas SA")).not.toBeInTheDocument();
    expect(within(impreso).getByText("IIBB: 901-123456-7")).toBeInTheDocument();
    expect(within(impreso).getByText("Inicio de actividades: 01/01/2020")).toBeInTheDocument();
    expect(within(impreso).getByText("CUIT: 30-71234567-1")).toBeInTheDocument();
    expect(within(impreso).getByText(/sin validez fiscal/)).toBeInTheDocument();
    expect(within(impreso).getByText("IVA contenido")).toBeInTheDocument();
    expect(normal(within(impreso).getByTestId("comprobante-total").textContent)).toBe(
      "$ 20.000,00",
    );
    expect(within(impreso).getByTestId("comprobante-cae")).toHaveTextContent("76123456789012");
    expect(within(impreso).getByText("30/11/2026")).toBeInTheDocument();
    expect(
      await within(impreso).findByRole("img", { name: "Código QR para verificar en ARCA" }),
    ).toHaveAttribute("src", expect.stringMatching(/^data:image\/svg\+xml/));
    expect(screen.getByRole("button", { name: "Imprimir" })).toBeInTheDocument();
  });

  it("la factura A discrimina neto e IVA; la NC muestra el comprobante asociado", async () => {
    responder("v_comprobantes", "select", {
      data: comprobanteDePrueba({
        tipo: "nota_credito",
        clase: "A",
        cbte_tipo: 3,
        ambiente: "produccion",
        numero: 7,
        doc_tipo: 80,
        doc_nro: 30712345671,
        receptor_nombre: "Empresa SA",
        condicion_iva_receptor: "IVA Responsable Inscripto",
        asociado_cbte_tipo: 1,
        asociado_punto_venta: 3,
        asociado_numero: 40,
        asociado_fecha: "2026-11-19",
      }),
    });
    renderRuta("/comprobantes/10", admin());
    const impreso = await screen.findByRole("article", {
      name: "Nota de crédito A 00003-00000007",
    });
    expect(within(impreso).getByText("Importe neto gravado")).toBeInTheDocument();
    expect(within(impreso).getByText("IVA 21 %")).toBeInTheDocument();
    expect(within(impreso).getByText("CUIT 30-71234567-1")).toBeInTheDocument();
    expect(
      within(impreso).getByText(/Factura A 00003-00000040 del 19\/11\/2026/),
    ).toBeInTheDocument();
    expect(within(impreso).queryByText(/sin validez fiscal/)).not.toBeInTheDocument();
  });

  it("un comprobante sin CAE no se imprime", async () => {
    responder("v_comprobantes", "select", {
      data: comprobanteDePrueba({ estado: "rechazado", cae: null, mensaje: "10016: número" }),
    });
    renderRuta("/comprobantes/10", cajero());
    expect(await screen.findByText("Factura B rechazada")).toBeInTheDocument();
    expect(screen.getByText(/Todavía no tiene CAE/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Imprimir" })).not.toBeInTheDocument();
  });

  it("inexistente o ajeno", async () => {
    responder("v_comprobantes", "select", { data: null });
    renderRuta("/comprobantes/99", cajero());
    expect(await screen.findByText("El comprobante no existe.")).toBeInTheDocument();
  });
});

describe("ConfiguracionArca", () => {
  it("guarda los datos fiscales normalizados", async () => {
    responder("arca_configuracion", "update", { data: null });
    renderRuta("/admin/arca", admin());
    const razon = await screen.findByLabelText("Razón social");
    expect(razon).toHaveValue("VTV Pruebas SA");
    expect(screen.getByTestId("certificado-actual")).toHaveTextContent("30-71234567-1");

    await userEvent.clear(razon);
    await userEvent.type(razon, "  Nueva   Razón SA ");
    await userEvent.click(screen.getByRole("button", { name: "Guardar datos" }));
    await vi.waitFor(() => {
      expect(argumentosDe("arca_configuracion", "update")?.[0]).toMatchObject({
        cuit: "30712345671",
        razon_social: "Nueva Razón SA",
        punto_venta: 3,
        tope_identificacion: 10000000,
      });
    });
    // Fila única: el UPDATE lleva WHERE (pg-safeupdate)
    expect(argumentosDe("arca_configuracion", "update", "eq")).toEqual(["id", true]);
  });

  it("valida antes de guardar", async () => {
    renderRuta("/admin/arca", admin());
    const cuit = await screen.findByLabelText("CUIT");
    await userEvent.clear(cuit);
    await userEvent.type(cuit, "123");
    await userEvent.click(screen.getByRole("button", { name: "Guardar datos" }));
    expect(await screen.findByText("El CUIT no es válido.")).toBeInTheDocument();
    expect(argumentosDe("arca_configuracion", "update")).toBeUndefined();
  });

  it("sube el certificado y la clave como texto a la Edge Function", async () => {
    invocarFuncion.mockResolvedValue({ configuracion: {} });
    renderRuta("/admin/arca", admin());
    await userEvent.click(await screen.findByRole("button", { name: "Guardar certificado" }));
    expect(
      screen.getByText("Elegí el certificado (.crt). Elegí la clave privada (.key)."),
    ).toBeInTheDocument();

    await userEvent.upload(
      screen.getByLabelText("Certificado (.crt)"),
      new File(["-----BEGIN CERTIFICATE-----"], "vtv.crt"),
    );
    await userEvent.upload(
      screen.getByLabelText("Clave privada (.key)"),
      new File(["-----BEGIN PRIVATE KEY-----"], "vtv.key"),
    );
    await userEvent.click(screen.getByRole("button", { name: "Guardar certificado" }));
    await vi.waitFor(() => {
      expect(invocarFuncion).toHaveBeenCalledWith("arca", {
        accion: "guardar_certificado",
        certificado: "-----BEGIN CERTIFICATE-----",
        clave: "-----BEGIN PRIVATE KEY-----",
      });
    });
  });

  it("rechaza un archivo vacío sin llamar a la Edge Function", async () => {
    renderRuta("/admin/arca", admin());
    await userEvent.upload(
      await screen.findByLabelText("Certificado (.crt)"),
      new File([""], "vacio.crt"),
    );
    await userEvent.upload(
      screen.getByLabelText("Clave privada (.key)"),
      new File(["-----BEGIN PRIVATE KEY-----"], "vtv.key"),
    );
    await userEvent.click(screen.getByRole("button", { name: "Guardar certificado" }));
    expect(
      await screen.findByText("El archivo elegido para el certificado (.crt) está vacío."),
    ).toBeInTheDocument();
    expect(invocarFuncion).not.toHaveBeenCalled();
  });

  it("prueba la conexión y muestra el resultado y las condiciones", async () => {
    invocarFuncion.mockResolvedValue({
      prueba: { ok: false, mensaje: "El certificado no corresponde a la clave" },
    });
    renderRuta("/admin/arca", admin());
    expect(await screen.findByText("Consumidor Final · Factura B o C")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Probar conexión" }));
    const resultado = await screen.findByTestId("resultado-prueba");
    expect(resultado).toHaveTextContent("No se pudo conectar");
    expect(resultado).toHaveTextContent("El certificado no corresponde a la clave");
    expect(invocarFuncion).toHaveBeenCalledWith("arca", { accion: "probar_conexion" });
  });
});

describe("Facturacion (admin)", () => {
  it("con una página completa ofrece ver más comprobantes (cursor por id)", async () => {
    responder("v_comprobantes", "select", {
      data: Array.from({ length: 50 }, (_, i) =>
        comprobanteDePrueba({ id: 200 - i, venta_id: 300 - i, estado: "pendiente", cae: null }),
      ),
    });
    responder("arca_intentos", "select", { data: [] });
    renderRuta("/admin/facturacion", admin());
    await userEvent.click(await screen.findByRole("button", { name: "Ver más comprobantes" }));
    await vi.waitFor(() => {
      expect(argumentosDe("v_comprobantes", "select", "lt")).toEqual(["id", 151]);
    });
  });

  it("lista comprobantes sin CAE con reintento y el log con detalle saneado", async () => {
    responder("v_comprobantes", "select", {
      data: [
        comprobanteDePrueba({
          estado: "pendiente",
          cae: null,
          numero: null,
          mensaje: "Sin respuesta",
        }),
        comprobanteDePrueba({
          id: 11,
          venta_id: 83,
          estado: "rechazado",
          cae: null,
          numero: null,
          mensaje: "10013: documento",
        }),
      ],
    });
    responder("arca_intentos", "select", {
      data: [
        {
          id: 7,
          comprobante_id: 10,
          operacion: "solicitar",
          ambiente: "homologacion",
          exito: false,
          mensaje: "10016: número",
          solicitud: "<Auth><Token>(oculto)</Token></Auth>",
          respuesta: "<Errors/>",
          duracion_ms: 1234,
          creado_en: "2026-11-20T13:00:00Z",
          perfiles: { nombre: "Cajero" },
        },
      ],
    });
    invocarFuncion.mockResolvedValue({ comprobante: comprobanteDePrueba() });
    renderRuta("/admin/facturacion", admin());

    const rechazada = await screen.findByTestId("sin-autorizar-11");
    expect(within(rechazada).getByText("Rechazada")).toBeInTheDocument();
    expect(within(rechazada).getByRole("link", { name: "Corregir datos" })).toHaveAttribute(
      "href",
      "/admin/ventas/turnos/5",
    );
    expect(within(rechazada).queryByRole("button")).not.toBeInTheDocument();

    const fila = screen.getByTestId("sin-autorizar-10");
    expect(within(fila).getByText("Pendiente")).toBeInTheDocument();
    await userEvent.click(
      within(fila).getByRole("button", { name: "Reintentar Factura B de la venta N° 82" }),
    );
    await vi.waitFor(() => {
      expect(invocarFuncion).toHaveBeenCalledWith("arca", { accion: "emitir", comprobante_id: 10 });
    });

    const intento = screen.getByTestId("intento-7");
    expect(within(intento).getByText("Pedido de CAE")).toBeInTheDocument();
    expect(within(intento).getByText("Error")).toBeInTheDocument();
    await userEvent.click(
      within(intento).getByRole("button", { name: "Ver detalle del intento 7" }),
    );
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("<Auth><Token>(oculto)</Token></Auth>")).toBeInTheDocument();
  });
});
