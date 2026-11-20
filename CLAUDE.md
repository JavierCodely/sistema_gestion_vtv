# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 1. Proyecto

Sistema de ventas para una planta de VTV (Argentina). Se cobran servicios; cada servicio
puede consumir una **hoja de certificado** comprada por caja/libreta. Hay cajas con turnos,
una **caja de efectivo para cambio única y compartida**, gastos por categorías y reportes.

Stack: Supabase (Postgres 17 + Auth + Realtime + Edge Functions). El frontend
(Vite + React + TS strict + Tailwind + shadcn + TanStack Query) se construye por fases (§8).

Idioma: código de dominio, mensajes de error y UI en **español rioplatense** ("tenés", "elegí").

## 2. Comandos

Requieren Docker corriendo. La CLI de Supabase va como devDependency (`npx supabase ...`).

Primera vez: `npm install` → `npx playwright install chromium` → `npm run db:start` → `npm run env:local` (genera `.env.local`).

| Comando | Qué hace |
|---|---|
| `npm run dev` | Vite en `http://localhost:5173` |
| `npm run typecheck` / `lint` / `format:check` | `tsc -b` · ESLint con `--max-warnings 0` · Prettier (`npm run format` corrige) |
| `npm run test` | Unit (Vitest + Testing Library, `tests/unit/**/*.test.{ts,tsx}`) |
| `npm run test:e2e` | Playwright (`tests/e2e/`), levanta `npm run dev` solo; usa Supabase local + seed |
| `npm run db:start` / `db:stop` | Supabase local (API `127.0.0.1:54321`, DB `:54322`) |
| `npm run db:reset` | Recrea la BD: migraciones + `supabase/seed.sql` |
| `npm run sql:produccion` | Regenera `supabase/produccion/01_esquema_completo.sql` (todas las migraciones en una transacción, para el SQL Editor). Ver `supabase/produccion/LEEME.md` |
| `npm run db:types` | Regenera `src/types/database.ts`. **Correrlo tras cada migración** |
| `npm run test:db` | Tests pgTAP (`supabase/tests/database/*.sql`) |
| `npm run test:functions` | Tests de integración de Edge Functions (node:test) |
| `npm run verificar` (= `verify`) | typecheck + lint + format + unit + build + db:reset + pgTAP + funciones + E2E. **Debe pasar antes de entregar cualquier cambio** |

- Un test unitario: `npx vitest run tests/unit/compartido/lib/formato.test.ts` (o `-t "nombre"`).
- Un E2E: `npx playwright test tests/e2e/auth.spec.ts` (o `-g "nombre"`).
- Un archivo pgTAP: `npx supabase test db supabase/tests/database/05_ventas.sql`
- Un test de función: `node --test --test-name-pattern "ciclo completo" supabase/tests/functions/admin-usuarios.test.mjs`
- **Edge Functions nuevas**: el runtime local solo las detecta al arrancar → `npm run db:stop && npm run db:start`.
- Usuarios del seed (solo local): `admin@vtv.local / admin1234`, `cajero@vtv.local / cajero1234`.

## Arquitectura del frontend

Capas (ESLint `no-restricted-imports` las hace cumplir): **`app/` → `modulos/` → `compartido/`**, nunca al revés.
Un módulo no importa de `app/`; `compartido/` no importa de ningún módulo.

```
src/
  main.tsx                 entrada (Vite)
  app/                     composición: App (providers), rutas.tsx, diferidas.tsx (lazy), páginas genéricas, index.css
  compartido/              sin lógica de negocio de un módulo concreto
    ui/                    componentes shadcn (npx shadcn@latest add <x> los deja acá)
    componentes/           Cargando, Campo, ErrorFormulario…
    lib/                   supabase, formato (ARS / hora AR), errores, validaciones, query-client, salud
    tipos.ts               Rol, Perfil, Tablas, Enums (derivados de types/database.ts)
  modulos/<modulo>/        una carpeta por área de negocio: auth, usuarios, panel-admin, caja, (cajas, certificados, ventas, gastos…)
    api/                   acceso a datos: llamadas RPC/Edge Functions + hooks TanStack Query
    componentes/           un componente por archivo
    lib/                   lógica pura del módulo (validaciones, mapeos)
    paginas/               pantallas enrutables
  types/database.ts        generado (npm run db:types), no editar
tests/
  unit/                    Vitest; espeja src/ (tests/unit/modulos/auth/Login.test.tsx ↔ src/modulos/auth/paginas/Login.tsx)
  e2e/                     Playwright (utilidades.ts: ingresar, salir, credenciales del seed)
  soporte/                 setup.ts y render.tsx (renderRuta con AuthContext falso, perfilDePrueba)
supabase/tests/            pgTAP y tests de Edge Functions (la CLI de Supabase exige esa ubicación)
```

