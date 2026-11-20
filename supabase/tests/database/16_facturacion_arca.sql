begin;
\ir _helpers.psql
select plan(56);

select * from pg_temp.escenario() \gset

-- Ventas: una del cajero (turno abierto) y una del admin (otro turno).
select pg_temp.como(:'cajero');
select abrir_turno(:caja);
select (registrar_venta(:servicio, 'efectivo')).id as venta \gset
select (registrar_venta(:servicio, 'tarjeta')).id as venta2 \gset
select (registrar_venta(:servicio, 'tarjeta')).id as venta3 \gset
select (registrar_venta(:servicio, 'tarjeta')).id as venta4 \gset
reset role;
select pg_temp.como(:'admin');
select abrir_turno(:caja2);
select (registrar_venta(:servicio, 'transferencia')).id as venta_admin \gset
reset role;

-- Condiciones frente al IVA como las devuelve ARCA (FEParamGetCondicionIvaReceptor).
insert into arca_condiciones_iva (id, descripcion, clases) values
  (1, 'IVA Responsable Inscripto', '{A,C}'),
  (4, 'IVA Sujeto Exento', '{B,C}'),
  (5, 'Consumidor Final', '{B,C,49}'),
  (6, 'Responsable Monotributo', '{A,C}');

-- ------------------------------------------------------------------ configuración
select pg_temp.como(:'cajero');
select throws_ok(format('select preparar_factura(%s, 5, 99::smallint, 0)', :venta),
  'P0001', 'La facturación electrónica no está configurada: completá los datos del emisor en Configuración ARCA',
  'sin configuración no se factura');
-- El cajero no edita la configuración (UPDATE bloqueado por RLS: 0 filas)
update arca_configuracion set razon_social = 'Hackeo';
reset role;
select is((select razon_social from arca_configuracion), null, 'el cajero no puede editar la configuración');

select pg_temp.como(:'admin');
select throws_ok($$update arca_configuracion set cuit = '30712345670'$$, '23514', null,
  'un CUIT con dígito verificador inválido se rechaza');
update arca_configuracion set cuit = '30-71234567-1', razon_social = '  VTV   Test SA ',
  domicilio = 'Ruta 3 km 10', inicio_actividades = '2020-01-01', punto_venta = 3;
reset role;
select is((select row(cuit, razon_social, actualizado_por)::text from arca_configuracion),
  row('30712345671', 'VTV Test SA', :'admin'::uuid)::text,
  'el admin configura: CUIT sin guiones, nombre normalizado y quién lo cambió');

select pg_temp.como(:'admin');
select throws_ok(format('select preparar_factura(%s, 5, 99::smallint, 0)', :venta),
  'P0001', 'Falta subir el certificado y la clave de ARCA en Configuración ARCA',
  'sin certificado no se factura');
reset role;

-- Certificado y clave (los guarda la Edge Function con el service role)
set local role service_role;
select _arca_guardar_credenciales('CERTIFICADO-PEM', 'CLAVE-PEM', '30712345671',
  'SERIALNUMBER=CUIT 30712345671', now() + interval '1 year', :'admin');
select is((select certificado from _arca_credenciales()), 'CERTIFICADO-PEM',
  'el service role lee el certificado desde Vault');
select is((select clave from _arca_credenciales()), 'CLAVE-PEM', 'y la clave');
reset role;
select isnt((select certificado_secreto_id from arca_configuracion), null, 'los secretos quedan en Vault');
select is((select count(*)::int from vault.decrypted_secrets where name in ('arca_certificado', 'arca_clave')),
  2, 'certificado y clave cifrados en Vault');

select pg_temp.como(:'admin');
select throws_ok('select certificado_secreto_id from arca_configuracion', '42501', null,
  'nadie lee los ids de Vault');
select throws_ok('select * from _arca_credenciales()', '42501', null,
  'authenticated no puede leer las credenciales');
select throws_ok('select * from arca_tokens', '42501', null, 'ni los tickets de WSAA');
select throws_ok('select count(*) from vault.decrypted_secrets', '42501', null, 'ni Vault directo');
select throws_ok(format('select _arca_tomar(%s)', 1), '42501', null,
  'authenticated no ejecuta las funciones internas de emisión');
