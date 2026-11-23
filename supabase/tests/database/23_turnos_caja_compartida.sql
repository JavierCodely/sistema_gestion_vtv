-- Migración 33: turnos de caja compartida (el turno es de la caja; cualquiera trabaja en una caja abierta).
begin;
\ir _helpers.psql
select plan(73);

select * from pg_temp.escenario() \gset
select pg_temp.crear_usuario('cajero2@test.local') as cajero2 \gset
select pg_temp.crear_usuario('cajero3@test.local') as cajero3 \gset
update perfiles set nombre = 'Carla', apellido = 'Gómez' where id = :'cajero';
update perfiles set nombre = 'Diego', apellido = 'Pérez' where id = :'cajero2';
select id as comida from categorias_gasto where nombre = 'Comida' \gset
select id as sueldos from categorias_gasto where nombre = 'Sueldos' \gset
insert into certificados (nombre, hojas_por_unidad) values ('Hoja VTV', 25) returning id as cert \gset

-- Firmas: una sola sobrecarga de cada RPC, sin las viejas -------------------------------------------
select is(
  (select array_agg(p.oid::regprocedure::text order by p.proname) from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('abrir_turno', 'cerrar_turno', 'registrar_venta', 'registrar_gasto', 'cajas_para_turno')),
  array['abrir_turno(bigint,numeric)', 'cajas_para_turno()', 'cerrar_turno(bigint,text)',
        'registrar_gasto(bigint,numeric,fuente_fondos,text,bigint)',
        'registrar_venta(bigint,bigint,medio_pago,text,jsonb,bigint,numeric)'],
  'abrir_turno, cerrar_turno, registrar_venta, registrar_gasto y cajas_para_turno tienen una sola firma (la nueva)');
select ok(not has_function_privilege('authenticated', 'public._turno_para_trabajar(bigint, boolean)', 'execute'),
  '_turno_para_trabajar es interna');
select ok(has_function_privilege('authenticated', 'public.nombre_usuario(uuid)', 'execute')
          and not has_function_privilege('anon', 'public.nombre_usuario(uuid)', 'execute'),
  'nombre_usuario: authenticated sí, anon no');
select ok(has_function_privilege('authenticated', 'public.turno_abierto(bigint)', 'execute')
          and not has_function_privilege('anon', 'public.turno_abierto(bigint)', 'execute'),
  'turno_abierto: authenticated sí, anon no');
select ok(has_function_privilege('authenticated', 'public.turnos_abiertos()', 'execute')
          and not has_function_privilege('anon', 'public.turnos_abiertos()', 'execute'),
  'turnos_abiertos: authenticated sí, anon no');
select is((select array_agg(column_name::text order by ordinal_position) from information_schema.columns
           where table_schema = 'public' and table_name = 'v_turnos_abiertos'),
  array['id', 'caja_id', 'caja_nombre', 'abierto_en'],
  'v_turnos_abiertos conserva sus columnas (sin dinero)');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'turnos'
             and cmd = 'SELECT' and qual not like '%es_admin()%'), 0,
  'la única política de lectura de turnos es la del admin');

-- Abrir: el turno es de la caja, sin usuario ---------------------------------------------------------
select pg_temp.como(:'admin');
select movimiento_efectivo('fondo_inicial', 10000, 'Fondo');
select throws_ok('select abrir_turno(null, 100)', '22023', 'Elegí la caja que vas a abrir',
  'hay que elegir la caja');
select (abrir_turno(:caja, 1000)).id as turno \gset
reset role;
select is((select row(caja_id, usuario_id, abierto_por, efectivo_inicial)::text from turnos where id = :turno),
  row(:caja::bigint, null::uuid, :'admin'::uuid, 1000.00)::text,
  'el turno queda de la caja: sin usuario asignado, con el admin que lo abrió y el efectivo inicial');
select is((select row(tipo::text, monto, turno_id)::text from movimientos_efectivo where tipo = 'apertura_turno'),
  row('apertura_turno', -1000.00, :turno::bigint)::text, 'el efectivo inicial sale de la caja de cambio');
