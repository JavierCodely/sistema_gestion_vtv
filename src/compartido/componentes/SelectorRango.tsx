import type { RangoFechas } from "@/compartido/lib/rango-fechas";
import { Input } from "@/compartido/ui/input";
import { Label } from "@/compartido/ui/label";

/** Campos "Desde" y "Hasta" (días de negocio) de un reporte. `id` arma los ids de los campos. */
export function SelectorRango({
  id,
  valor,
  onCambiar,
}: {
  id: string;
  valor: RangoFechas;
  onCambiar: (rango: RangoFechas) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-desde`}>Desde</Label>
        <Input
          id={`${id}-desde`}
          type="date"
          className="w-44"
          value={valor.desde}
          onChange={(e) => {
            onCambiar({ ...valor, desde: e.target.value });
          }}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-hasta`}>Hasta</Label>
        <Input
          id={`${id}-hasta`}
          type="date"
          className="w-44"
          value={valor.hasta}
          onChange={(e) => {
            onCambiar({ ...valor, hasta: e.target.value });
          }}
        />
      </div>
    </div>
  );
}