- **Nunca** tests dentro de `src/`. Alias: `@/` → `src/`, `@tests/` → `tests/`.
- Pantallas nuevas: entrada en `app/rutas.tsx` con `lazy` (code splitting); el login queda liviano.
- `RutaProtegida` es solo UX: la seguridad real es la RLS/RPC.
- `compartido/` crece solo con cosas usadas por 2+ módulos; si algo es de un módulo, va en el módulo.
- shadcn: tras `add`, verificar que importe `cn` de `@/compartido/lib/utils` (el CLI a veces mete un paquete `cn` externo).
- Versiones: React 19, React Router 8, Vite 8, TS 6, Tailwind 4, ESLint 10 (flat config), Vitest 5.
  En React 19.3 `FormEvent` está deprecado: usar `SubmitEvent<HTMLFormElement>`.

## 3. Principios de arquitectura

- **La BD es la fuente de verdad del dinero y el stock.** El frontend nunca calcula saldos,
  costos ni stock: llama RPC y lee vistas.
- **Lecturas**: el cliente lee tablas/vistas con RLS. Todas las vistas son
  `security_invoker = true` (el cajero ve lo suyo, el admin todo).
- **Escrituras con reglas de negocio** (ventas, turnos, gastos, compras, ajustes, efectivo,
  alertas): solo vía RPC `security definer` con `set search_path = ''`. No hay grants de
  INSERT/UPDATE para esas tablas.
- **CRUD simple de catálogo** (cajas, categorías de servicio, servicios, certificados,
  categorías de gasto): el admin escribe directo en la tabla, con **grants por columna**
  (ej. `certificados.stock_hojas` y `costo_promedio` no son editables por nadie).
- **Usuarios**: alta, rol, activación y contraseña solo vía Edge Function `admin-usuarios`
  (usa service role). El perfil se crea por trigger desde `auth.users`
  (`user_metadata.nombre`, `app_metadata.rol`). Un trigger impide quedarse sin admin activo.
- **Efectivo**: todo movimiento pasa por `_mover_efectivo()` (bloquea la fila única
  `caja_efectivo`, rechaza saldo negativo, escribe en `movimientos_efectivo`).
- **Día de negocio** = `fecha_local(ts)` en `America/Argentina/Buenos_Aires`.
- Montos `numeric(12,2)`; costo por hoja `numeric(14,4)`.
- Errores: `raise exception` con mensaje en español listo para mostrar al cajero.
  SQLSTATE: `42501` permisos, `22023` dato inválido, `P0001` regla de negocio.
- Funciones con prefijo `_` son internas: sin `EXECUTE` para `authenticated`.
- **Montos de entrada**: toda RPC que reciba dinero llama `perform public._validar_monto(p, 'El monto')`
  (rechaza NULL, `NaN` —Postgres lo acepta en numeric y lo ordena por encima de todo—, ≤ 0, > 2 decimales
  y fuera de rango). Toda columna de dinero nueva lleva `check (col <> 'NaN'::numeric)`.
- **Textos libres**: CHECK `char_length(col) <= N` (nombres 100, notas/motivos 500, patente 10, proveedor 200);
  la UI usa los mismos límites (`LARGO_MAXIMO_*` en `compartido/lib/validaciones.ts`).
- RPC que escriben sobre un turno lo leen con `for share` (serializa con `cerrar_turno`).
- Catálogo con historial (servicios, cajas, certificados, categorías): en la UI se **desactiva**
  (`activo/activa = false`); borrar falla por FK si ya se usó en ventas, turnos o gastos.

## 4. Modelo de datos (`supabase/migrations/`, en orden)

