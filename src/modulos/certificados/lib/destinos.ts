import type { Categoria, Servicio } from "@/modulos/servicios/api/consultas";

/*
 * Dónde se usa un certificado (migración 39): todos los servicios, o categorías enteras (también los
 * servicios que se agreguen después) y/o servicios sueltos, mezclados. Lógica pura del diálogo
 * "Se usa en"; la regla de qué certificado se usa al vender la aplica la BD.
 */

export interface Destinos {
  todos: boolean;
  categorias: ReadonlySet<number>;
  servicios: ReadonlySet<number>;
}

/**
 * Prende o apaga una categoría entera. Al prenderla se quitan sus servicios sueltos: la categoría ya
 * los incluye y así la lista guardada no tiene repetidos.
 */
export function cambiarCategoriaEntera(
  destinos: Destinos,
  categoriaId: number,
  serviciosDeCategoria: readonly Pick<Servicio, "id">[],
  entera: boolean,
): Destinos {
  const categorias = new Set(destinos.categorias);
  const servicios = new Set(destinos.servicios);
  if (entera) {
    categorias.add(categoriaId);
    for (const s of serviciosDeCategoria) servicios.delete(s.id);
  } else {
    categorias.delete(categoriaId);
  }
  return { ...destinos, categorias, servicios };
}

export function cambiarServicioSuelto(
  destinos: Destinos,
  servicioId: number,
  elegido: boolean,
): Destinos {
  const servicios = new Set(destinos.servicios);
  if (elegido) servicios.add(servicioId);
  else servicios.delete(servicioId);
  return { ...destinos, servicios };
}

function contar(cantidad: number, singular: string, plural: string): string {
  return `${String(cantidad)} ${cantidad === 1 ? singular : plural}`;
}

/** "Todos los servicios", "Ningún servicio" o "2 categorías y 1 servicio". */
export function resumirDestinos(destinos: Destinos): string {
  if (destinos.todos) return "Todos los servicios";
  const partes = [
    destinos.categorias.size > 0 && contar(destinos.categorias.size, "categoría", "categorías"),
    destinos.servicios.size > 0 && contar(destinos.servicios.size, "servicio", "servicios"),
  ].filter((parte): parte is string => typeof parte === "string");
  return partes.length === 0 ? "Ningún servicio" : partes.join(" y ");
}

/** Listas ordenadas para `fijar_destinos_certificado` (con "todos", vacías). */
export function destinosParaGuardar(destinos: Destinos): {
  todos: boolean;
  categoriaIds: number[];
  servicioIds: number[];
} {
  const ordenar = (ids: ReadonlySet<number>) => [...ids].sort((a, b) => a - b);
  return {
    todos: destinos.todos,
    categoriaIds: destinos.todos ? [] : ordenar(destinos.categorias),
    servicioIds: destinos.todos ? [] : ordenar(destinos.servicios),
  };
}

/** Todas las categorías (por nombre) con todos sus servicios (por nombre), también desactivados. */
export function agruparPorCategoria(
  categorias: readonly Categoria[],
  servicios: readonly Servicio[],
): { categoria: Categoria; servicios: Servicio[] }[] {
  const porNombre = (a: { nombre: string }, b: { nombre: string }) =>
    a.nombre.localeCompare(b.nombre, "es");
  return [...categorias].sort(porNombre).map((categoria) => ({
    categoria,
    servicios: servicios.filter((s) => s.categoria_id === categoria.id).sort(porNombre),
  }));
}
