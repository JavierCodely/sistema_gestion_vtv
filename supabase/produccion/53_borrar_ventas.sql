-- =====================================================================
-- Sistema VTV — BORRAR LAS VENTAS (y los turnos) Y DEJAR LOS FONDOS EN $ 0
--
-- ⚠ DESTRUCTIVO E IRREVERSIBLE. Hacé un backup antes si hay algo que quieras guardar
--   (Dashboard → Database → Backups).
--
-- Borra:
--   - TODAS las ventas (con turno y con fecha pasada, vigentes y anuladas; condicionales y vueltas),
--     con su cobro (`venta_pagos`), sus impuestos calculados, sus facturas y notas de crédito
--     (`comprobantes`) con su log de ARCA, y las alertas de esas ventas.
--   - TODOS los turnos (abiertos y cerrados). Los gastos que estaban en un turno se conservan, sin
--     turno (siguen con su caja).
--   - Fondos en $ 0: se vacía el libro de la caja de cambio (saldo $ 0) y los movimientos manuales de
--     transferencia y crédito/débito. Los gastos y compras pagados por transferencia se conservan y
--     restan de esa cuenta: si quedan, se agrega un "Ajuste a $ 0" (ingreso) que la deja en cero.
--
-- NO cambia:
--   - El STOCK de certificados: las hojas que usaron las ventas quedan descontadas. Su salida del
--     kardex pasa a ser un ajuste ("Hoja usada en la venta N° X, venta borrada"), así el stock sigue
--     cuadrando con los movimientos.
--   - Gastos, compras de certificados, catálogo, usuarios ni la configuración de ARCA.
--
-- Facturas reales: si hay comprobantes autorizados por ARCA en producción no borra nada, salvo que
-- escribas BORRAR FACTURAS REALES (en ARCA siguen existiendo).
--
-- Uso: completá los valores marcados con <<< y ejecutá TODO el script en el SQL Editor.
-- Corre en una transacción: si algo falla, no se borra nada.
-- =====================================================================

begin;

do $$
declare
  v_confirmacion           text    := 'NO';    -- <<< escribí exactamente: BORRAR VENTAS
  v_borrar_facturas_reales text    := 'NO';    -- <<< solo si hay facturas reales: BORRAR FACTURAS REALES
  v_reiniciar_numeros      boolean := true;    -- <<< true = la próxima venta es la N° 1 (y el próximo turno, el 1)

  v_facturas       bigint;
  v_ventas         bigint;
  v_turnos         bigint;
  v_comprobantes   bigint;
  v_kardex         bigint;
  v_gastos_turno   bigint;
  v_transferencia  numeric;
  v_admin          uuid;
