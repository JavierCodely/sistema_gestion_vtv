-- Migración 52: arreglos de la auditoría contable (impuesto fijo de la vuelta, costo del resumen
-- diario y patente normalizada solo con letras y números).
begin;
\ir _helpers.psql
select plan(12);

select * from pg_temp.escenario() \gset

select ok(not has_function_privilege('authenticated', 'public._ventas_normalizar_patente()', 'execute'),
  'la función del trigger de la patente es interna');

-- Catálogo: certificado de siempre con costo por hoja de 4 decimales y uno condicional ---------------
select pg_temp.como(:'admin');
insert into certificados (nombre, hojas_por_unidad) values ('Hoja E aud', 13) returning id as c_e \gset
insert into certificados (nombre, hojas_por_unidad, condicional, dias_vuelta)
  values ('Hoja B aud', 1, true, 30) returning id as c_b \gset
select fijar_destinos_certificado(:c_e, false, '{}', array[:servicio]::bigint[]);
select fijar_destinos_certificado(:c_b, false, '{}', array[:servicio]::bigint[]);
-- 1 libreta de 13 hojas a $ 11.000: $ 846,1538 por hoja.
select registrar_compra_certificado(:c_e, 1, 11000, 'transferencia');
select ajustar_stock_certificado(:c_b, 10, 'Stock de prueba');
insert into impuestos (nombre, tipo, valor)
  values ('Fijo impar aud', 'monto_fijo', 150.01) returning id as imp_impar \gset
insert into impuestos (nombre, tipo, valor)
  values ('Fijo par aud', 'monto_fijo', 150) returning id as imp_par \gset
select fijar_servicios_impuesto(:imp_impar, true, '{}');
select fijar_servicios_impuesto(:imp_par, true, '{}');
reset role;

select pg_temp.abrir_turno_para(:'admin', :'cajero', :caja, 100) as turno \gset

-- 3. Patente: solo letras y números -------------------------------------------------------------------
select (registrar_venta(:turno, :servicio, 'efectivo', ' ab-123 cd ')).id as v_pat \gset
select is((select patente from ventas where id = :v_pat), 'AB123CD',
  'la venta guarda la patente sin guiones ni espacios');
select is((select count(*) from ventas_anteriores_de_patente('AB-123-CD')), 1::bigint,
  'buscar con guiones encuentra la misma patente');

-- 1. Impuesto fijo: condicional al 50% + vuelta ---------------------------------------------------------
select (registrar_venta(:turno, :servicio, 'efectivo', 'IMP111', p_condicional => true,
  p_condicional_mitad => true)).id as cond \gset
select (registrar_venta(:turno, :servicio, 'transferencia', 'IMP111', p_precio_esperado => 10000)).id as vuelta \gset
reset role;
select is((select monto from venta_impuestos where venta_id = :cond and impuesto_id = :imp_impar),
  75.01::numeric, 'la condicional al 50% lleva su mitad redondeada (75,01)');
select is((select monto from venta_impuestos where venta_id = :vuelta and impuesto_id = :imp_impar),
  75.00::numeric, 'la vuelta lleva lo que falta (75,00), no otra mitad redondeada');
select is((select sum(monto) from venta_impuestos
           where venta_id in (:cond, :vuelta) and impuesto_id = :imp_impar),
  150.01::numeric, 'entre las dos queda el impuesto completo: 150,01');
select is((select sum(monto) from venta_impuestos
           where venta_id in (:cond, :vuelta) and impuesto_id = :imp_par),
  150.00::numeric, 'con un valor par sigue dando 75 + 75');

-- Anular la vuelta y registrarla de nuevo da lo mismo.
select pg_temp.como(:'cajero');
select anular_venta(:vuelta, 'Se cargó mal');
select (registrar_venta(:turno, :servicio, 'efectivo', 'IMP111', p_precio_esperado => 10000)).id as vuelta2 \gset
reset role;
select is((select sum(monto) from venta_impuestos
           where venta_id in (:cond, :vuelta2) and impuesto_id = :imp_impar),
  150.01::numeric, 'la vuelta registrada de nuevo también completa 150,01');
reset role;

-- Si el impuesto cambió entre la condicional y la vuelta, cada venta usa su valor.
select pg_temp.como(:'cajero');
select (registrar_venta(:turno, :servicio, 'efectivo', 'IMP222', p_condicional => true,
  p_condicional_mitad => true)).id as cond2 \gset
reset role;
update impuestos set valor = 200 where id = :imp_impar;
select pg_temp.como(:'cajero');
select (registrar_venta(:turno, :servicio, 'efectivo', 'IMP222', p_precio_esperado => 10000)).id as vuelta3 \gset
reset role;
select is((select monto from venta_impuestos where venta_id = :vuelta3 and impuesto_id = :imp_impar),
  100.00::numeric, 'con otro valor la vuelta lleva su mitad del valor nuevo (100,00)');
reset role;

-- 2. Costo de certificados del resumen diario = kardex ---------------------------------------------------
select pg_temp.como(:'cajero');
select (registrar_venta(:turno, :servicio, 'efectivo', 'COS111')).id as k1 \gset
select (registrar_venta(:turno, :servicio, 'efectivo', 'COS222')).id as k2 \gset
select (registrar_venta(:turno, :servicio, 'efectivo', 'COS333')).id as k3 \gset
reset role;
select is((select costo_certificado from ventas where id = :k1), 846.1538::numeric,
  'cada venta guarda el costo por hoja con 4 decimales');
update ventas set creado_en = '2003-02-03 12:00-03' where id in (:k1, :k2, :k3);
select pg_temp.como(:'admin');
select is((select costo_certificados from resumen_diario('2003-02-03', '2003-02-03')),
  (select -sum(costo_total) from movimientos_certificado where venta_id in (:k1, :k2, :k3))::numeric(14,2),
  'el costo del resumen diario es el mismo que el del kardex');
select is((select row(costo_certificados, margen_bruto)::text from resumen_diario('2003-02-03', '2003-02-03')),
  row(2538.45::numeric(14,2), 57461.55::numeric(14,2))::text,
  'costo 3 × 846,15 = 2.538,45 y margen 60.000 − 2.538,45');
reset role;

select * from finish();
rollback;
