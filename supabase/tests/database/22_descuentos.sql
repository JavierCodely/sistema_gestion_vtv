-- Migración 31: descuentos (catálogo del admin, disponibilidad por servicio, foto en la venta).
begin;
\ir _helpers.psql
select plan(74);

select * from pg_temp.escenario() \gset
select pg_temp.crear_usuario('cajero2@test.local') as cajero2 \gset
insert into servicios (nombre, categoria_id, precio, requiere_certificado)
  values ('Servicio B', :categoria, 15000, false) returning id as servicio_b \gset
insert into servicios (nombre, categoria_id, precio, requiere_certificado)
  values ('Servicio Redondeo', :categoria, 333.33, false) returning id as servicio_r \gset
insert into servicios (nombre, categoria_id, precio, requiere_certificado)
  values ('Servicio Barato', :categoria, 10, false) returning id as servicio_barato \gset
insert into servicios (nombre, categoria_id, precio, requiere_certificado)
  values ('Servicio Gratis', :categoria, 0, false) returning id as servicio_gratis \gset
insert into categorias_servicio (nombre) values ('Categoría Aparte') returning id as categoria_c \gset
insert into servicios (nombre, categoria_id, precio, requiere_certificado)
  values ('Servicio C', :categoria_c, 20000, false) returning id as servicio_c \gset

-- Catálogo: CRUD del admin -------------------------------------------------------------------------
select pg_temp.como(:'admin');
insert into descuentos (nombre, tipo, valor) values ('  Jubilados   10 ', 'porcentaje', 10) returning id as jubilados \gset
select is((select row(nombre, tipo::text, valor, activo)::text from descuentos where id = :jubilados),
  row('Jubilados 10', 'porcentaje', 10.00, true)::text, 'el admin crea un descuento con el nombre normalizado');
insert into descuentos (nombre, tipo, valor) values ('Promo', 'monto_fijo', 5000) returning id as promo \gset
insert into descuentos (nombre, tipo, valor) values ('Gigante', 'monto_fijo', 20000) returning id as gigante \gset
insert into descuentos (nombre, tipo, valor, activo) values ('Viejo', 'porcentaje', 5, false) returning id as viejo \gset
insert into descuentos (nombre, tipo, valor) values ('Mini', 'porcentaje', 0.01) returning id as mini \gset
select throws_ok($$insert into descuentos (nombre, tipo, valor) values ('jubilados 10', 'monto_fijo', 1)$$,
  '23505', null, 'el nombre es único sin distinguir mayúsculas');
select throws_ok($$insert into descuentos (nombre, tipo, valor) values ('Todo', 'porcentaje', 100)$$,
  '23514', null, 'un porcentaje tiene que ser menor a 100');
select throws_ok($$insert into descuentos (nombre, tipo, valor) values ('Nada', 'porcentaje', 0)$$,
  '23514', null, 'el valor tiene que ser mayor a cero');
select throws_ok($$insert into descuentos (nombre, tipo, valor) values ('Negativo', 'monto_fijo', -10)$$,
  '23514', null, 'un monto fijo negativo se rechaza');
select throws_ok($$insert into descuentos (nombre, tipo, valor) values ('Raro', 'monto_fijo', 'NaN')$$,
  '23514', null, 'NaN no es un valor');
select throws_ok(format($$insert into descuentos (nombre, tipo, valor) values ('%s', 'monto_fijo', 1)$$, repeat('x', 101)),
  '23514', null, 'el nombre tiene hasta 100 caracteres');
select throws_ok($$insert into descuentos (nombre, tipo, valor) values ('   ', 'monto_fijo', 1)$$,
  '23514', null, 'el nombre es obligatorio');
select throws_ok(format($$update descuentos set creado_en = now() where id = %s$$, :jubilados),
  '42501', null, 'solo se editan nombre, tipo, valor y activo');
select lives_ok(format($$update descuentos set valor = 12.5 where id = %s$$, :viejo),
  'el admin edita un descuento');
reset role;

-- El cajero no escribe y lee solo los activos
select pg_temp.como(:'cajero');
select throws_ok($$insert into descuentos (nombre, tipo, valor) values ('Del cajero', 'porcentaje', 50)$$,
  '42501', null, 'el cajero no crea descuentos');
update descuentos set valor = 99 where id = :jubilados;
delete from descuentos where id = :promo;
select is((select count(*)::int from descuentos), 4, 'el cajero ve solo los descuentos activos');
reset role;
select is((select row(valor, (select count(*) from descuentos where id = :promo))::text from descuentos where id = :jubilados),
  row(10.00, 1)::text, 'el cajero no edita ni borra descuentos');

