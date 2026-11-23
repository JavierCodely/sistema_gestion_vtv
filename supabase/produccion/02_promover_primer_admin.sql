-- =====================================================================
-- Sistema VTV — convertir en administrador al primer usuario
--
-- Requisitos:
--   1. Haber ejecutado 01_esquema_completo.sql.
--   2. Haber creado el usuario en Dashboard → Authentication → Users → "Add user"
--      (email + contraseña de al menos 8 caracteres, marcando "Auto Confirm User").
--
-- Uso: reemplazá el email de abajo y ejecutá todo el script en el SQL Editor.
-- Es idempotente: se puede correr más de una vez.
-- Los demás usuarios se crean después desde la app (Panel admin → Usuarios).
-- =====================================================================

do $$
declare
  v_email  text := 'CAMBIAR@tu-dominio.com';   -- <<< email del primer admin
  v_nombre   text := 'Nombre';    -- <<< nombre que se mostrará en la app
  v_apellido text := 'Apellido';  -- <<< apellido
  v_id     uuid;
begin
  if v_email = 'CAMBIAR@tu-dominio.com' or v_nombre = 'Nombre' or v_apellido = 'Apellido' then
    raise exception 'Reemplazá el email, el nombre y el apellido de ejemplo por los del usuario real';
  end if;

  select id into v_id from auth.users where lower(email) = lower(btrim(v_email));
  if v_id is null then
    raise exception 'No existe un usuario con email %. Crealo primero en Authentication → Users.', v_email;
  end if;

  -- Rol en app_metadata (solo editable por el servidor, nunca por el usuario).
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"rol": "admin"}'::jsonb,
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('nombre', v_nombre, 'apellido', v_apellido)
  where id = v_id;

  -- El perfil lo crea un trigger; si el usuario se creó ANTES del esquema, lo creamos acá.
  insert into public.perfiles (id, nombre, apellido, email, rol, activo)
  values (v_id, v_nombre, v_apellido, lower(btrim(v_email)), 'admin', true)
  on conflict (id) do update
    set rol = 'admin', activo = true, nombre = excluded.nombre, apellido = excluded.apellido;
end;
$$;

-- Verificación: tiene que aparecer el usuario con rol admin y activo = true.
select id, nombre, apellido, email, rol, activo from public.perfiles where rol = 'admin';
