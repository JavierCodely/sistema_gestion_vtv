-- =====================================================================
-- Sistema VTV — BORRAR TODO (vuelve el proyecto a cero)
--
-- ⚠ DESTRUCTIVO E IRREVERSIBLE. Pensado para un proyecto de PRUEBA.
--   Nunca lo ejecutes en un proyecto con datos reales.
--
-- Borra:
--   - Todas las tablas, vistas, funciones y tipos del esquema public
--     (lo que instaló 01_esquema_completo.sql), con todos sus datos.
--   - Todos los usuarios de Authentication (auth.users).
--   - El registro de migraciones aplicadas (supabase_migrations), si existe.
-- No toca extensiones ni los esquemas internos de Supabase.
--
-- Después podés repetir desde el paso 1 de LEEME.md.
--
-- Uso: cambiá v_confirmacion a 'BORRAR TODO' y ejecutá todo el script.
-- Corre en una transacción: si algo falla, no se borra nada.
-- =====================================================================

begin;

do $$
declare
  v_confirmacion text := 'NO';   -- <<< escribí exactamente: BORRAR TODO
  r record;
begin
  if v_confirmacion <> 'BORRAR TODO' then
    raise exception 'Por seguridad no se borró nada. Cambiá v_confirmacion a ''BORRAR TODO'' para confirmar.';
  end if;

  -- Vistas y tablas (cascade se lleva FKs, triggers, políticas y la publicación de Realtime).
  for r in
    select c.relname, c.relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('v', 'm', 'r', 'p')
      and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
    order by c.relkind = 'r'   -- primero vistas
  loop
    execute format('drop %s if exists public.%I cascade',
                   case r.relkind when 'v' then 'view' when 'm' then 'materialized view' else 'table' end,
                   r.relname);
  end loop;

  -- Funciones (incluye las de triggers sobre auth.users: cascade borra esos triggers).
  for r in
    select p.oid::regprocedure as firma
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('drop function if exists %s cascade', r.firma);
  end loop;

  -- Tipos (enums).
  for r in
    select t.typname
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typtype = 'e'
      and not exists (select 1 from pg_depend d where d.objid = t.oid and d.deptype = 'e')
  loop
    execute format('drop type if exists public.%I cascade', r.typname);
  end loop;

  -- Usuarios de Authentication (identidades y sesiones se borran en cascada).
  delete from auth.users;

  -- Historial de migraciones de la CLI (existe solo si se usó db push o migration repair).
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations;
  end if;

  raise notice 'Proyecto vacío. Podés empezar de nuevo desde 01_esquema_completo.sql.';
end;
$$;

commit;

-- Verificación: las tres cuentas deben dar 0.
select
  (select count(*) from pg_tables where schemaname = 'public') as tablas,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public') as funciones,
  (select count(*) from auth.users) as usuarios;
