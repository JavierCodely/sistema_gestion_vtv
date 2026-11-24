import { FolderPlus, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Cargando } from "@/compartido/componentes/Cargando";
import { mensajeDeError } from "@/compartido/lib/errores";
import { Alert, AlertDescription } from "@/compartido/ui/alert";
import { Badge } from "@/compartido/ui/badge";
import { Button } from "@/compartido/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/compartido/ui/card";
import { Switch } from "@/compartido/ui/switch";
import {
  MENSAJES_ERROR_CATEGORIA_GASTO,
  useActualizarCategoriaGasto,
  useCategoriasGasto,
  type CambiosCategoriaGasto,
  type CategoriaGasto,
} from "../api/consultas";
import { agruparPorRubro } from "../lib/categorias";
import { DialogoCategoriaGasto, type ModoCategoria } from "./DialogoCategoriaGasto";
import { DialogoEliminarCategoriaGasto } from "./DialogoEliminarCategoriaGasto";

/**
 * Rubros y subcategorías de gasto (solo admin). Se eliminan solo si no tienen gastos (un rubro, con
 * sus subcategorías); las que ya se usaron se desactivan. Las del sistema (compra de certificados)
 * solo se pueden renombrar: ni ellas ni su rubro tienen "Eliminar".
 */
export function CategoriasGasto() {
  const categorias = useCategoriasGasto();
  const actualizar = useActualizarCategoriaGasto();
  const [modo, setModo] = useState<ModoCategoria | null>(null);
  const [eliminando, setEliminando] = useState<{
    categoria: CategoriaGasto;
    subcategorias: CategoriaGasto[];
  } | null>(null);

  async function cambiar(categoria: CategoriaGasto, cambios: CambiosCategoriaGasto, aviso: string) {
    try {
      await actualizar.mutateAsync({ id: categoria.id, cambios });
      toast.success(aviso);
    } catch (e) {
      toast.error(mensajeDeError(e, MENSAJES_ERROR_CATEGORIA_GASTO));
    }
  }

  if (categorias.isPending) return <Cargando texto="Cargando categorías…" />;
  if (categorias.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{mensajeDeError(categorias.error)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button
          variant="outline"
          onClick={() => {
            setModo({ tipo: "rubro" });
          }}
        >
          <FolderPlus aria-hidden />
          Nuevo rubro
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {agruparPorRubro(categorias.data).map(({ rubro, subcategorias }) => (
          <Card key={rubro.id} data-testid={`rubro-${rubro.nombre}`}>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className={rubro.activa ? "" : "text-muted-foreground line-through"}>
                {rubro.nombre}
              </CardTitle>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Renombrar ${rubro.nombre}`}
                  onClick={() => {
                    setModo({ tipo: "editar", categoria: rubro });
                  }}
                >
                  <Pencil aria-hidden />
                </Button>
                {subcategorias.every((s) => s.sistema === null) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Eliminar ${rubro.nombre}`}
                    onClick={() => {
                      setEliminando({ categoria: rubro, subcategorias });
                    }}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                )}
                <Switch
                  checked={rubro.activa}
                  disabled={actualizar.isPending}
                  aria-label={`Rubro ${rubro.nombre} activo`}
                  onCheckedChange={(activa) =>
                    void cambiar(
                      rubro,
                      { activa },
                      `Rubro ${rubro.nombre} ${activa ? "activado" : "desactivado"}`,
                    )
                  }
                />
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <ul className="flex flex-col divide-y">
                {subcategorias.map((sub) => (
                  <li
                    key={sub.id}
                    data-testid={`subcategoria-${sub.nombre}`}
                    className="flex flex-wrap items-center gap-2 py-2"
                  >
                    <span
                      className={
                        sub.activa ? "mr-auto" : "mr-auto text-muted-foreground line-through"
                      }
                    >
                      {sub.nombre}
                    </span>
                    {sub.sistema !== null ? (
                      <Badge variant="secondary">Automática</Badge>
                    ) : (
                      <>
                        <label className="flex items-center gap-1 text-xs text-muted-foreground">
                          Caja
                          <Switch
                            checked={sub.habilitada_caja}
                            disabled={actualizar.isPending}
                            aria-label={`${sub.nombre} habilitada para la caja`}
                            onCheckedChange={(habilitada) =>
                              void cambiar(
                                sub,
                                { habilitada_caja: habilitada },
                                habilitada
                                  ? `El cajero ya puede cargar gastos en ${sub.nombre}`
                                  : `El cajero ya no puede cargar gastos en ${sub.nombre}`,
                              )
                            }
                          />
                        </label>
                        <label className="flex items-center gap-1 text-xs text-muted-foreground">
                          Activa
                          <Switch
                            checked={sub.activa}
                            disabled={actualizar.isPending}
                            aria-label={`Subcategoría ${sub.nombre} activa`}
                            onCheckedChange={(activa) =>
                              void cambiar(
                                sub,
                                { activa },
                                `${sub.nombre} ${activa ? "activada" : "desactivada"}`,
                              )
                            }
                          />
                        </label>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Renombrar ${sub.nombre}`}
                      onClick={() => {
                        setModo({ tipo: "editar", categoria: sub });
                      }}
                    >
                      <Pencil aria-hidden />
                    </Button>
                    {sub.sistema === null && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Eliminar ${sub.nombre}`}
                        onClick={() => {
                          setEliminando({ categoria: sub, subcategorias: [] });
                        }}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              <Button
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => {
                  setModo({ tipo: "subcategoria", rubro });
                }}
              >
                <Plus aria-hidden />
                Subcategoría
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      {eliminando && (
        <DialogoEliminarCategoriaGasto
          categoria={eliminando.categoria}
          subcategorias={eliminando.subcategorias}
          onCerrar={() => {
            setEliminando(null);
          }}
        />
      )}
      {modo && (
        <DialogoCategoriaGasto
          modo={modo}
          onCerrar={() => {
            setModo(null);
          }}
        />
      )}
    </div>
  );
}
