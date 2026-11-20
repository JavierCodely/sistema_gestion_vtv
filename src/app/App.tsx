import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";
import { AuthProvider } from "@/modulos/auth/AuthProvider";
import { Toaster } from "@/compartido/ui/sonner";
import { crearQueryClient } from "@/compartido/lib/query-client";
import { rutas } from "@/app/rutas";

const router = createBrowserRouter(rutas);

export function App() {
  const [queryClient] = useState(crearQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}
