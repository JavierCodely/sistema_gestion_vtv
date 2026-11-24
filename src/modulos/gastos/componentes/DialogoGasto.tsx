import { useState, type SubmitEvent } from "react";
import { toast } from "sonner";
import { Campo } from "@/compartido/componentes/Campo";
import { Cargando } from "@/compartido/componentes/Cargando";
import { ErrorFormulario } from "@/compartido/componentes/ErrorFormulario";
import { propsError } from "@/compartido/lib/accesibilidad";
import { mensajeDeError } from "@/compartido/lib/errores";
import { formatearMoneda } from "@/compartido/lib/formato";
import { LARGO_MAXIMO_NOTA, montoComoTexto, validarMotivo } from "@/compartido/lib/validaciones";
import { Button } from "@/compartido/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/compartido/ui/dialog";
import { Input } from "@/compartido/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/compartido/ui/select";
import {
  FUENTES,
  useCategoriasGasto,
  useCorregirGasto,
  useRegistrarGasto,
  type FuenteFondos,
  type Gasto,
} from "../api/consultas";
import { categoriasParaCargar } from "../lib/categorias";
import { validarGasto, type ErroresGasto, type FormularioGasto } from "../lib/validaciones";

const VACIO: FormularioGasto = { categoriaId: "", monto: "", fuente: "", nota: "" };

function esFuente(medio: string | null): medio is FuenteFondos {
  return medio !== null && medio in FUENTES;
}

/** El formulario de una corrección arranca con los datos del gasto. */
function formularioDe(gasto: Gasto): FormularioGasto {
  return {
    categoriaId: gasto.categoria_gasto_id === null ? "" : String(gasto.categoria_gasto_id),
    monto: montoComoTexto(Math.abs(gasto.monto ?? 0)),
    fuente: esFuente(gasto.medio) ? gasto.medio : "",
    nota: gasto.nota ?? "",
  };
}

/**
 * Carga de un gasto (la BD vuelve a controlar todo).
 * - `soloCaja`: solo las subcategorías habilitadas para la caja (el cajero).
 * - `turnoId` (pantalla de caja: el turno de la caja elegida): queda en ese turno y, si es en
 *   efectivo, se paga con su cajón. Sin `turnoId` (Gastos del admin) sale de la caja de cambio y no
 *   queda en ningún turno.
 * - `gasto` (Gastos del admin): corrige ese gasto con motivo (`corregir_gasto`). Puede quedar su
 *   subcategoría aunque hoy esté desactivada.
 */
