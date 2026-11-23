-- Migración 26: nombre y apellido de los usuarios; saldo de efectivo solo para el admin.
begin;
\ir _helpers.psql
select plan(17);

select * from pg_temp.escenario() \gset

-- Nombre y apellido ----------------------------------------------------------------------------

-- El alta (trigger desde auth.users) toma nombre y apellido de user_metadata, normalizados.
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'eva@test.local', '{"rol": "cajero"}',
        '{"nombre": "  Eva   María ", "apellido": " Duarte  "}');
select is(
  (select row(nombre, apellido, nombre_completo)::text from perfiles
   where id = '00000000-0000-0000-0000-0000000000e1'),
  row('Eva María', 'Duarte', 'Eva María Duarte')::text,
  'el alta guarda nombre y apellido normalizados y arma el nombre completo');

-- Sin apellido en los metadatos (ej. usuario creado desde el Dashboard): queda pendiente (NULL).
select is((select apellido from perfiles where id = :'cajero'), null,
  'sin apellido en el alta, queda NULL (la app lo marca como pendiente)');
select is((select nombre_completo from perfiles where id = :'cajero'), 'Usuario cajero@test.local',
  'el nombre completo sin apellido es solo el nombre');

select throws_ok(
  format($$update perfiles set apellido = repeat('x', 101) where id = %L$$, :'cajero'),
  '23514', null, 'el apellido tiene el mismo tope que el nombre (100)');
update perfiles set apellido = '   ' where id = :'cajero';
select is((select apellido from perfiles where id = :'cajero'), null,
  'un apellido en blanco se guarda como pendiente (NULL), nunca como texto vacío');
select throws_ok(
  format($$update perfiles set nombre_completo = 'x' where id = %L$$, :'cajero'),
  '428C9', null, 'el nombre completo es calculado: no se escribe');

update perfiles set nombre = 'Carla', apellido = 'Gómez' where id = :'cajero';
select is((select nombre_completo from perfiles where id = :'cajero'), 'Carla Gómez',
  'el nombre completo sigue a nombre y apellido');

-- Las vistas muestran nombre y apellido (desde la 33 el turno es de la caja: quien vende).
reset role;
insert into certificados (nombre, hojas_por_unidad) values ('Hoja nombres', 25);
select pg_temp.abrir_turno_para(:'admin', :'cajero', :caja) as turno \gset
select registrar_venta(:turno, :servicio, 'tarjeta', p_patente => $p$AB123CD$p$);
reset role;
select pg_temp.como(:'admin');
select is((select atendido_por from v_turnos where id = :turno), array['Carla Gómez'],
  'v_turnos muestra con nombre y apellido a quien atendió');
reset role;
select pg_temp.como(:'cajero');
select is((select usuario_nombre from v_movimientos_caja where turno_id = :turno), 'Carla Gómez',
  'v_movimientos_caja muestra al vendedor con nombre y apellido');
select is(
  (select has_column_privilege('authenticated', 'public.perfiles', 'apellido', 'select')
      and has_column_privilege('authenticated', 'public.perfiles', 'nombre_completo', 'select')),
  true, 'apellido y nombre completo son legibles (con la RLS de perfiles)');
reset role;

-- Caja de efectivo: saldo solo para el admin --------------------------------------------------

select pg_temp.como(:'admin');
select movimiento_efectivo('fondo_inicial', 1000, 'Fondo');
select is((select saldo from caja_efectivo), 1000.00::numeric, 'el admin ve el saldo');
select is((select count(*)::int from v_movimientos_efectivo), 3,
  'el admin ve el libro de efectivo (incluida la salida del efectivo inicial del turno)');
select is((select usuario_nombre from v_movimientos_efectivo where nota = 'Fondo'), 'Usuario admin@test.local',
  'el libro muestra quién hizo cada movimiento');
reset role;

select pg_temp.como(:'cajero');
select is((select count(*)::int from caja_efectivo), 0, 'el cajero no lee el saldo de efectivo');
select is((select count(*)::int from v_movimientos_efectivo), 0, 'el cajero no lee el libro de efectivo');
select throws_ok(
  (select format($$select registrar_gasto(%s, 5000, 'efectivo', 'Mucho café', %s)$$, id, :turno)
   from categorias_gasto where nombre = 'Café y bebidas'),
  'P0001',
  'No hay suficiente efectivo en la caja para este gasto. Avisale al administrador',
  'si el efectivo no alcanza, al cajero no se le dice cuánto hay');
reset role;

select pg_temp.como(:'admin');
select throws_ok($$select movimiento_efectivo('retiro', 5000, 'Depósito')$$, 'P0001',
  'No hay suficiente efectivo en la caja de cambio (disponible: $1.000,00, necesario: $5.000,00)',
  'al admin sí se le informa el disponible');
reset role;

select * from finish();
rollback;