-- Disponibilidad por servicio ------------------------------------------------------------------------
select pg_temp.como(:'admin');
select is((fijar_servicios_descuento(:jubilados, array[:servicio, :servicio_b])).id, :jubilados::bigint,
  'fijar_servicios_descuento devuelve el descuento');
select fijar_servicios_descuento(:jubilados, array[:servicio_b, :servicio_b]);
select is((select array_agg(servicio_id) from descuento_servicios where descuento_id = :jubilados),
  array[:servicio_b::bigint], 'fijar reemplaza el conjunto completo (sin repetidos)');
select fijar_servicios_descuento(:jubilados, array[:servicio, :servicio_b, :servicio_r]);
select fijar_servicios_descuento(:promo, array[:servicio, :servicio_b, :servicio_c]);
select fijar_servicios_descuento(:mini, array[:servicio_barato]);
select fijar_servicios_descuento(:gigante, array[:servicio]);
select fijar_servicios_descuento(:viejo, array[:servicio]);
select throws_ok(format('select fijar_servicios_descuento(%s, array[%s, 999999999])', :jubilados, :servicio),
  '22023', 'Hay un servicio que no existe en la lista', 'un servicio inexistente se rechaza');
select is((select count(*)::int from descuento_servicios where descuento_id = :jubilados), 3,
  'y no cambia nada');
select throws_ok(format('select fijar_servicios_descuento(%s, null)', :jubilados),
  '22023', 'Indicá los servicios del descuento (la lista puede estar vacía)', 'la lista es obligatoria');
select throws_ok(format('select fijar_servicios_descuento(%s, array[null]::bigint[])', :jubilados),
  '22023', 'Hay un servicio inválido en la lista', 'sin ids nulos');
select throws_ok('select fijar_servicios_descuento(999999999, array[]::bigint[])',
  '22023', 'El descuento no existe', 'descuento inexistente');
select fijar_servicios_descuento(:gigante, array[]::bigint[]);
select is((select count(*)::int from descuento_servicios where descuento_id = :gigante), 0,
  'una lista vacía lo saca de todos los servicios');
select fijar_servicios_descuento(:gigante, array[:servicio]);
reset role;

select pg_temp.como(:'cajero');
select throws_ok(format('select fijar_servicios_descuento(%s, array[%s])', :jubilados, :servicio),
  '42501', null, 'el cajero no fija servicios');
select is((select count(*)::int from descuento_servicios where descuento_id = :viejo), 0,
  'el cajero no ve la disponibilidad de los descuentos inactivos');
select throws_ok(format('insert into descuento_servicios values (%s, %s)', :promo, :servicio_r),
  '42501', null, 'nadie escribe descuento_servicios directo');

-- Descuentos para un servicio (con el monto calculado por la BD) ------------------------------------
select is((select array_agg(row(nombre, monto_descuento, precio_final)::text order by nombre)
           from descuentos_para_servicio(:servicio)),
  array[row('Jubilados 10', 2000.00, 18000.00)::text, row('Promo', 5000.00, 15000.00)::text],
  'solo los activos y habilitados que dejan un precio mayor a cero');
select is((select row(monto_descuento, precio_final)::text from descuentos_para_servicio(:servicio_r)),
  row(33.33, 300.00)::text, 'el porcentaje se redondea a 2 decimales');
select is((select count(*)::int from descuentos_para_servicio(:servicio_barato)), 0,
  'no ofrece un descuento que redondeado no descuenta nada (0,01 % de $ 10)');
select is((select array_agg(nombre::text) from descuentos_para_servicio(:servicio_c)), array['Promo'],
  'con la categoría activa ofrece sus descuentos');
reset role;
update categorias_servicio set activa = false where id = :categoria_c;
update servicios set activo = false where id = :servicio_b;
select pg_temp.como(:'cajero');
select is((select count(*)::int from descuentos_para_servicio(:servicio_c)), 0,
  'un servicio de una categoría desactivada no ofrece descuentos');
select is((select count(*)::int from descuentos_para_servicio(:servicio_b)), 0,
  'un servicio desactivado no ofrece descuentos');
reset role;
update categorias_servicio set activa = true where id = :categoria_c;
update servicios set activo = true where id = :servicio_b;

-- Venta con descuento --------------------------------------------------------------------------------
reset role;
select pg_temp.abrir_turno_para(:'admin', :'cajero', :caja, 100) as turno \gset
select (registrar_venta(:turno, :servicio, 'efectivo', p_descuento_id => :jubilados, p_precio_esperado => 18000, p_patente => $p$AB123CD$p$)).id as v_jub \gset
select is((select row(precio_lista, monto_descuento, precio, descuento_id, descuento_nombre,
                      descuento_tipo::text, descuento_valor)::text from ventas where id = :v_jub),
  row(20000.00, 2000.00, 18000.00, :jubilados::bigint, 'Jubilados 10', 'porcentaje', 10.00)::text,
  'la venta guarda la foto del descuento y cobra el precio final');
