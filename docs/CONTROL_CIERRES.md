# Control de cierres de turno

Script: [`supabase/produccion/60_control_cierres.sql`](../supabase/produccion/60_control_cierres.sql)
· Tests: [`supabase/tests/produccion/control-cierres.test.mjs`](../supabase/tests/produccion/control-cierres.test.mjs)
(`npm run test:produccion`, incluido en `npm run verificar`).

Sirve para comprobar, en la base real, que **cada peso de cada cierre cierre**: que lo que guardó
cada turno al cerrarse coincide con las ventas, los pagos y los gastos registrados, y que la caja de
cambio está sana. Es **solo lectura**: no modifica nada y se puede correr las veces que haga falta.

**Requiere la migración 54** (`quitar_tarjeta`): desde ahí los medios son solo efectivo y
transferencia y la foto del cierre ya no tiene `total_tarjeta` (lo que era tarjeta quedó sumado en
`total_transferencia`). En una base sin la 54 el script falla al leer las columnas.

## Cómo se usa

1. Supabase → **SQL Editor** → New query.
2. Pegar el archivo `60_control_cierres.sql` **entero** y ejecutar.
3. Mirar la columna `ok`. Si todas dicen `true`, está todo bien. Las que fallan (`false`) salen
   **primero**, con el detalle de qué no coincide.

Ejemplo de resultado sano (nube, 2026-11-27):

| control | detalle | ok |
|---|---|---|
| Ventas: los pagos suman el precio | Todas cuadran (111 ventas) | true |
| Caja de cambio: saldo = suma del libro | Saldo 1581400.00, suma del libro 1581400.00 | true |
| Caja de cambio: cada movimiento parte del saldo anterior | 0 saltos · 0 saldos negativos | true |
| Turno 2 (caja general, cerró 26/11/2026 13:55) | Todo coincide | true |

Ejemplo de una falla: `efectivo: guardado 25001.00, calculado 25000.00` → el cierre guardó $ 1 más
de lo que suman los pagos en efectivo de sus ventas.

## Qué controla

### 1. Cada turno cerrado (una fila por turno)

Al cerrar, `cerrar_turno` guarda una **foto** en `turnos`. El script la recalcula desde las tablas
y compara campo por campo:

| Campo | Guardado (foto del cierre) | Calculado |
|---|---|---|
| ventas | `cantidad_ventas` | Ventas del turno que **no estaban anuladas al cerrar** |
| efectivo | `total_efectivo` | Suma de `venta_pagos` en efectivo de esas ventas |
| transferencia | `total_transferencia` | Ídem, transferencia |
| gastos | `total_gastos` | Gastos del turno no anulados al cerrar |
| efectivo devuelto | `efectivo_cierre` | Efectivo inicial + ventas en efectivo − gastos en efectivo |
| salió de la caja de cambio | `efectivo_inicial` | Movimiento `apertura_turno` del turno en `movimientos_efectivo` |
| volvió a la caja de cambio | `efectivo_cierre` | Movimiento `cierre_turno` del turno |

Reglas que contempla:

- **Pago mixto**: cada parte suma en su medio (una venta de $ 5.000 en efectivo + $ 15.000 por
  transferencia suma 5.000 en efectivo y 15.000 en transferencia). Por eso todo sale de `venta_pagos`, nunca
  de `ventas.medio_pago` (que es NULL en una mixta).
- **Anulada antes del cierre**: no cuenta (su efectivo ya había vuelto del cajón).
- **Anulada después del cierre**: **sigue contando** en la foto: el cierre la incluyó. Su efectivo
  sale después de la caja de cambio, no del turno (ver §4 de `CLAUDE.md`, "Anular venta").
- **Turnos anteriores a la migración 27** (sin efectivo inicial): no se comparan los movimientos de
  la caja de cambio porque esos turnos no los tenían.
- Los turnos **abiertos** no se controlan: todavía no tienen foto (sus totales en vivo están en
  `/admin/ventas`).
- Las **ventas con fecha pasada** no tienen turno: no entran en ningún cierre.

### 2. Ventas: los pagos suman el precio

