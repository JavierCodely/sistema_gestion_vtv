import { Suspense } from "react";
import type { RouteObject } from "react-router";
import { RedireccionInicial, RutaProtegida } from "@/modulos/auth/RutaProtegida";
import { Cargando } from "@/compartido/componentes/Cargando";
import { EnConstruccion } from "@/app/paginas/EnConstruccion";
import { Login } from "@/modulos/auth/paginas/Login";
import { LayoutAdmin, LayoutCaja } from "@/app/diferidas";
import { NoEncontrada } from "@/app/paginas/NoEncontrada";

// Las pantallas autenticadas se cargan bajo demanda (code splitting): el login queda liviano.

export const rutas: RouteObject[] = [
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
      { index: true, element: <EnConstruccion titulo="Dashboard" fase={6} /> },
      {
        path: "ventas",
        lazy: async () => ({
          Component: (await import("@/modulos/ventas/paginas/Ventas")).Ventas,
        }),
      },
      {
        path: "ventas/turnos/:id",
        lazy: async () => ({
          Component: (await import("@/modulos/ventas/paginas/DetalleTurno")).DetalleTurno,
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
      { path: "gastos", element: <EnConstruccion titulo="Gastos" fase={5} /> },
      { path: "efectivo", element: <EnConstruccion titulo="Caja de efectivo" fase={5} /> },
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
  { path: "*", element: <NoEncontrada /> },
];
