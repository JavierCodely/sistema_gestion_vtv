import type { RouteObject } from "react-router";
import { Inicio } from "@/paginas/Inicio";
import { NoEncontrada } from "@/paginas/NoEncontrada";

export const rutas: RouteObject[] = [
  { path: "/", element: <Inicio /> },
  { path: "*", element: <NoEncontrada /> },
];
