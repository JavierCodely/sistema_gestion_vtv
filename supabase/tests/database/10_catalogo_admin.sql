begin;
\ir _helpers.psql
select plan(18);

select * from pg_temp.escenario() \gset

-- Nombres normalizados y únicos sin distinguir mayúsculas
select pg_temp.como(:'admin');
insert into cajas (nombre) values ('  Caja   Norte ') returning id as caja_norte \gset
select is((select nombre from cajas where id = :caja_norte), 'Caja Norte', 'el nombre se guarda sin espacios sobrantes');
select throws_ok($$insert into cajas (nombre) values ('caja norte')$$, '23505', null,
  'no se repite un nombre de caja aunque cambien las mayúsculas');
select throws_ok($$insert into cajas (nombre) values ('   ')$$, '23514', null, 'el nombre no puede quedar vacío');

insert into categorias_servicio (nombre) values ('Livianos') returning id as cat \gset
select throws_ok($$insert into categorias_servicio (nombre) values (' LIVIANOS')$$, '23505', null,
  'no se repite un nombre de categoría');
insert into servicios (nombre, categoria_id, precio) values ('Auto chico', :cat, 18000.5) returning id as auto \gset
select throws_ok(format($$insert into servicios (nombre, categoria_id, precio) values ('AUTO  CHICO', %s, 1)$$, :cat),
  '23505', null, 'no se repite un nombre de servicio');
select lives_ok(format($$update servicios set nombre = 'Auto  grande ', precio = 0, requiere_certificado = false where id = %s$$, :auto),
  'el admin edita nombre, precio y si usa certificado');
select is((select nombre from servicios where id = :auto), 'Auto grande', 'al editar también se normaliza');
select throws_ok(format($$update servicios set precio = 'NaN' where id = %s$$, :auto), '23514', null,
  'el precio no admite NaN');

-- Desactivar en lugar de borrar
select lives_ok(format('update cajas set activa = false where id = %s', :caja), 'el admin desactiva una caja');
select is((select activa from cajas where id = :caja), false, 'la caja quedó desactivada');
reset role;
insert into turnos (caja_id, efectivo_inicial) values (:caja2, 100) returning id as turno \gset
select pg_temp.como(:'admin');
select throws_ok(format('delete from cajas where id = %s', :caja2), '23503', null,
  'una caja con turnos no se puede borrar');
select lives_ok(format('delete from cajas where id = %s', :caja_norte), 'una caja sin uso sí se puede borrar');
reset role;

-- El cajero solo lee
select pg_temp.como(:'cajero');
select throws_ok($$insert into cajas (nombre) values ('Caja trucha')$$, '42501', null, 'un cajero no crea cajas');
update categorias_servicio set activa = false where id = :cat;  -- la RLS lo ignora: 0 filas
select throws_ok(format('update servicios set creado_en = now() where id = %s', :auto), '42501', null,
  'nadie puede cambiar columnas sin grant (creado_en)');
reset role;
select is((select activa from categorias_servicio where id = :cat), true, 'un cajero no desactiva categorías');

-- Una categoría desactivada saca de la venta a sus servicios (el cajero trabaja en el turno de caja2)
update categorias_servicio set activa = false where id = :categoria;
select pg_temp.como(:'cajero');
select throws_ok(format($$select registrar_venta(%s, %s, 'efectivo', p_patente => $p$AB123CD$p$)$$, :turno, :servicio), '22023',
  'La categoría de este servicio está desactivada', 'no se vende un servicio de una categoría desactivada');
reset role;
update categorias_servicio set activa = true where id = :categoria;
select pg_temp.como(:'cajero');
select lives_ok(format($$select registrar_venta(%s, %s, 'efectivo', p_patente => $p$AB123CD$p$)$$, :turno, :servicio),
  'al reactivar la categoría se vuelve a vender');
reset role;
select is((select count(*)::int from ventas where usuario_id = :'cajero'), 1, 'quedó registrada una sola venta');

select * from finish();
rollback;
