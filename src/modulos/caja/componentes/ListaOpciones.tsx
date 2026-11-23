import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/compartido/lib/utils";

export interface Opcion<T> {
  valor: T;
  etiqueta: string;
  /** Texto secundario a la derecha (ej. el precio). */
  detalle?: ReactNode;
}

const TECLAS_ANTERIOR = new Set(["ArrowUp", "ArrowLeft"]);
const TECLAS_SIGUIENTE = new Set(["ArrowDown", "ArrowRight"]);

/** Ningún control con foco propio (si se perdió el foco, el teclado sigue manejando la lista). */
function focoPerdido(objetivo: EventTarget | null): boolean {
  return objetivo === null || objetivo === document.body || objetivo === document.documentElement;
}

/**
 * Lista de opciones grande para elegir solo con el teclado: los números 1 a 9 o las flechas marcan
 * una opción y Enter la elige; Escape vuelve al paso anterior. También se elige con un clic.
 * Toma el foco al aparecer; si el foco se pierde (clic en un espacio vacío), las teclas siguen
 * funcionando.
 */
export function ListaOpciones<T>({
  titulo,
  opciones,
  onElegir,
  onVolver,
  inicial,
  horizontal = false,
  deshabilitada = false,
}: {
  titulo: string;
  opciones: Opcion<T>[];
  onElegir: (valor: T) => void;
  onVolver?: () => void;
  /** Valor marcado al aparecer (ej. el que ya se había elegido). */
  inicial?: T;
  horizontal?: boolean;
  deshabilitada?: boolean;
}) {
  const id = useId();
  const lista = useRef<HTMLDivElement>(null);
  const [marcada, setMarcada] = useState(() =>
    Math.max(
      0,
      opciones.findIndex((o) => o.valor === inicial),
    ),
  );

  useEffect(() => {
    lista.current?.focus();
  }, []);

  function manejar(evento: { key: string; preventDefault: () => void }) {
    if (deshabilitada || opciones.length === 0) return;
    const { key } = evento;
    if (TECLAS_ANTERIOR.has(key)) {
      evento.preventDefault();
      setMarcada((i) => (i - 1 + opciones.length) % opciones.length);
    } else if (TECLAS_SIGUIENTE.has(key)) {
      evento.preventDefault();
      setMarcada((i) => (i + 1) % opciones.length);
    } else if (/^[1-9]$/.test(key) && Number(key) <= opciones.length) {
      evento.preventDefault();
      setMarcada(Number(key) - 1);
    } else if (key === "Enter") {
      evento.preventDefault();
      const opcion = opciones[marcada];
      if (opcion) onElegir(opcion.valor);
    } else if (key === "Escape" && onVolver) {
      evento.preventDefault();
      onVolver();
    }
  }

  // Si el foco se perdió, las teclas igual manejan la lista (y el foco vuelve a ella).
  const manejarRef = useRef(manejar);
  useEffect(() => {
    manejarRef.current = manejar;
  });
  useEffect(() => {
    function global(evento: globalThis.KeyboardEvent) {
      if (evento.altKey || evento.ctrlKey || evento.metaKey) return;
      if (!focoPerdido(evento.target)) return;
      lista.current?.focus();
      manejarRef.current(evento);
    }
    window.addEventListener("keydown", global);
    return () => {
      window.removeEventListener("keydown", global);
    };
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <h2 id={`${id}-titulo`} className="text-2xl font-semibold md:text-3xl">
        {titulo}
      </h2>
      <div
        ref={lista}
        role="listbox"
        tabIndex={0}
        aria-labelledby={`${id}-titulo`}
        aria-orientation={horizontal ? "horizontal" : "vertical"}
        aria-activedescendant={opciones[marcada] ? `${id}-${String(marcada)}` : undefined}
        aria-disabled={deshabilitada || undefined}
        onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
          manejar(e);
        }}
        className={cn(
          "grid gap-3 rounded-lg outline-none focus-visible:ring-4 focus-visible:ring-ring/40",
          horizontal ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" : "grid-cols-1",
        )}
      >
        {opciones.map((opcion, indice) => (
          <div
            key={String(opcion.valor)}
            id={`${id}-${String(indice)}`}
            role="option"
            aria-selected={indice === marcada}
            onClick={() => {
              if (deshabilitada) return;
              setMarcada(indice);
              onElegir(opcion.valor);
            }}
            className={cn(
              "flex cursor-pointer items-center gap-4 rounded-lg border-2 px-5 py-4 text-2xl transition-colors select-none md:text-3xl",
              horizontal && "justify-center py-8",
              indice === marcada
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card hover:bg-accent",
            )}
          >
            {indice < 9 && (
              <span
                aria-hidden
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-md border-2 text-xl font-bold tabular-nums",
                  indice === marcada ? "border-primary-foreground" : "border-muted-foreground/40",
                )}
              >
                {indice + 1}
              </span>
            )}
            <span className="font-semibold">{opcion.etiqueta}</span>
            {opcion.detalle !== undefined && (
              <span className="ml-auto font-semibold tabular-nums">{opcion.detalle}</span>
            )}
          </div>
        ))}
      </div>
      <p className="text-base text-muted-foreground">
        {horizontal ? "← → o números" : "↑ ↓ o números"} para marcar · Enter para elegir
        {onVolver && " · Esc para volver"}
      </p>
    </div>
  );
}
