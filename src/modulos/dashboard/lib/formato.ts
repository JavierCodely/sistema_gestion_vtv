const pesosEnteros = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

/** "$ 800.000": montos del eje de un gráfico, sin centavos (los valores exactos van en la tabla). */
export function formatearEje(valor: number): string {
  return pesosEnteros.format(valor);
}
