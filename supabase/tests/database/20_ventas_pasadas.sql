begin;
\ir _helpers.psql
select plan(28);

select * from pg_temp.escenario() \gset
insert into certificados (todos_servicios, nombre, hojas_por_unidad, stock_minimo) values (true, 'Hoja VTV', 25, 10) returning id as cert \gset

select pg_temp.como(:'admin');
select registrar_compra_certificado(:cert, 4, 50000, 'transferencia');
select movimiento_efectivo('fondo_inicial', 1000, 'Fondo para las pruebas');
reset role;

-- ------------------------------------------------------------------ permisos
select ok(not has_function_privilege('anon',
  'public.registrar_venta_pasada(date, time, bigint, bigint, public.medio_pago, numeric, text)', 'execute'),
  'anon no carga ventas pasadas');
select pg_temp.como(:'cajero');
select throws_ok(format($$select registrar_venta_pasada('2026-11-01', '10:00', %s, %s, 'efectivo', 20000)$$,
  :caja, :servicio), '42501', null, 'el cajero no carga ventas con fecha pasada');
reset role;

-- ------------------------------------------------------------------ validaciones
select pg_temp.como(:'admin');
select throws_ok(format($$select registrar_venta_pasada(null, '10:00', %s, %s, 'efectivo', 20000)$$,
  :caja, :servicio), '22023', 'Elegí la fecha de la venta', 'la fecha es obligatoria');
select throws_ok(format($$select registrar_venta_pasada('2026-11-01', null, %s, %s, 'efectivo', 20000)$$,
  :caja, :servicio), '22023', 'Elegí la hora de la venta', 'la hora es obligatoria');
select throws_ok(format($$select registrar_venta_pasada((now() at time zone 'America/Argentina/Buenos_Aires')::date + 1, '00:00', %s, %s, 'efectivo', 20000)$$,
  :caja, :servicio), '22023', 'La fecha y hora de la venta tienen que ser anteriores a este momento',
  'no se cargan ventas en el futuro');
select throws_ok(format($$select registrar_venta_pasada('1999-12-31', '10:00', %s, %s, 'efectivo', 20000)$$,
  :caja, :servicio), '22023', 'La fecha de la venta no puede ser anterior al 01/01/2000',
  'fechas absurdas se rechazan');
select throws_ok(format($$select registrar_venta_pasada('2026-11-01', '10:00', %s, %s, null, 20000)$$,
  :caja, :servicio), '22023', 'Elegí un medio de pago', 'el medio de pago es obligatorio');
select throws_ok(format($$select registrar_venta_pasada('2026-11-01', '10:00', 0, %s, 'efectivo', 20000)$$,
  :servicio), '22023', 'La caja no existe', 'la caja tiene que existir');
select throws_ok(format($$select registrar_venta_pasada('2026-11-01', '10:00', %s, 0, 'efectivo', 20000)$$,
  :caja), '22023', 'El servicio no existe', 'el servicio tiene que existir');
select throws_ok(format($$select registrar_venta_pasada('2026-11-01', '10:00', %s, %s, 'efectivo', -1)$$,
  :caja, :servicio), '22023', null, 'el precio no puede ser negativo');
select throws_ok(format($$select registrar_venta_pasada('2026-11-01', '10:00', %s, %s, 'efectivo', 'NaN')$$,
  :caja, :servicio), '22023', null, 'ni NaN');
select throws_ok(format($$select registrar_venta_pasada('2026-11-01', '10:00', %s, %s, 'efectivo', 10.555)$$,
  :caja, :servicio), '22023', null, 'ni con más de 2 decimales');
select throws_ok(format($$select registrar_venta_pasada('2026-11-01', '10:00', %s, %s, 'efectivo', 100, 'ABC123456789')$$,
  :caja, :servicio), '23514', null, 'la patente respeta el largo máximo');

-- ------------------------------------------------------------------ venta en efectivo
select (registrar_venta_pasada('2026-11-01', '10:30', :caja, :servicio, 'efectivo', 15000, ' ab 123 cd ')).id
  as pasada \gset
