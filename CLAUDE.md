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

Guía de comandos en orden (local, tests, instalación en la nube): `docs/COMANDOS.md`.

Primera vez: `npm install` → `npx playwright install chromium` → `npm run db:start` → `npm run env:local` (genera `.env.local`).

| Comando | Qué hace |
|---|---|
| `npm run dev` | Vite en `http://localhost:5173` |
| `npm run dev:remoto` | Vite contra el proyecto Supabase en la nube (lee `.env.remoto.local`, no commiteado; solo clave publicable) |
| `npm run typecheck` / `lint` / `format:check` | `tsc -b` · ESLint con `--max-warnings 0` · Prettier (`npm run format` corrige) |
| `npm run test` | Unit (Vitest + Testing Library, `tests/unit/**/*.test.{ts,tsx}`) |
| `npm run test:e2e` | Playwright (`tests/e2e/`): servidor propio en :5174 con URL/clave de `supabase status` (nunca la nube) + seed |
| `npm run db:start` / `db:stop` | Supabase local (API `127.0.0.1:54321`, DB `:54322`) |
| `npm run db:reset` | Recrea la BD: migraciones + `supabase/seed.sql` |
| `npm run sql:produccion` | Regenera `supabase/produccion/01_esquema_completo.sql` (todas las migraciones en una transacción, para el SQL Editor). Ver `supabase/produccion/LEEME.md` |
| `npm run db:types` | Regenera `src/types/database.ts`. **Correrlo tras cada migración** |
| `npm run test:db` | Tests pgTAP (`supabase/tests/database/*.sql`) |
| `npm run test:functions` | Tests de integración de Edge Functions (node:test, un archivo a la vez); `arca` corre contra el simulador |
| `npm run arca:simulador` | Simulador de ARCA (WSAA + WSFEv1) en `:54399` para probar la facturación en local. **Nunca ARCA real en tests** |
| `npm run verificar` (= `verify`) | typecheck + lint + format + unit + build + db:reset + pgTAP + funciones + E2E. **Debe pasar antes de entregar cualquier cambio** |

- Un test unitario: `npx vitest run tests/unit/compartido/lib/formato.test.ts` (o `-t "nombre"`).
- Un E2E: `npx playwright test tests/e2e/auth.spec.ts` (o `-g "nombre"`).
- E2E con pantalla trabada en "Cargando…": `E2E_NETLOG=<carpeta> npx playwright test` guarda el net-log
  de Chromium por worker. En Docker Desktop/WSL el reenvío de puertos a veces corta el preflight CORS
  aunque Kong respondió (diagnóstico 2026-11-21): no es la base.
- Un archivo pgTAP: `npx supabase test db supabase/tests/database/05_ventas.sql`
- Un test de función: `node --test --test-name-pattern "ciclo completo" supabase/tests/functions/admin-usuarios.test.mjs`
- **Edge Functions nuevas**: el runtime local solo las detecta al arrancar → `npm run db:stop && npm run db:start`.
- **Edge runtime local en `oneshot`** (`supabase/config.toml`): un worker por petición. Con `per_worker` el
  worker acumulaba CPU y el runtime lo cortaba en medio de una petición (E2E de usuarios colgado).
  Cada llamada puede tardar unos segundos en frío: en los E2E, toda acción que llama a una Edge Function
  va envuelta en `conFuncion(page, "<función>", accion)` (`tests/e2e/utilidades.ts`), que espera la
  respuesta antes de las aserciones; los flujos largos llevan `test.setTimeout(90_000)`.
  En `oneshot`, con pedidos simultáneos el runtime a veces termina el worker antes de que salga la
  respuesta (503 vacío, log `connection aborted`; la función sí se ejecutó). Por eso los tests de
  funciones corren de a un archivo (`--test-concurrency=1`) y las E2E con `workers: 1`. No se
  reintenta automáticamente: la llamada pudo tener efecto. Es solo del runtime local, no de la nube.
- Usuarios del seed (solo local): `admin@vtv.local / admin1234`, `cajero@vtv.local / cajero1234`.

## Arquitectura del frontend

Capas (ESLint `no-restricted-imports` las hace cumplir): **`app/` → `modulos/` → `compartido/`**, nunca al revés.
Un módulo no importa de `app/`; `compartido/` no importa de ningún módulo.