Para todas las ventas (también anuladas y pasadas): `sum(venta_pagos.monto) = ventas.precio`. Si
falla, lista las ventas con el precio y lo que suman sus pagos.

### 3. Caja de cambio

- **Saldo = suma del libro**: `caja_efectivo.saldo` es igual a la suma de `movimientos_efectivo`.
- **Cada movimiento parte del saldo anterior**: en orden, saldo anterior + monto = saldo resultante
  (cuenta los "saltos") y ningún saldo negativo.

## Qué NO controla

- **Fondos de transferencia**: no tiene saldo guardado, se calculan siempre en
  `v_movimientos_fondos`, así que no pueden desincronizarse (el saldo de `resumen_fondos` *es* la
  suma del libro).
- Impuestos, stock, costos, facturación: los revisa el agente `auditor-contable`
  (`.claude/agents/auditor-contable.md`) contra la base local.
- **Falsa alarma posible (muy rara)**: si una venta se anula *en el mismo instante* en que se cierra
  su turno, la anulación puede quedar con una hora apenas anterior al cierre aunque se aplicó después
  y el turno aparecería con una diferencia por esa venta. Revisar esa venta en `/admin/patentes`
  antes de suponer un error.

## Si algo da `false`

1. Anotar el turno o la venta y el detalle.
2. Revisar si es **dato tocado a mano** (un UPDATE en el SQL Editor, un script de borrado) o un bug.
3. No corregir la foto del cierre a mano: pasar el resultado para analizarlo.

## Tests

`supabase/tests/produccion/control-cierres.test.mjs` corre el script **tal cual se pega en el SQL
Editor** contra la base local (psql dentro del contenedor `supabase_db_<project_id>`). Cada caso
arma su escenario en una transacción, adultera un dato si corresponde, corre el control y termina en
`ROLLBACK`: la base queda igual.

Escenario base: un turno con venta en efectivo anulada **después** del cierre, venta **mixta**
($ 5.000 efectivo + $ 15.000 transferencia), venta por transferencia anulada **antes** del cierre y
un gasto en efectivo de $ 1.000. Foto esperada: 2 ventas, efectivo 25.000, transferencia 15.000,
gastos 1.000, efectivo devuelto 24.100.

| Test | Qué prueba |
|---|---|
| un cierre correcto da ok | El escenario base da "Todo coincide" y los controles globales en `true` |
| la foto guardada es la esperada | Los números de la foto son los de arriba |
| total del cierre adulterado | +$ 1 en `total_efectivo` → `false` con "guardado 25001.00, calculado 25000.00", y sale primero |
| efectivo devuelto que no coincide | −$ 100 en `efectivo_cierre` → marca "efectivo devuelto" y "volvió a la caja de cambio" |
| turno sin movimiento de apertura | Se le quita el turno al movimiento → "salió de la caja de cambio: guardado 100.00, calculado 0" |
| venta cuyos pagos no suman el precio | −$ 1 a la transferencia de la mixta → marca la venta y el turno |
| saldo de la caja de cambio distinto del libro | +$ 50 al saldo → `false`; el turno sigue bien |
| movimiento que no parte del saldo anterior | +$ 1 al último saldo → "1 saltos" |
| turno anterior a la migración 27 | Sin efectivo inicial ni devuelto → "Todo coincide" |
| mixtas anuladas antes y después del cierre | Dos mixtas ($ 8.000 efectivo + $ 12.000 transferencia): la foto cuenta solo la anulada después (1 venta, 8.000 / 12.000, efectivo devuelto 8.300) y todo da `true` |
| mixta anulada después del cierre | De la caja de cambio sale **solo** la parte en efectivo (−8.000, nunca el total); la anulada antes no toca la caja de cambio; en Fondos la transferencia entra una vez y se revierte una vez (12.000 / −12.000) |

Nota de los tests: en una sola transacción `anular_venta` guarda `anulada_en = now()` (el inicio de
la transacción), que queda antes de `cerrado_en` (`clock_timestamp()`). Por eso las anulaciones
"después del cierre" fijan `anulada_en` un minuto después del cierre, como pasa en la app, donde
cada anulación es otra transacción.
