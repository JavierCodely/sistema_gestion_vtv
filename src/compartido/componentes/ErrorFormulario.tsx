/** Error general de un formulario (ej. el que devuelve el servidor). */
export function ErrorFormulario({ mensaje }: { mensaje: string | null }) {
  if (!mensaje) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {mensaje}
    </p>
  );
}
