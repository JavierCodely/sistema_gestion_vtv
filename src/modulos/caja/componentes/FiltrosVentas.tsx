import { Search, X } from "lucide-react";
import { useId, useState } from "react";
import { LARGO_MAXIMO_PATENTE } from "@/compartido/lib/validaciones";
import { cn } from "@/compartido/lib/utils";
import { Button } from "@/compartido/ui/button";
import { Input } from "@/compartido/ui/input";
import { Label } from "@/compartido/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/compartido/ui/select";
import { MEDIOS_PAGO, ORDEN_MEDIOS, type Venta } from "../api/consultas";
import { MINIMO_BUSQUEDA_PATENTE, patenteABuscar } from "../lib/buscar-patente";
import {
  categoriasDeVentas,
  SIN_FILTROS,
  type FiltroVentas,
  type MedioFiltro,
} from "../lib/filtrar-ventas";

const TODAS = "todas";

const OPCIONES_MEDIO: { valor: MedioFiltro; texto: string }[] = [
  ...ORDEN_MEDIOS.map((m) => ({ valor: m, texto: MEDIOS_PAGO[m] })),
  { valor: "mixto", texto: "Mixto" },
];

/**
 * Filtros de una lista de ventas (historial de la caja, ventas del turno del admin): patente (desde
 * 3 caracteres), categoría (las de las ventas de la lista) y medio de pago (una venta mixta aparece
 * en cada medio que usó; "Mixto", solo las mixtas). Avisa cada cambio con `onCambiar`; la lista la
 * filtra quien la muestra (`filtrarVentas`). `grande`: letra de la caja.
 */
export function FiltrosVentas({
  ventas,
  onCambiar,
  grande = false,
}: {
  ventas: readonly Venta[];
  onCambiar: (filtro: FiltroVentas) => void;
  grande?: boolean;
}) {
  const id = useId();
  const [texto, setTexto] = useState("");
  const [categoria, setCategoria] = useState(TODAS);
  const [medio, setMedio] = useState(TODAS);
  const categorias = categoriasDeVentas(ventas);
  const hayAlguno = texto !== "" || categoria !== TODAS || medio !== TODAS;

  function avisar(nuevoTexto: string, nuevaCategoria: string, nuevoMedio: string) {
    onCambiar({
      patente: patenteABuscar(nuevoTexto),
      categoriaId: nuevaCategoria === TODAS ? null : Number(nuevaCategoria),
      medio: nuevoMedio === TODAS ? null : (nuevoMedio as MedioFiltro),
    });
  }

  const etiqueta = grande ? "text-lg" : "text-sm";
  const control = grande ? "h-12 text-xl" : "";

  return (
    <div
      role="search"
      aria-label="Filtrar ventas"
      className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,18rem)_minmax(0,14rem)_minmax(0,12rem)_auto]"
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-patente`} className={etiqueta}>
          Buscar patente
        </Label>
        <div className="relative">
          <Search
            aria-hidden
            className="absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id={`${id}-patente`}
            type="search"
            autoComplete="off"
            maxLength={LARGO_MAXIMO_PATENTE + 2}
            className={cn("pl-10 uppercase", control)}
            placeholder="Ej. AB1"
            aria-describedby={`${id}-ayuda`}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              avisar(e.target.value, categoria, medio);
            }}
          />
        </div>
        <p id={`${id}-ayuda`} className="text-sm text-muted-foreground">
          Desde {MINIMO_BUSQUEDA_PATENTE} caracteres.
        </p>
      </div>
      <div className="flex flex-col gap-1 sm:self-start">
        <Label htmlFor={`${id}-categoria`} className={etiqueta}>
          Categoría
        </Label>
        <Select
          value={categoria}
          onValueChange={(valor) => {
            setCategoria(valor);
            avisar(texto, valor, medio);
          }}
        >
          <SelectTrigger id={`${id}-categoria`} className={cn("w-full", control)}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>Todas las categorías</SelectItem>
            {categorias.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1 sm:self-start">
        <Label htmlFor={`${id}-medio`} className={etiqueta}>
          Medio de pago
        </Label>
        <Select
          value={medio}
          onValueChange={(valor) => {
            setMedio(valor);
            avisar(texto, categoria, valor);
          }}
        >
          <SelectTrigger id={`${id}-medio`} className={cn("w-full", control)}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>Todos los medios</SelectItem>
            {OPCIONES_MEDIO.map((m) => (
              <SelectItem key={m.valor} value={m.valor}>
                {m.texto}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {hayAlguno && (
        <Button
          variant="ghost"
          className={cn("justify-self-start sm:self-start lg:mt-6", grande && "h-12 text-lg")}
          onClick={() => {
            setTexto("");
            setCategoria(TODAS);
            setMedio(TODAS);
            onCambiar(SIN_FILTROS);
          }}
        >
          <X aria-hidden />
          Limpiar filtros
        </Button>
      )}
    </div>
  );
}