select is((select nota from movimientos_efectivo where tipo = 'apertura_turno'),
  format('Efectivo inicial del turno #%s (Caja Test)', :turno), 'el libro nombra la caja, no una persona');

-- Dos cajeros venden en la misma caja; cada venta con su vendedor ---------------------------------
select pg_temp.como(:'cajero');
select (registrar_venta(:turno, :servicio, 'efectivo', p_patente => $p$AB123CD$p$)).id as v_carla \gset
reset role;
select pg_temp.como(:'cajero2');
select (registrar_venta(:turno, :servicio, 'efectivo', p_patente => $p$AB123CD$p$)).id as v_diego \gset
select (registrar_venta(:turno, :servicio, 'tarjeta', p_patente => $p$AB123CD$p$)).id as v_diego2 \gset
reset role;
select pg_temp.como(:'admin');
select (registrar_venta(:turno, :servicio, 'transferencia', p_patente => $p$AB123CD$p$)).id as v_admin \gset
reset role;
select is(
  (select array_agg(row(id, usuario_id, turno_id, caja_id)::text order by id) from ventas where turno_id = :turno),
  array[row(:v_carla, :'cajero'::uuid, :turno, :caja)::text, row(:v_diego, :'cajero2'::uuid, :turno, :caja)::text,
        row(:v_diego2, :'cajero2'::uuid, :turno, :caja)::text, row(:v_admin, :'admin'::uuid, :turno, :caja)::text],
  'cada venta queda en el turno y la caja elegidos, con quien la hizo (también el admin)');

-- Cajón compartido: un gasto de un cajero usa el efectivo que vendió otro
select pg_temp.como(:'cajero');
select throws_ok(format($$select registrar_gasto(%s, 41000.01, 'efectivo', 'Demasiado', %s)$$, :comida, :turno), 'P0001',
  'No hay suficiente efectivo en la caja para este gasto. Avisale al administrador',
  'el cajón tiene lo de todos (1.000 + 40.000) y no más');
select (registrar_gasto(:comida, 30000, 'efectivo', 'Compra con el efectivo de los dos', :turno)).id as g_carla \gset
reset role;
select is((select row(usuario_id, turno_id, caja_id)::text from gastos where id = :g_carla),
  row(:'cajero'::uuid, :turno, :caja)::text, 'el gasto queda en el turno elegido, con quien lo cargó');
select is(public._efectivo_en_caja(:turno), 11000.00::numeric,
  'el cajón es uno solo: inicial + efectivo de los dos cajeros − el gasto');

-- Elegir la caja: obligatorio y con turno abierto ----------------------------------------------------
select pg_temp.como(:'cajero');
select throws_ok(format($$select registrar_venta(null, %s, 'efectivo', p_patente => $p$AB123CD$p$)$$, :servicio), '22023',
  'Elegí la caja en la que estás trabajando', 'sin turno no se vende (nunca se adivina la caja)');
select throws_ok(format($$select registrar_venta(999999999, %s, 'efectivo', p_patente => $p$AB123CD$p$)$$, :servicio), '22023',
  'El turno elegido no existe', 'un turno inexistente se rechaza');
select throws_ok(format($$select registrar_gasto(%s, 10, 'efectivo', 'x')$$, :comida), '22023',
  'Elegí la caja en la que estás trabajando', 'el cajero tiene que elegir la caja también para un gasto');
select throws_ok(format($$select registrar_gasto(%s, 10, 'efectivo', 'x', 999999999)$$, :comida), '22023',
  'El turno elegido no existe', 'ni un gasto en un turno inexistente');
reset role;