reset role;

-- Certificado de otro CUIT
update arca_configuracion set certificado_cuit = '20123456786';
select pg_temp.como(:'admin');
select throws_ok(format('select preparar_factura(%s, 5, 99::smallint, 0)', :venta),
  'P0001', 'El certificado cargado es de otro CUIT (20123456786): subí el certificado del CUIT 30712345671',
  'el certificado tiene que ser del CUIT emisor');
reset role;
update arca_configuracion set certificado_cuit = '30712345671';

-- ------------------------------------------------------------------ preparar factura
select pg_temp.como(:'cajero');
select (preparar_factura(:venta, 5, 99::smallint, 0, 'se ignora')).id as fact \gset
reset role;
select is(
  (select row(tipo::text, clase, cbte_tipo, ambiente::text, cuit_emisor, punto_venta, doc_tipo, doc_nro,
     receptor_nombre, neto, iva, total, estado::text)::text from comprobantes where id = :fact),
  row('factura', 'B', 6, 'homologacion', '30712345671', 3, 99, 0, null, 16528.93, 3471.07, 20000.00,
     'pendiente')::text,
  'consumidor final: Factura B (6), neto e IVA 21 % calculados por la BD');

select pg_temp.como(:'cajero');
select throws_ok(format('select preparar_factura(%s, 5, 99::smallint, 0)', :venta_admin),
  '42501', 'Solo podés facturar las ventas de tu turno abierto', 'el cajero no factura ventas ajenas');
select throws_ok(format('select preparar_factura(%s, 6, 96::smallint, 30111222, %L)', :venta2, 'Ana'),
  'P0001', 'La Factura A requiere el CUIT del cliente', 'monotributista: Factura A, exige CUIT');
select throws_ok(format('select preparar_factura(%s, 1, 80::smallint, 20123456780, %L)', :venta2, 'Ana'),
  '22023', 'El CUIT del cliente no es válido', 'CUIT del cliente inválido');
select throws_ok(format('select preparar_factura(%s, 1, 80::smallint, 20123456786)', :venta2),
  '22023', 'Ingresá el nombre o la razón social del cliente', 'nombre obligatorio si se identifica');
select throws_ok(format('select preparar_factura(%s, 4, 99::smallint, 0)', :venta2),
  'P0001', 'Para un cliente "IVA Sujeto Exento" ingresá su CUIT o DNI',
  'sin identificar solo el consumidor final');
select throws_ok(format('select preparar_factura(%s, 5, 96::smallint, 123, %L)', :venta2, 'Ana'),
  '22023', 'El DNI del cliente no es válido', 'DNI inválido');
select throws_ok(format('select preparar_factura(%s, 99, 99::smallint, 0)', :venta2),
  '22023', 'Elegí una condición frente al IVA válida', 'condición inexistente');
select (preparar_factura(:venta2, 6, 80::smallint, 20123456786, '  Ana   Gómez ')).id as fact_a \gset
reset role;
select is(
  (select row(clase, cbte_tipo, doc_tipo, doc_nro, receptor_nombre)::text from comprobantes where id = :fact_a),
  row('A', 1, 80, 20123456786, 'Ana Gómez')::text,
  'monotributista con CUIT: Factura A (1) según la tabla de ARCA');

-- Corregir antes de enviar: misma fila
select pg_temp.como(:'cajero');
select is((preparar_factura(:venta2, 5, 96::smallint, 30111222, 'Ana Gómez')).id, :fact_a::bigint,
  'una factura pendiente se corrige (no se duplica)');
reset role;
select is((select row(clase, cbte_tipo, doc_tipo)::text from comprobantes where id = :fact_a),
  row('B', 6, 96)::text, 'pasa a Factura B con DNI');

-- Tope de identificación del consumidor final
update arca_configuracion set tope_identificacion = 15000;
select pg_temp.como(:'cajero');
select throws_ok(format('select preparar_factura(%s, 5, 99::smallint, 0)', :venta3),
  'P0001', 'Desde $ 15.000,00 hay que identificar al consumidor final con CUIT o DNI',
  'sobre el tope el consumidor final se identifica');