select is((select monto from venta_pagos where venta_id = :v_jub), 18000.00::numeric,
  'el pago es por el precio final');
-- Sin precio esperado (llamadas anteriores): no se compara.
select (registrar_venta(:turno, :servicio_r, 'transferencia', p_descuento_id => :jubilados, p_patente => $p$AB123CD$p$)).id as v_red \gset
select is((select row(monto_descuento, precio)::text from ventas where id = :v_red),
  row(33.33, 300.00)::text, '10 % de $ 333,33 descuenta $ 33,33');

-- Con pago mixto: las partes suman el precio final
select throws_ok(format($$select registrar_venta(%s, %s, p_descuento_id => %s,
    p_pagos => '[{"medio":"efectivo","monto":5000},{"medio":"transferencia","monto":15000}]', p_patente => $p$AB123CD$p$)$$, :turno, :servicio, :promo),
  '22023', 'Las partes del pago suman $ 20.000,00 y el precio es $ 15.000,00: tienen que coincidir',
  'el pago mixto se compara con el precio con descuento');
select (registrar_venta(:turno, :servicio, p_descuento_id => :promo,
          p_pagos => '[{"medio":"efectivo","monto":5000},{"medio":"transferencia","monto":10000}]', p_patente => $p$AB123CD$p$)).id as v_promo \gset
select is((select row(precio, monto_descuento, medio_pago)::text from ventas where id = :v_promo),
  row(15000.00, 5000.00, null::text)::text, 'descuento fijo con pago mixto');

-- Validaciones
select throws_ok(format('select registrar_venta(%s, %s, %L, p_descuento_id => %s, p_patente => $p$AB123CD$p$)', :turno, :servicio, 'efectivo', :viejo),
  '22023', 'El descuento no existe o está desactivado', 'un descuento inactivo no se usa');
select throws_ok(format('select registrar_venta(%s, %s, %L, p_descuento_id => 999999999, p_patente => $p$AB123CD$p$)', :turno, :servicio, 'efectivo'),
  '22023', 'El descuento no existe o está desactivado', 'un descuento inexistente tampoco');
select throws_ok(format('select registrar_venta(%s, %s, %L, p_descuento_id => %s, p_patente => $p$AB123CD$p$)', :turno, :servicio_r, 'efectivo', :promo),
  '22023', 'El descuento "Promo" no está habilitado para "Servicio Redondeo"', 'solo en los servicios habilitados');
select throws_ok(format('select registrar_venta(%s, %s, %L, p_descuento_id => %s, p_patente => $p$AB123CD$p$)', :turno, :servicio, 'efectivo', :gigante),
  'P0001', 'Con el descuento "Gigante" el precio de "Servicio Test" queda en $ 0,00: tiene que ser mayor a cero',
  'el precio final tiene que quedar mayor a cero');
-- Precio esperado: lo que el cajero vio en pantalla
select throws_ok(format('select registrar_venta(%s, %s, %L, p_descuento_id => %s, p_precio_esperado => 20000, p_patente => $p$AB123CD$p$)', :turno, :servicio, 'efectivo', :jubilados),
  'P0001', 'El precio cambió: ahora es $ 18.000,00. Revisá la venta.',
  'si el precio final no es el esperado (vio el precio sin descuento), se rechaza');
reset role;
update servicios set precio = 16000 where id = :servicio_b;
select pg_temp.como(:'cajero');
select throws_ok(format('select registrar_venta(%s, %s, %L, p_precio_esperado => 15000, p_patente => $p$AB123CD$p$)', :turno, :servicio_b, 'efectivo'),
  'P0001', 'El precio cambió: ahora es $ 16.000,00. Revisá la venta.',
  'si el admin cambió el precio mientras el cajero cargaba la venta, se rechaza');
select throws_ok(format('select registrar_venta(%s, %s, %L, p_precio_esperado => 0, p_patente => $p$AB123CD$p$)', :turno, :servicio, 'efectivo'),
  'P0001', 'El precio cambió: ahora es $ 20.000,00. Revisá la venta.',
  'esperar $ 0 en un servicio que no vale 0 también se rechaza');
select throws_ok(format($$select registrar_venta(%s, %s, %L, p_precio_esperado => 'NaN', p_patente => $p$AB123CD$p$)$$, :turno, :servicio, 'efectivo'),
  '22023', 'El precio esperado no es válido', 'NaN no es un precio esperado');