-- Otra caja abierta: el gasto va a la caja elegida (no a "la del usuario") ---------------------------
select pg_temp.como(:'admin');
select (abrir_turno(:caja2, 500)).id as turno2 \gset
reset role;
select pg_temp.como(:'cajero');
select (registrar_gasto(:comida, 200, 'efectivo', 'Gasto en la caja 2', :turno2)).id as g_caja2 \gset
select (registrar_venta(:turno2, :servicio, 'tarjeta', p_patente => $p$AB123CD$p$)).id as v_caja2 \gset
reset role;
select is((select row(turno_id, caja_id)::text from gastos where id = :g_caja2), row(:turno2, :caja2)::text,
  'el mismo cajero carga un gasto en otra caja abierta: queda en esa caja');
select is(public._efectivo_en_caja(:turno2), 300.00::numeric, 'y sale del cajón de esa caja');
select is(public._efectivo_en_caja(:turno), 11000.00::numeric, 'el cajón de la otra caja no cambia');

-- El admin: gasto en una caja abierta (su cajón) o sin turno (caja de cambio) ------------------------
select pg_temp.como(:'admin');
select (registrar_gasto(:sueldos, 100, 'efectivo', 'Desde la caja 2', :turno2)).id as g_admin_turno \gset
select (registrar_gasto(:sueldos, 100, 'efectivo', 'Desde la caja de cambio')).id as g_admin_general \gset
reset role;
select is((select array_agg(turno_id order by id) from gastos where id in (:g_admin_turno, :g_admin_general)),
  array[:turno2::bigint, null::bigint], 'el admin elige: cajón de una caja abierta o caja de cambio sin turno');

-- RLS: qué ve cada cajero -----------------------------------------------------------------------------
-- cajero3 no vendió nada: igual ve las cajas abiertas y lo que pasó en ellas.
select pg_temp.como(:'cajero3');
select is((select count(*)::int from turnos), 0,
  'un cajero no lee la tabla turnos (efectivo inicial, observaciones, quién abrió)');
select is((select count(*)::int from v_turnos), 0,
  'ni v_turnos: ni el efectivo del cajón ni los totales de ninguna caja');
select is((select array_agg(row(id, caja_id, caja_nombre)::text order by id) from v_turnos_abiertos),
  array[row(:turno, :caja, 'Caja Test')::text, row(:turno2, :caja2, 'Caja Test 2')::text],
  'v_turnos_abiertos: caja de cada turno abierto, para elegir dónde trabajar');
select is((select count(*)::int from v_turnos_abiertos where abierto_en is not null), 2,
  'con desde cuándo está abierta');
select ok(turno_abierto(:turno) and not turno_abierto(999999999) and not turno_abierto(null),
  'turno_abierto responde solo sí/no (false si no existe o es NULL)');
select is((select count(*)::int from ventas where turno_id = :turno), 4,
  've todas las ventas del turno abierto, de cualquier vendedor');
select is((select count(*)::int from venta_pagos p join ventas v on v.id = p.venta_id where v.turno_id = :turno), 4,
  'y sus pagos');
select is((select count(*)::int from gastos where turno_id in (:turno, :turno2)), 3,
  've los gastos de los turnos abiertos');
select is((select count(*)::int from gastos where id = :g_admin_general), 0,
  'pero no los gastos sin turno del admin');
select is(
  (select array_agg(usuario_nombre order by id) from v_movimientos_caja where tipo = 'venta' and turno_id = :turno),
  array['Carla Gómez', 'Diego Pérez', 'Diego Pérez', 'Usuario admin@test.local'],
  'en el historial de la caja ve quién hizo cada venta (aunque no lea esos perfiles)');
select is((select count(*)::int from perfiles), 1, 'sigue leyendo solo su propio perfil');
select is(nombre_usuario(:'cajero2'), 'Diego Pérez', 'nombre_usuario da el nombre de quien vendió en un turno abierto');
select is(nombre_usuario(:'cajero3'), 'Usuario cajero3@test.local', 'y el propio');
select is((select count(*)::int from caja_efectivo), 0, 'no lee la caja de cambio');
select is((select count(*)::int from movimientos_efectivo), 0, 'ni su libro');
reset role;

