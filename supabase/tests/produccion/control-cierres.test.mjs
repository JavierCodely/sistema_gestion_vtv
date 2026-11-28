// Tests de `supabase/produccion/60_control_cierres.sql` (control de cierres de turno, solo lectura)
// contra la BD local. Cada caso arma un turno en una transacción, opcionalmente adultera un dato,
// corre el script tal cual se pega en el SQL Editor y termina en ROLLBACK: la base queda igual.
// Se conecta con psql dentro del contenedor de Supabase local (supabase_db_<project_id>).
// Ejecutar: npm run test:produccion
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const raiz = new URL("../../../", import.meta.url);
const leer = (ruta) => readFileSync(new URL(ruta, raiz), "utf8");

const proyecto = /^project_id\s*=\s*"([^"]+)"/m.exec(leer("supabase/config.toml"))[1];
const CONTENEDOR = `supabase_db_${proyecto}`;
const CONTROL = leer("supabase/produccion/60_control_cierres.sql");
const HELPERS = leer("supabase/tests/database/_helpers.psql");

// Turno cerrado con todo lo que tiene que contemplar el control:
// · venta en efectivo de $ 20.000, anulada DESPUÉS del cierre (la foto la sigue contando);
// · venta mixta: $ 5.000 en efectivo + $ 15.000 por transferencia;
// · venta por transferencia anulada ANTES del cierre (no cuenta);
// · gasto en efectivo de $ 1.000 pagado con el cajón.
// Foto esperada: 2 ventas, efectivo 25.000, transferencia 15.000, gastos 1.000,
// efectivo devuelto 100 + 25.000 − 1.000 = 24.100.
const ESCENARIO = String.raw`
select * from pg_temp.escenario() \gset
select pg_temp.abrir_turno_para(:'admin', :'cajero', :caja, 100) as turno \gset
select (registrar_venta(:turno, :servicio, 'efectivo', 'CTL111')).id as v_efectivo \gset
select (registrar_venta(:turno, :servicio, null, 'CTL222',
  p_pagos => '[{"medio":"efectivo","monto":5000},{"medio":"transferencia","monto":15000}]')).id as v_mixta \gset
select (registrar_venta(:turno, :servicio, 'transferencia', 'CTL333')).id as v_antes \gset
select anular_venta(:v_antes, 'Anulada antes del cierre');
select registrar_gasto((select id from categorias_gasto where nombre = 'Comida'), 1000, 'efectivo',
  'Almuerzo', :turno);
reset role;
select pg_temp.como(:'admin');
select cerrar_turno(:turno);
select anular_venta(:v_efectivo, 'Anulada después del cierre');
reset role;
-- Todo el escenario es una sola transacción: anular_venta guarda anulada_en = now() (el inicio de
-- la transacción), que queda antes de cerrado_en (clock_timestamp()). En la app cada anulación es
-- otra transacción posterior al cierre: se pone la hora que tendría.
update public.ventas set anulada_en = (select cerrado_en from public.turnos where id = :turno) + interval '1 minute'
where id = :v_efectivo;
`;

/** Corre el escenario, la adulteración (SQL que puede usar :turno y :v_mixta) y el control. */
function controlar(adulterar = "") {
  const sql = [
    "\\set ON_ERROR_STOP 1",
    "\\o /dev/null",
    "begin;",
    HELPERS,
    ESCENARIO,
    adulterar,
    "\\o",
    "\\pset format unaligned",
    "\\pset tuples_only on",
    "\\pset fieldsep '|'",
    CONTROL,
    "select 'ids', :turno, :v_mixta;",
    "rollback;",
  ].join("\n");
  const salida = execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-U", "postgres", "-d", "postgres", "-X", "-q"],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
  const filas = salida
    .split(/\r?\n/)
    .filter((l) => l.includes("|"))
    .map((l) => {
      const [control, detalle, ok] = l.split("|").map((c) => c.trim());
      return { control, detalle, ok };
    });
  const ids = filas.pop();
  assert.equal(ids.control, "ids");
  return { filas, turno: ids.detalle, ventaMixta: ids.ok };
}

const delTurno = (r) => {
  const fila = r.filas.find((f) => f.control.startsWith(`Turno ${r.turno} (`));
  assert.ok(fila, `falta la fila del turno ${r.turno}`);
  return fila;
};
const control = (r, nombre) => {
  const fila = r.filas.find((f) => f.control === nombre);
  assert.ok(fila, `falta el control "${nombre}"`);
  return fila;
};

