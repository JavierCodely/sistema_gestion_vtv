import { describe, expect, it } from "vitest";
import {
  aniosDisponibles,
  nombreDePeriodo,
  periodoActual,
  PRIMER_ANIO,
  rangoDePeriodo,
  semanaActual,
  sumarDias,
} from "@/compartido/lib/periodo";

describe("período del reporte", () => {
  it("año entero o un mes (con bisiestos y diciembre)", () => {
    expect(rangoDePeriodo({ anio: 2027, mes: null })).toEqual({
      desde: "2027-01-01",
      hasta: "2027-12-31",
    });
    expect(rangoDePeriodo({ anio: 2026, mes: 2 })).toEqual({
      desde: "2026-02-01",
      hasta: "2026-02-28",
    });
    expect(rangoDePeriodo({ anio: 2028, mes: 2 })).toEqual({
      desde: "2028-02-01",
      hasta: "2028-02-29",
    });
    expect(rangoDePeriodo({ anio: 2026, mes: 12 })).toEqual({
      desde: "2026-12-01",
      hasta: "2026-12-31",
    });
  });

  it("el período actual es el mes en hora argentina", () => {
    // 1/12 01:00 UTC = 30/11 22:00 en Argentina
    expect(periodoActual(new Date("2026-12-01T01:00:00Z"))).toEqual({ anio: 2026, mes: 11 });
  });

  it("los años van del siguiente al actual hasta el primero", () => {
    const anios = aniosDisponibles(new Date("2026-11-22T15:00:00Z"));
    expect(anios[0]).toBe(2027);
    expect(anios.at(-1)).toBe(PRIMER_ANIO);
  });

  it("nombre del período", () => {
    expect(nombreDePeriodo({ anio: 2027, mes: null })).toBe("Año 2027");
    expect(nombreDePeriodo({ anio: 2026, mes: 3 })).toBe("Marzo de 2026");
  });
});

describe("semana actual (de lunes a domingo, hora argentina)", () => {
  it("un lunes empieza ese mismo día", () => {
    // Lunes 23/11/2026 10:00 en Argentina
    expect(semanaActual(new Date("2026-11-23T13:00:00Z"))).toEqual({
      desde: "2026-11-23",
      hasta: "2026-11-29",
    });
  });

  it("un domingo es el último día, aunque en UTC ya sea lunes", () => {
    // Domingo 29/11/2026 22:00 en Argentina = lunes 30/11 01:00 UTC
    expect(semanaActual(new Date("2026-11-30T01:00:00Z"))).toEqual({
      desde: "2026-11-23",
      hasta: "2026-11-29",
    });
  });

  it("cruza meses y años", () => {
    // Jueves 1/1/2026
    expect(semanaActual(new Date("2026-01-01T15:00:00Z"))).toEqual({
      desde: "2025-12-29",
      hasta: "2026-01-04",
    });
    expect(sumarDias("2028-02-28", 1)).toBe("2028-02-29");
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
  });
});