begin
  if v_confirmacion <> 'BORRAR VENTAS' then
    raise exception 'Por seguridad no se borró nada. Cambiá v_confirmacion a ''BORRAR VENTAS'' para confirmar.';
  end if;

  select count(*) into v_facturas
  from public.comprobantes
  where estado = 'autorizado' and ambiente = 'produccion';
  if v_facturas > 0 and v_borrar_facturas_reales <> 'BORRAR FACTURAS REALES' then
    raise exception 'Hay % comprobante(s) autorizado(s) por ARCA en producción. No se borró nada. Si igual querés borrarlos de este sistema (en ARCA siguen existiendo), cambiá v_borrar_facturas_reales a ''BORRAR FACTURAS REALES''.', v_facturas;
  end if;

  -- Nadie vende, gasta, abre/cierra turnos ni mueve Fondos mientras tanto.
  lock table public.ventas, public.venta_pagos, public.turnos, public.gastos, public.comprobantes,
    public.movimientos_efectivo, public.movimientos_fondos, public.movimientos_certificado,
    public.caja_efectivo, public.cuentas_fondos
    in share row exclusive mode;

  -- Facturación: el log de ARCA de esos comprobantes y los comprobantes (las NC primero: apuntan a
  -- su factura). Todos son de una venta.
  delete from public.arca_intentos where comprobante_id is not null;
  delete from public.comprobantes where asociado_id is not null;
  get diagnostics v_comprobantes = row_count;
  delete from public.comprobantes where id is not null;
  get diagnostics v_ventas = row_count;
  v_comprobantes := v_comprobantes + v_ventas;

  -- Kardex: la salida de cada venta queda como ajuste (el stock no cambia).
  update public.movimientos_certificado
  set tipo = 'ajuste',
      nota = format('Hoja usada en la venta N° %s (venta borrada)', venta_id),
      venta_id = null
  where venta_id is not null;
  get diagnostics v_kardex = row_count;

  delete from public.alertas where venta_id is not null;

  -- Fondos › Efectivo (caja de cambio): libro vacío y saldo $ 0. Incluye lo que referencia a ventas
  -- (ventas con fecha pasada en efectivo) y a turnos (apertura y cierre).
  delete from public.movimientos_efectivo where id is not null;
  update public.caja_efectivo set saldo = 0, actualizado_en = now() where id = 1;

  -- Ventas: el cobro (dispara el control diferido de pagos, que ignora las ventas que ya no
  -- existen), los impuestos (on delete cascade) y las ventas.
  delete from public.venta_pagos where venta_id is not null;
  delete from public.ventas where id is not null;
  get diagnostics v_ventas = row_count;

  -- Turnos: los gastos que estaban en uno quedan sin turno (conservan la caja).
  update public.gastos set turno_id = null where turno_id is not null;
  get diagnostics v_gastos_turno = row_count;
  delete from public.turnos where id is not null;
  get diagnostics v_turnos = row_count;

  -- Fondos › Transferencia y Crédito/Débito: sin movimientos manuales.
  delete from public.movimientos_fondos where id is not null;

  -- Lo que queda en transferencia son los gastos y compras pagados así (sin anular; un anulado se
  -- compensa con su reverso), igual que calcula `v_movimientos_fondos`. Crédito/Débito no tiene
  -- egresos: queda en $ 0.
  select coalesce(sum(g.monto), 0) into v_transferencia
  from public.gastos g
  where g.fuente = 'transferencia' and not g.anulado;
  if v_transferencia <> 0 then
    select p.id into v_admin
    from public.perfiles p
    where p.rol = 'admin'
    order by p.activo desc, p.creado_en
    limit 1;
    if v_admin is null then
      raise exception 'No hay ningún administrador para registrar el ajuste a $ 0 de transferencias. No se borró nada.';
    end if;
    insert into public.movimientos_fondos (cuenta, tipo, monto, nota, usuario_id)
    values ('transferencia', 'ingreso', v_transferencia,
            'Ajuste a $ 0 al borrar las ventas (compensa los gastos y compras pagados por transferencia)',
            v_admin);
  end if;

  if v_reiniciar_numeros then
    perform setval(pg_get_serial_sequence('public.ventas', 'id'), 1, false);
    perform setval(pg_get_serial_sequence('public.turnos', 'id'), 1, false);
  end if;

  raise notice 'Listo. Ventas borradas: %; turnos borrados: %; comprobantes borrados: %; salidas de hojas pasadas a ajuste: %; gastos que quedaron sin turno: %; ajuste de transferencias: $ %. Fondos en $ 0.',
    v_ventas, v_turnos, v_comprobantes, v_kardex, v_gastos_turno, v_transferencia;
end;
$$;

commit;

-- Verificación: ventas y turnos en 0; las tres cuentas de Fondos en $ 0; el stock cuadra con el kardex.
select
  (select count(*) from public.ventas)                                     as ventas,
  (select count(*) from public.venta_pagos)                                as pagos,
  (select count(*) from public.turnos)                                     as turnos,
  (select count(*) from public.comprobantes)                               as comprobantes,
  (select saldo from public.caja_efectivo)                                 as saldo_efectivo,
  (select coalesce(sum(monto), 0) from public.movimientos_efectivo)        as suma_libro_efectivo,
  (select coalesce(sum(m.monto), 0) from public.movimientos_fondos m where m.cuenta = 'transferencia')
    - (select coalesce(sum(g.monto), 0) from public.gastos g
       where g.fuente = 'transferencia' and not g.anulado)                 as saldo_transferencia,
  (select coalesce(sum(m.monto), 0) from public.movimientos_fondos m where m.cuenta = 'tarjeta')
                                                                           as saldo_credito_debito,
  (select count(*) from public.certificados c
   where c.stock_hojas <> (select coalesce(sum(m.hojas), 0) from public.movimientos_certificado m
                           where m.certificado_id = c.id))                 as certificados_que_no_cuadran,
  (select count(*) from public.gastos)                                     as gastos_conservados;
