import {
  Bell,
  Car,
  ChartColumn,
  ClipboardList,
  FileText,
  FileCheck,
  KeyRound,
  Landmark,
  LayoutDashboard,
  Menu,
  Percent,
  Scale,
  Receipt,
  Store,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { useAuth } from "@/modulos/auth/contexto";
import { BotonSalir } from "@/modulos/auth/componentes/BotonSalir";
import { BotonTema } from "@/compartido/componentes/BotonTema";
import { Cargando } from "@/compartido/componentes/Cargando";
import { AccionesTurnoAdmin } from "@/modulos/caja/componentes/AccionesTurnoAdmin";
import { cn } from "@/compartido/lib/utils";
import { Button } from "@/compartido/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/compartido/ui/sheet";

interface ItemMenu {
  a: string;
  texto: string;
  icono: LucideIcon;
}

const MENU_ADMIN: ItemMenu[] = [
  { a: "/admin", texto: "Dashboard", icono: LayoutDashboard },
  { a: "/admin/estadisticas", texto: "Estadísticas", icono: ChartColumn },
  { a: "/admin/ventas", texto: "Ventas", icono: Receipt },
  { a: "/admin/patentes", texto: "Patentes", icono: Car },
  { a: "/admin/facturacion", texto: "Facturación", icono: FileCheck },
  { a: "/admin/alertas", texto: "Alertas", icono: Bell },
  { a: "/admin/usuarios", texto: "Usuarios", icono: Users },
  { a: "/admin/cajas", texto: "Cajas", icono: Store },
  { a: "/admin/servicios", texto: "Servicios", icono: ClipboardList },
  { a: "/admin/descuentos", texto: "Descuentos", icono: Percent },
  { a: "/admin/impuestos", texto: "Impuestos", icono: Scale },
  { a: "/admin/certificados", texto: "Certificados", icono: FileText },
  { a: "/admin/gastos", texto: "Gastos", icono: Wallet },
  { a: "/admin/fondos", texto: "Fondos", icono: Landmark },
  { a: "/admin/arca", texto: "Configuración ARCA", icono: KeyRound },
];

/** Links del menú. `onNavegar` cierra el panel del celular al elegir una pantalla. */
function MenuAdmin({ className, onNavegar }: { className?: string; onNavegar?: () => void }) {
  return (
    <nav aria-label="Menú de administración">
      <ul className={cn("flex flex-col gap-1 px-2 pb-2", className)}>
        {MENU_ADMIN.map(({ a, texto, icono: Icono }) => (
          <li key={a}>
            <NavLink
              to={a}
              end={a === "/admin"}
              onClick={onNavegar}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm whitespace-nowrap hover:bg-accent",
                  isActive && "bg-accent font-medium",
                )
              }
            >
              <Icono className="size-4" aria-hidden />
              {texto}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function LayoutAdmin() {
  const { perfil } = useAuth();
  const contenido = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const [menuAbierto, setMenuAbierto] = useState(false);

  // El contenido tiene su propio scroll: al cambiar de pantalla vuelve arriba (el navegador solo
  // restaura el scroll de la ventana).
  useEffect(() => {
    if (contenido.current) contenido.current.scrollTop = 0;
  }, [pathname]);

  return (
    // En pantallas medianas o más grandes el panel ocupa la ventana: el menú y la barra quedan fijos
    // y solo el contenido se desplaza, con su propia barra de scroll. En el celular el menú se abre
    // desde la barra ("Menú", panel lateral) y el scroll es el normal.
    <div className="flex min-h-svh flex-col md:h-svh md:flex-row md:overflow-hidden">
      <aside className="hidden bg-muted/40 md:block md:w-60 md:shrink-0 md:overflow-y-auto md:border-r">
        <div className="px-4 py-3 font-semibold">Sistema VTV</div>
        <MenuAdmin />
      </aside>
      <Sheet open={menuAbierto} onOpenChange={setMenuAbierto}>
        <SheetContent side="left" className="w-64 gap-0 overflow-y-auto p-0">
          <SheetHeader>
            <SheetTitle>Sistema VTV</SheetTitle>
            <SheetDescription className="sr-only">Elegí una pantalla del panel.</SheetDescription>
          </SheetHeader>
          <MenuAdmin
            onNavegar={() => {
              setMenuAbierto(false);
            }}
          />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col md:min-h-0">
        {/* Barra fija: las acciones de turno quedan siempre a mano al hacer scroll. */}
        <header className="sticky top-0 z-40 flex items-center gap-2 border-b bg-background px-2 py-2 sm:px-4 md:grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Abrir el menú"
            aria-expanded={menuAbierto}
            onClick={() => {
              setMenuAbierto(true);
            }}
          >
            <Menu aria-hidden />
          </Button>
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            {perfil?.nombre_completo}
            <span className="hidden sm:inline"> · Administrador</span>
          </span>
          <div className="md:justify-self-center">
            <AccionesTurnoAdmin mostrarIrALaCaja />
          </div>
          <div className="flex items-center justify-end gap-1">
            <BotonTema />
            <BotonSalir />
          </div>
        </header>
        <main
          ref={contenido}
          data-testid="contenido-admin"
          className="min-w-0 flex-1 p-3 sm:p-4 md:min-h-0 md:overflow-y-auto md:p-6"
        >
          <Suspense fallback={<Cargando />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