export function DialogoGasto({
  soloCaja,
  turnoId,
  gasto,
  descripcion,
  onCerrar,
}: {
  soloCaja: boolean;
  turnoId?: number;
  gasto?: Gasto;
  descripcion: string;
  onCerrar: () => void;
}) {
  const delTurno = turnoId !== undefined || (gasto !== undefined && gasto.turno_id !== null);
  const categorias = useCategoriasGasto();
  const registrar = useRegistrarGasto();
  const corregir = useCorregirGasto();
  const enCurso = registrar.isPending || corregir.isPending;
  const [formulario, setFormulario] = useState<FormularioGasto>(() =>
    gasto ? formularioDe(gasto) : VACIO,
  );
  const [motivo, setMotivo] = useState("");
  const [errorMotivo, setErrorMotivo] = useState<string | undefined>();
  const [errores, setErrores] = useState<ErroresGasto>({});
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  function cambiar<K extends keyof FormularioGasto>(clave: K, valor: FormularioGasto[K]) {
    setFormulario((actual) => ({ ...actual, [clave]: valor }));
  }

  async function enviar(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    const resultado = validarGasto(formulario);
    setErrores(resultado.errores ?? {});
    const errorDelMotivo = gasto ? validarMotivo(motivo) : undefined;
    setErrorMotivo(errorDelMotivo);
    if (!resultado.datos || errorDelMotivo) return;
    setErrorServidor(null);
    try {
      if (gasto) {
        const corregido = await corregir.mutateAsync({
          ...resultado.datos,
          id: gasto.id,
          motivo: motivo.trim(),
        });
        toast.success(`Gasto corregido: ${formatearMoneda(corregido.monto)}`);
      } else {
        const registrado = await registrar.mutateAsync({
          ...resultado.datos,
          turnoId: turnoId ?? null,
        });
        toast.success(`Gasto de ${formatearMoneda(registrado.monto)} registrado`);
      }
      onCerrar();
    } catch (e) {
      setErrorServidor(mensajeDeError(e));
    }
  }

  const rubros = categorias.data
    ? categoriasParaCargar(categorias.data, {
        soloCaja,
        incluir: gasto?.categoria_gasto_id ?? undefined,
      })
    : [];

  return (
    <Dialog
      open
      onOpenChange={(abierto) => {
        // Con la escritura en curso no se cierra.
        if (!abierto && !enCurso) onCerrar();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{gasto ? "Corregir gasto" : "Registrar gasto"}</DialogTitle>
          <DialogDescription>{descripcion}</DialogDescription>
        </DialogHeader>
        {categorias.isPending ? (
          <Cargando texto="Cargando categorías…" />
        ) : categorias.isError ? (
          <ErrorFormulario mensaje={mensajeDeError(categorias.error)} />
        ) : rubros.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay categorías de gasto disponibles
            {soloCaja ? " para la caja. Consultá con el administrador." : "."}
          </p>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={(e) => void enviar(e)} noValidate>
            <Campo id="gasto-categoria" etiqueta="Categoría" error={errores.categoriaId}>
              <Select
                value={formulario.categoriaId}
                onValueChange={(valor) => {
                  cambiar("categoriaId", valor);
                }}
              >
                <SelectTrigger
                  id="gasto-categoria"
                  className="w-full"
                  {...propsError("gasto-categoria", errores.categoriaId)}
                >
                  <SelectValue placeholder="Elegí una categoría" />
                </SelectTrigger>
                <SelectContent>
                  {rubros.map(({ rubro, subcategorias }) => (
                    <SelectGroup key={rubro.id}>
                      <SelectLabel>{rubro.nombre}</SelectLabel>
                      {subcategorias.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.nombre}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo id="gasto-monto" etiqueta="Monto ($)" error={errores.monto}>
                <Input
                  id="gasto-monto"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="Ej. 15.000,50"
                  value={formulario.monto}
                  onChange={(e) => {
                    cambiar("monto", e.target.value);
                  }}
                  {...propsError("gasto-monto", errores.monto)}
                />
              </Campo>
              <Campo id="gasto-fuente" etiqueta="Pagado con" error={errores.fuente}>
                <Select
                  value={formulario.fuente}
                  onValueChange={(valor) => {
                    cambiar("fuente", valor as FuenteFondos);
                  }}
                >
                  <SelectTrigger
                    id="gasto-fuente"
                    className="w-full"
                    {...propsError("gasto-fuente", errores.fuente)}
                  >
                    <SelectValue placeholder="Elegí" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(FUENTES) as FuenteFondos[]).map((f) => (
                      <SelectItem key={f} value={f}>
                        {f === "efectivo"
                          ? delTurno
                            ? "Efectivo (de la caja)"
                            : "Efectivo (caja de cambio)"
                          : FUENTES[f]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>
            </div>
            <Campo id="gasto-nota" etiqueta="Nota" error={errores.nota}>
              <Input
                id="gasto-nota"
                autoComplete="off"
                maxLength={LARGO_MAXIMO_NOTA}
                placeholder="Ej. Resma de papel A4"
                value={formulario.nota}
                onChange={(e) => {
                  cambiar("nota", e.target.value);
                }}
                {...propsError("gasto-nota", errores.nota)}
              />
            </Campo>
            {gasto && (
              <Campo id="gasto-motivo" etiqueta="Motivo de la corrección" error={errorMotivo}>
                <Input
                  id="gasto-motivo"
                  autoComplete="off"
                  maxLength={LARGO_MAXIMO_NOTA}
                  placeholder="Ej. El monto era otro"
                  value={motivo}
                  onChange={(e) => {
                    setMotivo(e.target.value);
                  }}
                  {...propsError("gasto-motivo", errorMotivo)}
                />
              </Campo>
            )}
            <ErrorFormulario mensaje={errorServidor} />
            <DialogFooter>
              <Button type="submit" disabled={enCurso}>
                {enCurso ? "Guardando…" : gasto ? "Guardar corrección" : "Registrar gasto"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
