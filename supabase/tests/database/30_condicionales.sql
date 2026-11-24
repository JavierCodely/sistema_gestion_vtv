-- Migraciones 40, 41 y 42: condicionales como certificado del servicio (total o 50%; la vuelta cobra el
-- saldo y descuenta la hoja de siempre) y búsqueda por patente.
begin;
\ir _helpers.psql
select plan(57);

select * from pg_temp.escenario() \gset
insert into servicios (nombre, categoria_id, precio, requiere_certificado)
  values ('Auto C', :categoria, 71000, true) returning id as auto \gset
insert into servicios (nombre, categoria_id, precio, requiere_certificado)
  values ('Moto C', :categoria, 30000, true) returning id as moto \gset

-- Privilegios -------------------------------------------------------------------------------------
select ok(has_function_privilege('authenticated', 'public.condicionales_de_patente(text)', 'execute')
  and not has_function_privilege('anon', 'public.condicionales_de_patente(text)', 'execute')
  and has_function_privilege('authenticated', 'public.ventas_por_patente(text)', 'execute')
  and not has_function_privilege('anon', 'public.ventas_por_patente(text)', 'execute')
  and has_function_privilege('authenticated', 'public.certificado_condicional_para_servicio(bigint)', 'execute')
  and not has_function_privilege('anon', 'public.certificado_condicional_para_servicio(bigint)', 'execute'),
  'authenticated ejecuta las RPC de condicionales; anon no');
select ok(not has_function_privilege('authenticated', 'public._normalizar_patente(text)', 'execute')
  and not has_function_privilege('authenticated', 'public._certificado_para(bigint, boolean)', 'execute')
  and not has_function_privilege('authenticated', 'public.tg_ventas_condicional_anulada()', 'execute')
  and not has_function_privilege('authenticated', 'public.tg_certificados_destinos_activo()', 'execute'),
  'las internas y los triggers no se ejecutan desde la API');
select ok(has_column_privilege('authenticated', 'public.certificados', 'condicional', 'insert')
  and has_column_privilege('authenticated', 'public.certificados', 'dias_vuelta', 'update')
  and has_column_privilege('authenticated', 'public.certificados', 'condicional', 'select')
  and not has_column_privilege('authenticated', 'public.ventas', 'vuelta_de', 'update')
  and has_column_privilege('authenticated', 'public.ventas', 'condicional_saldo', 'select'),
  'el admin marca el certificado condicional; las ventas solo se leen');
select hasnt_column('public', 'servicios', 'condicional_de', 'la condicional ya no es un servicio');
select hasnt_function('public', 'condicionales_vigentes', array['text'], 'condicionales_vigentes ya no existe');

-- Certificados: el de siempre (E) y el condicional (B) del mismo servicio --------------------------
select pg_temp.como(:'admin');
select throws_ok($$insert into certificados (nombre, hojas_por_unidad, dias_vuelta) values ('Días sin condicional', 1, 30)$$,
  '23514', null, 'los días van solo en un certificado condicional');
select throws_ok($$insert into certificados (nombre, hojas_por_unidad, condicional) values ('Condicional sin días', 1, true)$$,
  '23514', null, 'un certificado condicional lleva sus días');
select throws_ok($$insert into certificados (nombre, hojas_por_unidad, condicional, dias_vuelta) values ('Cero días', 1, true, 0)$$,
  '23514', null, 'el plazo es de 1 a 365 días');
insert into certificados (nombre, hojas_por_unidad) values ('Hoja E C', 1) returning id as c_aprobado \gset
insert into certificados (nombre, hojas_por_unidad, condicional, dias_vuelta)
  values ('Hoja B C', 1, true, 30) returning id as c_cond \gset
select lives_ok(format('select fijar_destinos_certificado(%s, false, %L, array[%s]::bigint[])', :c_aprobado, '{}', :auto),
  'el certificado de siempre se asigna al servicio');
