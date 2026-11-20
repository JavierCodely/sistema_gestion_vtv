import { lazy } from "react";

// Layouts autenticados cargados bajo demanda (ver rutas.tsx).
export const LayoutAdmin = lazy(async () => ({
  default: (await import("@/modulos/panel-admin/LayoutAdmin")).LayoutAdmin,
}));

export const LayoutCaja = lazy(async () => ({
  default: (await import("@/modulos/caja/LayoutCaja")).LayoutCaja,
}));
