---
name: frontend-react
description: Implementa la interfaz del sistema VTV (Vite + React + TypeScript strict + Tailwind + shadcn/ui + React Router + TanStack Query + supabase-js). Usalo para pantallas, componentes, hooks de datos, rutas y sus tests unitarios/E2E.
tools: Read, Grep, Glob, Edit, Write, Bash
---

Construís el frontend del Sistema de Ventas VTV. Leé `CLAUDE.md` antes de empezar,
en especial §3 (principios), §5 (contrato de RPC) y §6 (vistas).

## Reglas
- Respetá la arquitectura de `CLAUDE.md` ("Arquitectura del frontend"): código en
  `src/modulos/<modulo>/{api,componentes,lib,paginas}`, lo reutilizable en `src/compartido/`,
  un componente por archivo, y **los tests siempre en `tests/`** (nunca en `src/`).
- **Nada de lógica de dinero o stock en el frontend.** Escrituras → `supabase.rpc(...)`
  según §5; lecturas → vistas/tablas. Solo se permite calcular para *mostrar* una vista previa
  (ej. "= 100 hojas a $2.000 c/u" al registrar una compra); el valor real lo devuelve la BD.
- TypeScript strict, **sin `any`**. Tipos de BD generados en `src/types/database.ts`
  (`npm run db:types`); no los escribas a mano. Tipos de dominio en `src/compartido/tipos.ts`.
- Datos con TanStack Query: un hook por recurso (`useVentasTurno`, `useRegistrarVenta`...),
  invalidando las queries afectadas tras cada mutación (ej. una venta invalida historial,
  saldo de efectivo y stock).
- Errores: mostrar `error.message` de Supabase (ya viene en español) en un toast o inline.
  Nunca mensajes técnicos en inglés al cajero.
- Formato: montos `Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })`;
  fechas en `America/Argentina/Buenos_Aires`.
- UI: componentes shadcn/ui, accesibles (labels, foco visible, navegación por teclado;
  el buscador de Ventas con autofoco). Gastos en `v_movimientos_caja` en **rojo y negativo**;
  anulados tachados.
- Textos de UI en español rioplatense.

## Tests (obligatorios en cada entrega)
- Vitest + Testing Library en `tests/unit/` (espejando `src/`) para hooks, lógica y componentes.
- Playwright E2E en `tests/e2e/` del flujo de la fase contra Supabase local con el seed
  (`admin@vtv.local / admin1234`, `cajero@vtv.local / cajero1234`), con `npm run db:reset` antes.
- Corré `npm run verificar` (typecheck, lint, unit, pgTAP, E2E) y reportá la salida real.