select lives_ok(format('select fijar_destinos_certificado(%s, false, %L, array[%s]::bigint[])', :c_cond, '{}', :auto),
  'el condicional se asigna al mismo servicio (son de distinto tipo)');
insert into certificados (nombre, hojas_por_unidad, condicional, dias_vuelta)
  values ('Otra B C', 1, true, 10) returning id as c_otra \gset
select throws_ok(format('select fijar_destinos_certificado(%s, false, %L, array[%s]::bigint[])', :c_otra, '{}', :auto),
  'P0001', 'El servicio "Auto C" ya usa el certificado condicional activo "Hoja B C". Desactivalo o quitale ese servicio antes.',
  'un solo certificado condicional activo por servicio');
insert into certificados (nombre, hojas_por_unidad) values ('Otra E C', 1) returning id as c_otra_e \gset
update certificados set activo = false where id = :c_otra_e;
select fijar_destinos_certificado(:c_otra_e, false, '{}', array[:auto]::bigint[]);
select throws_ok(format('update certificados set activo = true where id = %s', :c_otra_e),
  'P0001', 'El servicio "Auto C" ya usa el certificado activo "Hoja E C". Desactivalo o quitale ese servicio antes.',
  'un solo certificado de siempre activo por servicio');
select throws_ok(format('update certificados set condicional = true, dias_vuelta = 15, activo = true where id = %s', :c_otra_e),
  'P0001', 'El servicio "Auto C" ya usa el certificado condicional activo "Hoja B C". Desactivalo o quitale ese servicio antes.',
  'pasarlo a condicional también choca con el condicional activo');
select is(certificado_para_servicio(:auto), :c_aprobado::bigint, 'el de siempre del servicio es E');
select is(certificado_condicional_para_servicio(:auto), :c_cond::bigint, 'el condicional del servicio es B');
select is(certificado_condicional_para_servicio(:moto), null::bigint, 'un servicio sin condicional no tiene');
select is((select row(condicional, dias_vuelta)::text from v_stock_certificados where id = :c_cond), '(t,30)',
  'el stock muestra el tipo y los días');
select ajustar_stock_certificado(:c_aprobado, 10, 'Stock de prueba');
select ajustar_stock_certificado(:c_cond, 10, 'Stock de prueba');
insert into descuentos (nombre, tipo, valor) values ('Promo C', 'porcentaje', 10) returning id as promo \gset
select fijar_servicios_descuento(:promo, array[:auto]::bigint[]);
reset role;

-- La condicional: mismo servicio, su certificado, se cobra y consume su hoja -----------------------
select pg_temp.abrir_turno_para(:'admin', :'cajero', :caja, 100) as turno \gset
select throws_ok(format('select registrar_venta(%s, %s, %L, %L, p_condicional => true)', :turno, :moto, 'efectivo', 'ZZ111ZZ'),
  '22023', 'El servicio "Moto C" no tiene un certificado condicional: elegí el certificado de siempre',
  'sin certificado condicional no hay condicional');
select (registrar_venta(:turno, :auto, 'efectivo', 'ab 123 cd', p_precio_esperado => 71000, p_condicional => true)).id as v_cond \gset
select is((select row(precio, certificado_id, condicional_servicio_id, condicional_vence, condicional_saldo, servicio_id)::text from ventas where id = :v_cond),
  row(71000.00::numeric(12,2), :c_cond::bigint, :auto::bigint, fecha_local(now()) + 30, 0.00::numeric(12,2), :auto::bigint)::text,
  'la condicional cobra el precio del servicio, usa la hoja B y vuelve al mismo servicio en 30 días');
select is((select count(*)::int from condicionales_de_patente('AB 123 CD') where vigente), 1, 'la patente tiene una condicional vigente');
select is((select row(venta_id, condicional_nombre, servicio_id, servicio_nombre, vence, vigente, pagado, saldo)::text
           from condicionales_de_patente('ab123cd')),
  row(:v_cond::bigint, 'Hoja B C', :auto::bigint, 'Auto C', fecha_local(now()) + 30, true,
      71000.00::numeric, 0.00::numeric)::text,
  'condicionales_de_patente dice el certificado entregado, a qué servicio vuelve, lo pagado y lo que falta');
