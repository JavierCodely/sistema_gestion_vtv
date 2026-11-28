-- Migración 46: vuelta fuera de plazo de una condicional vencida (p_vuelta_vencida).
begin;
\ir _helpers.psql
select plan(17);

select * from pg_temp.escenario() \gset

select ok(has_function_privilege('authenticated',
    'public.registrar_venta(bigint, bigint, public.medio_pago, text, jsonb, bigint, numeric, boolean, boolean, bigint)', 'execute')
  and not has_function_privilege('anon',
    'public.registrar_venta(bigint, bigint, public.medio_pago, text, jsonb, bigint, numeric, boolean, boolean, bigint)', 'execute'),
  'authenticated ejecuta registrar_venta con p_vuelta_vencida; anon no');
select hasnt_function('public', 'registrar_venta',
  array['bigint', 'bigint', 'medio_pago', 'text', 'jsonb', 'bigint', 'numeric', 'boolean', 'boolean'],
  'la firma anterior ya no existe');

-- Servicio con certificado de siempre (E) y condicional (B) ----------------------------------------
select pg_temp.como(:'admin');
insert into servicios (nombre, categoria_id, precio, requiere_certificado)
  values ('Auto V', :categoria, 71000, true) returning id as auto \gset
insert into servicios (nombre, categoria_id, precio, requiere_certificado)
  values ('Moto V', :categoria, 30000, true) returning id as moto \gset
insert into certificados (nombre, hojas_por_unidad) values ('Hoja E V', 1) returning id as c_e \gset
insert into certificados (nombre, hojas_por_unidad, condicional, dias_vuelta)
  values ('Hoja B V', 1, true, 30) returning id as c_b \gset
select fijar_destinos_certificado(:c_e, false, '{}', array[:auto, :moto]::bigint[]);
select fijar_destinos_certificado(:c_b, false, '{}', array[:auto, :moto]::bigint[]);
select ajustar_stock_certificado(:c_e, 10, 'Stock de prueba');
select ajustar_stock_certificado(:c_b, 10, 'Stock de prueba');
insert into descuentos (nombre, tipo, valor) values ('Promo V', 'porcentaje', 10) returning id as promo \gset
select fijar_servicios_descuento(:promo, array[:auto]::bigint[]);
reset role;

-- Condicionales: una pagada entera y otra al 50%, ambas vencidas -------------------------------------
select pg_temp.abrir_turno_para(:'admin', :'cajero', :caja, 100) as turno \gset
select (registrar_venta(:turno, :auto, 'transferencia', 'VV111AA', p_condicional => true)).id as v_entera \gset
select (registrar_venta(:turno, :auto, 'transferencia', 'VV222BB', p_condicional => true, p_condicional_mitad => true)).id as v_mitad \gset
select (registrar_venta(:turno, :moto, 'transferencia', 'VV111AA', p_condicional => true)).id as v_moto \gset
reset role;
update ventas set condicional_vence = fecha_local(now()) - 1 where id in (:v_entera, :v_mitad, :v_moto);

select pg_temp.como(:'cajero');
select throws_ok(format('select registrar_venta(%s, %s, %L, %L, p_vuelta_vencida => %s)', :turno, :auto, 'efectivo', 'VV999ZZ', :v_entera),
  '22023', 'La condicional elegida no es de la patente VV999ZZ y el servicio "Auto V"',
  'la condicional tiene que ser de la misma patente');
select throws_ok(format('select registrar_venta(%s, %s, %L, %L, p_vuelta_vencida => %s)', :turno, :auto, 'efectivo', 'VV111AA', :v_moto),
  '22023', 'La condicional elegida no es de la patente VV111AA y el servicio "Auto V"',
  'y del mismo servicio');
select throws_ok(format('select registrar_venta(%s, %s, %L, %L, p_condicional => true, p_vuelta_vencida => %s)', :turno, :auto, 'efectivo', 'VV111AA', :v_entera),
  '22023', 'Una vuelta de condicional no es otra condicional: elegí una de las dos',
  'no se combina con otra condicional');
select throws_like(format('select registrar_venta(%s, %s, %L, %L, p_descuento_id => %s, p_vuelta_vencida => %s)', :turno, :auto, 'efectivo', 'VV111AA', :promo, :v_entera),
  'La patente VV111AA vuelve de la condicional del %: no lleva descuento',
  'la vuelta fuera de plazo no lleva descuento');
