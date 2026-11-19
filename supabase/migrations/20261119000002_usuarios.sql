-- Perfiles de usuario y roles.
-- El perfil se crea solo cuando se da de alta un usuario en auth.users.
-- El rol se toma de raw_app_meta_data->>'rol' (solo el service role puede escribirlo).

create table public.perfiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  nombre         text not null check (btrim(nombre) <> ''),
  email          text,
  rol            public.rol_usuario not null default 'cajero',
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create trigger perfiles_actualizado_en
  before update on public.perfiles
  for each row execute function public.tg_actualizado_en();

create function public.tg_crear_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfiles (id, nombre, email, rol)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nombre'), ''), new.email, 'Sin nombre'),
    new.email,
    coalesce((new.raw_app_meta_data ->> 'rol')::public.rol_usuario, 'cajero')
  );
  return new;
end;
$$;

create trigger auth_users_crear_perfil
  after insert on auth.users
  for each row execute function public.tg_crear_perfil();

-- Siempre debe quedar al menos un administrador activo.
create function public.tg_proteger_ultimo_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.rol = 'admin' and old.activo
     and (tg_op = 'DELETE' or new.rol <> 'admin' or not new.activo)
     and not exists (
       select 1 from public.perfiles p
       where p.rol = 'admin' and p.activo and p.id <> old.id
     )
  then
    raise exception 'Debe quedar al menos un administrador activo' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger perfiles_proteger_ultimo_admin
  before update or delete on public.perfiles
  for each row execute function public.tg_proteger_ultimo_admin();

-- Rol del usuario actual; null si no hay sesión o el usuario está desactivado.
create function public.rol_actual()
returns public.rol_usuario
language sql
stable
security definer
set search_path = ''
as $$
  select p.rol from public.perfiles p where p.id = auth.uid() and p.activo
$$;

create function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.rol_actual() = 'admin', false)
$$;

-- Para usar al inicio de cada RPC: corta si no hay usuario activo.
create function public._exigir_usuario()
returns public.rol_usuario
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rol public.rol_usuario := public.rol_actual();
begin
  if v_rol is null then
    raise exception 'Usuario no autenticado o desactivado' using errcode = '42501';
  end if;
  return v_rol;
end;
$$;

create function public._exigir_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public._exigir_usuario() <> 'admin' then
    raise exception 'Solo un administrador puede hacer esta operación' using errcode = '42501';
  end if;
end;
$$;