test("un cierre correcto da ok, con anuladas antes y después del cierre, pago mixto y gasto", () => {
  const r = controlar();
  assert.deepEqual(delTurno(r), {
    control: delTurno(r).control,
    detalle: "Todo coincide",
    ok: "t",
  });
  assert.equal(control(r, "Ventas: los pagos suman el precio").ok, "t");
  assert.equal(control(r, "Caja de cambio: saldo = suma del libro").ok, "t");
  assert.equal(control(r, "Caja de cambio: cada movimiento parte del saldo anterior").ok, "t");
});

test("la foto guardada es la esperada (el control compara contra estos números)", () => {
  const r = controlar(String.raw`
    \o
    select 'foto', row(cantidad_ventas, total_efectivo, total_transferencia,
                       total_gastos, efectivo_cierre)::text
    from public.turnos where id = :turno;
    \o /dev/null
  `);
  const foto = r.filas.find((f) => f.control === "foto");
  assert.equal(foto.detalle, "(2,25000.00,15000.00,1000.00,24100.00)");
});

test("detecta un total del cierre adulterado y dice cuánto se guardó y cuánto da", () => {
  const r = controlar(
    "update public.turnos set total_efectivo = total_efectivo + 1 where id = :turno;",
  );
  const fila = delTurno(r);
  assert.equal(fila.ok, "f");
  assert.equal(fila.detalle, "efectivo: guardado 25001.00, calculado 25000.00");
  // Los que fallan van primero.
  assert.equal(r.filas[0].control, fila.control);
});

test("detecta un efectivo devuelto que no coincide con el cajón ni con la caja de cambio", () => {
  const r = controlar(
    "update public.turnos set efectivo_cierre = efectivo_cierre - 100 where id = :turno;",
  );
  const fila = delTurno(r);
  assert.equal(fila.ok, "f");
  assert.match(fila.detalle, /efectivo devuelto: guardado 24000\.00, calculado 24100\.00/);
  assert.match(fila.detalle, /volvió a la caja de cambio: guardado 24000\.00, calculado 24100\.00/);
});

test("detecta un turno sin el movimiento de apertura en la caja de cambio", () => {
  const r = controlar(String.raw`
    update public.movimientos_efectivo set turno_id = null
    where turno_id = :turno and tipo = 'apertura_turno';
  `);
  const fila = delTurno(r);
  assert.equal(fila.ok, "f");
  assert.equal(fila.detalle, "salió de la caja de cambio: guardado 100.00, calculado 0");
});

test("detecta una venta cuyos pagos no suman el precio", () => {
  const r = controlar(String.raw`
    update public.venta_pagos set monto = monto - 1 where venta_id = :v_mixta and medio = 'transferencia';
  `);
  const fila = control(r, "Ventas: los pagos suman el precio");
  assert.equal(fila.ok, "f");
  assert.match(fila.detalle, new RegExp(`venta ${r.ventaMixta}: precio 20000.00, pagos 19999.00`));
  // El cierre guardó 15.000 de transferencia y ahora los pagos dan 14.999: también lo marca.
  assert.match(delTurno(r).detalle, /transferencia: guardado 15000\.00, calculado 14999\.00/);
});

test("detecta un saldo de la caja de cambio distinto de su libro", () => {
  const r = controlar("update public.caja_efectivo set saldo = saldo + 50 where true;");
  const fila = control(r, "Caja de cambio: saldo = suma del libro");
  assert.equal(fila.ok, "f");
  assert.equal(delTurno(r).ok, "t");
});

test("detecta un movimiento de la caja de cambio que no parte del saldo anterior", () => {
  const r = controlar(String.raw`
    update public.movimientos_efectivo set saldo_resultante = saldo_resultante + 1
    where id = (select max(id) from public.movimientos_efectivo);
  `);
  const fila = control(r, "Caja de cambio: cada movimiento parte del saldo anterior");
  assert.equal(fila.ok, "f");
  assert.equal(fila.detalle, "1 saltos · 0 saldos negativos");
});

test("un turno anterior a la migración 27 (sin efectivo inicial ni devuelto) no se marca", () => {
  const r = controlar(String.raw`
    insert into public.turnos (caja_id, abierto_en, cerrado_en, cantidad_ventas, total_efectivo,
                               total_transferencia, total_gastos)
    values (:caja, now() - interval '2 days', now() - interval '2 days' + interval '8 hours',
            0, 0, 0, 0)
    returning id as viejo \gset
    \o
    select 'viejo', :viejo;
    \o /dev/null
  `);
  const viejo = r.filas.find((f) => f.control === "viejo").detalle;
  const fila = r.filas.find((f) => f.control.startsWith(`Turno ${viejo} (`));
  assert.equal(fila.detalle, "Todo coincide");
  assert.equal(fila.ok, "t");
});

