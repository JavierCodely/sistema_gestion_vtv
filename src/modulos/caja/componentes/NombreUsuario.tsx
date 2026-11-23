import { useNombreUsuario } from "../api/consultas";

/**
 * Nombre de quien hizo un movimiento (ej. "Vendió" en el historial). TanStack Query comparte la
 * consulta entre las filas del mismo usuario. Mientras carga, "…"; si no se puede ver, "—".
 */
export function NombreUsuario({ usuarioId }: { usuarioId: string }) {
  const nombre = useNombreUsuario(usuarioId);
  if (nombre.isPending) return <span aria-label="Cargando nombre">…</span>;
  return <>{nombre.data ?? "—"}</>;
}