-- Cerrar: solo el admin, con el turno explícito -------------------------------------------------------
select pg_temp.como(:'cajero');
select throws_ok(format('select cerrar_turno(%s)', :turno2), '42501', null, 'un cajero no cierra un turno');
reset role;
select is((select cerrado_en from turnos where id = :turno2), null, 'la caja sigue abierta');
select pg_temp.como(:'admin');
select saldo as saldo_antes from caja_efectivo \gset
select lives_ok(format('select cerrar_turno(%s, %L)', :turno2, 'Fin de la caja 2'), 'el admin cierra el turno');
reset role;
select is((select row(observaciones, efectivo_cierre, total_gastos, cantidad_ventas)::text from turnos where id = :turno2),
  row('Fin de la caja 2', 200.00, 300.00, 1)::text, 'el cierre guarda las fotos del turno compartido');
select ok((select cerrado_en from turnos where id = :turno2)
          > (select max(creado_en) from ventas where turno_id = :turno2),
  'cerrado_en es la hora real del cierre (clock_timestamp), posterior a la última venta');
select is((select saldo from caja_efectivo), :saldo_antes::numeric + 200,
  'el efectivo del cajón vuelve a la caja de cambio');

-- Turno cerrado: no se vende ni se gasta ahí, y el cajero ya no lo ve -------------------------------
select pg_temp.como(:'cajero');
select throws_ok(format($$select registrar_venta(%s, %s, 'efectivo', p_patente => $p$AB123CD$p$)$$, :turno2, :servicio), 'P0001',
  'El turno de la caja "Caja Test 2" ya se cerró: elegí una caja abierta', 'no se vende en un turno cerrado');
select throws_ok(format($$select registrar_gasto(%s, 10, 'efectivo', 'x', %s)$$, :comida, :turno2), 'P0001',
  'El turno de la caja "Caja Test 2" ya se cerró: elegí una caja abierta', 'ni se carga un gasto');
select is((select count(*)::int from v_turnos_abiertos where id = :turno2), 0,
  'el turno cerrado desaparece de las cajas abiertas');
select ok(not turno_abierto(:turno2), 'turno_abierto: el cerrado ya no está abierto');
select is((select count(*)::int from ventas where id = :v_caja2), 0, 'y sus ventas');
select is((select count(*)::int from gastos where id = :g_caja2), 0, 'y sus gastos');
select is((select count(*)::int from v_movimientos_caja where turno_id = :turno2), 0, 'también en la vista');
select is(nombre_usuario(:'admin'), 'Usuario admin@test.local',
  'nombre_usuario sigue dando el nombre de quien vendió en el turno abierto que queda');
reset role;

-- Facturación: venta de otro cajero del turno abierto sí, de un turno cerrado no ---------------------
insert into arca_condiciones_iva (id, descripcion, clases) values (5, 'Consumidor Final', '{B,C}');
update arca_configuracion set cuit = '30712345671', razon_social = 'VTV SA', domicilio = 'Ruta 3 km 10',
  inicio_actividades = '2020-01-01', punto_venta = 3
where id;
set local role service_role;
select _arca_guardar_credenciales('CERT', 'CLAVE', '30712345671', 'CUIT 30712345671',
  now() + interval '1 year', :'admin');
reset role;

select pg_temp.como(:'cajero');
select (preparar_factura(:v_diego, 5, 99::smallint, 0)).id as f_diego \gset
select is((puede_emitir_comprobante(:f_diego)).id, :f_diego::bigint,
  'el cajero factura y emite la venta de otro cajero del turno abierto');
select is((select count(*)::int from v_comprobantes where venta_id = :v_diego), 1,
  'y ve ese comprobante');
select is((select row(creado_por, actualizado_por)::text from v_comprobantes where id = :f_diego),
  row(:'cajero'::uuid, null::uuid)::text, 'recién preparada: creado_por = quien la preparó, sin corrección');
reset role;
select pg_temp.como(:'cajero3');
select actualizado_en as f_antes from comprobantes where id = :f_diego \gset
select is((preparar_factura(:v_diego, 5, 96::smallint, 30111222, 'Juan Cliente')).id, :f_diego::bigint,
  'otro cajero corrige la factura pendiente de una venta ajena del turno abierto');
