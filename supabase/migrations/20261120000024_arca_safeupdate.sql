-- Corrige dos funciones de la migración 023 que actualizaban la fila única de
-- arca_configuracion con un UPDATE sin WHERE. En Supabase, las sesiones de la API cargan
-- pg-safeupdate, que rechaza todo UPDATE/DELETE sin WHERE ("UPDATE requires a WHERE clause"):
-- subir el certificado y actualizar las condiciones de IVA fallaban desde la Edge Function.

create or replace function public._arca_actualizar_condiciones(p_condiciones jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cantidad integer;
begin
  if jsonb_typeof(p_condiciones) <> 'array' or jsonb_array_length(p_condiciones) = 0 then
    raise exception 'ARCA no devolvió condiciones frente al IVA' using errcode = '22023';
  end if;
  insert into public.arca_condiciones_iva (id, descripcion, clases, actualizado_en)
  select (c ->> 'id')::int, c ->> 'descripcion',
         array(select jsonb_array_elements_text(c -> 'clases')), now()
  from jsonb_array_elements(p_condiciones) c
  on conflict (id) do update
    set descripcion = excluded.descripcion, clases = excluded.clases, actualizado_en = now();
  get diagnostics v_cantidad = row_count;
  update public.arca_configuracion set condiciones_actualizadas_en = now() where id;
  return v_cantidad;
end;
$$;

create or replace function public._arca_guardar_credenciales(
  p_certificado text, p_clave text, p_cuit text, p_sujeto text, p_vence timestamptz,
  p_usuario_id uuid
)
returns public.arca_configuracion
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_config public.arca_configuracion;
begin
  select * into v_config from public.arca_configuracion where id for update;
  if v_config.certificado_secreto_id is null then
    v_config.certificado_secreto_id := vault.create_secret(p_certificado, 'arca_certificado',
      'Certificado X.509 de ARCA (WSAA)');
    v_config.clave_secreto_id := vault.create_secret(p_clave, 'arca_clave',
      'Clave privada del certificado de ARCA');
  else
    perform vault.update_secret(v_config.certificado_secreto_id, p_certificado);
    perform vault.update_secret(v_config.clave_secreto_id, p_clave);
  end if;
  update public.arca_configuracion set
    certificado_secreto_id = v_config.certificado_secreto_id,
    clave_secreto_id = v_config.clave_secreto_id,
    certificado_cuit = p_cuit, certificado_sujeto = left(p_sujeto, 500),
    certificado_vence = p_vence, certificado_cargado_en = now(), actualizado_por = p_usuario_id
  where id
  returning * into v_config;
  -- Un certificado nuevo invalida los tickets de acceso anteriores.
  delete from public.arca_tokens where true;
  return v_config;
end;
$$;