| # | Migración | Contenido |
|---|---|---|
| 01 | `tipos` | Enums, `fecha_local`, `_texto_obligatorio` |
| 02 | `usuarios` | `perfiles`, trigger de alta, protección del último admin, `rol_actual()`, `es_admin()`, `_exigir_usuario()`, `_exigir_admin()` |
| 03 | `cajas_turnos` | `cajas`, `turnos` (índices únicos parciales: 1 turno abierto por caja y por usuario) |
| 04 | `catalogo` | `categorias_servicio`, `servicios` |
| 05 | `certificados` | `certificados` (alcance global/categoría/servicio, 1 activo por destino), kardex `movimientos_certificado`, `certificado_para_servicio()` |
| 06 | `efectivo` | `caja_efectivo` (fila única), `movimientos_efectivo`, `_mover_efectivo()`, `movimiento_efectivo()` |
| 07 | `gastos` | `categorias_gasto` (2 niveles + precarga de 9 rubros), `gastos`, `registrar_gasto()`, `anular_gasto()` |
| 08 | `compras_certificados` | `compras_certificado`, `registrar_compra_certificado()`, `ajustar_stock_certificado()` |
| 09 | `alertas` | `alertas`, `marcar_alertas_leidas()` |
| 10 | `ventas` | `ventas`, `registrar_venta()`, `anular_venta()` |
| 11 | `turnos` | `abrir_turno()`, `cerrar_turno()` |
| 12 | `vistas` | Vistas de reportes (§6) |
| 13 | `rls` | Revoke total, RLS, grants, default privileges, Realtime de `alertas` |
| 14 | `endurecimiento_seguridad` | `_validar_monto`, CHECK anti-NaN, largos máximos, locks (último admin, turno) — auditoría 2026-11-20 |

Reglas que no son obvias leyendo una sola tabla:
- **Certificado a usar**: el activo más específico (servicio > categoría > global).
- **Venta sin stock** (o sin certificado configurado): se registra igual, `sin_stock = true`,
  costo 0, y se inserta una alerta `venta_sin_stock`. El stock nunca baja de 0.
- **Stock bajo**: alerta `stock_bajo` solo al *cruzar* `stock_minimo` hacia abajo con una venta.
- **Compra**: suma hojas (`unidades × hojas_por_unidad`), recalcula costo promedio ponderado
  y crea automáticamente un gasto en la categoría con `sistema = 'compra_certificados'`
  (Insumos › Compra de certificados), que no se carga a mano ni se anula.
- **Ajuste de stock**: valuado al costo promedio vigente, no lo modifica, no genera gasto.
- **Anular venta** (solo admin): la hoja NO vuelve al stock; si fue en efectivo, el monto
  sale de la caja de cambio (si no alcanza, se rechaza).
- **Gastos**: siempre a una subcategoría; `habilitada_caja` solo existe en subcategorías.
  El cajero necesita turno abierto y categoría habilitada; el admin puede cargar sin turno.
  Usuario, turno y caja se completan solos.
- **Totales de turno**: `cerrar_turno` guarda una foto en `turnos.total_*`; `v_turnos` los
  calcula en vivo. Los anulados nunca suman.

## 5. Contrato de RPC

Todas requieren usuario autenticado y **activo**. Devuelven la fila afectada.

| RPC | Quién | Notas |
|---|---|---|
| `abrir_turno(p_caja_id bigint) → turnos` | todos | Caja activa y libre; el usuario sin otro turno |
| `cerrar_turno(p_observaciones text = null, p_turno_id bigint = null) → turnos` | todos / admin | Sin `p_turno_id` cierra el propio; con id, el admin cierra cualquiera |
| `registrar_venta(p_servicio_id bigint, p_medio_pago medio_pago, p_patente text = null) → ventas` | todos | Requiere turno abierto. Patente se normaliza (mayúsculas, sin espacios). `ventas.id` = número de venta |
| `anular_venta(p_venta_id bigint, p_motivo text) → ventas` | admin | Motivo obligatorio |
| `registrar_gasto(p_categoria_id bigint, p_monto numeric, p_fuente fuente_fondos, p_nota text) → gastos` | todos | Nota obligatoria. Cajero: turno abierto + categoría habilitada |
| `anular_gasto(p_gasto_id bigint, p_motivo text) → gastos` | admin | No aplica a gastos de compra de certificados |
| `registrar_compra_certificado(p_certificado_id bigint, p_unidades int, p_costo_unidad numeric, p_fuente fuente_fondos, p_proveedor text = null) → compras_certificado` | admin | Para la UI: hojas = `unidades × hojas_por_unidad`, costo/hoja = `costo_unidad / hojas_por_unidad` |
| `ajustar_stock_certificado(p_certificado_id bigint, p_hojas int, p_nota text) → movimientos_certificado` | admin | `p_hojas` con signo, ≠ 0 |
| `movimiento_efectivo(p_tipo tipo_mov_efectivo, p_monto numeric, p_nota text) → movimientos_efectivo` | admin | Solo `fondo_inicial`, `ingreso`, `retiro`; monto positivo |
| `marcar_alertas_leidas(p_ids bigint[] = null) → int` | admin | `null` = todas; devuelve cuántas marcó |
| `certificado_para_servicio(p_servicio_id bigint) → bigint` | todos | Para mostrar en Ventas qué hoja se usará |
| `rol_actual() → rol_usuario`, `es_admin() → boolean` | todos | `null`/`false` si el usuario está desactivado |

