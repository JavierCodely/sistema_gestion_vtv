import { formatearDia } from "@/compartido/lib/formato";
import {
  aniosDisponibles,
  NOMBRES_MESES,
  rangoDePeriodo,
  type Periodo,
} from "@/compartido/lib/periodo";
import { Label } from "@/compartido/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/compartido/ui/select";

const TODO_EL_ANIO = "todo";
const TODOS_LOS_TURNOS = "todos";

/** Un turno para elegir en el filtro (el que llama arma la etiqueta: caja y apertura). */
export interface OpcionTurno {
  id: number;
  etiqueta: string;
}

/**
 * Filtro de los reportes: **Año** + **Mes** ("Todo el año" = el año entero) y, opcional, un
 * **Turno** abierto en ese período. Abajo dice siempre qué se está consultando: "Del 01/11/2026 al
 * 30/11/2026" o el turno elegido. Cambiar el período quita el turno (puede no pertenecer al nuevo).
 */
export function FiltroPeriodo({
  idBase,
  periodo,
  onPeriodo,
  turnoId,
  onTurno,
  turnos,
}: {
  /** Prefijo de los id de los campos (`<idBase>-anio`, `-mes`, `-turno`). */
  idBase: string;
  periodo: Periodo;
  onPeriodo: (periodo: Periodo) => void;
  turnoId: number | null;
  onTurno: (turnoId: number | null) => void;
  /** undefined mientras se cargan (el selector queda deshabilitado). */
  turnos: OpcionTurno[] | undefined;
}) {
  const rango = rangoDePeriodo(periodo);
  const turno = turnos?.find((t) => t.id === turnoId);

  function cambiarPeriodo(nuevo: Periodo) {
    onPeriodo(nuevo);
    onTurno(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${idBase}-anio`}>Año</Label>
          <Select
            value={String(periodo.anio)}
            onValueChange={(valor) => {
              cambiarPeriodo({ ...periodo, anio: Number(valor) });
            }}
          >
            <SelectTrigger id={`${idBase}-anio`} className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {aniosDisponibles().map((anio) => (
                <SelectItem key={anio} value={String(anio)}>
                  {anio}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${idBase}-mes`}>Mes</Label>
          <Select
            value={periodo.mes === null ? TODO_EL_ANIO : String(periodo.mes)}
            onValueChange={(valor) => {
              cambiarPeriodo({ ...periodo, mes: valor === TODO_EL_ANIO ? null : Number(valor) });
            }}
          >
            <SelectTrigger id={`${idBase}-mes`} className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODO_EL_ANIO}>Todo el año</SelectItem>
              {NOMBRES_MESES.map((nombre, i) => (
                <SelectItem key={nombre} value={String(i + 1)}>
                  {nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${idBase}-turno`}>Turno</Label>
          <Select
            value={turnoId === null ? TODOS_LOS_TURNOS : String(turnoId)}
            disabled={!turnos}
            onValueChange={(valor) => {
              onTurno(valor === TODOS_LOS_TURNOS ? null : Number(valor));
            }}
          >
            <SelectTrigger id={`${idBase}-turno`} className="w-72 max-w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS_LOS_TURNOS}>Todos los turnos</SelectItem>
              {turnos?.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.etiqueta}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-sm text-muted-foreground" data-testid={`${idBase}-rango`}>
        {turno ? (
          <>
            Datos del turno: <span className="font-medium text-foreground">{turno.etiqueta}</span>
          </>
        ) : (
          <>
            Del{" "}
            <span className="font-medium text-foreground tabular-nums">
              {formatearDia(rango.desde)}
            </span>{" "}
            al{" "}
            <span className="font-medium text-foreground tabular-nums">
              {formatearDia(rango.hasta)}
            </span>
          </>
        )}
      </p>
      {turnos?.length === 0 && (
        <p className="text-xs text-muted-foreground">No se abrió ningún turno en ese período.</p>
      )}
    </div>
  );
}
