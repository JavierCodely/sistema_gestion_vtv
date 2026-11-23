-- =====================================================================
-- Sistema VTV — BORRAR LOS GASTOS (y sus categorías y subcategorías)
--
-- ⚠ DESTRUCTIVO E IRREVERSIBLE. Hacé un backup antes si hay algo que quieras guardar
--   (Dashboard → Database → Backups). No toca ventas, turnos, compras ni usuarios.
--
-- Borra:
--   - TODOS los gastos cargados (de la caja y del admin, vigentes y anulados), como si nunca se
--     hubieran cargado:
--       · los pagados en efectivo con la caja de cambio: se sacan sus movimientos del libro de la caja
--         de cambio y se recalculan el saldo después de cada movimiento y el saldo actual (la plata
--         vuelve, igual que al anular un gasto);
--       · los pagados con el cajón de un turno abierto: el efectivo en caja de ese turno vuelve a subir
--         (se calcula en vivo). En los turnos cerrados no cambia lo que se devolvió al cerrar;
--       · los pagados por transferencia: desaparecen de Fondos › Transferencia.
--   - Si v_borrar_categorias = true: todos los rubros y subcategorías de gasto.
--     Con v_recrear_categorias_de_fabrica = true se vuelven a crear los que trae el sistema al
--     instalarse (9 rubros con sus subcategorías, como vienen de fábrica).
--
-- NO borra (los usa el sistema):
--   - Los gastos automáticos de las COMPRAS DE CERTIFICADOS: son parte de cada compra (stock y
--     costo). Para borrarlos hay que borrar las compras: usá 50_reiniciar_datos.sql.
--   - La categoría "Insumos › Compra de certificados" (la usan esas compras).
--
-- Uso: completá los valores marcados con <<< y ejecutá TODO el script en el SQL Editor.
-- Corre en una transacción: si algo falla, no se borra nada.
-- =====================================================================

begin;

do $$
declare
  v_confirmacion                   text    := 'NO';    -- <<< escribí exactamente: BORRAR GASTOS
  v_borrar_categorias              boolean := true;    -- <<< false = conservar rubros y subcategorías
  v_recrear_categorias_de_fabrica  boolean := false;   -- <<< true = después de borrar, crear las de fábrica

  v_saldo       numeric;
  v_suma        numeric;
  v_gastos      bigint;
  v_movimientos bigint;
  v_categorias  bigint := 0;
  v_movimientos_rubros bigint;
  v_rubro       record;
  v_padre       bigint;
  v_sub         text;