// Turno en la otra caja con dos ventas mixtas ($ 8.000 en efectivo + $ 12.000 por transferencia):
// una anulada antes del cierre (no cuenta) y otra anulada después (sigue en la foto; de la caja de
// cambio sale solo su parte en efectivo y la transferencia tiene su reverso en Fondos).
const MIXTAS_ANULADAS = String.raw`
  select pg_temp.abrir_turno_para(:'admin', :'cajero', :caja2, 300) as turno_m \gset
  select (registrar_venta(:turno_m, :servicio, null, 'MIX111',
    p_pagos => '[{"medio":"efectivo","monto":8000},{"medio":"transferencia","monto":12000}]')).id as m_antes \gset
  select (registrar_venta(:turno_m, :servicio, null, 'MIX222',
    p_pagos => '[{"medio":"efectivo","monto":8000},{"medio":"transferencia","monto":12000}]')).id as m_despues \gset
  select anular_venta(:m_antes, 'Mixta anulada antes del cierre');
  reset role;
  select pg_temp.como(:'admin');
  select cerrar_turno(:turno_m);
  select anular_venta(:m_despues, 'Mixta anulada después del cierre');
  reset role;
  update public.ventas set anulada_en = (select cerrado_en from public.turnos where id = :turno_m) + interval '1 minute'
  where id = :m_despues;
`;

test("mixtas anuladas antes y después del cierre: la foto cuenta solo la anulada después", () => {
  const r = controlar(String.raw`
    ${MIXTAS_ANULADAS}
    \o
    select 'turno_m', :turno_m;
    select 'foto_m', row(cantidad_ventas, total_efectivo, total_transferencia,
                         total_gastos, efectivo_cierre)::text
    from public.turnos where id = :turno_m;
    \o /dev/null
  `);
  const turnoM = r.filas.find((f) => f.control === "turno_m").detalle;
  // 1 venta: la anulada después; efectivo devuelto = 300 + 8.000.
  assert.equal(
    r.filas.find((f) => f.control === "foto_m").detalle,
    "(1,8000.00,12000.00,0.00,8300.00)",
  );
  const fila = r.filas.find((f) => f.control.startsWith(`Turno ${turnoM} (`));
  assert.equal(fila.detalle, "Todo coincide");
  assert.equal(fila.ok, "t");
  assert.equal(control(r, "Ventas: los pagos suman el precio").ok, "t");
  assert.equal(control(r, "Caja de cambio: saldo = suma del libro").ok, "t");
  assert.equal(control(r, "Caja de cambio: cada movimiento parte del saldo anterior").ok, "t");
});

test("mixta anulada después del cierre: sale solo el efectivo de la caja de cambio y la transferencia se revierte en Fondos", () => {
  const r = controlar(String.raw`
    ${MIXTAS_ANULADAS}
    \o
    select 'caja_cambio_despues', coalesce(sum(monto), 0) from public.movimientos_efectivo where venta_id = :m_despues;
    select 'caja_cambio_antes', coalesce(sum(monto), 0) from public.movimientos_efectivo where venta_id = :m_antes;
    select pg_temp.como(:'admin') \g /dev/null
    select 'fondos_despues', string_agg(cuenta || ' ' || origen || ' ' || monto, ', ' order by origen, cuenta)
    from public.v_movimientos_fondos where venta_id = :m_despues and cuenta <> 'efectivo';
    select 'fondos_antes', string_agg(cuenta || ' ' || origen || ' ' || monto, ', ' order by origen, cuenta)
    from public.v_movimientos_fondos where venta_id = :m_antes and cuenta <> 'efectivo';
    reset role;
    \o /dev/null
  `);
  const valor = (nombre) => r.filas.find((f) => f.control === nombre).detalle;
  // Anulada después del cierre: el efectivo ya había vuelto a la caja de cambio con el cierre, así que
  // sale de ahí solo esa parte ($ 8.000), nunca el total de la venta.
  assert.equal(valor("caja_cambio_despues"), "-8000.00");
  // Anulada antes: su efectivo vuelve del cajón, la caja de cambio no se toca.
  assert.equal(valor("caja_cambio_antes"), "0");
  // La parte por transferencia entra una sola vez y se revierte una sola vez.
  assert.equal(
    valor("fondos_despues"),
    "transferencia venta 12000.00, transferencia venta_anulada -12000.00",
  );
  assert.equal(
    valor("fondos_antes"),
    "transferencia venta 12000.00, transferencia venta_anulada -12000.00",
  );
});
