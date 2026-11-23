import { describe, expect, it } from "vitest";
import { formatearDia } from "@/compartido/lib/formato";
import { mesActual, revisarRango } from "@/compartido/lib/rango-fechas";

describe("rango de fechas", () => {
  it("el mes actual va del 1° a hoy, en hora argentina", () => {
    // 01/12 a las 02:00 UTC todavía es 30/11 en Argentina.
    expect(mesActual(new Date("2026-12-01T02:00:00Z"))).toEqual({
      desde: "2026-11-01",
      hasta: "2026-11-30",
    });
    expect(mesActual(new Date("2026-11-22T15:00:00Z"))).toEqual({
      desde: "2026-11-01",
      hasta: "2026-11-22",
    });
  });

  it("revisa el rango antes de consultar", () => {
    expect(revisarRango({ desde: "2026-11-01", hasta: "2026-11-22" })).toEqual({
      rango: { desde: "2026-11-01", hasta: "2026-11-22" },
      error: null,
    });
    expect(revisarRango({ desde: "", hasta: "2026-11-22" })).toEqual({ rango: null, error: null });
    expect(revisarRango({ desde: "2026-12-01", hasta: "2026-11-22" })).toEqual({
      rango: null,
      error: "La fecha “desde” no puede ser posterior a “hasta”.",
    });
  });

  it("un día de negocio se muestra sin correrse por la zona horaria", () => {
    expect(formatearDia("2026-11-01")).toBe("01/11/2026");
  });
});
