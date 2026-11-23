import { describe, expect, it } from "vitest";
import { validarVentaPasada, type FormularioVentaPasada } from "@/modulos/ventas/lib/venta-pasada";

const HOY = "2026-11-21";

const completo = (cambios: Partial<FormularioVentaPasada> = {}): FormularioVentaPasada => ({
  fecha: "2026-11-01",
  hora: "10:30",
  cajaId: "2",
  servicioId: "7",
  medioPago: "efectivo",
  precio: "18.500,50",
  patente: " ab 123 cd ",
  ...cambios,
});

describe("validarVentaPasada", () => {
  it("convierte un formulario completo (precio argentino y patente normalizada)", () => {
    expect(validarVentaPasada(completo(), HOY)).toEqual({
      datos: {
        fecha: "2026-11-01",
        hora: "10:30",
        cajaId: 2,
        servicioId: 7,
        medioPago: "efectivo",
        precio: 18500.5,
        patente: "AB123CD",
      },
    });
  });

  it("todo es obligatorio salvo la hora y la patente", () => {
    const { errores, datos } = validarVentaPasada(
      { fecha: "", hora: "", cajaId: "", servicioId: "", medioPago: "", precio: "", patente: "" },
      HOY,
    );
    expect(datos).toBeUndefined();
    expect(errores).toEqual({
      fecha: "Elegí la fecha de la venta.",
      cajaId: "Elegí una caja.",
      servicioId: "Elegí un servicio.",
      medioPago: "Elegí el medio de pago.",
      precio: "Ingresá un precio.",
    });
  });

  it("la fecha no puede ser futura ni anterior a 2000 (hoy sí)", () => {
    expect(validarVentaPasada(completo({ fecha: "2026-11-22" }), HOY).errores?.fecha).toBe(
      "La fecha no puede ser posterior a hoy.",
    );
    expect(validarVentaPasada(completo({ fecha: "1999-12-31" }), HOY).errores?.fecha).toBe(
      "La fecha no puede ser anterior al 01/01/2000.",
    );
    expect(validarVentaPasada(completo({ fecha: HOY }), HOY).datos?.fecha).toBe(HOY);
  });

  it("acepta precio $ 0 pero no negativo ni con más de 2 decimales", () => {
    expect(validarVentaPasada(completo({ precio: "0" }), HOY).datos?.precio).toBe(0);
    expect(validarVentaPasada(completo({ precio: "-5" }), HOY).errores?.precio).toBe(
      "El precio no es válido.",
    );
    expect(validarVentaPasada(completo({ precio: "10,555" }), HOY).errores?.precio).toBe(
      "El precio no puede tener más de 2 decimales.",
    );
  });

  it("sin hora, la venta queda al comienzo del día (00:00)", () => {
    expect(validarVentaPasada(completo({ hora: "" }), HOY).datos?.hora).toBe("00:00");
    expect(validarVentaPasada(completo({ fecha: HOY, hora: "  " }), HOY).datos?.hora).toBe("00:00");
  });

  it("hora mal formada y patente larga", () => {
    const { errores } = validarVentaPasada(
      completo({ hora: "25:00", patente: "ABC123456789" }),
      HOY,
    );
    expect(errores).toEqual({
      hora: "La hora no es válida.",
      patente: "La patente no puede superar los 10 caracteres.",
    });
  });

  it("sin patente manda null", () => {
    expect(validarVentaPasada(completo({ patente: "  " }), HOY).datos?.patente).toBeNull();
  });
});
