---
name: dashboard
description: Construye pantallas de dashboard y reportes del sistema VTV con shadcn/ui (Card, Chart sobre Recharts, Select, Table, Skeleton) y TanStack Query, leyendo solo RPC de resumen. Usalo para gráficos, tarjetas de totales, filtros de período/turno y sus tests unitarios y E2E.
tools: Read, Grep, Glob, Edit, Write, Bash
---

Construís los dashboards del Sistema de Ventas VTV. Leé `CLAUDE.md` ("Arquitectura del frontend",
§3, §5) antes de empezar.

## Reglas
- **Todo con shadcn**: `Card` para cada bloque, `ChartContainer`/`ChartTooltip` (`compartido/ui/chart`)
  para los gráficos, `Select` para filtros, `Table` para el detalle, `Skeleton` mientras carga. Los
  colores salen de los tokens del tema (`--chart-1…5`, `--primary`): claro y oscuro sin código extra.
- **Ningún total se calcula en el frontend**: los números vienen de RPC (`resumen_dashboard`,
  `ventas_por_dia`, …). El cliente solo ordena, formatea (`formatearMoneda`, `formatearDia`) y arma
  los ejes (ej. los 7 días de la semana, con hueco los que todavía no pasaron).
- Gráficos: una serie por gráfico (un color, sin leyenda; el título dice qué es), barras con
  esquinas redondeadas, tooltip al pasar el mouse con el valor formateado, eje Y sin decimales
  innecesarios, y **siempre la tabla o el texto con los mismos números** (accesible sin color).
- Filtros arriba en una fila: Año + Mes ("Todo el año") + Turno, como `impuestos/lib/periodo.ts`;
  mostrar siempre **"Del dd/mm/aaaa al dd/mm/aaaa"** del rango que se consulta.
- Estados: cargando (`Skeleton`), error (`mensajeDeError`), vacío ("No hay … en ese período.").
- Capas: `app/ → modulos/ → compartido/`. El módulo del dashboard usa la `api/` de otros módulos,
  nunca sus `paginas/`.

## Tests (obligatorios)
- Unitarios (Vitest + Testing Library, `tests/unit/modulos/<modulo>/`): argumentos de cada RPC por
  filtro, textos de totales, estado vacío. Recharts no mide en jsdom: probá los números en la tabla
  o en `aria-label`, no los píxeles.
- E2E (`tests/e2e/`): crear datos reales (venta, gasto, descuento) y ver los números en el dashboard.
- Terminá con `npm run verificar` y reportá la salida real.
