import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  separarCertificadosServicios,
  type FilaCertificadosServicios,
} from "@/modulos/caja/api/consultas";
import { DialogoCertificadosServicios } from "@/modulos/caja/componentes/DialogoCertificadosServicios";
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

const normal = (texto: string | null | undefined) => (texto ?? "").replace(/\s/g, " ");
const celdas = (fila: HTMLElement) =>
  within(fila)
    .getAllByRole("cell")
    .map((c) => normal(c.textContent));

const fila = (cambios: Partial<FilaCertificadosServicios>): FilaCertificadosServicios => ({
  agrupacion: "servicio",
  id: 1,
  nombre: "VTV auto",
  categoria_nombre: "Autos",
  condicional: false,
  precio: 30000,
  cantidad: 0,
  anuladas: 0,
  efectivo_cantidad: 0,
  transferencia_cantidad: 0,
  efectivo_total: null,
  transferencia_total: null,
  ...cambios,
});

const DEL_CAJERO = [
  fila({
    agrupacion: "certificado",
    id: 7,
    nombre: "Certificado E",
    categoria_nombre: null,
    precio: null,
    cantidad: 5,
    anuladas: 1,
  }),
  fila({
    agrupacion: "certificado",
    id: 8,
    nombre: "B condicional",
    categoria_nombre: null,
    condicional: true,
    precio: null,
    cantidad: 2,
  }),
  fila({ id: 1, cantidad: 4, anuladas: 1, efectivo_cantidad: 3, transferencia_cantidad: 1 }),
  fila({ id: 2, nombre: "VTV moto", categoria_nombre: "Motos", precio: 15000 }),
];

beforeEach(() => {
  reiniciarSupabaseFalso();
});

const pedidos = () => llamadas.filter((l) => l.tabla === "rpc:certificados_servicios_de_turno");

describe("DialogoCertificadosServicios", () => {
  it("solo lee al abrir; el cajero ve certificados, servicios con precio y cantidades, sin $", async () => {
    responderRpc("certificados_servicios_de_turno", { data: DEL_CAJERO });
    renderConQuery(<DialogoCertificadosServicios turnoId={5} />);
    expect(pedidos()).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "Certificados y servicios" }));
    const dialogo = await screen.findByRole("dialog", { name: "Certificados y servicios" });
    await waitFor(() => {
      expect(argumentosRpc("certificados_servicios_de_turno")).toEqual({ p_turno_id: 5 });
    });

    expect(celdas(await within(dialogo).findByTestId("certificado-turno-7"))).toEqual([
      "Certificado E",
      "5",
      "1",
    ]);
    expect(celdas(within(dialogo).getByTestId("certificado-turno-8"))).toEqual([
      "B condicionalCondicional",
      "2",
      "0",
    ]);
    expect(celdas(within(dialogo).getByTestId("servicio-turno-1"))).toEqual([
      "VTV autoAutos",
      "$ 30.000,00",
      "3",
      "1",
    ]);
    expect(celdas(within(dialogo).getByTestId("servicio-turno-2"))).toEqual([
      "VTV motoMotos",
      "$ 15.000,00",
      "0",
      "0",
    ]);
    expect(within(dialogo).queryByRole("columnheader", { name: "Cobrado en efectivo" })).toBeNull();
    expect(within(dialogo).getByText(/Las de pago mixto no se cuentan/)).toBeInTheDocument();
  });

  it("el admin ve además lo cobrado en $ por medio", async () => {
    responderRpc("certificados_servicios_de_turno", {
      data: [
        fila({
          id: 1,
          cantidad: 2,
          efectivo_cantidad: 1,
          transferencia_cantidad: 1,
          efectivo_total: 27000,
          transferencia_total: 30000,
        }),
        fila({ id: 2, nombre: "VTV moto", efectivo_total: 0, transferencia_total: 0 }),
      ],
    });
    renderConQuery(<DialogoCertificadosServicios turnoId={5} />);
    await userEvent.click(screen.getByRole("button", { name: "Certificados y servicios" }));
    const dialogo = await screen.findByRole("dialog", { name: "Certificados y servicios" });
    expect(celdas(await within(dialogo).findByTestId("servicio-turno-1"))).toEqual([
      "VTV autoAutos",
      "$ 30.000,00",
      "1",
      "1",
      "$ 27.000,00",
      "$ 30.000,00",
    ]);
    expect(
      within(dialogo).getByRole("columnheader", { name: "Cobrado por transferencia" }),
    ).toBeInTheDocument();
    expect(
      within(dialogo).getByText("No se entregaron certificados en este turno."),
    ).toBeInTheDocument();
  });

  it("muestra el rechazo de la BD", async () => {
    responderRpc("certificados_servicios_de_turno", {
      error: {
        code: "P0001",
        message: 'El turno de la caja "Caja 1" ya se cerró: elegí una caja abierta',
      },
    });
    renderConQuery(<DialogoCertificadosServicios turnoId={5} />);
    await userEvent.click(screen.getByRole("button", { name: "Certificados y servicios" }));
    expect(
      await screen.findByText('El turno de la caja "Caja 1" ya se cerró: elegí una caja abierta'),
    ).toBeInTheDocument();
  });
});

describe("separarCertificadosServicios", () => {
  it("separa las filas y deja los totales del cajero en null", () => {
    const { certificados, servicios } = separarCertificadosServicios(DEL_CAJERO);
    expect(certificados.map((c) => c.id)).toEqual([7, 8]);
    expect(servicios.map((s) => s.id)).toEqual([1, 2]);
    expect(servicios[0]).toEqual({
      id: 1,
      nombre: "VTV auto",
      categoria: "Autos",
      precio: 30000,
      efectivoCantidad: 3,
      transferenciaCantidad: 1,
      efectivoTotal: null,
      transferenciaTotal: null,
    });
  });
});
