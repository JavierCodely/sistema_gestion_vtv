-- Migración 45: ventas anteriores de una patente (aviso de patente repetida en la caja).
begin;
\ir _helpers.psql
select plan(13);

select * from pg_temp.escenario() \gset

-- Privilegios ---------------------------------------------------------------------------------------
select ok(has_function_privilege('authenticated', 'public.ventas_anteriores_de_patente(text)', 'execute')
  and not has_function_privilege('anon', 'public.ventas_anteriores_de_patente(text)', 'execute'),
  'authenticated ejecuta ventas_anteriores_de_patente; anon no');
select is((select array_agg(parameter_name::text order by ordinal_position)
           from information_schema.parameters p
           join information_schema.routines r on r.specific_name = p.specific_name
           where r.routine_schema = 'public' and r.routine_name = 'ventas_anteriores_de_patente'
             and p.parameter_mode = 'OUT'),
  array['venta_id', 'fecha', 'servicio_nombre', 'certificado_nombre', 'condicional', 'vuelta'],
  'devuelve solo fecha, servicio y certificado: sin montos, medio, caja, usuario ni costos');

-- Datos: un certificado del servicio, ventas en un turno que después se cierra ----------------------
select pg_temp.como(:'admin');
insert into certificados (nombre, hojas_por_unidad) values ('Hoja Patente', 1) returning id as cert \gset
select fijar_destinos_certificado(:cert, false, '{}', array[:servicio]::bigint[]);
select ajustar_stock_certificado(:cert, 10, 'Stock de prueba');
reset role;

select pg_temp.abrir_turno_para(:'admin', :'cajero', :caja, 100) as turno \gset
select (registrar_venta(:turno, :servicio, 'efectivo', 'tp 901 xq')).id as v1 \gset
select (registrar_venta(:turno, :servicio, 'tarjeta', 'TP901XQ')).id as v2 \gset
select (registrar_venta(:turno, :servicio, 'tarjeta', 'TP901XQ')).id as v_anulada \gset
select (registrar_venta(:turno, :servicio, 'tarjeta', 'ZZ999ZZ')).id as v_otra \gset
reset role;
-- La primera, de otro día (para el orden y la fecha de negocio).
update ventas set creado_en = '2026-01-10 15:00-03' where id = :v1;
select pg_temp.como(:'admin');
select anular_venta(:v_anulada, 'error de carga');
select cerrar_turno(:turno);
select (registrar_venta_pasada('2025-06-01', '10:00', :caja, :servicio, 'efectivo', 20000, 'TP901XQ')).id as v_pasada \gset
reset role;

-- El cajero las ve aunque el turno ya se cerró --------------------------------------------------------
select pg_temp.como(:'cajero');
select is((select count(*)::int from ventas where patente = 'TP901XQ'), 0,
  'por RLS el cajero no lee las ventas de un turno cerrado');
select is((select array_agg(venta_id order by ord) from (
             select venta_id, row_number() over () as ord from ventas_anteriores_de_patente(' tp 901 xq ')) x),
  array[:v2, :v1, :v_pasada]::bigint[],
  'pero la RPC le devuelve las ventas de la patente (normalizada), de la más nueva a la más vieja, sin anuladas');
select is((select row(fecha, servicio_nombre, certificado_nombre, condicional, vuelta)::text
           from ventas_anteriores_de_patente('TP901XQ') where venta_id = :v1),
  row('2026-01-10'::date, 'Servicio Test', 'Hoja Patente', false, false)::text,
  'cada venta trae el día de negocio, el servicio y el certificado entregado');
select is((select row(fecha, certificado_nombre)::text
           from ventas_anteriores_de_patente('TP901XQ') where venta_id = :v_pasada),
  row('2025-06-01'::date, null::text)::text,
  'una venta con fecha pasada no tiene certificado');
select is((select count(*)::int from ventas_anteriores_de_patente('TP901')), 0,
  'busca la patente exacta, no por prefijo');
select is((select count(*)::int from ventas_anteriores_de_patente('QQ000QQ')), 0,
  'una patente sin ventas no trae nada');
select throws_ok($$select * from ventas_anteriores_de_patente('  ')$$, '22023',
  'Ingresá la patente del vehículo', 'sin patente, avisa');
reset role;

-- Condicional y vuelta ----------------------------------------------------------------------------
select pg_temp.como(:'admin');
insert into certificados (nombre, hojas_por_unidad, condicional, dias_vuelta)
  values ('Hoja B Patente', 1, true, 30) returning id as cert_b \gset
select fijar_destinos_certificado(:cert_b, false, '{}', array[:servicio]::bigint[]);
reset role;
select pg_temp.abrir_turno_para(:'admin', :'cajero', :caja, 100) as turno2 \gset
select (registrar_venta(:turno2, :servicio, 'efectivo', 'TQ456RW', p_condicional => true)).id as v_cond \gset
select (registrar_venta(:turno2, :servicio, 'efectivo', 'TQ456RW', p_precio_esperado => 0)).id as v_vuelta \gset
select is((select row(certificado_nombre, condicional, vuelta)::text
           from ventas_anteriores_de_patente('TQ456RW') where venta_id = :v_cond),
  row('Hoja B Patente', true, false)::text, 'marca la condicional con su certificado');
select is((select row(certificado_nombre, condicional, vuelta)::text
           from ventas_anteriores_de_patente('TQ456RW') where venta_id = :v_vuelta),
  row('Hoja Patente', false, true)::text, 'y la vuelta con el certificado de siempre');
reset role;

-- Usuarios sin acceso -----------------------------------------------------------------------------
select pg_temp.como_anonimo();
select throws_ok($$select * from ventas_anteriores_de_patente('TP901XQ')$$, '42501', null,
  'anon no la ejecuta');
reset role;
update perfiles set activo = false where id = :'cajero';
select pg_temp.como(:'cajero');
select throws_ok($$select * from ventas_anteriores_de_patente('TP901XQ')$$, '42501', null,
  'un usuario desactivado tampoco');
reset role;

select * from finish();
rollback;