```
src/
  main.tsx                 entrada (Vite)
  app/                     composición: App (providers), rutas.tsx, diferidas.tsx (lazy), páginas genéricas, index.css
  compartido/              sin lógica de negocio de un módulo concreto
    ui/                    componentes shadcn (npx shadcn@latest add <x> los deja acá; `chart` = gráficos sobre Recharts)
    componentes/           Cargando, Campo, ErrorFormulario, SelectorRango (Desde/Hasta de los reportes), FiltroPeriodo (Año + Mes + Turno)…
    lib/                   supabase, formato (ARS / hora AR / hoyEnArgentina), errores, validaciones, query-client, salud, claves-descuentos, claves-impuestos, periodo (Año/Mes y semana actual), paginacion, rango-fechas (mesActual, revisarRango)
    tipos.ts               Rol, Perfil, Tablas, Enums (derivados de types/database.ts)
  modulos/<modulo>/        una carpeta por área de negocio: auth, usuarios, panel-admin, caja, cajas, servicios, certificados, ventas, facturacion, gastos, fondos (caja de cambio + transferencia + crédito/débito), descuentos, impuestos, dashboard
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
- Esperas en tests unitarios: `waitFor`/`findBy*` de Testing Library (timeout de 3 s en `tests/soporte/setup.ts`,
  por las rutas `lazy` con la suite en paralelo). **No `vi.waitFor`**: tiene su propio timeout de 1 s y falla al azar.
- Pantallas nuevas: entrada en `app/rutas.tsx` con `lazy` (code splitting); el login queda liviano.
- `RutaProtegida` es solo UX: la seguridad real es la RLS/RPC.
- `compartido/` crece solo con cosas usadas por 2+ módulos; si algo es de un módulo, va en el módulo.
- Un módulo puede usar la `api/` y los `componentes/` de otro (ej. `ventas` usa `TablaVentas` y
  `DialogoCerrarTurno` de `caja`), nunca sus `paginas/`, y sin ciclos entre módulos.
- **Ventas en las listas** (historial del turno, detalle del admin, ventas pasadas): el `select` de
  `ventas` es `COLUMNAS_VENTA` (`caja/api`), que trae `precio_lista`, `monto_descuento`,
  `descuento_nombre` y `venta_pagos(medio, monto)`. El medio se muestra con `MedioDeVenta` ("Mixto" +
  detalle "Efectivo $ 5.000,00 + Tarjeta $ 13.000,00" cuando `medio_pago` es NULL) y el descuento con
  `DescuentoDeVenta` (nombre, −monto, precio de lista; "—" sin descuento). Nunca indexar por
  `medio_pago` sin contemplar NULL.
- **Venta en la caja** (`FormularioVenta`): categoría → servicio → descuento (solo si
  `descuentos_para_servicio` trae opciones; "Sin descuento" marcado; si no se pueden leer, se sigue sin
  descuento y se avisa) → patente (**obligatoria**, migración 38: vacía no avanza y avisa "Ingresá la patente del vehículo.") → medio (Efectivo, Transferencia, Tarjeta, **Mixto**) → en Mixto
  (decisión 2026-11-23) el cajero escribe **solo el efectivo** (campo grande; > 0 y menor que el precio)
  y el resto (precio final − efectivo, `revisarPagoMixto`, solo vista previa) se ve en grande; Enter →
  "¿Con qué paga el resto?": Transferencia / Débito / Crédito (1/2 o flechas + Enter, `PasoRestoMixto`;
  Esc vuelve al efectivo) → cuánto entregó y el vuelto **sobre la parte en efectivo**.
  La vista previa usa el precio final de `descuentos_para_servicio` (o el del servicio sin descuento);
  la "Última venta" usa el `precio` que devolvió `registrar_venta` y avisa si el vuelto da negativo.
  **Precio esperado**: `useRegistrarVenta` manda siempre `p_precio_esperado` = el precio final en
  pantalla. Ante "El precio cambió…" (`esPrecioCambiado`) se muestra el mensaje, el catálogo ya está
  releído (la venta invalida servicios, categorías y `clavesDescuentos.paraServicios` en `onSuccess` y
  `onError`, que TanStack espera antes de rechazar `mutateAsync`) y el cajero vuelve al paso del
  descuento (o a la patente si no hay) con el reparto mixto y lo entregado en blanco: ve el precio
  nuevo y confirma otra vez. **Nunca se reintenta sola.** Si el descuento elegido ya no se ofrece
  (desactivado, quitado del servicio o redondea a $ 0), la venta **no** se registra sin él: "El
  descuento elegido ya no está disponible: elegí otro." y vuelve al paso del descuento (si no quedan
  otros, lo avisa y sigue sin descuento a la vista del cajero).
- Diálogos con una escritura en curso no se cierran (Esc, la X o clic afuera): `onOpenChange` ignora
  el cierre mientras la mutación está `isPending` (ej. `DialogoCerrarTurno`, `DialogoDisponibilidad`).
  Los números de paso de patente (3), medio (4), mixto (5) y efectivo (5; 6 en un mixto) no cambian con el paso
  de descuento (que no lleva número): los E2E los usan.
- Listados con "Ver más": `useInfiniteQuery` con cursor sobre `id` (`order("id", desc)` + `lt("id", …)`,
  `siguienteCursor` y `TAMANO_PAGINA` de `compartido/lib/paginacion.ts`), nunca `range` por posición.
  Una vista sin `id` propio se pagina con `siguienteCursorDe(ultima, fila => cursor)`: el libro de Fondos
  (`v_movimientos_fondos`) ordena por `(fecha desc, clave desc)` y pide la página siguiente con
  `or(fecha.lt."<fecha>",and(fecha.eq."<fecha>",clave.lt."<clave>"))`, la fecha tal cual llega (con microsegundos).
- shadcn: tras `add`, verificar que importe `cn` de `@/compartido/lib/utils` (el CLI a veces mete un paquete `cn` externo).
- Versiones: React 19, React Router 8, Vite 8, TS 6, Tailwind 4, ESLint 10 (flat config), Vitest 5.
  En React 19.3 `FormEvent` está deprecado: usar `SubmitEvent<HTMLFormElement>`.

## 3. Principios de arquitectura

- **La BD es la fuente de verdad del dinero y el stock.** El frontend nunca calcula saldos,
  costos ni stock: llama RPC y lee vistas.
- **Lecturas**: el cliente lee tablas/vistas con RLS. Todas las vistas son
  `security_invoker = true` (el admin ve todo; el cajero, lo que pasó en los turnos **abiertos** de
  todas las cajas —ventas, `venta_pagos`, gastos, comprobantes—; de los turnos cerrados nada,
  migración 33). `turnos` y `v_turnos` son **solo admin**: el cajero no lee el efectivo, las
  observaciones ni los totales de ningún turno; elige la caja con `v_turnos_abiertos` (sin dinero, lee
  de la RPC `turnos_abiertos()`) y las políticas preguntan con `turno_abierto(id)` (nunca un `exists`
  sobre `turnos`, que para el cajero devolvería vacío).
  Las vistas **solo admin** que leen tablas que el cajero sí ve en parte (`ventas`, `venta_pagos`,
  `gastos`) filtran además con `where (select public.es_admin())` (ej. `v_movimientos_fondos`,
  `v_ventas_mixtas`, migración 34): la RLS sola le mostraría al cajero lo de los turnos abiertos.
- **Costos de certificados (costo por hoja, costo promedio, valor de stock, costo de venta, margen)**:
  nadie los lee de tablas ni vistas (`certificados` y `ventas` tienen `grant select` por columna, sin
  costos). El admin los obtiene solo por RPC: `stock_certificados_valorizado()`, `resumen_diario()` y
  el kardex `movimientos_certificado` (RLS admin). Por eso en `certificados`/`ventas` **nunca `select *`**:
  pedir columnas explícitas. Una columna nueva en esas tablas no es legible hasta sumarla al grant.
- **Escrituras con reglas de negocio** (ventas, turnos, gastos, compras, ajustes, efectivo,
  alertas): solo vía RPC `security definer` con `set search_path = ''`. No hay grants de
  INSERT/UPDATE para esas tablas.
- **CRUD simple de catálogo** (cajas, categorías de servicio, servicios, certificados,
  categorías de gasto, descuentos, impuestos): el admin escribe directo en la tabla, con **grants por columna**
  (ej. `certificados.stock_hojas` y `costo_promedio` no son editables por nadie).
- **Usuarios**: alta, rol, activación y contraseña solo vía Edge Function `admin-usuarios`
  (usa service role). El perfil se crea por trigger desde `auth.users`
  (`user_metadata.nombre`, `app_metadata.rol`). Un trigger impide quedarse sin admin activo.
- **Efectivo**: todo movimiento de la caja de cambio (`caja_efectivo`, la caja general) pasa por
  `_mover_efectivo()` (bloquea la fila única, rechaza saldo negativo, escribe en `movimientos_efectivo`).
  El efectivo de un turno abierto (cajón) no es una tabla: lo calcula `_efectivo_en_caja(turno)` =
  efectivo inicial + la parte en efectivo de las ventas (`venta_pagos`) − gastos en efectivo, sin anulados (migraciones 27 y 30).
  La caja de cambio es la cuenta `efectivo` de **Fondos** (migración 34): su libro y su saldo no cambian.
- **Fondos** (migración 34, solo admin): cuentas `efectivo` (caja de cambio), `transferencia` y `tarjeta`.
  El libro de transferencia y tarjeta **se calcula** en la vista `v_movimientos_fondos` desde
  `venta_pagos`/`ventas`, `gastos` (+ `compras_certificado`) y los manuales de `movimientos_fondos`: no
  hay triggers que copien filas, así nunca se desincroniza. Los saldos y totales salen solo de
  `resumen_fondos()`; los manuales, solo de `movimiento_fondos()` (bloquea la fila de `cuentas_fondos`).
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
- **Turnos de caja compartida** (migración 33): el turno es de la **caja**, no de una persona. Toda RPC
  que trabaja en una caja recibe el turno explícito (`p_turno_id`) y lo valida con la interna
  `_turno_para_trabajar(turno, para_actualizar)` (existe, abierto, bloqueado; ventas `for share`,
  gastos `for update`). Nunca se busca "el turno del usuario". `turnos.usuario_id` es solo historia
  (turnos anteriores a la 33); quién vendió o gastó está en `ventas.usuario_id` / `gastos.usuario_id`.
- **Nombres de otros usuarios**: el cajero solo lee su propio perfil (ni email ni rol ajenos). Para
  mostrar quién hizo un movimiento, las vistas usan `nombre_usuario(uuid)` (solo nombre completo: el
  admin, de cualquiera; los demás, el propio y el de quien vendió o gastó en un turno abierto).
- **Pedidos con límite de tiempo** (`compartido/lib/red.ts`, en el cliente de Supabase): 15 s REST/auth,
  150 s Edge Functions. postgrest-js reintenta solo las lecturas; una escritura vencida muestra
  "La operación tardó demasiado" y nunca se reintenta sola.
- **Errores en la UI**: siempre `mensajeDeError(e, mensajes?)` (`compartido/lib/errores.ts`). Las RPC ya
  responden en español; los errores crudos de Postgres del CRUD directo (23505 repetido, 23503 en uso,
  23514 inválido, permisos) se traducen por código, con mensajes específicos por pantalla
  (ej. `MENSAJES_ERROR_CAJA`).
- **Validaciones genéricas** en `compartido/lib/validaciones.ts`: las primitivas que espejan reglas de
  la BD y usan varios módulos — `parsearMonto` (formato argentino `20.000,50`, mismas reglas que
  `_validar_monto`), `parsearEntero` (`1.000` sí, `2.5` no), `validarNombre`, `validarNota` y los
  `LARGO_MAXIMO_*` de los CHECK. Las reglas propias de un módulo van en `modulos/<m>/lib/`.
- **Caja de efectivo** (cuenta `efectivo` de Fondos): el saldo se lee solo con `useSaldoEfectivo`
  (`modulos/fondos/api/efectivo.ts`, también en la pantalla de Fondos); toda mutación que mueva efectivo
  invalida `claveEfectivo`. Toda venta, anulación, gasto, compra o corrección, apertura/cierre de turno y
  movimiento manual invalida además `claveFondos` (`modulos/fondos/api/claves.ts`, raíz de todo Fondos). **Solo el admin** lee el saldo y el libro
  (RLS, migración 26): el cajero no lo ve ni en el mensaje de "no alcanza" de un gasto.
- Nombres de catálogo: la BD los normaliza (trim + espacios simples) y son únicos sin distinguir mayúsculas.
- Catálogo con historial (servicios, cajas, certificados, categorías): en la UI se **desactiva**
  (`activo/activa = false`); borrar falla por FK si ya se usó en ventas, turnos o gastos.

## 4. Modelo de datos (`supabase/migrations/`, en orden)

| # | Migración | Contenido |
|---|---|---|
| 01 | `tipos` | Enums, `fecha_local`, `_texto_obligatorio` |
| 02 | `usuarios` | `perfiles`, trigger de alta, protección del último admin, `rol_actual()`, `es_admin()`, `_exigir_usuario()`, `_exigir_admin()` |
| 03 | `cajas_turnos` | `cajas`, `turnos` (índices únicos parciales: 1 turno abierto por caja y por usuario; el de usuario lo quita la 33) |
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
| 15 | `catalogo_nombres` | Nombres de cajas/categorías/servicios normalizados y únicos sin mayúsculas; `registrar_venta` rechaza servicios de categoría desactivada |
| 16 | `privilegios_funciones` | Quita EXECUTE de PUBLIC por defecto a nivel global (la 13 lo hacía por esquema, que no alcanza) y en todas las funciones existentes |
| 17 | `costos_solo_admin` | Grants por columna sin costos en `certificados`/`ventas`; `v_stock_certificados` sin costos; `v_resumen_diario` pasa a RPC admin `resumen_diario()`; `stock_certificados_valorizado()` |
| 18 | `certificados_admin` | Nombres de certificado normalizados y únicos sin mayúsculas; topes (hojas/unidad ≤ 10.000, stock mínimo ≤ 1.000.000); `registrar_compra_certificado` rechaza certificados desactivados y valida el total antes de guardarlo |
| 19 | `ajuste_stock_tope` | `ajustar_stock_certificado`: máximo 100.000 hojas por movimiento |
| 20 | `stock_tope` | Tope del stock acumulado por certificado (1.000.000.000 hojas): CHECK + mensaje claro en compra y ajuste |
| 21 | `corregir_compra` | Editar compras: `corregir_compra_certificado()` (anula la original revirtiendo hojas, costo promedio, gasto y efectivo, y registra la corregida), columnas `anulada*`/`reemplazada_por`, tipo de kardex `anulacion_compra`, vista `v_compras_certificado` (con `editable`) |
| 22 | `cajas_para_turno` | `cajas_para_turno()`: cajas activas con `ocupada`/`ocupada_por` (la RLS de `turnos` no deja ver los ajenos) |
| 23 | `facturacion_arca` | Configuración ARCA (fila única; certificado y clave en Vault), `arca_condiciones_iva` (de `FEParamGetCondicionIvaReceptor`), `comprobantes` (factura/NC, estados, numeración serializada), log `arca_intentos`, tickets WSAA, `preparar_factura()`, `puede_emitir_comprobante()`, internas `_arca_*` (solo service role), `anular_venta` genera la NC, vista `v_comprobantes` (con `qr_url`) |
| 24 | `arca_safeupdate` | `_arca_guardar_credenciales` y `_arca_actualizar_condiciones` con `WHERE` (pg-safeupdate rechazaba el UPDATE de la fila única) |
| 25 | `arca_emision_segura` | Numeración reservada mientras un número espera confirmación (índice `comprobantes_numeracion_reservada`); `toma` uuid que exigen todas las `_arca_*` de cierre (una ejecución vieja no pisa el estado); retomar una emisión colgada a los 10 min; foto del emisor en el comprobante (`emisor_*`, en `v_comprobantes`); el cajero espera 5 s entre intentos — auditoría 2026-11-20 |
| 26 | `nombre_apellido_efectivo_admin` | `perfiles.apellido` (NULL = falta completar, la app lo marca) y `nombre_completo` generada, que usan las vistas y `cajas_para_turno`; saldo y libro de efectivo solo admin; `_mover_efectivo` no revela el saldo al cajero y muestra montos en formato argentino; vista `v_movimientos_efectivo` — decisiones 2026-11-21 |
| 27 | `turno_efectivo_inicial` | Solo el admin abre turnos: `abrir_turno(caja, usuario, efectivo_inicial)` saca el efectivo inicial de la caja de cambio (`apertura_turno`); ventas y gastos en efectivo del turno quedan en el cajón (`_efectivo_en_caja`) y `cerrar_turno` devuelve el total a la caja de cambio (`cierre_turno`, foto en `turnos.efectivo_cierre`); `registrar_gasto(..., p_del_turno)`; gastos del admin y compras sin turno; `v_turnos` con `efectivo_inicial`, `gastos_efectivo`, `efectivo_en_caja`; rubro activo en gastos; nombres de categorías de gasto normalizados y únicos sin mayúsculas por rubro — decisiones 2026-11-21. Exige que no haya turnos abiertos al aplicarse |
| 28 | `turno_efectivo_cierre` | `v_turnos.efectivo_en_caja` = foto del cierre en turnos cerrados (NULL en los anteriores a la 27) y columna `efectivo_cierre`; `cajas_para_turno()` solo admin; **service_role sin DML por defecto** (como en la nube) y grants explícitos: arca (lectura de config, condiciones, comprobantes, ventas —por columna desde la 32—) y admin-usuarios (`perfiles`: lee id, nombre, apellido, nombre_completo, email, rol, activo; actualiza nombre, apellido, rol, activo) |
| 29 | `ventas_pasadas` | Ventas con fecha pasada (solo admin): `ventas.turno_id` NULL + `cargada_en` (CHECK: sin turno ⇔ cargada), `registrar_venta_pasada()`; `anular_venta` de una venta sin turno devuelve el efectivo desde la caja de cambio; trigger que impide facturarlas — decisiones 2026-11-21 |
| 30 | `pago_mixto` | `venta_pagos(venta_id, medio, monto)` = fuente de verdad del cobro (una fila por medio; relleno de las ventas existentes); `ventas.medio_pago` NULL = mixto; trigger de restricción **diferido** de coherencia ventas ↔ pagos; `registrar_venta(..., p_pagos jsonb)`; `_efectivo_en_caja`, `cerrar_turno`, `v_turnos`, `resumen_diario`, `anular_venta` reparten por las partes; `v_movimientos_caja.medio = 'mixto'` + columna `pagos`; internas `_validar_pagos_mixtos`, `_pesos` — decisiones 2026-11-22 |
| 31 | `descuentos` | Catálogo `descuentos` (porcentaje / monto fijo, CRUD admin por columna; el cajero lee los activos), `descuento_servicios` (disponibilidad por servicio, se fija con `fijar_servicios_descuento()`), `descuentos_para_servicio()`, `registrar_venta(..., p_descuento_id, p_precio_esperado)` con foto en `ventas` (`descuento_*`, `precio_lista`, `monto_descuento`; CHECK: valor sin NaN, nombre ≤ 100 y monto coherente con tipo/valor/precio de lista), `v_movimientos_caja` con el descuento, `resumen_descuentos()` — decisiones 2026-11-22 |
| 32 | `service_role_ventas_columnas` | service_role lee de `ventas` solo `id`, `turno_id`, `servicio_nombre`, `patente` (las que usa `v_comprobantes` para la Edge Function `arca`); antes leía la tabla entera, costos incluidos — auditoría 2026-11-22 |
| 33 | `turnos_caja_compartida` | El turno es de la caja: `abrir_turno(p_caja_id, p_efectivo_inicial)` sin usuario (`turnos.usuario_id` NULL, queda como historia; se quita "1 turno abierto por usuario"); `registrar_venta(p_turno_id, ...)` y `registrar_gasto(..., p_turno_id)` con turno explícito (interna `_turno_para_trabajar`); `cerrar_turno(p_turno_id, p_observaciones)` solo admin; RLS: `turnos`/`v_turnos` solo admin; el cajero lee ventas/pagos/gastos/comprobantes de turnos abiertos (nada de los cerrados) vía `turno_abierto(id)`; `cerrado_en = clock_timestamp()`; `comprobantes.actualizado_por` (lo carga `preparar_factura` al corregir, en `v_comprobantes`); facturar (`preparar_factura`, `puede_emitir_comprobante`): el cajero, cualquier venta de un turno abierto; `nombre_usuario(uuid)`; `v_turnos` sin cajero (+ `abierto_por`, `abierto_por_nombre`, `atendido_por`); vista `v_turnos_abiertos` (sobre `turnos_abiertos()`, sin dinero); `cajas_para_turno()` → `(id, nombre, ocupada, turno_id, abierto_en)`; firmas viejas borradas — decisión 2026-11-22. Se aplica con o sin turnos abiertos (los abiertos pasan a ser de la caja) |
| 34 | `fondos` | Sección **Fondos** (solo admin): enums `cuenta_fondos` (efectivo, transferencia, tarjeta) y `tipo_mov_fondos` (fondo_inicial, ingreso, retiro); `cuentas_fondos` (una fila por cuenta, para el `for update` de los retiros); `movimientos_fondos` (manuales de transferencia/tarjeta, monto con signo, nota ≤ 500, CHECK anti-NaN y de signo); vista calculada `v_movimientos_fondos` (libro unificado de las tres cuentas, con reversos de anulaciones); `v_ventas_mixtas` (informativa); `movimiento_fondos()`, `resumen_fondos()`, `resumen_ventas_mixtas()` — decisiones 2026-11-22 |
| 35 | `ventas_tiempo_real` | `v_turnos.fecha_apertura` (día de negocio de la apertura, al final de la vista); `resumen_turnos(p_desde, p_hasta)` (totales sumados de los turnos abiertos en el rango, solo admin); Realtime de `ventas`, `venta_pagos`, `gastos`, `turnos` y `comprobantes` (la RLS y los grants por columna de cada suscriptor filtran lo que llega: los costos nunca viajan) — decisión 2026-11-23 |
| 36 | `impuestos` | Sección **Impuestos** (solo admin, es un reporte): enum `tipo_impuesto` (porcentaje, monto_fijo por venta); `impuestos` (nombre, tipo, valor, `medios medio_pago[]` —al menos uno, sin repetidos—, `todos_servicios`, activo; CRUD admin por columna), `impuesto_servicios`; foto `venta_impuestos` (una fila por venta, impuesto y medio) calculada por el trigger de sentencia `venta_pagos_impuestos` (interna `_calcular_impuestos_venta`); `fijar_servicios_impuesto()`, `resumen_impuestos()` — decisiones 2026-11-23 |
| 37 | `dashboard` | Dashboard del admin (solo lectura): `ventas_por_dia(desde, hasta)` (un día por fila hasta hoy, máx. 366 días), `resumen_dashboard(desde, hasta, turno)` (total, servicio, categoría, descuento) y `resumen_gastos(desde, hasta, turno)` (total, compra de certificados, otros gastos, rubro, subcategoría); interna `_validar_rango_reporte` — decisiones 2026-11-23 |
| 38 | `patente_obligatoria` | Trigger `ventas_patente_obligatoria` (BEFORE INSERT): toda venta con turno lleva patente (22023 "Ingresá la patente del vehículo"); las ventas con fecha pasada siguen con patente opcional y las viejas sin patente no cambian — decisión 2026-11-23 |

Reglas que no son obvias leyendo una sola tabla:
- **Certificado a usar**: el activo más específico (servicio > categoría > global).
- **Venta sin stock** (o sin certificado configurado): se registra igual, `sin_stock = true`,
  costo 0, y se inserta una alerta `venta_sin_stock`. El stock nunca baja de 0.
- **Stock bajo**: alerta `stock_bajo` solo al *cruzar* `stock_minimo` hacia abajo con una venta.
- **Compra**: suma hojas (`unidades × hojas_por_unidad`), recalcula costo promedio ponderado
  y crea automáticamente un gasto en la categoría con `sistema = 'compra_certificados'`
  (Insumos › Compra de certificados), que no se carga a mano ni se anula.
- **Ajuste de stock**: valuado al costo promedio vigente, no lo modifica, no genera gasto.
- **Compra de un certificado desactivado**: se rechaza (hay que activarlo antes). El ajuste sí se permite.
- **Editar una compra** (solo admin, motivo obligatorio): solo la **última** del certificado, sin ventas,
  ajustes ni compras posteriores (así el costo de ventas ya hechas nunca cambia). Se anula la original
  (vuelven sus hojas, el costo promedio anterior, se anula su gasto y, si fue en efectivo, vuelve el
  dinero) y se registra la corregida con la misma presentación, todo en una transacción. La original
  queda tachada con motivo y enlazada (`reemplazada_por`). Si ya hubo movimientos: ajuste de stock.
- **Categoría desactivada**: sus servicios no se pueden vender (lo controla `registrar_venta`).
- **Gastos sin tope**: el cajero puede cargar gastos de cualquier monto (decisión del negocio); la
  garantía es que todo queda registrado (usuario, turno, caja, nota) y solo el admin anula.
  Con cajas compartidas (migración 33) el cajero puede gastar en efectivo contra el cajón de
  **cualquier** caja abierta, no solo la que eligió: se acepta así (decisión del negocio,
  2026-11-22, tras la auditoría), sin tope ni "presencia"; el admin ve quién cargó cada gasto ("Cargó").
- **Costos de certificados solo para el admin** (decisión del negocio): ver §3 "Costos" y la migración 17.
- **Anular venta** (solo admin): la hoja NO vuelve al stock; si fue en efectivo, el monto sale del
  cajón si el turno sigue abierto, o de la caja de cambio si ya cerró (si no alcanza, se rechaza).
- **Gastos**: siempre a una subcategoría activa de un rubro activo; `habilitada_caja` solo existe en
  subcategorías. El cajero necesita turno abierto y categoría habilitada y paga con el cajón (si no
  alcanza, se rechaza sin decirle montos). El admin desde `/admin/gastos` paga con la caja de cambio y
  el gasto no queda en ningún turno; desde `/caja` (`p_turno_id` de la caja donde trabaja) paga con ese
  cajón. El cajero siempre pasa `p_turno_id` (la caja elegida). Las compras
  de certificados nunca van a un turno. Anular un gasto en efectivo lo devuelve al cajón (turno abierto)
  o a la caja de cambio.
- **Turnos y efectivo** (decisiones del negocio, 2026-11-21 y 2026-11-22): solo el admin abre turnos,
  **de una caja y sin elegir quién atiende**, con un **efectivo inicial obligatorio > 0** para cambio,
  que sale de la caja de cambio. **Cualquier usuario activo (cajero o admin) trabaja en cualquier caja
  con turno abierto** y varios comparten el mismo cajón; cada venta y cada gasto guardan quién los hizo.
  En `/caja` (cajero y admin) el usuario elige la caja abierta donde trabaja (`v_turnos_abiertos`,
  reconsultada cada 15 s) y toda venta/gasto manda ese `p_turno_id`: con una sola queda elegida; con
  varias elige en una lista y cambia con el selector "Estás trabajando en" de arriba; se recuerda la
  última caja elegida (`localStorage` "vtv-caja-elegida", id de la caja; solo comodidad, se valida que
  siga abierta). Si la caja elegida se cierra (deja de estar en la lista o la venta responde "ya se
  cerró") vuelve a la elección con un aviso y **nunca pasa sola a otra caja** (es otro cajón). Lógica en
  `modulos/caja/lib/caja-elegida.ts`. Sin cajas abiertas ve "Esperá que el administrador abra una caja"
  (el admin, un botón "Abrir turno"). El historial y los gastos de la caja muestran quién hizo cada
  movimiento ("Vendió" con `nombre_usuario`, "Cargó" con `usuario_nombre`). **Solo el admin cierra** (`cerrar_turno(p_turno_id, ...)`). Se
  abren y cierran desde la **barra superior fija** (ver "Barra de turnos"). Al cerrar, el efectivo del cajón vuelve a la caja de cambio; el
  admin lo ve en el detalle del turno ("Efectivo de la caja"). En un turno cerrado el detalle separa la
  **foto del cierre** (efectivo inicial, ventas en efectivo al cerrar = `total_efectivo`, efectivo
  devuelto = `efectivo_cierre`) de lo de **hoy en vivo** (ventas y gastos en efectivo sin anuladas):
  lo que se anule después sale de la caja de cambio y no cambia la foto (`v_turnos` no guarda foto de
  los gastos en efectivo, por eso solo se muestran en vivo). El efectivo del cajón (inicial, en caja,
  al cierre) es **solo del admin también por seguridad** (RLS de `turnos`, auditoría 2026-11-22): el
  cajero no lee `turnos` ni `v_turnos`. El admin atendiendo una caja carga gastos en cualquier subcategoría.
- **Totales de turno**: `cerrar_turno` guarda una foto en `turnos.total_*`; `v_turnos` los
  calcula en vivo. Los anulados nunca suman.
- **El cajero no ve totales** (decisión del negocio, 2026-11-20): en `/caja` ve solo la lista de ventas
  y gastos del turno de la caja donde trabaja (de todos los que vendieron, con quién hizo cada una;
  sin sumas). Los totales por medio, gastos y neto los ve el admin en `/admin/ventas` (lee `v_turnos`).
  No hay arqueo al cerrar. Desde la migración 33 es también **regla de seguridad** para los datos del
  turno: la RLS de `turnos` es solo admin, así que el cajero no lee `efectivo_inicial`, `efectivo_en_caja`,
  `efectivo_cierre`, `observaciones` ni los totales (`v_turnos` le devuelve 0 filas). Lo único que
  podría sumar por su cuenta es el precio de cada venta y el monto de cada gasto que ve en la lista de
  los turnos abiertos (sin el efectivo inicial, no llega al efectivo del cajón). La caja de cambio
  (saldo y libro) es solo del admin (RLS).
- **Usuarios: nombre y apellido** (decisión 2026-11-21): obligatorios al crear y editar (Edge Function
  y UI). Los que vienen de antes con una sola palabra (ej. el primer admin del Dashboard) quedan con
  `apellido` NULL y la pantalla de usuarios los marca "Falta el apellido". Las vistas muestran
  `nombre_completo`.
- **Gastos del cajero**: carga en subcategorías habilitadas para la caja, en la caja donde trabaja
  (`p_turno_id`), y ve la lista de los gastos de ese turno, **sin totales ni saldo**. El admin carga en cualquier subcategoría (con o sin turno), anula
  y administra rubros/subcategorías (`habilitada_caja`, activar/desactivar) en `/admin/gastos`.
- **Barra de turnos** (decisión 2026-11-22): la barra superior es **fija** (`sticky top-0`) en el panel
  y en la caja. En el panel del admin (desde `md`) el contenido tiene **scroll propio** (`<main
  data-testid="contenido-admin">` con `overflow-y-auto`; el layout ocupa la ventana con `h-svh`): el menú
  y la barra quedan fijos y, al cambiar de pantalla, el contenido vuelve arriba. En el celular, scroll normal. El admin ve siempre **"Abrir turno"** y **"Cerrar turno"** (en `/admin/*` y en `/caja`)
  y, fuera de `/caja`, **"Ir a la caja"** si hay alguna caja abierta (solo con la consulta ya respondida).
  "Abrir turno" abre el modal **sin "Atiende"** (el turno es de la caja, migración 33): caja (la
  **primera libre ya elegida**, orden de `cajas_para_turno`, se puede cambiar) y efectivo inicial; sin
  cajas libres lo explica y no deja enviar. "Cerrar turno" lista los turnos abiertos (`v_turnos` con
  `abierto = true`: caja, desde cuándo, quiénes atendieron —`atendido_por`—; si hay uno solo ya queda
  elegido) y llama `cerrar_turno(p_turno_id, p_observaciones)`; sin turnos abiertos queda deshabilitado
  con el motivo. **El cajero no cierra turnos**: no tiene botón de cerrar. En el detalle de un turno el
  botón es "Cerrar este turno".
  En pantallas chicas los botones de la barra quedan solo con ícono (nombre accesible por `aria-label`).
  Después de abrir no se navega. Abrir y cerrar invalidan `["turnos"]` (`v_turnos`, turnos abiertos y
  cajas abiertas de `/caja`), `["caja"]` (cajas para turno, historial), `claveEfectivo` y `claveFondos`. Tema claro/oscuro propio (`compartido/lib/tema.ts` + `ProveedorTema`; clase `dark`, guardado en `localStorage` "vtv-tema", aplicado antes de pintar por el script de `index.html`). No usar `next-themes`: renderiza un `<script>` dentro de React y React 19 lo rechaza en una SPA.
- **Ventas con fecha pasada** (decisión del negocio, 2026-11-21): carga histórica, solo el admin, en
  `/admin/ventas/pasadas`. Elige fecha y hora (hora AR, anterior a este momento, desde 2000), caja,
  servicio (también desactivados), medio de pago, precio (propone el actual; acepta $ 0) y patente.
  **Sin turno** (no tocan totales ni fotos de turnos), `creado_en` = fecha elegida (los reportes por
  día la cuentan ahí) y `cargada_en` = cuándo se cargó. **No descuentan hojas** ni generan alertas.
  En efectivo, **el monto entra a la caja de cambio** al cargarla; anularla lo saca de ahí. **No se
  facturan** (trigger en `comprobantes`).
- **Pago mixto** (decisión del negocio, 2026-11-22): una venta con turno (cajero o admin atendiendo una
  caja) se cobra con 2 o 3 medios **distintos** (la BD acepta los dos; la caja arma efectivo + transferencia o tarjeta), cada parte > 0 (`_validar_monto`), que suman el precio
  final. El cobro vive en `venta_pagos` (una fila por medio, también en las ventas simples, las pasadas
  y las anuladas); `ventas.medio_pago` es el medio si fue uno solo y **NULL si fue mixto** (no se agregó
  'mixto' al enum: `sql:produccion` corre todo en una transacción y un valor nuevo de enum no se puede
  usar en la misma transacción; además 'mixto' no debe poder aparecer como medio de una parte). Un
  trigger de restricción diferido exige al cerrar la transacción que los pagos sumen el precio y
  coincidan con `medio_pago`. **Todo total por medio se calcula desde `venta_pagos`**, nunca desde
  `ventas.medio_pago`. Solo la parte en efectivo entra al cajón y, al anular, vuelve solo esa parte
  (del cajón si el turno sigue abierto; si no, de la caja de cambio). Las ventas pasadas: un solo medio.
- **Descuentos** (decisión del negocio, 2026-11-22): catálogo del admin (`/admin/descuentos`) con tipo
  porcentaje (0 < valor < 100) o monto fijo; se habilita **por servicio** (`fijar_servicios_descuento`
  con el conjunto final; el switch de categoría es un atajo de la UI y un servicio nuevo no se suma
  solo). Un descuento opcional por venta, solo con turno, activo y habilitado para el servicio. La BD
  calcula: descuento = porcentaje redondeado a 2 decimales o el monto fijo; `precio` = lista −
  descuento, **> 0**. La venta guarda una foto (`descuento_id/nombre/tipo/valor`, `precio_lista`,
  `monto_descuento`): editar el descuento después no la cambia. `precio` sigue siendo lo cobrado: el
  pago mixto, los totales, el cajón, los reportes, la factura y la anulación usan el precio final.
  Ventas viejas y pasadas: sin descuento (`precio_lista = precio`, monto 0). Un descuento usado no se
  borra (FK): se desactiva. En `/admin/descuentos`: lista (nombre, tipo, valor "10 %" / "$ 2.000,00",
  cantidad de servicios, switch activo), alta/edición con las validaciones de los CHECK
  (`descuentos/lib/validaciones.ts`), diálogo "Servicios" con todas las categorías y todos sus servicios
  (desactivados marcados; el switch de categoría prende/apaga todos y muestra "Parcial: x de n") que
  guarda el conjunto con `fijar_servicios_descuento`, y estadísticas de `resumen_descuentos` (por
  defecto el mes actual: cantidad, total descontado, ranking por descuento y por servicio). Las
  mutaciones de descuentos invalidan `["descuentos"]` (lista, `descuentos_para_servicio` y estadísticas);
  también las del catálogo de servicios (precio, activar/desactivar servicio o categoría). Las ventas y
  anulaciones invalidan las estadísticas, y la venta (ok o rechazada) además los
  `descuentos_para_servicio`. Las claves viven en `compartido/lib/claves-descuentos.ts` (las usan
  `descuentos`, `caja` y `servicios`; así `servicios` no importa de `descuentos` y no hay ciclo).
- **Ventas del admin** (decisión 2026-11-23): `/admin/ventas` muestra arriba los **turnos abiertos en
  vivo** (`v_turnos` con `abierto = true`; con varios, una pestaña por caja): totales por medio,
  gastos, neto, efectivo en caja y la lista de ventas (con factura y "Anular"); abajo el **historial de
  turnos** filtrado por **fecha de apertura** (`SelectorRango` sobre `v_turnos.fecha_apertura`, por
  defecto el mes actual) con los totales del período (`resumen_turnos`, los suma la BD) y la tabla con
  los totales de cada turno. El detalle permite anular ventas (`anular_venta`) y cerrar un turno
  abierto (`cerrar_turno(p_turno_id)`). **Tiempo real**: `useVentasEnVivo` (`ventas/api/tiempo-real.ts`,
  en la lista y en el detalle) se suscribe a `postgres_changes` de `ventas`, `venta_pagos`, `gastos`,
  `turnos` y `comprobantes` y, agrupando los eventos (400 ms), invalida `["turnos"]`, `["caja",
  "ventas"]` y `["facturacion", "turno"]`: el evento es solo un aviso, los datos se vuelven a leer de
  las vistas. Al reconectarse vuelve a consultar todo. Arriba, el estado: "En vivo" / "Conectando…" /
  "Sin conexión en vivo" + botón "Actualizar". Los tests unitarios simulan Realtime con
  `emitirCambio(tabla)` y `cambiarEstadoCanales(estado)` de `tests/soporte/supabase-falso.ts`.
- **Dashboard** (decisiones del negocio, 2026-11-23; solo admin, portada `/admin`, módulo `dashboard`,
  todo con shadcn: Card, Chart sobre Recharts, Select, Table): arriba **"Ventas de esta semana"** en barras
  de lunes a domingo (`semanaActual` de `compartido/lib/periodo.ts`, hora AR; "Del lunes dd/mm/aaaa al
  domingo dd/mm/aaaa"): `ventas_por_dia` trae solo los días que ya pasaron, así que un lunes hay una sola
  barra; abajo el día que más se vendió y cada día con total y cantidad. Después, con `FiltroPeriodo`
  (**Año** + **Mes**, "Todo el año" = el año entero, o **Turno**; siempre muestra "Del dd/mm/aaaa al
  dd/mm/aaaa" o el turno): ventas, total vendido y descuentos realizados; servicios y categorías más
  vendidos (por cantidad); descuentos (ventas, cobrado, descontado); gastos (total, compra de
  certificados, otros gastos) y en qué se gastó más (por rubro y por subcategoría); impuestos con el mismo
  filtro (`resumen_impuestos`: total, por medio de pago y por impuesto). Cada gráfico es de
  una serie, con tooltip y la tabla de los mismos números debajo. Las consultas se repiten cada vez que
  se entra (`staleTime: 0`, `refetchOnMount: "always"`): no hace falta invalidarlas desde otras pantallas.
  Ningún total se calcula en el frontend.
- **Impuestos** (decisiones del negocio, 2026-11-23; solo admin, `/admin/impuestos`): **no cambian lo
  que paga el cliente** (precio, cobro, cajón, factura y Fondos siguen igual): de cada venta la BD
  calcula cuánto corresponde a cada impuesto y lo guarda como **foto** en `venta_impuestos` al
  registrarse (también las ventas con fecha pasada). Cambiar, desactivar o crear un impuesto rige para
  las ventas que vienen; las anteriores no cambian. Un impuesto alcanza a **todos los servicios**
  (`todos_servicios`, también los futuros) o a una lista, y a **uno o más medios de pago**. Cálculo:
  base alcanzada = lo pagado con medios del impuesto (`venta_pagos`); porcentaje → round(base × valor /
  100, 2); monto fijo → **por venta**, prorrateado por la parte pagada con medios alcanzados (venta
  entera alcanzada o precio $ 0 → el valor entero). El total se reparte entre los medios alcanzados en
  proporción a lo pagado (pago mixto) y la parte más grande se lleva el redondeo: la suma da exacto.
  Lo calcula un trigger de sentencia sobre `venta_pagos` (las RPC insertan todos los pagos de una venta
  en una sentencia): ninguna venta queda sin calcular. Las anuladas conservan su foto y el reporte las
  excluye. Un impuesto usado no se borra (FK): se desactiva. Pantalla: catálogo (nombre, tipo, valor
  "3 %" / "$ 150,00 por venta", medios "Todos" / "Efectivo y Tarjeta", servicios "Todos" / "n
  servicios", switch activo), diálogo de alta/edición con switches de medios ("Todos los medios de
  pago" + uno por medio), diálogo "Servicios" (switch "Todos los servicios" o `SelectorServicios` de
  `servicios/componentes`, compartido con descuentos) y **reporte** de `resumen_impuestos`: filtro
  **Año** (del siguiente al 2000) + **Mes** ("Todo el año" = el año entero; un mes = ese mes;
  `impuestos/lib/periodo.ts`) + **Turno** opcional (turnos abiertos en el período; con un turno se
  filtra solo por el turno), tarjeta de totales (total, efectivo, transferencia, tarjeta, ventas
  alcanzadas) y tabla por impuesto. Las ventas, anulaciones y ventas pasadas invalidan
  `clavesImpuestos.resumenes` (`compartido/lib/claves-impuestos.ts`).
- **Fondos** (decisión del negocio, 2026-11-22; reemplaza a "Caja de efectivo", solo admin): pestañas
  **Efectivo · Transferencia · Crédito/Débito · Mixto**. Crédito/Débito es la cuenta `tarjeta` (un solo
  `medio_pago = 'tarjeta'`, no se separa). Todo sale de la BD, sin cargar nada a mano por operación:
  - **Efectivo** = la caja de cambio de siempre (`movimientos_efectivo`, mismas reglas). Las ventas en
    efectivo de un turno abierto están en el cajón: entran a esta cuenta con el `cierre_turno`.
  - **Transferencia / tarjeta**: ingresos = cada fila de `venta_pagos` del medio con monto > 0 (incluye
    la parte de un pago mixto y las ventas pasadas, en su `creado_en`). Egresos de transferencia = gastos
    con `fuente = 'transferencia'`; **una compra de certificados se cuenta por su gasto automático**
    (`compras_certificado.gasto_id`; la fila de la compra solo aporta `compra_id` y el certificado), así
    nunca se cuenta dos veces. La tarjeta no tiene egresos automáticos (`fuente_fondos` no la incluye).
  - **Anulaciones**: el movimiento original queda en su fecha y se agrega un **reverso** con fecha de
    anulación (`ventas.anulada_en`, `gastos.anulado_en`). Corregir una compra anula su gasto (reverso
    `compra_anulada`) y la corregida trae el suyo.
  - **Saldo negativo**: los egresos automáticos nunca se rechazan (como siempre), así que el saldo de
    transferencia puede quedar negativo y se muestra así. Un **retiro manual** no puede dejar la cuenta en
    negativo (P0001 "No alcanza el saldo de transferencias: hay $ X y el retiro es de $ Y"); los retiros
    se serializan con `for update` sobre `cuentas_fondos`.
  - **Manuales**: `movimiento_fondos(cuenta, tipo, monto, nota)` para las tres cuentas (en `efectivo`
    deriva en `movimiento_efectivo`: misma regla y mismo libro).
  - **Mixto es informativa**: sin saldo ni manuales. Cada parte de una venta mixta ya está en su cuenta
    (transferencia/tarjeta como `venta`; efectivo vía cajón → cierre de turno). `v_ventas_mixtas` y
    `resumen_ventas_mixtas()` (con `incluido_en_cuentas = true`) **nunca se suman** a las cuentas.
  - **Totales** (`resumen_fondos`): saldo de todos los tiempos; en el rango, `ingresos` = suma de las
    filas de sentido ingreso (ventas menos sus anulaciones, ingresos manuales, cierres de turno),
    `egresos` = −suma de las de sentido egreso (gastos y compras menos sus anulaciones, retiros,
    aperturas de turno), `neto` = ingresos − egresos = suma del libro en el rango.
  - **Diferencia con `resumen_diario`**: `resumen_diario` (y `resumen_ventas_mixtas`) excluyen las ventas
    anuladas en el día de la venta, aunque se hayan anulado después (el pasado cambia); Fondos deja la
    venta en su día y resta el reverso el día de la anulación (el pasado no cambia). En un rango sin
    anulaciones, `total_transferencia`/`total_tarjeta` de `resumen_diario` = `ingresos` de esa cuenta.
    El efectivo no se compara: `resumen_diario.total_efectivo` es lo cobrado en efectivo (cajón incluido)
    y la cuenta `efectivo` es la caja de cambio.
  - **Pantalla** `/admin/fondos` (módulo `fondos`; `/admin/efectivo` redirige a `?pestana=efectivo`):
    arriba Desde/Hasta (`SelectorRango`, por defecto el mes actual en hora AR) y una tarjeta por cuenta
    con el saldo actual (efectivo: `useSaldoEfectivo`; transferencia y crédito/débito: `resumen_fondos`)
    e ingresos, egresos y neto del rango; saldo o neto negativo en rojo. Pestañas (shadcn Tabs) Efectivo ·
    Transferencia · Crédito/Débito · Mixto: la elegida va en la URL (`?pestana=`) y se recuerda en
    `localStorage` "vtv-fondos-pestana" (con try/catch; la URL gana). Cada cuenta: saldo, botones
    "Fondo inicial" (efectivo) o "Saldo inicial" (las otras), "Ingreso" y "Retiro" (`parsearMonto`,
    nota obligatoria ≤ 500; efectivo usa `movimiento_efectivo`, que devuelve el saldo para el aviso; las
    otras, `movimiento_fondos`; el rechazo "No alcanza el saldo…" se muestra en el diálogo) y el libro
    del rango ("Del dd/mm/aaaa al dd/mm/aaaa"; fecha, origen legible, descripción + nota, caja, quién,
    monto con signo: ingresos en verde, egresos en rojo; marcas "Reverso", "Mixto" y "Fecha pasada";
    en efectivo además el saldo después de cada movimiento, de `v_movimientos_efectivo`) con "Ver más".
    Mixto: aviso fijo de que ya está incluido en las otras pestañas, tarjetas de `resumen_ventas_mixtas`
    y la lista de `v_ventas_mixtas` con el reparto por medio (anuladas tachadas) y "Ver más".
    Tablas con scroll propio en móvil. Ningún total se calcula en el frontend.

## 5. Contrato de RPC

Todas requieren usuario autenticado y **activo**. Devuelven la fila afectada.

| RPC | Quién | Notas |
|---|---|---|
| `abrir_turno(p_caja_id bigint, p_efectivo_inicial numeric) → turnos` | admin | Turno de la caja, sin usuario (`usuario_id` NULL, `abierto_por` = admin). Caja activa y libre; el efectivo inicial (> 0) sale de la caja de cambio |
| `cerrar_turno(p_turno_id bigint, p_observaciones text = null) → turnos` | admin | Cualquier turno abierto. El efectivo del cajón vuelve a la caja de cambio |
| `registrar_venta(p_turno_id bigint, p_servicio_id bigint, p_medio_pago medio_pago = null, p_patente text = null, p_pagos jsonb = null, p_descuento_id bigint = null, p_precio_esperado numeric = null) → ventas` | todos | `p_turno_id` **obligatorio**: turno abierto de la caja donde se trabaja (NULL → 22023 "Elegí la caja en la que estás trabajando"; inexistente → 22023; cerrado → P0001 "El turno de la caja "X" ya se cerró: elegí una caja abierta"). `usuario_id` = quien vende. Un medio (`p_medio_pago`) **o** pago mixto (`p_pagos` = `[{"medio":"efectivo","monto":5000},{"medio":"tarjeta","monto":13000}]`, 2–3 medios distintos que suman el precio final), nunca los dos. `p_descuento_id` opcional (activo y habilitado para el servicio). `p_precio_esperado` opcional = precio final que vio el cajero: monto válido o `0` exacto (servicio de $ 0); si no coincide con el calculado, P0001 "El precio cambió: ahora es $ X. Revisá la venta." (sin el parámetro no se compara). Patente **obligatoria** (migración 38; 22023 "Ingresá la patente del vehículo") y se normaliza (mayúsculas, sin espacios). `ventas.id` = número de venta |
| `descuentos_para_servicio(p_servicio_id bigint) → setof (id, nombre, tipo, valor, precio_lista, monto_descuento, precio_final)` | todos | Descuentos activos habilitados para el servicio que descuentan algo (monto redondeado > 0) y dejan precio final > 0, con los montos calculados por la BD. Vacío si el servicio o su categoría están desactivados |
| `fijar_servicios_descuento(p_descuento_id bigint, p_servicio_ids bigint[]) → descuentos` | admin | Reemplaza de una vez (atómico) los servicios donde se puede usar; `'{}'` = ninguno |
| `resumen_descuentos(p_desde date = null, p_hasta date = null) → setof (agrupacion, id, nombre, cantidad_ventas, total_descontado)` | admin | Sin anuladas, rango por día de negocio. `agrupacion` = `total` (1 fila, id NULL) · `descuento` · `servicio` (nombres actuales del catálogo); en ese orden y de mayor a menor total descontado |
| `registrar_venta_pasada(p_fecha date, p_hora time, p_caja_id bigint, p_servicio_id bigint, p_medio_pago medio_pago, p_precio numeric, p_patente text = null) → ventas` | admin | Sin turno ni hoja de certificado; efectivo a la caja de cambio; no facturable |
| `anular_venta(p_venta_id bigint, p_motivo text) → ventas` | admin | Motivo obligatorio |
| `registrar_gasto(p_categoria_id bigint, p_monto numeric, p_fuente fuente_fondos, p_nota text, p_turno_id bigint = null) → gastos` | todos | Nota obligatoria. Cajero: `p_turno_id` obligatorio (turno abierto, mismas validaciones que `registrar_venta`) + categoría habilitada; paga con ese cajón. Admin: con `p_turno_id` paga con el cajón de esa caja; sin él, caja de cambio y sin turno |
| `anular_gasto(p_gasto_id bigint, p_motivo text) → gastos` | admin | No aplica a gastos de compra de certificados |
| `registrar_compra_certificado(p_certificado_id bigint, p_unidades int, p_costo_unidad numeric, p_fuente fuente_fondos, p_proveedor text = null) → compras_certificado` | admin | Para la UI: hojas = `unidades × hojas_por_unidad`, costo/hoja = `costo_unidad / hojas_por_unidad` |
| `corregir_compra_certificado(p_compra_id bigint, p_unidades int, p_costo_unidad numeric, p_fuente fuente_fondos, p_proveedor text, p_motivo text) → compras_certificado` | admin | Devuelve la compra corregida. Rechaza si no es el último movimiento del certificado o ya fue corregida |
| `ajustar_stock_certificado(p_certificado_id bigint, p_hojas int, p_nota text) → movimientos_certificado` | admin | `p_hojas` con signo, ≠ 0 |
| `movimiento_efectivo(p_tipo tipo_mov_efectivo, p_monto numeric, p_nota text) → movimientos_efectivo` | admin | Solo `fondo_inicial`, `ingreso`, `retiro`; monto positivo |
| `movimiento_fondos(p_cuenta cuenta_fondos, p_tipo tipo_mov_fondos, p_monto numeric, p_nota text) → v_movimientos_fondos` | admin | Manual en cualquier cuenta (`efectivo` deriva en `movimiento_efectivo`). Monto > 0 (`_validar_monto`; el retiro resta), nota obligatoria ≤ 500. Un retiro no deja la cuenta en negativo (P0001). Devuelve la fila del libro |
| `fijar_servicios_impuesto(p_impuesto_id bigint, p_todos boolean, p_servicio_ids bigint[]) → impuestos` | admin | `p_todos = true`: todos los servicios (también los futuros; la lista queda vacía). Si no, reemplaza la lista de una vez (`'{}'` = ninguno) |
| `resumen_impuestos(p_desde date = null, p_hasta date = null, p_turno_id bigint = null) → setof (agrupacion, id, nombre, cantidad_ventas, total, total_efectivo, total_transferencia, total_tarjeta)` | admin | Sin anuladas; día de negocio de la venta y/o turno. `agrupacion` = `total` (siempre 1 fila, en 0 si no hay nada) · `impuesto` (nombre actual), de mayor a menor total |
| `ventas_por_dia(p_desde date, p_hasta date) → setof (fecha, cantidad, total)` | admin | Ambas fechas obligatorias, máx. 366 días. Un día por fila (0 sin ventas) hasta `least(p_hasta, hoy)`: los días que no llegaron no vienen. Sin anuladas; día de negocio |
| `resumen_dashboard(p_desde date = null, p_hasta date = null, p_turno_id bigint = null) → setof (agrupacion, id, nombre, cantidad, total, total_descontado)` | admin | Sin anuladas. `agrupacion` = `total` (siempre 1 fila) · `servicio` · `categoria` (nombres actuales) · `descuento`; cada grupo de más a menos ventas |
| `resumen_gastos(p_desde date = null, p_hasta date = null, p_turno_id bigint = null) → setof (agrupacion, id, nombre, cantidad, total)` | admin | Sin anulados. `total`, `compra_certificados` y `otros_gastos` (1 fila cada uno, en 0 si no hay) · `rubro` · `subcategoria` ("Rubro › Sub"), de mayor a menor. Las compras, por su gasto automático (nunca tienen turno) |
| `resumen_turnos(p_desde date = null, p_hasta date = null) → setof (cantidad_turnos, turnos_abiertos, ventas_cantidad, ventas_efectivo, ventas_transferencia, ventas_tarjeta, ventas_total, gastos_total, neto)` | admin | 1 fila: turnos con apertura (día de negocio, `v_turnos.fecha_apertura`) en el rango, totales en vivo sin anulados |
| `resumen_fondos(p_desde date = null, p_hasta date = null) → setof (cuenta, saldo, ingresos, egresos, neto, cantidad_movimientos)` | admin | Una fila por cuenta (efectivo, transferencia, tarjeta; nunca "mixto"). `saldo` de todos los tiempos; el resto, filas del libro con `fecha_local` en el rango; `neto` = suma del libro en el rango |
| `resumen_ventas_mixtas(p_desde date = null, p_hasta date = null) → setof (cantidad_ventas, total, total_efectivo, total_transferencia, total_tarjeta, incluido_en_cuentas)` | admin | 1 fila. Ventas mixtas no anuladas por día de venta. **Informativo**: ya incluido en las cuentas (`incluido_en_cuentas = true`), no sumar |
| `marcar_alertas_leidas(p_ids bigint[] = null) → int` | admin | `null` = todas; devuelve cuántas marcó |
| `certificado_para_servicio(p_servicio_id bigint) → bigint` | todos | Para mostrar en Ventas qué hoja se usará |
| `cajas_para_turno() → setof (id, nombre, ocupada, turno_id, abierto_en)` | admin | Cajas activas: libre u ocupada (con su turno abierto y desde cuándo) |
| `turnos_abiertos() → setof (id, caja_id, caja_nombre, abierto_en)` | todos | Turnos abiertos sin dinero, por nombre de caja. La usa `v_turnos_abiertos` (el cliente lee la vista) |
| `turno_abierto(p_turno_id bigint) → boolean` | todos | Solo sí/no (false si no existe, está cerrado o es NULL). La usan las políticas de `ventas`, `venta_pagos`, `gastos` y `comprobantes` |
| `nombre_usuario(p_usuario_id uuid) → text` | todos | Nombre completo para mostrar quién hizo un movimiento: el admin, de cualquiera; los demás, el propio o el de quien vendió/gastó en un turno abierto (si no, NULL). La usa `v_movimientos_caja` |
| `preparar_factura(p_venta_id bigint, p_condicion_iva_id int, p_doc_tipo smallint, p_doc_nro bigint, p_receptor_nombre text = null) → comprobantes` | todos | Cajero: cualquier venta de un turno abierto (sea de quien sea). Crea o corrige la factura pendiente/rechazada (clase, importes, cliente); no emite. Al corregir guarda `actualizado_por` = quien corrigió |
| `puede_emitir_comprobante(p_comprobante_id bigint) → comprobantes` | todos | Lo llama la Edge Function `arca` antes de emitir: cajero solo facturas de ventas de un turno abierto y 5 s entre intentos; NC solo admin |
| `stock_certificados_valorizado() → setof (… columnas de v_stock_certificados, costo_promedio, valor_stock)` | admin | Stock con valuación |
| `resumen_diario(p_desde date = null, p_hasta date = null) → setof (fecha, cantidad_ventas, total_*, total_gastos, flujo_neto, costo_certificados, margen_bruto, ventas_sin_stock)` | admin | Reporte por día (hora AR), sin anulados; rango opcional |
| `rol_actual() → rol_usuario`, `es_admin() → boolean` | todos | `null`/`false` si el usuario está desactivado |

Enums: `medio_pago` = efectivo | transferencia | tarjeta · `fuente_fondos` = efectivo | transferencia ·
`unidad_compra` = caja | libreta | unidad · `alcance_certificado` = global | categoria | servicio ·
`tipo_descuento` = porcentaje | monto_fijo · `cuenta_fondos` = efectivo | transferencia | tarjeta ·
`tipo_mov_fondos` = fondo_inicial | ingreso | retiro · `tipo_impuesto` = porcentaje | monto_fijo.

Edge Function `admin-usuarios` (POST, `Authorization: Bearer <jwt del admin>`), responde
`{ usuario }` o `{ error }`:
`{accion:"crear", nombre, apellido, email, password, rol}` · `{accion:"actualizar", id, nombre?, apellido?, rol?}` ·
`{accion:"activar", id, activo}` · `{accion:"cambiar_password", id, password}` (mín. 8 caracteres).
El admin no puede desactivarse ni quitarse el rol a sí mismo.

Edge Function `arca` (POST, JWT del usuario; la UI la llama con `invocarFuncion` de
`compartido/lib/funciones.ts`), responde `{ comprobante }` (fila de `v_comprobantes`) /
`{ configuracion }` / `{ prueba }` o `{ error }` (409 regla, 403 permiso):
`{accion:"emitir", comprobante_id}` (permiso de `puede_emitir_comprobante`: cajero solo facturas de
ventas de un turno abierto; NC solo admin) · `{accion:"guardar_certificado", certificado, clave}` (admin; PEM, valida
par, CUIT y vencimiento; a Vault) · `{accion:"probar_conexion"}` (admin; WSAA + condiciones IVA + último
número). Flujo de una factura: `preparar_factura()` (BD: clase, importes, cliente) → `emitir`. El número
se registra antes del `FECAESolicitar`; si no hubo respuesta, el siguiente `emitir` reconcilia con
`FECompConsultar`. Local: `ARCA_URL_SIMULADOR` en `supabase/config.toml`; en la nube no existe. Ver
`docs/arca/LEEME.md`.

## 6. Vistas

| Vista | Uso |
|---|---|
| `v_movimientos_caja` | Ventas + gastos juntos, con quién hizo cada uno (`usuario_id`, `usuario_nombre` —también para el cajero cuando lo hizo un compañero, vía `nombre_usuario`—). `tipo` = venta/gasto; **gastos con `monto` negativo** (fila roja); `anulada` para tacharlas (excluirlas de totales). `medio` = `'mixto'` en un pago mixto y `pagos` = detalle `[{medio, monto}]` (NULL en gastos); `descuento_nombre`, `monto_descuento`, `precio_lista` (NULL en gastos; `monto` es lo cobrado). Filtrar por `turno_id`, `caja_id`, `fecha_local`, etc. |
| `v_turnos` | **Solo admin** (RLS de `turnos`; al cajero, 0 filas). Turnos con caja (sin cajero: el turno es de la caja), `abierto_por`/`abierto_por_nombre` (admin que lo abrió), `atendido_por` (text[]: quienes vendieron o gastaron, más el cajero asignado de los turnos anteriores a la 33), `abierto`, totales en vivo por medio (desde `venta_pagos`: una venta mixta suma en cada medio su parte), gastos y neto, y efectivo del cajón (`efectivo_inicial`, `gastos_efectivo`, `efectivo_en_caja` —en vivo si está abierto, foto del cierre si no—, `efectivo_cierre`); `fecha_apertura` = día de negocio de la apertura (filtro del historial) |
| `v_turnos_abiertos` | `id`, `caja_id`, `caja_nombre`, `abierto_en` de los turnos abiertos, **sin dinero**: para que el usuario elija la caja donde trabaja. Envuelve `turnos_abiertos()` (security definer) porque el cajero no lee `turnos`; sin relación embebible con `cajas` |
| `v_stock_certificados` | Stock en hojas, `semaforo` (ok/bajo/sin_stock), `aplica_a`. **Sin costos** (el admin usa `stock_certificados_valorizado()`) |
| `v_compras_certificado` | Compras con certificado, usuario, estado de anulación y `editable` (regla de §4). Solo admin (RLS) |
| `v_gastos_por_categoria` | Totales por fecha, rubro, subcategoría y fuente |
| `v_movimientos_efectivo` | Libro de la caja de cambio con quién hizo cada movimiento (`usuario_nombre`). Solo admin (RLS de `movimientos_efectivo`) |
| `v_movimientos_fondos` | **Solo admin** (`es_admin()` en la vista). Libro de Fondos de las tres cuentas: `cuenta`, `clave` (única), `fecha`, `fecha_local`, `origen` (venta, venta_anulada, gasto, gasto_anulado, compra, compra_anulada, manual, apertura_turno, cierre_turno), `tipo` (detalle: el tipo manual o el de `movimientos_efectivo`), `sentido` (ingreso/egreso), `descripcion`, `nota`, `monto` con signo, `usuario_id`/`usuario_nombre`, `venta_id`, `gasto_id`, `compra_id`, `movimiento_id`, `turno_id`, `caja_id`/`caja_nombre`, `pago_mixto`, `venta_pasada`. Efectivo = `movimientos_efectivo` fila por fila. Paginar por `(fecha desc, clave desc)` |
| `v_ventas_mixtas` | **Solo admin**. Ventas con pago mixto (con turno): fecha, caja, servicio, patente, quién vendió, `precio`, `pago_efectivo/transferencia/tarjeta`, `pagos` jsonb, anulación. Informativa (ya está en las cuentas). Paginar por `id desc` |
| `venta_pagos` (tabla) | Cobro de cada venta por medio (misma RLS que `ventas`). Para mostrar el detalle de un pago mixto |
| `v_comprobantes` | Facturas y NC con venta, turno, cliente, importes, `a_reconciliar`, comprobante asociado y `qr_url`; al final `creado_por`, `actualizado_por` (último que corrigió los datos del cliente con `preparar_factura`, NULL si nadie) y `actualizado_en` (último cambio de cualquier tipo) (RLS: el cajero, los de ventas de turnos abiertos) |

Saldo de efectivo: `select saldo from caja_efectivo` (**solo admin**, migración 26); los saldos de todas
las cuentas de Fondos, con `resumen_fondos()`.
Tiempo real: Realtime `postgres_changes` sobre `public.alertas` (RLS: solo admin) y, desde la migración
35, `ventas`, `venta_pagos`, `gastos`, `turnos` y `comprobantes`. Realtime aplica la RLS del suscriptor y
envía solo las columnas con SELECT: una tabla nueva en la publicación hereda exactamente lo que el
usuario puede leer por REST (revisar grants por columna antes de publicarla).

## 7. Cambiar la base de datos

- **Nunca editar una migración ya commiteada**: crear una nueva (`npx supabase migration new <nombre>`).
- Las migraciones 13 y 16 revocan los privilegios por defecto: **toda tabla, vista o función nueva
  necesita `grant` explícito** a `authenticated`, RLS habilitada (las vistas con
  `security_invoker = true`). `08_seguridad.sql` falla si una tabla queda sin RLS o una vista sin invoker;
  `12_privilegios_funciones.sql` falla si `anon` puede ejecutar alguna función o `authenticated` una
  interna (`_*`) o de trigger.
- **service_role no tiene SELECT/INSERT/UPDATE/DELETE por defecto** (migración 28, igual que los proyectos
  nuevos de Supabase en la nube; el local se los daba y ocultaba el error). Si una Edge Function lee o
  escribe una tabla con service_role, la migración le da el `grant` exacto (por columna si se puede).
  `08_seguridad.sql` controla la lista. Los tests nunca usan service_role por REST para preparar datos:
  usan `npx supabase db query` contra la BD local.
- **Todo `UPDATE`/`DELETE` lleva `WHERE`**, aun sobre una tabla de fila única (`where id`): las sesiones de
  la API cargan `pg-safeupdate` y rechazan el resto ("UPDATE requires a WHERE clause"). pgTAP no lo detecta
  (no pasa por PostgREST); lo detectan los tests de Edge Functions.
- RPC nuevas: `security definer`, `set search_path = ''`, nombres calificados (`public.x`),
  empezar con `perform public._exigir_usuario()` o `_exigir_admin()`.
- Revisión de seguridad: agente `ciberseguridad` (auditoría completa o de un diff).
- Tests pgTAP: incluir `\ir _helpers.psql`; usar `pg_temp.escenario()` para datos base,
  `pg_temp.como(uid)` para actuar como un usuario y `reset role` para volver a postgres.
  Los tests no dependen del seed. Un UPDATE bloqueado por RLS no lanza error (afecta 0 filas):
  verificar el dato, no la excepción.

## 8. Agentes (`.claude/agents/`)

`db-supabase` (migraciones, RPC, pgTAP), `frontend-react` (UI), `analisis-datos` (RPC de reportes y
análisis con datos locales), `dashboard` (pantallas de dashboard con shadcn Chart), `qa-tester` (escribe y corre
tests, reporta), `revisor-codigo` (revisión antes de commitear), `ciberseguridad` (auditoría de seguridad),
`arca` (facturación electrónica ARCA: WSAA/WSFEv1, configuración fiscal, notas de crédito). Flujo por fase:
agente de implementación → `qa-tester` → `revisor-codigo` → commit con todo en verde.
No se pasa de fase con tests en rojo.

| Fase | Contenido |
|---|---|
| −1 | BD completa, Edge Function, tests pgTAP y de función (**hecha**) |
| 0 | (**hecha**) Scaffold: Vite + React + TS strict, Tailwind, shadcn, router, TanStack Query, cliente Supabase, ESLint + Prettier, Vitest, Playwright, scripts `dev`/`build`/`typecheck`/`lint`/`test`/`test:e2e`; tipos generados (`supabase gen types`); sumar todo a `verificar` |
| 1 | (**hecha**) Auth, layout por rol, guardas de rutas, pantalla de usuarios |
| 2 | (**hecha**) Admin: cajas, categorías de servicio, servicios |
| 3 | (**hecha**) Admin: certificados, compras (con edición/corrección), ajustes, kardex, stock |
| 4 | (**hecha**) Caja: abrir turno, ventas, historial del turno (sin totales), cerrar turno; admin: turnos con totales, anular venta, cerrar turno ajeno |
| 4b | (**hecha**) Facturación electrónica ARCA (agente `arca`): configuración en admin, facturar desde el historial, comprobante con QR, notas de crédito, log avanzado. Ver §9 |
| 5 | (**hecha**) Gastos (admin y caja, con categorías) + caja de efectivo (solo admin); nombre y apellido de usuarios; barra superior fija con "Abrir turno" / "Cerrar turno" (2026-11-22); modo oscuro y tema verde de shadcn; turnos abiertos por el admin con efectivo inicial y efectivo del cajón al cerrar |
| 6 | Dashboard (**hecho**, migración 37), reportes, alertas en tiempo real |
| 7 | Pulido: responsive, accesibilidad, estados vacíos/errores, rendimiento; E2E completo |

Calidad exigida: TypeScript strict sin `any`, ESLint sin warnings, tests nuevos (unit + E2E del
flujo) en cada fase, ejecutados y en verde. Si un requisito es ambiguo, preguntar antes de inventar.

## 9. Facturación electrónica ARCA (decisiones del negocio, 2026-11-20)

Se implementa en la fase 4b, después de la caja (necesita el historial de ventas real).

- **Emisor Responsable Inscripto**: la clase la decide la tabla de ARCA (`FEParamGetCondicionIvaReceptor`,
  guardada en `arca_condiciones_iva` al probar la conexión): **B** si la condición la admite
  (consumidor final, exento) y si no **A** con CUIT (responsable inscripto y **monotributista**, según
  RG 5616; decisión 2026-11-20 que reemplaza "B a monotributista").
- **Precios con IVA 21% incluido**: la BD calcula neto = precio / 1,21 e IVA discriminado; el total
  facturado es el precio de la venta. Nada de esto se calcula en el frontend.
- **Se factura después, desde el historial** (no al vender). Pueden facturar el **cajero** (cualquier
  venta de un turno **abierto**, sea de quien sea: la caja es compartida, migración 33) y el **admin**
  (cualquier venta). El cajero puede corregir y reintentar una factura rechazada de un turno abierto; las NC, el panel `/admin/facturacion` (sin CAE + log) y la
  configuración son del admin.
- **Cliente**: Consumidor Final por defecto; opcionalmente CUIT o DNI + nombre/razón social y
  condición frente al IVA (obligatorio para Factura A y para montos sobre el tope vigente de ARCA).
- Al autorizarse, **la venta queda vinculada a su comprobante** con todos los datos: tipo, punto de
  venta, número, CAE y vencimiento, fecha, cliente, neto, IVA, total, QR.
- **Errores**: la factura queda **pendiente** (o rechazada, con el motivo de ARCA) y se puede reintentar.
  Un **log avanzado** (solo admin) guarda cada intento: request/response SOAP saneados (sin token ni
  clave), códigos `Errors`/`Observaciones`, tiempos y quién lo hizo. Nunca dos CAE para una venta:
  ante error de red se reconcilia con `FECompConsultar` antes de reintentar. Mientras un número espera
  confirmación, ese punto de venta y tipo no emite otro (migración 25).
- **Anular una venta facturada** emite **nota de crédito automática** asociada a la factura (A o B
  según el original). Si ARCA falla, la NC queda pendiente con el mismo esquema de reintento y log.
- **Configuración ARCA (solo admin)**: CUIT, razón social, domicilio, inicio de actividades, IIBB,
  punto de venta, ambiente (homologación/producción) y **certificado .crt + clave .key subidos desde la
  pantalla**, guardados cifrados en Supabase Vault y nunca devueltos al navegador (solo CUIT del
  certificado y vencimiento). Botón "Probar conexión".
- Representación impresa del comprobante con **QR** (RG 4892) en `/comprobantes/:id` (sin menú, para
  imprimir), en formato **ticket para impresora térmica** (decisión 2026-11-23: solo ticket): una columna
  de ancho fluido hasta 80 mm (sirve para rollos de 80 y 58 mm; el ancho lo pone el papel del driver),
  negro sobre blanco sin grises aunque la app esté en oscuro, `@page { margin: 2mm }` y sin botones ni
  avisos al imprimir (`index.css`). Se imprime desde Chrome con el diálogo del navegador; en homologación lleva la leyenda "sin validez fiscal". La Factura B informa el IVA
  contenido (Ley 27.743). Los datos del emisor del impreso son los guardados al enviarlo (`emisor_*`),
  no la configuración actual.

