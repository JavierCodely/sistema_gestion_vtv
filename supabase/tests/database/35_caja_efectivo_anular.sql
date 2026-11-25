-- Migración 47: el cajero ve el efectivo del cajón y anula sus ventas de un turno abierto.
begin;
\ir _helpers.psql
select plan(21);

select * from pg_temp.escenario() \gset
select pg_temp.crear_usuario('cajero2@test.local', 'cajero') as cajero2 \gset

select ok(has_function_privilege('authenticated', 'public.efectivo_en_caja_de_turno(bigint)', 'execute')
  and not has_function_privilege('anon', 'public.efectivo_en_caja_de_turno(bigint)', 'execute'),
  'authenticated ve el efectivo de la caja; anon no');

-- Efectivo del cajón ------------------------------------------------------------------------------------
select pg_temp.abrir_turno_para(:'admin', :'cajero', :caja, 100) as turno \gset
select (registrar_venta(:turno, :servicio, 'efectivo', 'TE111AA')).id as v_efectivo \gset
select (registrar_venta(:turno, :servicio, 'transferencia', 'TE222BB')).id as v_transf \gset
select is(efectivo_en_caja_de_turno(:turno), 20100.00::numeric,
  'el cajero ve el efectivo de la caja: inicial + ventas en efectivo (no la transferencia)');
select throws_ok('select efectivo_en_caja_de_turno(999999)', '22023', 'El turno elegido no existe',
  'un turno inexistente se rechaza');
select throws_ok('select efectivo_en_caja_de_turno(null)', '22023',
  'Elegí la caja en la que estás trabajando', 'sin turno se rechaza');
select is(nombre_usuario(:'admin'), null, 'el cajero no ve el nombre del admin si no hizo nada en la caja');
reset role;

-- Ventas de otros: solo el admin ---------------------------------------------------------------------------
select pg_temp.como(:'cajero2');
select (registrar_venta(:turno, :servicio, 'tarjeta', 'TE333CC')).id as v_otro \gset
reset role;
select pg_temp.como(:'cajero');
select throws_ok(format('select anular_venta(%s, %L)', :v_otro, 'error'), '42501',
  'Solo podés anular las ventas que registraste vos: pedile al administrador que la anule',
  'el cajero no anula la venta de un compañero');
reset role;
select pg_temp.como(:'admin');
select anular_venta(:v_otro, 'Cobro duplicado');
reset role;
select pg_temp.como(:'cajero');
select is(nombre_usuario(:'admin'), 'Usuario admin@test.local',
  'el cajero ve el nombre de quien anuló una venta de un turno abierto');

-- Sus ventas: queda registrado quién, cuándo y por qué ------------------------------------------------------
select throws_ok(format('select anular_venta(%s, %L)', :v_efectivo, ''), '22023',
  'El motivo es obligatorio', 'anular exige motivo');
select is((anular_venta(:v_efectivo, 'Se cargó mal')).anulada, true, 'el cajero anula su venta');
reset role;
select is((select row(anulada, anulada_por, anulada_motivo, anulada_en is not null)::text
           from ventas where id = :v_efectivo),
  row(true, :'cajero'::uuid, 'Se cargó mal', true)::text, 'queda registrado quién anuló, cuándo y por qué');
select pg_temp.como(:'cajero');
select is(efectivo_en_caja_de_turno(:turno), 100.00::numeric, 'el efectivo de la venta anulada sale del cajón');
select throws_ok(format('select anular_venta(%s, %L)', :v_efectivo, 'otra vez'), 'P0001',
  'La venta ya estaba anulada', 'no se anula dos veces');
reset role;

-- La venta del admin en la caja: el cajero no la anula --------------------------------------------------
select pg_temp.como(:'admin');
select (registrar_venta(:turno, :servicio, 'tarjeta', 'TE444DD')).id as v_admin \gset
reset role;
select pg_temp.como(:'cajero');
select throws_ok(format('select anular_venta(%s, %L)', :v_admin, 'error'), '42501',
  'Solo podés anular las ventas que registraste vos: pedile al administrador que la anule',
  'tampoco la del admin');
reset role;

-- Facturada: la nota de crédito queda pendiente para el admin -------------------------------------------
select pg_temp.como(:'cajero');
select (registrar_venta(:turno, :servicio, 'transferencia', 'TE555EE')).id as v_facturada \gset
reset role;
insert into arca_condiciones_iva (id, descripcion, clases) values (5, 'Consumidor Final', '{B,C,49}')
  on conflict (id) do nothing;
insert into comprobantes (venta_id, tipo, clase, cbte_tipo, ambiente, cuit_emisor, punto_venta, estado,
                          numero, cae, fecha, fecha_servicio, doc_tipo, doc_nro, condicion_iva_receptor_id,
                          neto, iva, total, creado_por)
values (:v_facturada, 'factura', 'B', 6, 'homologacion', '30712345671', 3, 'autorizado',
        1, '75123456789012', current_date, current_date, 99, 0, 5, 16528.93, 3471.07, 20000, :'cajero')
returning id as factura \gset
select pg_temp.como(:'cajero');
select lives_ok(format('select anular_venta(%s, %L)', :v_facturada, 'Error de servicio'),
  'el cajero anula su venta facturada');
reset role;
select is((select row(estado, asociado_id, creado_por)::text from comprobantes
           where venta_id = :v_facturada and tipo = 'nota_credito'),
  row('pendiente'::estado_comprobante, :factura::bigint, :'cajero'::uuid)::text,
  'la nota de crédito queda pendiente');
select pg_temp.como(:'cajero');
select throws_ok(format('select puede_emitir_comprobante(%s)',
    (select id from comprobantes where venta_id = :v_facturada and tipo = 'nota_credito')),
  '42501', 'Solo un administrador puede emitir notas de crédito', 'y la emite el admin');
reset role;

-- Turno cerrado: ni efectivo ni anular ----------------------------------------------------------------------
select pg_temp.como(:'admin');
select cerrar_turno(:turno);
reset role;
select pg_temp.como(:'cajero');
select throws_ok(format('select efectivo_en_caja_de_turno(%s)', :turno), 'P0001',
  'El turno de la caja "Caja Test" ya se cerró: elegí una caja abierta',
  'el efectivo de un turno cerrado no se ve');
select throws_ok(format('select anular_venta(%s, %L)', :v_transf, 'error'), '42501',
  'Solo el administrador anula ventas de un turno cerrado', 'el cajero no anula ventas de un turno cerrado');
reset role;
select pg_temp.como(:'admin');
select lives_ok(format('select anular_venta(%s, %L)', :v_transf, 'Cobro duplicado'),
  'el admin sí');
select (registrar_venta_pasada('2026-11-01', '10:00', :caja, :servicio, 'tarjeta', 20000)).id as v_pasada \gset
reset role;
select pg_temp.como(:'cajero');
select throws_ok(format('select anular_venta(%s, %L)', :v_pasada, 'error'), '42501',
  'Solo el administrador anula ventas de un turno cerrado', 'ni una venta con fecha pasada');
reset role;

select pg_temp.como_anonimo();
select throws_ok(format('select efectivo_en_caja_de_turno(%s)', :turno), '42501', null,
  'anon no ve el efectivo');
reset role;

select * from finish();
rollback;