reset role;
update arca_configuracion set tope_identificacion = 10000000;

-- ------------------------------------------------------------------ emisión (service role)
select pg_temp.como(:'cajero');
select is((puede_emitir_comprobante(:fact)).id, :fact::bigint, 'el cajero puede emitir su factura');
reset role;
select pg_temp.como(:'admin');
select is((puede_emitir_comprobante(:fact)).id, :fact::bigint, 'y el admin');
reset role;

set local role service_role;
select is((_arca_tomar(:fact)).estado::text, 'procesando', 'tomar la factura la pasa a procesando');
select throws_ok(format('select _arca_tomar(%s)', :fact), 'P0001',
  'El comprobante se está emitiendo en este momento: esperá unos segundos', 'no se toma dos veces');
select throws_ok(format('select _arca_tomar(%s)', :fact_a), 'P0001',
  'Hay otro comprobante del mismo tipo emitiéndose: probá de nuevo en unos segundos',
  'un solo comprobante por punto de venta y tipo a la vez (numeración correlativa)');
select _arca_registrar_numero(:fact, 41, '2026-11-20');
-- Error de red: queda pendiente y a reconciliar
select is((_arca_liberar(:fact, 'Sin respuesta de ARCA')).numero_intentado, 41::bigint,
  'un corte de comunicación conserva el número para reconciliar');
reset role;

select pg_temp.como(:'cajero');
select throws_ok(format('select preparar_factura(%s, 5, 96::smallint, 30111222, %L)', :venta, 'X'),
  'P0001', 'La factura de esta venta ya se envió a ARCA y falta confirmar el resultado: reintentá la emisión',
  'a reconciliar: no se pueden cambiar los datos');
select is((select a_reconciliar from v_comprobantes where id = :fact), true, 'la vista lo marca a reconciliar');
reset role;
select pg_temp.como(:'admin');
select throws_ok(format('select anular_venta(%s, %L)', :venta, 'x'), 'P0001',
  'La factura de esta venta se envió a ARCA y falta confirmar el resultado: reintentá la emisión y después anulá la venta',
  'no se anula una venta con factura a confirmar');
reset role;

-- Reintento: se reconcilia y se autoriza
set local role service_role;
select _arca_tomar(:fact);
select _arca_autorizar(:fact, 41, '2026-11-20', '75123456789012', '2026-11-30');
reset role;
select is(
  (select row(estado::text, numero, numero_intentado, cae, procesando_desde)::text from comprobantes where id = :fact),
  row('autorizado', 41, null, '75123456789012', null)::text, 'autorizada con número y CAE');

select pg_temp.como(:'cajero');
select throws_ok(format('select preparar_factura(%s, 5, 99::smallint, 0)', :venta), 'P0001',
  'La venta ya está facturada (Factura B 00003-00000041)', 'no se factura dos veces');
select is(
  (select convert_from(decode(split_part(qr_url, '?p=', 2), 'base64'), 'UTF8')::jsonb from v_comprobantes where id = :fact),
  '{"ver":1,"fecha":"2026-11-20","cuit":30712345671,"ptoVta":3,"tipoCmp":6,"nroCmp":41,"importe":20000.00,"moneda":"PES","ctz":1,"tipoDocRec":99,"nroDocRec":0,"tipoCodAut":"E","codAut":75123456789012}'::jsonb,
  'QR según la especificación de ARCA');
select ok((select qr_url like 'https://www.arca.gob.ar/fe/qr/?p=%' from v_comprobantes where id = :fact),
  'con la URL vigente de ARCA');
reset role;

-- Rechazo: el número no se consume
set local role service_role;
select _arca_tomar(:fact_a);
select _arca_registrar_numero(:fact_a, 42, '2026-11-20');
select is((_arca_rechazar(:fact_a, '10015: documento inválido')).numero_intentado, null::bigint,
  'un rechazo libera el número');
reset role;
select is((select estado::text from comprobantes where id = :fact_a), 'rechazado', 'queda rechazada con el motivo');

