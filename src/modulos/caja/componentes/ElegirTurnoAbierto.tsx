import { formatearFechaHora, formatearLista } from "@/compartido/lib/formato";
import { cn } from "@/compartido/lib/utils";
import type { TurnoAbiertoResumen } from "../api/consultas";

/**
 * Lista de turnos abiertos para elegir cuál cerrar: grupo de radios nativo (flechas para moverse,
 * espacio para elegir), con caja, desde cuándo y quiénes atendieron (vendieron o gastaron).
 */
export function ElegirTurnoAbierto({
  turnos,
  elegido,
  error,
  onElegir,
}: {
  turnos: TurnoAbiertoResumen[];
  elegido: number | null;
  error: string | undefined;
  onElegir: (id: number) => void;
}) {
  return (
    <fieldset
      className="flex flex-col gap-2"
      aria-describedby={error ? "cierre-turno-error" : undefined}
      aria-invalid={error ? true : undefined}
    >
      <legend className="mb-2 text-sm font-medium">Turno a cerrar</legend>
      {turnos.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay turnos abiertos.</p>
      ) : (
        <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
          {turnos.map((t) => (
            <li key={t.id}>
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
                  elegido === t.id && "border-primary bg-accent",
                )}
              >
                <input
                  type="radio"
                  name="cierre-turno"
                  className="mt-0.5 accent-primary"
                  value={t.id}
                  checked={elegido === t.id}
                  onChange={() => {
                    onElegir(t.id);
                  }}
                />
                <span className="flex flex-col">
                  <span className="font-medium">{t.caja_nombre}</span>
                  <span className="text-muted-foreground">
                    Desde {formatearFechaHora(t.abierto_en)}
                  </span>
                  <span className="text-muted-foreground">
                    {t.atendido_por && t.atendido_por.length > 0
                      ? `Atendieron: ${formatearLista(t.atendido_por)}`
                      : "Todavía nadie vendió ni cargó gastos"}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p id="cierre-turno-error" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}
