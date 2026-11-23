import { LayoutDashboard } from "lucide-react";
import { Suspense } from "react";
import { Outlet } from "react-router";
import { useAuth } from "@/modulos/auth/contexto";
import { BotonSalir } from "@/modulos/auth/componentes/BotonSalir";
import { BotonTema } from "@/compartido/componentes/BotonTema";
import { Cargando } from "@/compartido/componentes/Cargando";
import { AccionesTurnoAdmin } from "./componentes/AccionesTurnoAdmin";
import { BotonBarra } from "./componentes/BotonBarra";

export function LayoutCaja() {
  const { perfil } = useAuth();
  const esAdmin = perfil?.rol === "admin";

  return (
    <div className="flex min-h-svh flex-col">
      {/* Barra fija: el admin tiene abrir y cerrar turno siempre a mano al hacer scroll. El cajero no
          cierra turnos: la caja donde trabaja se ve (y se cambia) en la pantalla. */}
      <header className="sticky top-0 z-40 flex items-center gap-2 border-b bg-background px-4 py-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-xs font-medium text-muted-foreground">
            Sistema VTV · Caja
          </span>
          {/* Quién atiende, bien grande: se lee de lejos y se ve enseguida si quedó otra sesión. */}
          <span
            className="truncate text-2xl leading-tight font-bold sm:text-3xl md:text-4xl"
            data-testid="usuario-caja"
          >
            {perfil?.nombre_completo}
          </span>
        </div>
        {esAdmin && <AccionesTurnoAdmin mostrarIrALaCaja={false} />}
        <div className="flex items-center gap-1">
          {esAdmin && (
            <BotonBarra icono={LayoutDashboard} texto="Panel admin" variant="ghost" a="/admin" />
          )}
          <BotonTema />
          <BotonSalir />
        </div>
      </header>
      <main className="flex-1 p-4 md:p-6">
        <Suspense fallback={<Cargando />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