select is((select row(creado_por, actualizado_por, doc_nro)::text from v_comprobantes where id = :f_diego),
  row(:'cajero'::uuid, :'cajero3'::uuid, 30111222::bigint)::text,
  'la corrección deja rastro: actualizado_por = quien la corrigió (v_comprobantes)');
reset role;
select ok((select actualizado_por = :'cajero3'::uuid and actualizado_en >= :'f_antes'::timestamptz
           from comprobantes where id = :f_diego),
  'y en la tabla, con actualizado_en');
select pg_temp.como(:'cajero');
select throws_ok(format('select preparar_factura(%s, 5, 99::smallint, 0)', :v_caja2), '42501',
  'Solo podés facturar ventas de una caja con el turno abierto', 'no factura una venta de un turno cerrado');
reset role;
select pg_temp.como(:'admin');
select (preparar_factura(:v_caja2, 5, 99::smallint, 0)).id as f_caja2 \gset
reset role;
select pg_temp.como(:'cajero');
select throws_ok(format('select puede_emitir_comprobante(%s)', :f_caja2), '42501',
  'Solo podés facturar ventas de una caja con el turno abierto', 'ni emite la factura de un turno cerrado');
select is((select count(*)::int from comprobantes where id = :f_caja2), 0, 'ni ve ese comprobante');
reset role;
select pg_temp.como(:'admin');
select is((puede_emitir_comprobante(:f_caja2)).id, :f_caja2::bigint, 'el admin factura cualquier venta');
reset role;

-- Turno abierto antes de la migración 33 (con cajero asignado): pasa a ser de la caja ---------------
insert into cajas (nombre) values ('Caja vieja') returning id as caja_vieja \gset
insert into turnos (caja_id, usuario_id, efectivo_inicial, abierto_por)
values (:caja_vieja, :'cajero', 100, :'admin') returning id as turno_viejo \gset
select pg_temp.como(:'cajero3');
select lives_ok(format($$select registrar_venta(%s, %s, 'tarjeta', p_patente => $p$AB123CD$p$)$$, :turno_viejo, :servicio),
  'en un turno abierto antes de la 33 vende cualquiera, no solo el cajero asignado');
reset role;
select pg_temp.como(:'admin');
select is((select atendido_por from v_turnos where id = :turno_viejo),
  array['Carla Gómez', 'Usuario cajero3@test.local'],
  'v_turnos lista al cajero asignado (historia) y a quien vendió');
select lives_ok(format('select cerrar_turno(%s)', :turno_viejo), 'y lo cierra el admin');
reset role;

-- Anónimo y desactivado ---------------------------------------------------------------------------
select pg_temp.como_anonimo();
select throws_ok(format($$select registrar_venta(%s, %s, 'efectivo', p_patente => $p$AB123CD$p$)$$, :turno, :servicio), '42501', null,
  'anon no vende');
select throws_ok('select * from v_turnos_abiertos', '42501', null, 'anon no lee los turnos abiertos');
reset role;
update perfiles set activo = false where id = :'cajero2';
select pg_temp.como(:'cajero2');
select throws_ok(format($$select registrar_venta(%s, %s, 'efectivo', p_patente => $p$AB123CD$p$)$$, :turno, :servicio), '42501',
  'Usuario no autenticado o desactivado', 'un usuario desactivado no vende en una caja abierta');
select is((select count(*)::int from turnos), 0, 'ni ve los turnos abiertos');
select is((select count(*)::int from ventas), 0, 'ni sus ventas');
select is((select count(*)::int from gastos), 0, 'ni sus gastos');
select is((select count(*)::int from comprobantes), 0, 'ni sus comprobantes');
select throws_ok('select * from v_turnos_abiertos', '42501', 'Usuario no autenticado o desactivado',
  'ni las cajas abiertas');
reset role;

select * from finish();
rollback;