-- Una emisión abandonada (más de 2 minutos) se retoma
set local role service_role;
select _arca_tomar(:fact_a);
reset role;
update comprobantes set procesando_desde = now() - interval '3 minutes' where id = :fact_a;
set local role service_role;
select is((_arca_tomar(:fact_a)).intentos, 3, 'una emisión colgada se puede retomar');
select _arca_liberar(:fact_a, 'corte');
reset role;

-- ------------------------------------------------------------------ anulación y nota de crédito
select pg_temp.como(:'admin');
select anular_venta(:venta, 'Cobro duplicado');
reset role;
select is(
  (select row(tipo::text, clase, cbte_tipo, asociado_id, doc_tipo, total, estado::text)::text
   from comprobantes where venta_id = :venta and tipo = 'nota_credito'),
  row('nota_credito', 'B', 8, :fact, 99, 20000.00, 'pendiente')::text,
  'anular una venta facturada genera la nota de crédito B (8) asociada');

select pg_temp.como(:'admin');
select anular_venta(:venta2, 'Error');
reset role;
select is((select estado::text from comprobantes where id = :fact_a), 'cancelado',
  'una factura que nunca llegó a ARCA se cancela al anular la venta');
select is((select count(*)::int from comprobantes where venta_id = :venta2 and tipo = 'nota_credito'), 0,
  'y no genera nota de crédito');

select (select id from comprobantes where venta_id = :venta and tipo = 'nota_credito') as nc \gset
select pg_temp.como(:'cajero');
select throws_ok(format('select puede_emitir_comprobante(%s)', :nc), '42501',
  'Solo un administrador puede emitir notas de crédito', 'el cajero no emite notas de crédito');
reset role;

-- La NC se emite con la configuración de la factura original
update arca_configuracion set ambiente = 'produccion';
set local role service_role;
select throws_ok(format('select _arca_tomar(%s)', :nc), 'P0001',
  'La factura original se emitió en homologacion con el CUIT 30712345671: la nota de crédito tiene que emitirse con esa misma configuración',
  'la nota de crédito no cambia de ambiente');
reset role;
update arca_configuracion set ambiente = 'homologacion';

-- ------------------------------------------------------------------ visibilidad
select pg_temp.como(:'admin');
select preparar_factura(:venta_admin, 5, 99::smallint, 0);
reset role;
select pg_temp.como(:'cajero');
select is((select count(*)::int from comprobantes where venta_id = :venta_admin), 0,
  'el cajero no ve comprobantes de ventas ajenas');
select is((select count(*)::int from v_comprobantes where venta_id = :venta), 2,
  've los de sus ventas (factura y nota de crédito)');
select is((select count(*)::int from arca_intentos), 0, 'no ve el log de ARCA');
reset role;

set local role service_role;
select _arca_registrar_intento(:fact, 'solicitar', 'homologacion', true, 'ok', '[]', '[]', '<req/>', '<resp/>', 120, :'admin');
reset role;
select pg_temp.como(:'admin');
select is((select count(*)::int from arca_intentos), 1, 'el admin ve el log');
reset role;

-- Condiciones desde ARCA
set local role service_role;
select is(_arca_actualizar_condiciones('[{"id":5,"descripcion":"Consumidor Final","clases":["B","C"]},{"id":7,"descripcion":"Sujeto No Categorizado","clases":["B","C"]}]'),
  2, 'se actualizan las condiciones de ARCA');
reset role;
select is((select clases from arca_condiciones_iva where id = 7), '{B,C}'::text[], 'con sus clases');

-- Anónimo
select pg_temp.como_anonimo();
select throws_ok(format('select preparar_factura(%s, 5, 99::smallint, 0)', :venta3), '42501', null,
  'anon no factura');
reset role;

-- Un usuario desactivado no factura
update perfiles set activo = false where id = :'cajero';
select pg_temp.como(:'cajero');
select throws_ok(format('select preparar_factura(%s, 5, 99::smallint, 0)', :venta4), '42501',
  'Usuario no autenticado o desactivado', 'un usuario desactivado no factura');
reset role;

select * from finish();
rollback;
