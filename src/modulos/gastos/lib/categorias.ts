import type { CategoriaGasto } from "../api/consultas";

export interface Rubro {
  rubro: CategoriaGasto;
  subcategorias: CategoriaGasto[];
}

function porNombre(a: CategoriaGasto, b: CategoriaGasto): number {
  return a.nombre.localeCompare(b.nombre, "es");
}

/** Agrupa las categorías en rubros con sus subcategorías, ordenados por nombre. */
export function agruparPorRubro(categorias: readonly CategoriaGasto[]): Rubro[] {
  return categorias
    .filter((c) => c.padre_id === null)
    .sort(porNombre)
    .map((rubro) => ({
      rubro,
      subcategorias: categorias.filter((c) => c.padre_id === rubro.id).sort(porNombre),
    }));
}

/**
 * Subcategorías donde se puede cargar un gasto a mano: activas, de un rubro activo y no del
 * sistema (la compra de certificados se registra sola). El cajero, además, solo las habilitadas
 * para la caja. La BD aplica las mismas reglas en `registrar_gasto`.
 */
export function categoriasParaCargar(
  categorias: readonly CategoriaGasto[],
  { soloCaja }: { soloCaja: boolean },
): Rubro[] {
  return agruparPorRubro(categorias)
    .filter(({ rubro }) => rubro.activa)
    .map(({ rubro, subcategorias }) => ({
      rubro,
      subcategorias: subcategorias.filter(
        (s) => s.activa && s.sistema === null && (!soloCaja || s.habilitada_caja),
      ),
    }))
    .filter(({ subcategorias }) => subcategorias.length > 0);
}
