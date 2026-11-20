import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import { crearQueryClient } from "@/lib/query-client";
import { rutas } from "@/rutas";

const router = createBrowserRouter(rutas);

export function App() {
  const [queryClient] = useState(crearQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}