reset role;

select is(
  (select row(turno_id, caja_id, usuario_id, precio, medio_pago::text, patente, certificado_id,
              costo_certificado, sin_stock, fecha_local(creado_en),
              to_char(creado_en at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI'))::text
   from ventas where id = :pasada),
  row(null::bigint, :caja, :'admin'::uuid, 15000.00, 'efectivo', 'AB123CD', null::bigint, 0.0000, false,
      date '2026-11-01', '10:30')::text,
  'sin turno, con el precio elegido, patente normalizada, sin certificado y en la fecha y hora elegidas (hora AR)');
select ok((select cargada_en is not null and cargada_en > creado_en from ventas where id = :pasada),
  'guarda cuándo se cargó');
select is((select stock_hojas from certificados where id = :cert), 100, 'no descuenta hojas del stock');
select is((select count(*)::int from movimientos_certificado where venta_id = :pasada), 0, 'ni pasa por el kardex');
select is((select count(*)::int from alertas where venta_id = :pasada), 0, 'ni genera alertas');
select is((select saldo from caja_efectivo), 16000.00::numeric, 'el efectivo entra a la caja de cambio');
select is(
  (select row(tipo::text, monto, turno_id)::text from movimientos_efectivo where venta_id = :pasada),
  row('venta', 15000.00, null::bigint)::text, 'y queda en el libro de efectivo, sin turno');
select is(
  (select total_efectivo from resumen_diario('2026-11-01', '2026-11-01')),
  15000.00::numeric, 'el reporte diario la cuenta en su fecha');

-- Otros medios no mueven la caja de cambio; caja y servicio desactivados se aceptan (historial).
update cajas set activa = false where id = :caja2;
update servicios set activo = false where id = :servicio;
select pg_temp.como(:'admin');
select (registrar_venta_pasada('2026-10-15', '18:00', :caja2, :servicio, 'tarjeta', 0)).id as pasada_tarjeta \gset
reset role;
select is((select row(precio, caja_id)::text from ventas where id = :pasada_tarjeta),
  row(0.00, :caja2)::text, 'acepta precio $ 0 y caja o servicio hoy desactivados');
select is((select saldo from caja_efectivo), 16000.00::numeric, 'con tarjeta no toca la caja de cambio');

-- ------------------------------------------------------------------ facturación
insert into arca_condiciones_iva (id, descripcion, clases) values (5, 'Consumidor Final', '{B,C,49}');
update arca_configuracion set cuit = '30712345671', razon_social = 'VTV Test SA', domicilio = 'Ruta 3 km 10',
  inicio_actividades = '2020-01-01', punto_venta = 3 where id;
set local role service_role;
select _arca_guardar_credenciales('CERTIFICADO-PEM', 'CLAVE-PEM', '30712345671',
  'SERIALNUMBER=CUIT 30712345671', now() + interval '1 year', :'admin');
reset role;
select pg_temp.como(:'admin');
select throws_ok(format('select preparar_factura(%s, 5, 99::smallint, 0)', :pasada),
  'P0001', 'Las ventas cargadas con fecha pasada no se facturan desde el sistema',
  'las ventas pasadas no se facturan');

-- ------------------------------------------------------------------ anulación
select anular_venta(:pasada, 'Se cargó dos veces');
reset role;
select is((select anulada from ventas where id = :pasada), true, 'el admin la anula');
select is((select saldo from caja_efectivo), 1000.00::numeric, 'el efectivo sale de la caja de cambio');
select is(
  (select row(tipo::text, monto)::text from movimientos_efectivo
   where venta_id = :pasada and tipo = 'anulacion_venta'),
  row('anulacion_venta', -15000.00)::text, 'la devolución queda en el libro');

-- Integridad: una venta sin turno tiene que ser una carga con fecha pasada.
select throws_ok(format($$update ventas set cargada_en = null where id = %s$$, :pasada_tarjeta),
  '23514', null, 'una venta sin turno siempre registra cuándo se cargó');

select * from finish();
rollback;