select throws_ok(format('select registrar_venta(%s, %s, %L, p_precio_esperado => -20000, p_patente => $p$AB123CD$p$)', :turno, :servicio, 'efectivo'),
  '22023', 'El precio esperado debe ser mayor a cero', 'un precio esperado negativo se rechaza');
select throws_ok(format('select registrar_venta(%s, %s, %L, p_precio_esperado => 20000.001, p_patente => $p$AB123CD$p$)', :turno, :servicio, 'efectivo'),
  '22023', 'El precio esperado no puede tener más de 2 decimales', 'con más de 2 decimales también');
select is((select count(*)::int from ventas where turno_id = :turno), 3, 'los intentos rechazados no dejan ventas');
select lives_ok(format('select registrar_venta(%s, %s, %L, p_precio_esperado => 0, p_patente => $p$AB123CD$p$)', :turno, :servicio_gratis, 'efectivo'),
  'un servicio de $ 0 se vende esperando $ 0');
select lives_ok('set constraints all immediate', 'las ventas con descuento quedan coherentes con sus pagos');
set constraints all deferred;
reset role;

-- CHECKs de la foto (la base los garantiza aunque se escriba fuera de la RPC)
select throws_ok(format($$update ventas set descuento_valor = 'NaN' where id = %s$$, :v_jub),
  '23514', 'new row for relation "ventas" violates check constraint "ventas_descuento_valor_valido"',
  'el valor de la foto no puede ser NaN');
select throws_ok(format('update ventas set descuento_nombre = %L where id = %s', repeat('x', 101), :v_jub),
  '23514', 'new row for relation "ventas" violates check constraint "ventas_descuento_nombre_largo"',
  'el nombre de la foto tiene hasta 100 caracteres');
select throws_ok(format('update ventas set monto_descuento = 1999, precio = 18001 where id = %s', :v_jub),
  '23514', 'new row for relation "ventas" violates check constraint "ventas_monto_descuento_coherente"',
  'el monto de la foto tiene que salir del tipo, el valor y el precio de lista');
-- El CHECK repite inline la cuenta de _monto_descuento(): tienen que dar lo mismo.
select is((select count(*)::int
           from generate_series(1, 9999, 7) g(centesimos),
                (values (0.01), (10), (333.33), (20000), (12345.67), (9999999999.99)) p(precio),
                (values ('porcentaje'::tipo_descuento), ('monto_fijo')) t(tipo)
           where public._monto_descuento(t.tipo, g.centesimos / 100.0, p.precio)
                 is distinct from case t.tipo when 'porcentaje' then round(p.precio * (g.centesimos / 100.0) / 100, 2)
                                              else g.centesimos / 100.0 end), 0,
  'el CHECK y _monto_descuento() calculan el mismo monto');

-- La foto no cambia si después se edita el descuento
select pg_temp.como(:'admin');
update descuentos set nombre = 'Jubilados 50', valor = 50 where id = :jubilados;
reset role;
select is((select row(descuento_nombre, descuento_valor, monto_descuento, precio)::text from ventas where id = :v_jub),
  row('Jubilados 10', 10.00, 2000.00, 18000.00)::text, 'la venta conserva la foto del descuento');

-- El cajero lee la foto en sus ventas y en v_movimientos_caja
select pg_temp.como(:'cajero');
select is((select row(descuento_nombre, monto_descuento, precio_lista)::text from ventas where id = :v_jub),
  row('Jubilados 10', 2000.00, 20000.00)::text, 'el cajero lee las columnas del descuento de su venta');
select is((select row(descuento_nombre, monto_descuento, precio_lista, monto)::text
           from v_movimientos_caja where tipo = 'venta' and id = :v_jub),
  row('Jubilados 10', 2000.00, 20000.00, 18000.00)::text, 'v_movimientos_caja muestra el descuento');
reset role;

-- Totales con el precio final
select is((select row(ventas_total, ventas_efectivo, ventas_transferencia, efectivo_en_caja)::text
           from v_turnos where id = :turno),
  row(33300.00, 23000.00, 10300.00, 23100.00)::text, 'los totales del turno usan el precio final');
select pg_temp.como(:'admin');
select is((select total_ventas from resumen_diario(fecha_local(now()), fecha_local(now()))), 33300.00::numeric,
  'resumen_diario usa el precio final');

