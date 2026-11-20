import {
  Banknote,
  Bell,
  ClipboardList,
  FileText,
  FileCheck,
  KeyRound,
  LayoutDashboard,
  Receipt,
  Store,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Suspense } from "react";
import { Link, NavLink, Outlet } from "react-router";
import { useAuth } from "@/modulos/auth/contexto";
import { BotonSalir } from "@/modulos/auth/componentes/BotonSalir";
import { Cargando } from "@/compartido/componentes/Cargando";
import { Button } from "@/compartido/ui/button";
import { cn } from "@/compartido/lib/utils";

interface ItemMenu {
  a: string;
  texto: string;
  icono: LucideIcon;
}

const MENU_ADMIN: ItemMenu[] = [
  { a: "/admin", texto: "Dashboard", icono: LayoutDashboard },
  { a: "/admin/ventas", texto: "Ventas", icono: Receipt },
  { a: "/admin/facturacion", texto: "Facturación", icono: FileCheck },
  { a: "/admin/alertas", texto: "Alertas", icono: Bell },
  { a: "/admin/usuarios", texto: "Usuarios", icono: Users },
  { a: "/admin/cajas", texto: "Cajas", icono: Store },
  { a: "/admin/servicios", texto: "Servicios", icono: ClipboardList },
  { a: "/admin/certificados", texto: "Certificados", icono: FileText },
  { a: "/admin/gastos", texto: "Gastos", icono: Wallet },
  { a: "/admin/efectivo", texto: "Caja de efectivo", icono: Banknote },
  { a: "/admin/arca", texto: "Configuración ARCA", icono: KeyRound },
];

export function LayoutAdmin() {
  const { perfil } = useAuth();

  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <aside className="border-b bg-muted/40 md:w-60 md:shrink-0 md:border-r md:border-b-0">
        <div className="px-4 py-3 font-semibold">Sistema VTV</div>
        <nav aria-label="Menú de administración">
          <ul className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible">
            {MENU_ADMIN.map(({ a, texto, icono: Icono }) => (
              <li key={a}>
                <NavLink
                  to={a}
                  end={a === "/admin"}
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
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-end gap-2 border-b px-4 py-2">
          <span className="mr-auto text-sm text-muted-foreground">
            {perfil?.nombre} · Administrador
          </span>
          <Button asChild variant="ghost" size="sm">
            <Link to="/caja">Operar caja</Link>
          </Button>
          <BotonSalir />
        </header>
        <main className="flex-1 p-4 md:p-6">
          <Suspense fallback={<Cargando />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
