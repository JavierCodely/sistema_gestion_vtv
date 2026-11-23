import { describe, expect, it } from "vitest";
import { validarServicio, type FormularioServicio } from "@/modulos/servicios/lib/validaciones";

const valido: FormularioServicio = {
  nombre: "  Vehículo particular ",
  categoriaId: "3",
  precio: "20.000,50",
  requiereCertificado: true,
};

describe("validarServicio", () => {
  it("convierte el formulario en los datos de la tabla", () => {
    expect(validarServicio(valido)).toEqual({
      datos: {
        nombre: "Vehículo particular",
        categoria_id: 3,
        precio: 20000.5,
        requiere_certificado: true,
      },
    });
  });

  it("permite precio 0 (servicio sin cargo)", () => {
    expect(validarServicio({ ...valido, precio: "0" }).datos?.precio).toBe(0);
  });

  it("junta todos los errores con mensajes del campo", () => {
    expect(
      validarServicio({ nombre: " ", categoriaId: "", precio: "", requiereCertificado: false }),
    ).toEqual({
      errores: {
        nombre: "Ingresá el nombre.",
        categoriaId: "Elegí una categoría.",
        precio: "Ingresá un precio.",
      },
    });
    expect(validarServicio({ ...valido, precio: "10,555" }).errores).toEqual({
      precio: "El precio no puede tener más de 2 decimales.",
    });
    expect(validarServicio({ ...valido, categoriaId: "abc" }).errores).toEqual({
      categoriaId: "Elegí una categoría.",
    });
  });
});
