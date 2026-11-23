-- Migración 39: un certificado se usa en una o más categorías y/o servicios.
begin;
\ir _helpers.psql
select plan(26);

select * from pg_temp.escenario() \gset
-- escenario(): categoría "Categoría Test" con "Servicio Test" (lleva certificado).
insert into categorias_servicio (nombre) values ('Motos D') returning id as cat_motos \gset
insert into categorias_servicio (nombre) values ('Camiones D') returning id as cat_camiones \gset
insert into servicios (nombre, categoria_id, precio, requiere_certificado)
  values ('Moto D', :cat_motos, 10000, true) returning id as moto \gset
insert into servicios (nombre, categoria_id, precio, requiere_certificado)
  values ('Camión D', :cat_camiones, 30000, true) returning id as camion \gset
insert into servicios (nombre, categoria_id, precio, requiere_certificado)
  values ('Acoplado D', :cat_camiones, 25000, true) returning id as acoplado \gset

-- Privilegios -------------------------------------------------------------------------------------
select ok(has_function_privilege('authenticated', 'public.fijar_destinos_certificado(bigint, boolean, bigint[], bigint[])', 'execute')
  and not has_function_privilege('anon', 'public.fijar_destinos_certificado(bigint, boolean, bigint[], bigint[])', 'execute'),
  'authenticated ejecuta fijar_destinos_certificado (el control es _exigir_admin); anon no');
select ok(not has_function_privilege('authenticated', 'public._validar_destinos_certificado(bigint, boolean, bigint[], bigint[])', 'execute')
  and not has_function_privilege('authenticated', 'public.tg_certificados_destinos_activo()', 'execute'),
  'la validación y el trigger son internos');
select ok(not has_table_privilege('authenticated', 'public.certificado_destinos', 'insert')
  and not has_table_privilege('authenticated', 'public.certificado_destinos', 'update')
  and not has_table_privilege('authenticated', 'public.certificado_destinos', 'delete')
  and not has_column_privilege('authenticated', 'public.certificados', 'todos_servicios', 'insert')
  and not has_column_privilege('authenticated', 'public.certificados', 'todos_servicios', 'update'),
  'los destinos solo se escriben con la RPC');

-- Un certificado nuevo no se usa en ningún servicio ----------------------------------------------
select pg_temp.como(:'admin');
insert into certificados (nombre, hojas_por_unidad) values ('Hoja varios', 25) returning id as c_varios \gset
select is(certificado_para_servicio(:moto), null, 'un certificado sin destinos no se usa');
select is((select aplica_a from v_stock_certificados where id = :c_varios), 'Sin asignar',
  'la vista lo muestra "Sin asignar"');

-- Varias categorías y un servicio suelto, mezclados ------------------------------------------------
select lives_ok(format($$select fijar_destinos_certificado(%s, false, array[%s, %s, %s]::bigint[], array[%s]::bigint[])$$,
                       :c_varios, :cat_motos, :cat_motos, :cat_camiones, :servicio),
  'se fijan dos categorías (con un repetido) y un servicio');
select is(certificado_para_servicio(:moto), :c_varios::bigint, 'se usa en la primera categoría');
select is(certificado_para_servicio(:acoplado), :c_varios::bigint, 'se usa en la segunda categoría');
select is(certificado_para_servicio(:servicio), :c_varios::bigint, 'se usa en el servicio suelto');
select is(
  (select row(todos_servicios, categoria_ids, servicio_ids, aplica_a)::text from v_stock_certificados where id = :c_varios),
  row(false, array[:cat_motos, :cat_camiones]::bigint[], array[:servicio]::bigint[],
      'Categoría Camiones D, Categoría Motos D, Servicio Test')::text,
  'la vista trae los ids y la lista legible (primero las categorías)');
select is((select aplica_a from stock_certificados_valorizado() where id = :c_varios),
  'Categoría Camiones D, Categoría Motos D, Servicio Test', 'el stock valorizado también');

-- Un servicio nuevo de una categoría entera queda incluido
insert into servicios (nombre, categoria_id, precio, requiere_certificado)
  values ('Moto nueva D', :cat_motos, 11000, true) returning id as moto_nueva \gset