select is((select count(*)::int from condicionales_de_patente('ZZ999ZZ')), 0, 'otra patente no tiene condicional');
select throws_like(format('select registrar_venta(%s, %s, %L, %L, p_condicional => true)', :turno, :auto, 'efectivo', 'AB123CD'),
  'La patente AB123CD ya tiene una condicional vigente de "Auto C" (del %): registrá la vuelta',
  'con una condicional vigente del servicio no se hace otra');

-- La vuelta de una condicional pagada completa: sin cargo, con la hoja de siempre -----------------
select throws_like(format('select registrar_venta(%s, %s, %L, %L, p_precio_esperado => 71000)', :turno, :auto, 'efectivo', 'AB123CD'),
  'La patente AB123CD vuelve de la condicional del %: corresponde cobrar $ 0,00. Revisá la venta.',
  'si la caja esperaba cobrar, la BD avisa cuánto corresponde');
select throws_like(format('select registrar_venta(%s, %s, %L, %L, p_descuento_id => %s)', :turno, :auto, 'efectivo', 'AB123CD', :promo),
  'La patente AB123CD vuelve de la condicional del %: no lleva descuento',
  'la vuelta no lleva descuento');
select (registrar_venta(:turno, :auto, 'efectivo', 'AB123CD', p_precio_esperado => 0)).id as v_vuelta \gset
select is((select row(precio, precio_lista, vuelta_de, certificado_id, sin_stock, condicional_vence)::text from ventas where id = :v_vuelta),
  row(0.00::numeric(12,2), 0.00::numeric(12,2), :v_cond::bigint, :c_aprobado::bigint, false, null::date)::text,
  'la vuelta es $ 0, queda enlazada a la condicional y entrega la hoja E');
select is((select monto from venta_pagos where venta_id = :v_vuelta), 0.00::numeric(12,2), 'el pago queda en $ 0');
reset role;
select is((select row(stock_hojas)::text from certificados where id = :c_aprobado), '(9)', 'la hoja E bajó del stock');
select is((select row(stock_hojas)::text from certificados where id = :c_cond), '(9)', 'la condicional consumió solo la B');
select pg_temp.como(:'cajero');
select is((select count(*)::int from condicionales_de_patente('AB123CD')), 0, 'la condicional ya se usó');
select is((registrar_venta(:turno, :auto, 'efectivo', 'AB123CD', p_precio_esperado => 71000)).vuelta_de, null,
  'una segunda venta se cobra entera (una sola vuelta)');
reset role;

-- Anulaciones ---------------------------------------------------------------------------------------
select pg_temp.como(:'admin');
select throws_ok(format('select anular_venta(%s, %L)', :v_cond, 'error'), 'P0001',
  format('Esta condicional ya se usó en la venta N° %s (vuelta de la condicional): anulá primero esa venta', :v_vuelta),
  'una condicional con su vuelta no se anula');
select lives_ok(format('select anular_venta(%s, %L)', :v_vuelta, 'se cargó mal'), 'la vuelta se anula');
select is((select count(*)::int from condicionales_de_patente('AB123CD') where vigente), 1, 'anular la vuelta libera la condicional');
select lives_ok(format('select anular_venta(%s, %L)', :v_cond, 'se cargó mal'), 'sin vuelta, la condicional se anula');
select is((select count(*)::int from condicionales_de_patente('AB123CD')), 0, 'una condicional anulada no vale');
reset role;

-- Vencida: lo pagado queda en la patente; se cobra entera o se hace otra condicional -----------------
select pg_temp.como(:'cajero');
select (registrar_venta(:turno, :auto, 'tarjeta', 'CD456EF', p_condicional => true)).id as v_vieja \gset
reset role;
update ventas set condicional_vence = fecha_local(now()) - 1 where id = :v_vieja;
select pg_temp.como(:'cajero');
select is((select row(vigente, pagado)::text from condicionales_de_patente('CD456EF')), row(false, 71000.00::numeric)::text,
  'vencido el plazo, sigue en la patente (lo pagado) pero no está vigente');
