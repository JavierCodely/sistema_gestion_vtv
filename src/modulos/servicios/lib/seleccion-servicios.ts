import type { Categoria, Servicio } from "../api/consultas";

/*
 * Elegir servicios con switches por categoría (descuentos e impuestos): la lista agrupada, el
 * estado del switch de cada categoría y los cambios. Lógica pura; la usa `SelectorServicios`.
 */

export interface GrupoDisponibilidad {
  categoria: Categoria;
  servicios: Servicio[];
}

/** Estado del switch de una categoría según cuántos de sus servicios están habilitados. */
export type EstadoCategoria = "todos" | "ninguno" | "parcial";

/** Todas las categorías con todos sus servicios (también los desactivados), por nombre. */
export function agruparServicios(
  categorias: readonly Categoria[],
  servicios: readonly Servicio[],
): GrupoDisponibilidad[] {
  const porNombre = (a: { nombre: string }, b: { nombre: string }) =>
    a.nombre.localeCompare(b.nombre, "es");
  return [...categorias].sort(porNombre).map((categoria) => ({
    categoria,
    servicios: servicios.filter((s) => s.categoria_id === categoria.id).sort(porNombre),
  }));
}

export function estadoCategoria(
  servicios: readonly Servicio[],
  elegidos: ReadonlySet<number>,
): EstadoCategoria {
  const habilitados = servicios.filter((s) => elegidos.has(s.id)).length;
  if (habilitados === 0) return "ninguno";
  return habilitados === servicios.length ? "todos" : "parcial";
}

/** El switch de categoría prende o apaga todos sus servicios de una vez. */
export function cambiarCategoria(
  elegidos: ReadonlySet<number>,
  servicios: readonly Servicio[],
  habilitar: boolean,
): Set<number> {
  const nuevos = new Set(elegidos);
  for (const s of servicios) {
    if (habilitar) nuevos.add(s.id);
    else nuevos.delete(s.id);
  }
  return nuevos;
}

export function cambiarServicio(
  elegidos: ReadonlySet<number>,
  servicioId: number,
  habilitar: boolean,
): Set<number> {
  const nuevos = new Set(elegidos);
  if (habilitar) nuevos.add(servicioId);
  else nuevos.delete(servicioId);
  return nuevos;
}
