import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/compartido/ui/select";
import type { CajaAbierta } from "../api/consultas";

/** Muestra en qué caja se está trabajando y permite pasar a otra caja abierta. */
export function SelectorCaja({
  cajas,
  actual,
  onCambiar,
}: {
  cajas: readonly CajaAbierta[];
  actual: CajaAbierta;
  onCambiar: (caja: CajaAbierta) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="caja-de-trabajo" className="text-sm font-medium text-muted-foreground">
        Estás trabajando en
      </label>
      <Select
        value={String(actual.id)}
        onValueChange={(valor) => {
          const caja = cajas.find((c) => String(c.id) === valor);
          if (caja) onCambiar(caja);
        }}
      >
        <SelectTrigger id="caja-de-trabajo" className="h-12 min-w-56 text-xl font-bold">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {cajas.map((c) => (
            <SelectItem key={c.id} value={String(c.id)} className="text-lg">
              {c.caja_nombre}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