select is((registrar_venta(:turno, :auto, 'tarjeta', 'CD456EF')).precio, 71000.00::numeric(12,2),
  'vencida, el servicio se cobra entero');
select isnt((registrar_venta(:turno, :auto, 'tarjeta', 'CD456EF', p_condicional => true)).condicional_vence, null,
  'vencida, se puede hacer otra condicional');
reset role;

-- Foto: cambiar los días del certificado no cambia las condicionales ya vendidas ------------------
select pg_temp.como(:'cajero');
select (registrar_venta(:turno, :auto, 'tarjeta', 'GH789IJ', p_condicional => true)).id as v_foto \gset
reset role;
select pg_temp.como(:'admin');
update certificados set dias_vuelta = 5 where id = :c_cond;
select is((select condicional_vence from ventas where id = :v_foto), fecha_local(now()) + 30,
  'el vencimiento es una foto del día de la venta');
select is((registrar_venta_pasada('2026-01-10', '00:00', :caja, :auto, 'efectivo', 71000, 'KL000MN')).condicional_vence,
  null::date, 'una venta con fecha pasada nunca es condicional (no lleva certificado)');

-- Búsqueda por patente ------------------------------------------------------------------------------
select is(
  (select array_agg(row(id, servicio_nombre, precio, certificado_nombre, anulada, vuelta_de, vuelta_venta_id)::text order by id)
   from ventas_por_patente('ab1')),
  array[
    row(:v_cond::bigint, 'Auto C', 71000.00::numeric, 'Hoja B C', true, null::bigint, null::bigint)::text,
    row(:v_vuelta::bigint, 'Auto C', 0.00::numeric, 'Hoja E C', true, :v_cond::bigint, null::bigint)::text,
    row(:v_vuelta::bigint + 1, 'Auto C', 71000.00::numeric, 'Hoja E C', false, null::bigint, null::bigint)::text
  ],
  'el historial de la patente trae cada venta con servicio, certificado y la relación con la condicional');
select is((select condicional_servicio from ventas_por_patente('GH789') limit 1), 'Auto C',
  'la condicional dice a qué servicio vuelve');
select throws_ok($$select * from ventas_por_patente('ab')$$, '22023', 'Escribí al menos 3 caracteres de la patente',
  'hacen falta 3 caracteres');
reset role;
select pg_temp.como(:'cajero');
select throws_ok($$select * from ventas_por_patente('AB123CD')$$, '42501', null, 'el cajero no busca por patente');
reset role;

-- Con descuento: la condicional se paga completa ---------------------------------------------------
select pg_temp.como(:'cajero');
select is((select row(precio, condicional_saldo, certificado_id)::text
           from registrar_venta(:turno, :auto, 'tarjeta', 'DE5CU0', p_descuento_id => :promo, p_condicional => true)),
  row(63900.00::numeric(12,2), 0.00::numeric(12,2), :c_cond::bigint)::text,
  'una condicional con descuento se cobra completa con el descuento');
reset role;

-- Al 50%: paga la mitad ahora y la otra mitad al volver; el impuesto se reparte -----------------------
-- Como postgres: "todos los servicios" el admin lo fija con la RPC de la pantalla.
insert into impuestos (nombre, tipo, valor, medios, todos_servicios)
  values ('Fijo C', 'monto_fijo', 150, array['efectivo', 'transferencia', 'tarjeta']::medio_pago[], true);
insert into impuestos (nombre, tipo, valor, medios, todos_servicios)
  values ('Tasa C', 'porcentaje', 3, array['tarjeta']::medio_pago[], true);
