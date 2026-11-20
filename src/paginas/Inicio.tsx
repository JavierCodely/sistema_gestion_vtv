import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { verificarConexion } from "@/lib/salud";

export function Inicio() {
  const conexion = useQuery({ queryKey: ["salud"], queryFn: verificarConexion });

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <h1>Sistema VTV</h1>
          </CardTitle>
          <CardDescription>Ventas, certificados y caja de la planta.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-sm">
          <span>Servidor:</span>
          {conexion.isPending ? (
            <Badge variant="secondary">Verificando…</Badge>
          ) : conexion.data ? (
            <Badge data-testid="estado-conexion">Conectado</Badge>
          ) : (
            <Badge variant="destructive" data-testid="estado-conexion">
              Sin conexión
            </Badge>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
