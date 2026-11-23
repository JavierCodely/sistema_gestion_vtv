begin;
\ir _helpers.psql
select plan(13);

select * from pg_temp.escenario() \gset

-- Base: configuración completa, credenciales y condiciones (como en 16_facturacion_arca.sql).
insert into arca_condiciones_iva (id, descripcion, clases) values (5, 'Consumidor Final', '{B,C}');
update arca_configuracion set cuit = '30712345671', razon_social = 'VTV Original SA',
  domicilio = 'Ruta 3 km 10', inicio_actividades = '2020-01-01', iibb = '901-1', punto_venta = 3
where id;
set local role service_role;
select _arca_guardar_credenciales('CERT', 'CLAVE', '30712345671', 'CUIT 30712345671',
  now() + interval '1 year', :'admin');
reset role;

reset role;
select pg_temp.abrir_turno_para(:'admin', :'cajero', :caja) as turno \gset
select (registrar_venta(:turno, :servicio, 'efectivo')).id as v1 \gset
select (registrar_venta(:turno, :servicio, 'efectivo')).id as v2 \gset
select (preparar_factura(:v1, 5, 99::smallint, 0)).id as f1 \gset
select (preparar_factura(:v2, 5, 99::smallint, 0)).id as f2 \gset
reset role;

-- ------------------------------------------------ 1. numeración reservada mientras se confirma
set local role service_role;
select (_arca_tomar(:f1)).toma as t1 \gset
select _arca_registrar_numero(:f1, :'t1', 7, '2026-11-20');
select _arca_liberar(:f1, :'t1', 'ARCA no respondió');
select throws_ok(format('select _arca_tomar(%s)', :f2), 'P0001',
  format('La factura de la venta N° %s quedó a confirmar con ARCA: reintentala primero (hasta confirmarla no se puede emitir otra del mismo tipo)', :v1),
  'con un número a confirmar no se emite otro comprobante del mismo punto de venta y tipo');
reset role;

-- ------------------------------------------------ 2. la toma vigente es la única que cierra
set local role service_role;
select (_arca_tomar(:f1)).toma as t2 \gset
select throws_ok(format('select _arca_autorizar(%s, %L, 7, %L, %L, %L)', :f1, :'t1', '2026-11-20',
    '75123456789012', '2026-11-30'), 'P0001',
  'El comprobante ya no está en esta emisión (otra la retomó o terminó)',
  'una ejecución vieja no puede autorizar');
select throws_ok(format('select _arca_liberar(%s, %L, %L)', :f1, :'t1', 'x'), 'P0001',
  'El comprobante ya no está en esta emisión (otra la retomó o terminó)',
  'ni devolverlo a pendiente');
select isnt(:'t1'::uuid, :'t2'::uuid, 'cada toma tiene su identificador');
reset role;

-- ------------------------------------------------ 3. plazo para retomar: 10 minutos
update comprobantes set procesando_desde = now() - interval '9 minutes' where id = :f1;
set local role service_role;
select throws_ok(format('select _arca_tomar(%s)', :f1), 'P0001',
  'El comprobante se está emitiendo en este momento: esperá unos segundos',
  'a los 9 minutos la emisión todavía puede estar viva');
reset role;
update comprobantes set procesando_desde = now() - interval '11 minutes' where id = :f1;
set local role service_role;
select (_arca_tomar(:f1)).toma as t3 \gset
select throws_ok(format('select _arca_descartar_numero(%s, %L)', :f1, :'t2'), 'P0001',
  'El comprobante ya no está en esta emisión (otra la retomó o terminó)',
  'retomada a los 11 minutos: la toma anterior queda sin efecto');

-- ------------------------------------------------ 4. foto del emisor y número ajeno
select _arca_autorizar(:f1, :'t3', 7, '2026-11-20', '75123456789012', '2026-11-30');
reset role;
update arca_configuracion set razon_social = 'Otra Razón SA', domicilio = 'Otro domicilio' where id;
select is(
  (select row(emisor_razon_social, emisor_domicilio, emisor_iibb, emisor_inicio_actividades)::text
   from v_comprobantes where id = :f1),
  row('VTV Original SA', 'Ruta 3 km 10', '901-1', '2020-01-01'::date)::text,
  'el comprobante conserva los datos del emisor con que se envió');

set local role service_role;
select (_arca_tomar(:f2)).toma as t4 \gset
reset role;
select is((select emisor_razon_social from comprobantes where id = :f2), 'Otra Razón SA',
  'uno nuevo toma la configuración vigente');
set local role service_role;
select throws_ok(format('select _arca_autorizar(%s, %L, 7, %L, %L, %L)', :f2, :'t4', '2026-11-20',
    '75123456789013', '2026-11-30'), 'P0001',
  'El número 7 ya pertenece a otro comprobante: revisá el log de ARCA',
  'nunca se asigna a una venta el número de otra');
select _arca_liberar(:f2, :'t4', 'corte');
reset role;

-- ------------------------------------------------ 5. el cajero no reintenta en ráfaga
select pg_temp.como(:'cajero');
select throws_ok(format('select puede_emitir_comprobante(%s)', :f2), 'P0001',
  'Esperá unos segundos antes de volver a intentar', 'el cajero espera entre intentos');
reset role;
update comprobantes set tomado_en = now() - interval '6 seconds' where id = :f2;
select pg_temp.como(:'cajero');
select is((puede_emitir_comprobante(:f2)).id, :f2::bigint, 'pasados unos segundos puede reintentar');
reset role;
update comprobantes set tomado_en = now() where id = :f2;
select pg_temp.como(:'admin');
select is((puede_emitir_comprobante(:f2)).id, :f2::bigint, 'el admin no tiene ese límite');
reset role;

-- ------------------------------------------------ 6. permisos de las funciones nuevas
select pg_temp.como(:'admin');
select throws_ok(format('select _arca_en_emision(%s, %L)', :f2, gen_random_uuid()), '42501', null,
  'las funciones internas de emisión no son de authenticated');
reset role;

select * from finish();
rollback;
