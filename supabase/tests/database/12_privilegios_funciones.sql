begin;
\ir _helpers.psql
select plan(4);

-- Barrido general: protege también a las funciones que se agreguen en el futuro.
select is(
  (select coalesce(string_agg(p.oid::regprocedure::text, ', ' order by 1), '')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     and has_function_privilege('anon', p.oid, 'execute')),
  '', 'anon no ejecuta ninguna función de public');

select is(
  (select coalesce(string_agg(p.oid::regprocedure::text, ', ' order by 1), '')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     and (p.proname like '\_%' or p.prorettype = 'trigger'::regtype)
     and has_function_privilege('authenticated', p.oid, 'execute')),
  '', 'authenticated no ejecuta funciones internas (_*) ni de trigger');

select is(
  (select coalesce(string_agg(p.oid::regprocedure::text, ', ' order by 1), '')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     and p.proacl is null),
  '', 'ninguna función queda con los privilegios de fábrica (EXECUTE para PUBLIC)');

-- Una función nueva creada por postgres nace sin EXECUTE para PUBLIC.
create function public._prueba_privilegios() returns int language sql as 'select 1';
select ok(not has_function_privilege('anon', 'public._prueba_privilegios()', 'execute'),
  'las funciones nuevas no son ejecutables por anon');

select * from finish();
rollback;
