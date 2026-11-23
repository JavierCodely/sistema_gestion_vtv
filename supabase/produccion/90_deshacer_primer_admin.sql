-- =====================================================================
-- Sistema VTV — DESHACER 02_promover_primer_admin.sql
--
-- Borra el usuario indicado (login en auth.users + su perfil) para poder repetir:
--   paso 2 (crear el usuario en Authentication → Users) y
--   paso 3 (02_promover_primer_admin.sql).
--
-- Seguridad:
--   - Solo borra si el usuario NO tiene operaciones registradas (turnos, ventas, gastos…).
--   - Desactiva por un instante la protección de "último admin activo" SOLO para este
--     borrado; si algo falla, la transacción se revierte y la protección queda como estaba.
--
-- Uso: reemplazá el email de abajo y ejecutá todo el script en el SQL Editor.
-- =====================================================================

do $$
declare
  v_email text := 'CAMBIAR@tu-dominio.com';   -- <<< email del usuario a borrar
  v_id    uuid;
begin
  if v_email = 'CAMBIAR@tu-dominio.com' then
    raise exception 'Reemplazá el email de ejemplo por el del usuario a borrar';
  end if;

  select id into v_id from auth.users where lower(email) = lower(btrim(v_email));
  if v_id is null then
    raise notice 'No existe un usuario con email %: no hay nada para borrar.', v_email;
    return;
  end if;

  if exists (select 1 from public.turnos where usuario_id = v_id)
     or exists (select 1 from public.ventas where usuario_id = v_id or anulada_por = v_id)
     or exists (select 1 from public.gastos where usuario_id = v_id or anulado_por = v_id)
     or exists (select 1 from public.compras_certificado where usuario_id = v_id)
     or exists (select 1 from public.movimientos_certificado where usuario_id = v_id)
     or exists (select 1 from public.movimientos_efectivo where usuario_id = v_id)
     or exists (select 1 from public.alertas where leida_por = v_id)
  then
    raise exception 'El usuario % tiene operaciones registradas: no se borra. Para empezar de cero usá 99_borrar_todo.sql.', v_email;
  end if;

  alter table public.perfiles disable trigger perfiles_proteger_ultimo_admin;
  delete from auth.users where id = v_id;   -- borra en cascada el perfil e identidades
  alter table public.perfiles enable trigger perfiles_proteger_ultimo_admin;

  raise notice 'Usuario % borrado. Ya podés crearlo de nuevo y volver a correr 02_promover_primer_admin.sql.', v_email;
end;
$$;

-- Verificación: el usuario ya no debe aparecer.
select id, nombre, email, rol, activo from public.perfiles order by rol, email;
