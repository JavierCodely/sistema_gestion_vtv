-- =====================================================================
-- Sistema VTV — BORRAR LOS USUARIOS (login, email y perfil)
--
-- ⚠ DESTRUCTIVO E IRREVERSIBLE.
--
-- Borra de Authentication (auth.users, con sus identidades y sesiones) y de la app (perfiles):
--   - Con v_conservar_email vacío: TODOS los usuarios. Después nadie puede entrar: repetí los pasos
--     D6 y D7 de docs/COMANDOS.md (crear el usuario en Authentication → Users y correr
--     02_promover_primer_admin.sql).
--   - Con v_conservar_email = tu email: todos MENOS ese usuario (tiene que ser un admin activo, así
--     seguís pudiendo entrar y crear los demás desde Usuarios).
--
-- Solo borra usuarios SIN operaciones: si alguno figura en ventas, turnos, gastos, compras,
-- comprobantes, movimientos, etc., no se borra NADIE y el mensaje dice dónde aparece. En ese caso
-- corré primero 50_reiniciar_datos.sql (borra las operaciones y conserva los usuarios) y después
-- este script. Lo único que se limpia solo es "quién modificó la configuración de ARCA".
--
-- Uso: completá los valores marcados con <<< y ejecutá TODO el script en el SQL Editor.
-- Corre en una transacción: si algo falla, no se borra nada y la protección del último admin
-- queda como estaba.
-- =====================================================================

begin;

do $$
declare
  v_confirmacion    text := 'NO';   -- <<< escribí exactamente: BORRAR USUARIOS
  v_conservar_email text := '';     -- <<< tu email para conservarte; vacío = borrar a todos

  v_conservar uuid;
  v_usos      text := '';
  v_cantidad  bigint;
  v_borrados  bigint;
  r           record;
begin
  if v_confirmacion <> 'BORRAR USUARIOS' then
    raise exception 'Por seguridad no se borró nada. Cambiá v_confirmacion a ''BORRAR USUARIOS'' para confirmar.';
  end if;

  if btrim(v_conservar_email) <> '' then
    select p.id into v_conservar
    from public.perfiles p
    where lower(p.email) = lower(btrim(v_conservar_email)) and p.rol = 'admin' and p.activo;
    if v_conservar is null then
      raise exception 'No hay un admin activo con email %. Revisá v_conservar_email (o dejalo vacío para borrar a todos).', v_conservar_email;
    end if;
  end if;

  create temporary table usuarios_a_borrar on commit drop as
  select u.id from auth.users u
  where v_conservar is null or u.id <> v_conservar;

  -- La configuración de ARCA solo recuerda quién la modificó: se limpia.
  update public.arca_configuracion set actualizado_por = v_conservar
  where actualizado_por in (select id from usuarios_a_borrar);

  -- ¿Alguno figura en el historial? Se revisan TODAS las columnas que apuntan a perfiles.
  for r in
    select c.conrelid::regclass as tabla, a.attname as columna
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f'
      and c.confrelid = 'public.perfiles'::regclass
      and c.conrelid <> 'public.perfiles'::regclass
  loop
    execute format('select count(*) from %s where %I in (select id from usuarios_a_borrar)',
                   r.tabla, r.columna)
      into v_cantidad;
    if v_cantidad > 0 then
      v_usos := v_usos || format(' %s.%s (%s)', r.tabla, r.columna, v_cantidad);
    end if;
  end loop;
  if v_usos <> '' then
    raise exception 'No se borró nadie: hay usuarios con operaciones registradas en:%. Corré primero 50_reiniciar_datos.sql y después este script.', v_usos;
  end if;

  -- Sin la protección de "último admin activo" solo durante este borrado.
  alter table public.perfiles disable trigger perfiles_proteger_ultimo_admin;
  delete from auth.users u where u.id in (select id from usuarios_a_borrar);   -- perfiles en cascada
  get diagnostics v_borrados = row_count;
  alter table public.perfiles enable trigger perfiles_proteger_ultimo_admin;

  raise notice 'Listo. Usuarios borrados: %. %', v_borrados,
    case when v_conservar is null
      then 'No queda ninguno: creá el primer admin en Authentication → Users y corré 02_promover_primer_admin.sql.'
      else 'Quedaste vos como admin: creá los demás desde Usuarios.' end;
end;
$$;

commit;

-- Verificación: los usuarios que quedan (ninguno, o vos).
select u.email, p.nombre_completo, p.rol, p.activo
from auth.users u
left join public.perfiles p on p.id = u.id
order by u.email;