select is(certificado_para_servicio(:moto_nueva), :c_varios::bigint,
  'la categoría entera incluye los servicios nuevos');

-- El más específico gana: un servicio suelto de otro certificado sobre la categoría
insert into certificados (nombre, hojas_por_unidad) values ('Hoja camión', 10) returning id as c_camion \gset
select fijar_destinos_certificado(:c_camion, false, '{}', array[:camion]::bigint[]);
select is(certificado_para_servicio(:camion), :c_camion::bigint, 'el servicio gana sobre la categoría');
select is(certificado_para_servicio(:acoplado), :c_varios::bigint, 'el resto de la categoría sigue con la suya');

-- Choques: un solo certificado activo por destino y nivel ----------------------------------------
insert into certificados (nombre, hojas_por_unidad) values ('Hoja choque', 10) returning id as c_choque \gset
select throws_ok(format($$select fijar_destinos_certificado(%s, false, array[%s]::bigint[], '{}')$$, :c_choque, :cat_motos),
  'P0001', 'La categoría "Motos D" ya usa el certificado activo "Hoja varios". Desactivalo o quitale esa categoría antes.',
  'una categoría no se repite entre certificados activos');
select throws_ok(format($$select fijar_destinos_certificado(%s, false, '{}', array[%s]::bigint[])$$, :c_choque, :camion),
  'P0001', 'El servicio "Camión D" ya usa el certificado activo "Hoja camión". Desactivalo o quitale ese servicio antes.',
  'un servicio no se repite entre certificados activos');

-- Desactivado sí acepta el destino; al activarlo, avisa
update certificados set activo = false where id = :c_choque;
select lives_ok(format($$select fijar_destinos_certificado(%s, false, array[%s]::bigint[], '{}')$$, :c_choque, :cat_motos),
  'un certificado desactivado puede tener un destino ocupado');
select throws_ok(format('update certificados set activo = true where id = %s', :c_choque),
  'P0001', 'La categoría "Motos D" ya usa el certificado activo "Hoja varios". Desactivalo o quitale esa categoría antes.',
  'no se activa si choca con otro activo');
update certificados set activo = false where id = :c_varios;
select is((select bool_or(activo) from certificado_destinos where certificado_id = :c_varios), false,
  'desactivar copia el estado a los destinos');
select lives_ok(format('update certificados set activo = true where id = %s', :c_choque),
  'liberado el destino, se activa');
select is(certificado_para_servicio(:moto), :c_choque::bigint, 'y pasa a usarse');

-- Todos los servicios
insert into certificados (nombre, hojas_por_unidad) values ('Hoja general D', 10) returning id as c_general \gset
select lives_ok(format($$select fijar_destinos_certificado(%s, true, null, null)$$, :c_general),
  'todos los servicios (sin listas)');
select is(certificado_para_servicio(:servicio), :c_general::bigint,
  'sin otro más específico activo se usa el de todos los servicios');
insert into certificados (nombre, hojas_por_unidad) values ('Hoja general E', 10) returning id as c_general2 \gset
select throws_ok(format($$select fijar_destinos_certificado(%s, true, null, null)$$, :c_general2),
  'P0001', 'Ya hay un certificado activo para todos los servicios: "Hoja general D". Desactivalo antes.',
  'solo un certificado activo para todos los servicios');

-- Reemplazar la lista de una vez
select fijar_destinos_certificado(:c_choque, false, '{}', array[:moto]::bigint[]);
select is((select count(*)::int from certificado_destinos where certificado_id = :c_choque and servicio_id = :moto
           and categoria_id is null) + (select count(*)::int from certificado_destinos where certificado_id = :c_choque), 2,
  'la lista se reemplaza: queda solo el servicio');
reset role;

-- El cajero lee los destinos pero no los fija
select pg_temp.como(:'cajero');
select throws_ok(format($$select fijar_destinos_certificado(%s, true, null, null)$$, :c_choque),
  '42501', null, 'el cajero no fija destinos');
reset role;

select * from finish();
rollback;
