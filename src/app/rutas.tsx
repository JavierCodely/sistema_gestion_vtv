import { Suspense } from "react";
import { Navigate, Outlet, type RouteObject } from "react-router";
import { RedireccionInicial, RutaProtegida } from "@/modulos/auth/RutaProtegida";
import { Cargando } from "@/compartido/componentes/Cargando";
import { EnConstruccion } from "@/app/paginas/EnConstruccion";
import { Login } from "@/modulos/auth/paginas/Login";
import { LayoutAdmin, LayoutCaja } from "@/app/diferidas";
import { NoEncontrada } from "@/app/paginas/NoEncontrada";

// Las pantallas autenticadas se cargan bajo demanda (code splitting): el login queda liviano.

export const rutas: RouteObject[] = [
  {
    // Al entrar directo a una pantalla diferida, el router la carga antes del primer render:
    // mientras tanto muestra esto (HydrateFallback).
    element: <Outlet />,
    HydrateFallback: Cargando,
    children: [
      { path: "/", element: <RedireccionInicial /> },
      { path: "/login", element: <Login /> },
      {
        path: "/admin",
        element: (
          <RutaProtegida roles={["admin"]}>
            <Suspense fallback={<Cargando />}>
              <LayoutAdmin />
            </Suspense>
          </RutaProtegida>
        ),
        children: [
          {
            index: true,
            lazy: async () => ({
              Component: (await import("@/modulos/dashboard/paginas/Dashboard")).Dashboard,
            }),
          },
          {
            path: "estadisticas",
            lazy: async () => ({
              Component: (await import("@/modulos/estadisticas/paginas/Estadisticas")).Estadisticas,
            }),
          },
          {
            path: "ventas",
            lazy: async () => ({
              Component: (await import("@/modulos/ventas/paginas/Ventas")).Ventas,
            }),
          },
          {
            path: "ventas/pasadas",
            lazy: async () => ({
              Component: (await import("@/modulos/ventas/paginas/VentasPasadas")).VentasPasadas,
            }),
          },
          {
            path: "patentes",
            lazy: async () => ({
              Component: (await import("@/modulos/ventas/paginas/BuscarPatente")).BuscarPatente,
            }),
          },
          {
            path: "ventas/turnos/:id",
            lazy: async () => ({
              Component: (await import("@/modulos/ventas/paginas/DetalleTurno")).DetalleTurno,
            }),
          },
          {
            path: "facturacion",
            lazy: async () => ({
              Component: (await import("@/modulos/facturacion/paginas/Facturacion")).Facturacion,
            }),
          },
          {
            path: "arca",
            lazy: async () => ({
              Component: (await import("@/modulos/facturacion/paginas/ConfiguracionArca"))
                .ConfiguracionArca,
            }),
          },
          { path: "alertas", element: <EnConstruccion titulo="Alertas" fase={6} /> },
          {
            path: "usuarios",
            lazy: async () => ({
              Component: (await import("@/modulos/usuarios/paginas/Usuarios")).Usuarios,
            }),
          },
          {
            path: "cajas",
            lazy: async () => ({
              Component: (await import("@/modulos/cajas/paginas/Cajas")).Cajas,
            }),
          },
          {
            path: "servicios",
            lazy: async () => ({
              Component: (await import("@/modulos/servicios/paginas/Servicios")).Servicios,
            }),
          },
          {
            path: "certificados",
            lazy: async () => ({
              Component: (await import("@/modulos/certificados/paginas/Certificados")).Certificados,
            }),
          },
          {
            path: "certificados/:id",
            lazy: async () => ({
              Component: (await import("@/modulos/certificados/paginas/MovimientosCertificado"))
                .MovimientosCertificado,
            }),
          },
          {
            path: "descuentos",
            lazy: async () => ({
              Component: (await import("@/modulos/descuentos/paginas/Descuentos")).Descuentos,
            }),
          },
          {
            path: "impuestos",
            lazy: async () => ({
              Component: (await import("@/modulos/impuestos/paginas/Impuestos")).Impuestos,
            }),
          },
          {
            path: "gastos",
            lazy: async () => ({
              Component: (await import("@/modulos/gastos/paginas/Gastos")).Gastos,
            }),
          },
          {
            path: "fondos",
            lazy: async () => ({
              Component: (await import("@/modulos/fondos/paginas/Fondos")).Fondos,
            }),
          },
          // La sección se llamaba "Caja de efectivo": la dirección vieja abre la pestaña Efectivo.
          { path: "efectivo", element: <Navigate to="/admin/fondos?pestana=efectivo" replace /> },
        ],
      },
      {
        path: "/caja",
        element: (
          <RutaProtegida roles={["cajero", "admin"]}>
            <Suspense fallback={<Cargando />}>
              <LayoutCaja />
            </Suspense>
          </RutaProtegida>
        ),
        children: [
          {
            index: true,
            lazy: async () => ({
              Component: (await import("@/modulos/caja/paginas/Caja")).Caja,
            }),
          },
        ],
      },
      {
        // Representación impresa: sin menú, para imprimir solo el comprobante.
        path: "/comprobantes/:id",
        element: (
          <RutaProtegida roles={["cajero", "admin"]}>
            <Suspense fallback={<Cargando />}>
              <Outlet />
            </Suspense>
          </RutaProtegida>
        ),
        children: [
          {
            index: true,
            lazy: async () => ({
              Component: (await import("@/modulos/facturacion/paginas/VerComprobante"))
                .VerComprobante,
            }),
          },
        ],
      },
      { path: "*", element: <NoEncontrada /> },
    ],
  },
];