Enums: `medio_pago` = efectivo | transferencia | tarjeta · `fuente_fondos` = efectivo | transferencia ·
`unidad_compra` = caja | libreta | unidad · `alcance_certificado` = global | categoria | servicio.

Edge Function `admin-usuarios` (POST, `Authorization: Bearer <jwt del admin>`), responde
`{ usuario }` o `{ error }`:
`{accion:"crear", nombre, email, password, rol}` · `{accion:"actualizar", id, nombre?, rol?}` ·
`{accion:"activar", id, activo}` · `{accion:"cambiar_password", id, password}` (mín. 8 caracteres).
El admin no puede desactivarse ni quitarse el rol a sí mismo.

## 6. Vistas

| Vista | Uso |
|---|---|
| `v_movimientos_caja` | Ventas + gastos juntos. `tipo` = venta/gasto; **gastos con `monto` negativo** (fila roja); `anulada` para tacharlas (excluirlas de totales). Filtrar por `turno_id`, `caja_id`, `fecha_local`, etc. |
| `v_turnos` | Turnos con caja, cajero, `abierto` y totales en vivo por medio, gastos y neto |
| `v_resumen_diario` | Por `fecha`: ventas, por medio, gastos, `flujo_neto`, `costo_certificados`, `margen_bruto`, `ventas_sin_stock` |
| `v_stock_certificados` | Stock, costo promedio, `valor_stock`, `semaforo` (ok/bajo/sin_stock), `aplica_a` |
| `v_gastos_por_categoria` | Totales por fecha, rubro, subcategoría y fuente |

Saldo de efectivo: `select saldo from caja_efectivo` (visible para todos).
Alertas en tiempo real: Realtime `postgres_changes` sobre `public.alertas` (RLS: solo admin).

## 7. Cambiar la base de datos

- **Nunca editar una migración ya commiteada**: crear una nueva (`npx supabase migration new <nombre>`).
- La migración 13 revoca los privilegios por defecto: **toda tabla, vista o función nueva
  necesita `grant` explícito** a `authenticated`, RLS habilitada (las vistas con
  `security_invoker = true`). `08_seguridad.sql` falla si una tabla queda sin RLS o una vista sin invoker.
- RPC nuevas: `security definer`, `set search_path = ''`, nombres calificados (`public.x`),
  empezar con `perform public._exigir_usuario()` o `_exigir_admin()`.
- Revisión de seguridad: agente `ciberseguridad` (auditoría completa o de un diff).
- Tests pgTAP: incluir `\ir _helpers.psql`; usar `pg_temp.escenario()` para datos base,
  `pg_temp.como(uid)` para actuar como un usuario y `reset role` para volver a postgres.
  Los tests no dependen del seed. Un UPDATE bloqueado por RLS no lanza error (afecta 0 filas):
  verificar el dato, no la excepción.

## 8. Agentes (`.claude/agents/`)

`db-supabase` (migraciones, RPC, pgTAP), `frontend-react` (UI), `qa-tester` (escribe y corre
tests, reporta), `revisor-codigo` (revisión antes de commitear), `ciberseguridad` (auditoría de seguridad). Flujo por fase:
agente de implementación → `qa-tester` → `revisor-codigo` → commit con todo en verde.
No se pasa de fase con tests en rojo.

| Fase | Contenido |
|---|---|
| −1 | BD completa, Edge Function, tests pgTAP y de función (**hecha**) |
| 0 | (**hecha**) Scaffold: Vite + React + TS strict, Tailwind, shadcn, router, TanStack Query, cliente Supabase, ESLint + Prettier, Vitest, Playwright, scripts `dev`/`build`/`typecheck`/`lint`/`test`/`test:e2e`; tipos generados (`supabase gen types`); sumar todo a `verificar` |
| 1 | Auth, layout por rol, guardas de rutas, pantalla de usuarios |
| 2 | Admin: cajas, categorías de servicio, servicios |
| 3 | Admin: certificados, compras, ajustes, kardex, stock |
| 4 | Caja: abrir turno, ventas, historial, cerrar turno |
| 5 | Gastos (admin y caja) + caja de efectivo |
| 6 | Dashboard, reportes, alertas en tiempo real |
| 7 | Pulido: responsive, accesibilidad, estados vacíos/errores, rendimiento; E2E completo |

Calidad exigida: TypeScript strict sin `any`, ESLint sin warnings, tests nuevos (unit + E2E del
flujo) en cada fase, ejecutados y en verde. Si un requisito es ambiguo, preguntar antes de inventar.
