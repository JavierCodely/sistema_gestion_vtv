-- Datos SOLO para desarrollo local (supabase db reset). No se aplican en producción.
-- Admin:  admin@vtv.local  / admin1234
-- Cajero: cajero@vtv.local / cajero1234
-- Los tests pgTAP no dependen de estos datos: crean los suyos.

do $$
declare
  v_usuario record;
begin
  for v_usuario in
    select * from (values
      ('00000000-0000-0000-0000-00000000a001'::uuid, 'admin@vtv.local',  'admin1234',  'Ana',    'Administradora', 'admin'),
      ('00000000-0000-0000-0000-00000000c001'::uuid, 'cajero@vtv.local', 'cajero1234', 'Carlos', 'Demo',           'cajero')
    ) as t(id, email, clave, nombre, apellido, rol)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', v_usuario.id, 'authenticated', 'authenticated',
      v_usuario.email, extensions.crypt(v_usuario.clave, extensions.gen_salt('bf')), now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'rol', v_usuario.rol),
      jsonb_build_object('nombre', v_usuario.nombre, 'apellido', v_usuario.apellido), now(), now(),
      '', '', '', '', '', '', '', ''
    );

    insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(), v_usuario.id, v_usuario.id::text, 'email',
      jsonb_build_object('sub', v_usuario.id::text, 'email', v_usuario.email, 'email_verified', true),
      now(), now(), now()
    );
  end loop;
end;
$$;

insert into public.cajas (nombre) values ('Caja 1'), ('Caja 2');

insert into public.categorias_servicio (nombre) values ('Vehicular'), ('Motos');

insert into public.servicios (nombre, categoria_id, precio, requiere_certificado)
select 'Vehículo particular', id, 20000, true from public.categorias_servicio where nombre = 'Vehicular'
union all
select 'Moto', id, 12000, true from public.categorias_servicio where nombre = 'Motos'
union all
select 'Reverificación', id, 0, false from public.categorias_servicio where nombre = 'Vehicular';
