import type { LucideIcon } from "lucide-react";
import { useId, type ComponentProps } from "react";
import { Link } from "react-router";
import { Button } from "@/compartido/ui/button";

/**
 * Botón de la barra superior fija: en pantallas chicas queda solo el ícono (el nombre accesible es
 * siempre `texto`, por `aria-label`). Con `a`, es un enlace. Deshabilitado, `motivo` explica por qué:
 * como `title` (en un envoltorio, porque el botón deshabilitado no recibe el mouse) y para el lector
 * de pantalla.
 */
export function BotonBarra({
  icono: Icono,
  texto,
  a,
  motivo,
  disabled,
  ...props
}: Omit<ComponentProps<typeof Button>, "children" | "asChild" | "size"> & {
  icono: LucideIcon;
  texto: string;
  a?: string;
  /** Por qué está deshabilitado. */
  motivo?: string;
}) {
  const idMotivo = useId();
  const contenido = (
    <>
      <Icono aria-hidden />
      <span className="hidden sm:inline">{texto}</span>
    </>
  );
  if (a) {
    return (
      <Button asChild size="sm" {...props}>
        <Link to={a} aria-label={texto}>
          {contenido}
        </Link>
      </Button>
    );
  }
  const explicado = disabled && motivo ? motivo : undefined;
  // Siempre el mismo árbol (con o sin motivo), para que el botón no se vuelva a montar al
  // habilitarse o deshabilitarse (perdería el foco).
  return (
    <span title={explicado} className="inline-flex">
      <Button
        size="sm"
        aria-label={texto}
        disabled={disabled}
        title={explicado}
        aria-describedby={explicado ? idMotivo : undefined}
        {...props}
      >
        {contenido}
      </Button>
      {explicado && (
        <span id={idMotivo} className="sr-only">
          {explicado}
        </span>
      )}
    </span>
  );
}