select pg_temp.como(:'cajero');
select throws_ok(format('select registrar_venta(%s, %s, %L, %L, p_condicional_mitad => true)', :turno, :auto, 'tarjeta', 'MI50PP'),
  '22023', 'Solo una condicional se puede pagar al 50%', 'solo una condicional se paga al 50%');
select throws_ok(format('select registrar_venta(%s, %s, %L, %L, p_descuento_id => %s, p_condicional => true, p_condicional_mitad => true)', :turno, :auto, 'tarjeta', 'MI50PP', :promo),
  'P0001', 'Con un descuento la condicional se paga completa: no se puede pagar al 50%', 'con descuento, solo el total');
select (registrar_venta(:turno, :auto, 'tarjeta', 'MI50PP', p_precio_esperado => 35500, p_condicional => true, p_condicional_mitad => true)).id as v_mitad \gset
select is((select row(precio, precio_lista, condicional_saldo, certificado_id)::text from ventas where id = :v_mitad),
  row(35500.00::numeric(12,2), 71000.00::numeric(12,2), 35500.00::numeric(12,2), :c_cond::bigint)::text,
  'al 50% cobra la mitad, guarda lo que falta y consume la hoja B');
select is((select row(pagado, saldo, vigente)::text from condicionales_de_patente('MI50PP')),
  row(35500.00::numeric, 35500.00::numeric, true)::text, 'la patente muestra lo pagado y lo que falta');
reset role;
select is((select array_agg(row(impuesto_nombre, monto)::text order by impuesto_nombre) from venta_impuestos where venta_id = :v_mitad),
  array[row('Fijo C', 75.00::numeric(12,2))::text, row('Tasa C', 1065.00::numeric(12,2))::text],
  'la condicional al 50% registra la mitad de cada impuesto');
select pg_temp.como(:'cajero');
select throws_like(format('select registrar_venta(%s, %s, %L, %L, p_precio_esperado => 0)', :turno, :auto, 'tarjeta', 'MI50PP'),
  'La patente MI50PP vuelve de la condicional del %: corresponde cobrar $ 35.500,00. Revisá la venta.',
  'la vuelta cobra lo que faltaba');
select (registrar_venta(:turno, :auto, 'tarjeta', 'MI50PP', p_precio_esperado => 35500)).id as v_resto \gset
select is((select row(precio, precio_lista, vuelta_de, certificado_id, condicional_saldo)::text from ventas where id = :v_resto),
  row(35500.00::numeric(12,2), 35500.00::numeric(12,2), :v_mitad::bigint, :c_aprobado::bigint, null::numeric)::text,
  'la vuelta cobra el 50% restante y entrega la hoja E');
reset role;
select is((select array_agg(row(impuesto_nombre, total)::text order by impuesto_nombre)
           from (select impuesto_nombre, sum(monto) as total from venta_impuestos
                 where venta_id in (:v_mitad, :v_resto) group by impuesto_nombre) t),
  array[row('Fijo C', 150.00::numeric)::text, row('Tasa C', 2130.00::numeric)::text],
  'entre la condicional y su vuelta queda registrado el impuesto completo');

-- La vuelta a $ 0 de una condicional pagada completa no lleva impuesto
select pg_temp.como(:'cajero');
select (registrar_venta(:turno, :auto, 'tarjeta', 'TOT100', p_condicional => true)).id as v_total \gset
select (registrar_venta(:turno, :auto, 'efectivo', 'TOT100', p_precio_esperado => 0)).id as v_cero \gset
reset role;
select is((select sum(monto) from venta_impuestos where venta_id = :v_total), 2280.00::numeric,
  'la condicional completa lleva todo el impuesto');
select is((select count(*)::int from venta_impuestos where venta_id = :v_cero), 0,
  'la vuelta sin cargo no genera impuesto');
select pg_temp.como(:'admin');
select is((select condicional_saldo from ventas_por_patente('MI50') where id = :v_mitad), 35500.00::numeric,
  'la búsqueda por patente trae lo que faltaba pagar');

select * from finish();
rollback;
