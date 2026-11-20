import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { vi } from "vitest";
import type { Perfil } from "@/compartido/tipos";
import { AuthContext, type ValorAuth } from "@/modulos/auth/contexto";
import { rutas } from "@/app/rutas";

export function perfilDePrueba(cambios: Partial<Perfil> = {}): Perfil {
  return {
    id: "00000000-0000-0000-0000-0000000000c1",
    nombre: "Cajero Prueba",
    email: "cajero@prueba.local",
    rol: "cajero",
    activo: true,
    creado_en: "2026-01-01T00:00:00Z",
    actualizado_en: "2026-01-01T00:00:00Z",
    ...cambios,
  };
}

/** Valor de AuthContext falso: sin sesión salvo que se pase un perfil. */
export function authDePrueba(cambios: Partial<ValorAuth> = {}): ValorAuth {
  return {
    sesion: null,
    perfil: null,
    cargando: false,
    aviso: null,
    iniciarSesion: vi.fn(() => Promise.resolve()),
    cerrarSesion: vi.fn(() => Promise.resolve()),
    ...cambios,
  };
}

/** Renderiza la app en una ruta, con QueryClient aislado y AuthContext controlado. */
export function renderRuta(ruta: string, auth: ValorAuth = authDePrueba()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(rutas, { initialEntries: [ruta] });
  const resultado = render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <RouterProvider router={router} />
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
  return { ...resultado, router };
}