-- Estadísticas -------------------------------------------------------------------------------------
select is((select array_agg(row(agrupacion, id, nombre, cantidad_ventas, total_descontado)::text)
           from resumen_descuentos(fecha_local(now()), fecha_local(now()))),
  array[row('total', null::bigint, 'Total', 3, 7033.33)::text,
        row('descuento', :promo::bigint, 'Promo', 1, 5000.00)::text,
        row('descuento', :jubilados::bigint, 'Jubilados 50', 2, 2033.33)::text,
        row('servicio', :servicio::bigint, 'Servicio Test', 2, 7000.00)::text,
        row('servicio', :servicio_r::bigint, 'Servicio Redondeo', 1, 33.33)::text],
  'resumen_descuentos: total, por descuento y por servicio, de mayor a menor');
select is((select count(*)::int from resumen_descuentos(fecha_local(now()) - 10, fecha_local(now()) - 1)), 0,
  'filtra por día de negocio');
select throws_ok(format($$select * from resumen_descuentos('%s', '%s')$$, current_date, current_date - 1),
  '22023', 'La fecha "desde" no puede ser posterior a "hasta"', 'rango invertido');

-- Anulación: devuelve lo cobrado y deja de contar ---------------------------------------------------
select anular_venta(:v_promo, 'Error');
reset role;
select is((select efectivo_en_caja from v_turnos where id = :turno), 18100.00::numeric,
  'anular devuelve del cajón solo el efectivo cobrado (con descuento)');
select pg_temp.como(:'admin');
select is((select row(cantidad_ventas, total_descontado)::text from resumen_descuentos() where agrupacion = 'total'),
  row(2, 2033.33)::text, 'las anuladas no cuentan en las estadísticas');
select throws_ok(format('delete from descuentos where id = %s', :jubilados),
  '23503', null, 'un descuento usado en ventas no se borra');
select lives_ok(format('delete from descuentos where id = %s', :gigante),
  'uno sin ventas sí (con su disponibilidad)');

-- Venta pasada: sin descuento -------------------------------------------------------------------------
select (registrar_venta_pasada(fecha_local(now()) - 3, '10:00', :caja, :servicio, 'transferencia', 7000)).id as pasada \gset
reset role;
select is((select row(precio_lista, monto_descuento, precio, descuento_id)::text from ventas where id = :pasada),
  row(7000.00, 0.00, 7000.00, null::bigint)::text, 'la venta pasada queda sin descuento');
select throws_ok(format('update ventas set descuento_id = %s, descuento_nombre = %L, descuento_tipo = %L, descuento_valor = 1, monto_descuento = 1, precio = 6999 where id = %s',
    :promo, 'Promo', 'monto_fijo', :pasada),
  '23514', null, 'la base no admite descuento en una venta sin turno');

-- Facturación: se factura el precio final -----------------------------------------------------------
insert into arca_condiciones_iva (id, descripcion, clases) values (5, 'Consumidor Final', '{B,C,49}')
  on conflict (id) do nothing;
update arca_configuracion set cuit = '30-71234567-1', razon_social = 'VTV Test SA',
  domicilio = 'Ruta 3 km 10', inicio_actividades = '2020-01-01', punto_venta = 3 where id;
set local role service_role;
select _arca_guardar_credenciales('CERTIFICADO-PEM', 'CLAVE-PEM', '30712345671',
  'SERIALNUMBER=CUIT 30712345671', now() + interval '1 year', :'admin');
reset role;
select pg_temp.como(:'cajero');
select is((select total from preparar_factura(:v_jub, 5, 99::smallint, 0)), 18000.00::numeric,
  'la factura es por el precio con descuento');
reset role;

-- Anónimo y desactivado ----------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.descuentos_para_servicio(bigint)', 'execute'),
  'anon no pide descuentos');
select ok(not has_function_privilege('anon', 'public.fijar_servicios_descuento(bigint, bigint[])', 'execute')
      and not has_function_privilege('anon', 'public.resumen_descuentos(date, date)', 'execute'),
  'anon no fija servicios ni ve estadísticas');
select pg_temp.como_anonimo();
select throws_ok('select * from descuentos', '42501', null, 'anon no lee descuentos');
select throws_ok('select * from descuento_servicios', '42501', null, 'ni su disponibilidad');
reset role;

select pg_temp.como(:'cajero');
select throws_ok('select * from resumen_descuentos()', '42501', null, 'el cajero no ve las estadísticas');
reset role;

update perfiles set activo = false where id = :'cajero2';
select pg_temp.como(:'cajero2');
select throws_ok(format('select * from descuentos_para_servicio(%s)', :servicio),
  '42501', 'Usuario no autenticado o desactivado', 'un usuario desactivado no pide descuentos');
select is((select count(*)::int from descuentos), 0, 'ni los lee');
reset role;

select * from finish();
rollback;
