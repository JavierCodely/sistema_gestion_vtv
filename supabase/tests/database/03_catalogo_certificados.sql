begin;
\ir _helpers.psql
select plan(14);

select * from pg_temp.escenario() \gset

-- Catálogo
select pg_temp.como(:'cajero');
select throws_ok(format($$insert into servicios (nombre, categoria_id, precio) values ('X', %s, 1)$$, :categoria),
  '42501', null, 'un cajero no crea servicios');
select is((select count(*)::int from servicios where id = :servicio), 1, 'un cajero ve los servicios');
reset role;

select pg_temp.como(:'admin');
select throws_ok(format($$insert into servicios (nombre, categoria_id, precio) values ('Neg', %s, -1)$$, :categoria),
  '23514', null, 'el precio no puede ser negativo');
select lives_ok(format($$update servicios set precio = 25000 where id = %s$$, :servicio), 'el admin edita precios');
reset role;

-- Coherencia de certificados (los destinos se prueban en 29_certificados_destinos.sql)
select throws_ok($$insert into certificados (nombre, unidad_compra, hojas_por_unidad) values ('U', 'unidad', 5)$$,
  '23514', null, 'una unidad suelta tiene 1 hoja');
select throws_ok(format($$with c as (insert into certificados (nombre, hojas_por_unidad) values ('Doble', 1) returning id)
                         insert into certificado_destinos (certificado_id, categoria_id, servicio_id, activo)
                         select id, %s, %s, true from c$$, :categoria, :servicio),
  '23514', null, 'un destino es una categoría o un servicio, no los dos');

-- Elección del más específico
insert into categorias_servicio (nombre) values ('Motos Test') returning id as cat_motos \gset
insert into servicios (nombre, categoria_id, precio) values ('Moto Test', :cat_motos, 12000) returning id as moto \gset
insert into servicios (nombre, categoria_id, precio) values ('Moto grande', :cat_motos, 15000) returning id as moto_grande \gset
insert into servicios (nombre, categoria_id, precio, requiere_certificado)
  values ('Reverificación Test', :categoria, 0, false) returning id as rever \gset

select is(certificado_para_servicio(:moto), null, 'sin certificados configurados no hay certificado');

insert into certificados (todos_servicios, nombre, hojas_por_unidad) values (true, 'Hoja general', 25) returning id as c_global \gset
insert into certificados (nombre, hojas_por_unidad) values ('Hoja motos', 50) returning id as c_motos \gset
insert into certificados (nombre, unidad_compra, hojas_por_unidad)
  values ('Hoja moto grande', 'libreta', 10) returning id as c_grande \gset
select pg_temp.como(:'admin');
select fijar_destinos_certificado(:c_motos, false, array[:cat_motos]::bigint[], '{}');
select fijar_destinos_certificado(:c_grande, false, '{}', array[:moto_grande]::bigint[]);
reset role;

select is(certificado_para_servicio(:servicio), :c_global::bigint, 'sin otro más específico se usa el global');
select is(certificado_para_servicio(:moto), :c_motos::bigint, 'la categoría gana sobre el global');
select is(certificado_para_servicio(:moto_grande), :c_grande::bigint, 'el de servicio gana sobre categoría y global');
select is(certificado_para_servicio(:rever), null, 'un servicio sin certificado no usa hoja');

select throws_ok($$insert into certificados (todos_servicios, nombre, hojas_por_unidad) values (true, 'Otro global', 25)$$,
  '23505', null, 'solo puede haber un certificado global activo');

-- El stock no se toca a mano
select pg_temp.como(:'admin');
select throws_ok(format('update certificados set stock_hojas = 999 where id = %s', :c_global),
  '42501', null, 'ni el admin puede editar el stock directamente');
reset role;
select pg_temp.como(:'cajero');
update certificados set stock_minimo = 5 where id = :c_global; -- la RLS lo filtra: 0 filas
reset role;
select is((select stock_minimo from certificados where id = :c_global), 0,
  'un cajero no edita certificados (la RLS ignora el update)');

select * from finish();
rollback;
