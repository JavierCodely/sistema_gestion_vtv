import { Suspense } from "react";
import { Link, Outlet } from "react-router";
import { useAuth } from "@/modulos/auth/contexto";
import { BotonSalir } from "@/modulos/auth/componentes/BotonSalir";
import { Cargando } from "@/compartido/componentes/Cargando";
import { Button } from "@/compartido/ui/button";

export function LayoutCaja() {
  const { perfil } = useAuth();

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex flex-wrap items-center justify-end gap-2 border-b px-4 py-2">
        <span className="mr-auto font-semibold">Sistema VTV · Caja</span>
        <span className="text-sm text-muted-foreground">{perfil?.nombre}</span>
        {perfil?.rol === "admin" && (
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin">Panel admin</Link>
          </Button>
        )}
        <BotonSalir />
      </header>
      <main className="flex-1 p-4 md:p-6">
        <Suspense fallback={<Cargando />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