select throws_like(format('select registrar_venta(%s, %s, %L, %L, p_precio_esperado => 71000, p_vuelta_vencida => %s)', :turno, :auto, 'efectivo', 'VV111AA', :v_entera),
  'La patente VV111AA vuelve de la condicional del %: corresponde cobrar $ 0,00. Revisá la venta.',
  'si la caja esperaba otro precio, avisa cuánto corresponde');

-- Pagada entera: $ 0 con la hoja de siempre ---------------------------------------------------------
select (registrar_venta(:turno, :auto, 'efectivo', 'VV111AA', p_precio_esperado => 0, p_vuelta_vencida => :v_entera)).id as v_vuelta \gset
select is((select row(precio, vuelta_de, certificado_id, condicional_vence, usuario_id)::text from ventas where id = :v_vuelta),
  row(0.00::numeric(12,2), :v_entera::bigint, :c_e::bigint, null::date, :'cajero'::uuid)::text,
  'el cajero registra la vuelta fuera de plazo: $ 0, enlazada a la condicional, con la hoja E');
select is((select count(*)::int from condicionales_de_patente('VV111AA') where servicio_id = :auto), 0,
  'la condicional vencida ya se usó');
select throws_ok(format('select registrar_venta(%s, %s, %L, %L, p_vuelta_vencida => %s)', :turno, :auto, 'efectivo', 'VV111AA', :v_entera),
  'P0001', 'La condicional de la patente VV111AA ya se usó en otra venta: revisá el historial',
  'una sola vuelta por condicional');

-- Pagada al 50%: cobra la otra mitad ----------------------------------------------------------------
select is((registrar_venta(:turno, :auto, 'transferencia', 'VV222BB', p_precio_esperado => 35500, p_vuelta_vencida => :v_mitad)).precio,
  35500.00::numeric(12,2), 'al 50%, la vuelta fuera de plazo cobra lo que faltaba');
reset role;

-- Anular la vuelta la libera; anulada la condicional, no se puede usar ------------------------------
select pg_temp.como(:'admin');
select anular_venta(:v_vuelta, 'error');
reset role;
select pg_temp.como(:'cajero');
select is((select count(*)::int from condicionales_de_patente('VV111AA') where servicio_id = :auto and not vigente), 1,
  'anular la vuelta libera la condicional vencida');
reset role;
select pg_temp.como(:'admin');
select anular_venta(:v_moto, 'error');
reset role;
select pg_temp.como(:'cajero');
select throws_ok(format('select registrar_venta(%s, %s, %L, %L, p_vuelta_vencida => %s)', :turno, :moto, 'efectivo', 'VV111AA', :v_moto),
  'P0001', 'La condicional elegida está anulada: revisá la patente', 'una condicional anulada no vale');

-- Con una vigente del servicio, la vuelta es esa ------------------------------------------------------
select (registrar_venta(:turno, :moto, 'transferencia', 'VV333CC', p_condicional => true)).id as v_vieja \gset
reset role;
update ventas set condicional_vence = fecha_local(now()) - 1 where id = :v_vieja;
select pg_temp.como(:'cajero');
select (registrar_venta(:turno, :moto, 'transferencia', 'VV333CC', p_condicional => true)).id as v_nueva \gset
select throws_like(format('select registrar_venta(%s, %s, %L, %L, p_vuelta_vencida => %s)', :turno, :moto, 'efectivo', 'VV333CC', :v_vieja),
  'La patente VV333CC tiene una condicional vigente de "Moto V" (del %): registrá la vuelta',
  'con una condicional vigente del servicio, la vuelta es la vigente');

-- Sin p_vuelta_vencida no cambia nada: vencida se cobra entera ---------------------------------------
select is((registrar_venta(:turno, :auto, 'transferencia', 'VV111AA')).precio, 71000.00::numeric(12,2),
  'sin elegir la vuelta, una condicional vencida se cobra entera');
select is((select count(*)::int from ventas where vuelta_de = :v_entera and not anulada), 0,
  'y no queda como vuelta');
select is((select stock_hojas from certificados where id = :c_e), 7,
  'las vueltas y la venta común descontaron la hoja E');
reset role;

select * from finish();
rollback;