begin
  if v_confirmacion <> 'BORRAR GASTOS' then
    raise exception 'Por seguridad no se borró nada. Cambiá v_confirmacion a ''BORRAR GASTOS'' para confirmar.';
  end if;

  -- Nadie carga gastos ni mueve la caja de cambio mientras tanto.
  lock table public.gastos, public.movimientos_efectivo in share row exclusive mode;
  select saldo into v_saldo from public.caja_efectivo where id = 1 for update;

  -- El libro de la caja de cambio tiene que estar sano antes de recalcularlo.
  select coalesce(sum(monto), 0) into v_suma from public.movimientos_efectivo;
  if v_suma <> v_saldo or exists (
    select 1 from (
      select saldo_resultante, sum(monto) over (order by id) as acumulado
      from public.movimientos_efectivo
    ) l where l.saldo_resultante <> l.acumulado
  ) then
    raise exception 'El libro de la caja de cambio no cuadra con su saldo (saldo % y suma del libro %). No se borró nada: revisalo antes.', v_saldo, v_suma;
  end if;

  -- Gastos a borrar: todos menos los de compras de certificados.
  create temporary table gastos_a_borrar on commit drop as
  select g.id from public.gastos g
  where not exists (select 1 from public.compras_certificado c where c.gasto_id = g.id);

  -- Movimientos de la caja de cambio de esos gastos (el gasto y, si se anuló, su devolución).
  delete from public.movimientos_efectivo m
  where m.gasto_id in (select id from gastos_a_borrar);
  get diagnostics v_movimientos = row_count;

  delete from public.gastos g
  where g.id in (select id from gastos_a_borrar);
  get diagnostics v_gastos = row_count;

  -- Recalcular el saldo después de cada movimiento y el saldo actual (sacar egresos solo lo sube).
  update public.movimientos_efectivo m
  set saldo_resultante = l.acumulado
  from (select id, sum(monto) over (order by id) as acumulado from public.movimientos_efectivo) l
  where m.id = l.id and m.saldo_resultante <> l.acumulado;

  update public.caja_efectivo
  set saldo = (select coalesce(sum(monto), 0) from public.movimientos_efectivo), actualizado_en = now()
  where id = 1;

  if v_borrar_categorias then
    -- Primero subcategorías, después rubros (sin hijos). Queda la del sistema y su rubro.
    delete from public.categorias_gasto c
    where c.padre_id is not null and c.sistema is null
      and not exists (select 1 from public.gastos g where g.categoria_id = c.id);
    get diagnostics v_categorias = row_count;
    delete from public.categorias_gasto c
    where c.padre_id is null and c.sistema is null
      and not exists (select 1 from public.categorias_gasto h where h.padre_id = c.id)
      and not exists (select 1 from public.gastos g where g.categoria_id = c.id);
    get diagnostics v_movimientos_rubros = row_count;
    v_categorias := v_categorias + v_movimientos_rubros;

    if v_recrear_categorias_de_fabrica then
      for v_rubro in
        select * from (values
          (1, 'Insumos',              array['Compra de certificados', 'Papelería', 'Tóner y tinta']),
          (2, 'Limpieza',             array['Productos de limpieza', 'Servicio de limpieza']),
          (3, 'Personal',             array['Sueldos', 'Adelantos', 'Horas extra']),
          (4, 'Comida y refrigerio',  array['Comida', 'Café y bebidas']),
          (5, 'Servicios',            array['Luz', 'Agua', 'Gas', 'Internet y telefonía', 'Alquiler']),
          (6, 'Mantenimiento',        array['Edificio', 'Equipos de inspección', 'Informática']),
          (7, 'Impuestos y tasas',    array['Impuestos', 'Tasas municipales']),
          (8, 'Administración',       array['Honorarios', 'Bancos y comisiones', 'Seguros']),
          (9, 'Varios',               array['Otros'])
        ) as t(orden, nombre, subs)
        order by orden
      loop
        -- El rubro de la categoría del sistema ya existe: se reutiliza.
        select c.id into v_padre from public.categorias_gasto c
        where c.padre_id is null and lower(c.nombre) = lower(v_rubro.nombre);
        if v_padre is null then
          insert into public.categorias_gasto (nombre) values (v_rubro.nombre) returning id into v_padre;
        end if;
        foreach v_sub in array v_rubro.subs loop
          if v_sub <> 'Compra de certificados' then
            insert into public.categorias_gasto (nombre, padre_id, habilitada_caja)
            values (v_sub, v_padre,
                    v_sub in ('Papelería', 'Productos de limpieza', 'Comida', 'Café y bebidas', 'Otros'));
          end if;
        end loop;
        v_padre := null;
      end loop;
    end if;
  end if;

  raise notice 'Listo. Gastos borrados: % (se conservan los de compras de certificados); movimientos de la caja de cambio quitados: %; categorías borradas: %; saldo de la caja de cambio: $ %.',
    v_gastos, v_movimientos, v_categorias, (select saldo from public.caja_efectivo where id = 1);
end;
$$;

commit;

-- Verificación
select
  (select count(*) from public.gastos)                                         as gastos_que_quedan_de_compras,
  (select count(*) from public.categorias_gasto where padre_id is null)        as rubros,
  (select count(*) from public.categorias_gasto where padre_id is not null)    as subcategorias,
  (select saldo from public.caja_efectivo)                                     as saldo_caja_cambio,
  (select coalesce(sum(monto), 0) from public.movimientos_efectivo)            as suma_libro_caja_cambio;
