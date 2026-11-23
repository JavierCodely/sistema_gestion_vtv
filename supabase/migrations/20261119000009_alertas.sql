-- Alertas para el administrador (venta sin certificado, stock bajo).
-- Se publican en Realtime para el contador del header.

create table public.alertas (
  id             bigint generated always as identity primary key,
  tipo           public.tipo_alerta not null,
  mensaje        text not null,
  certificado_id bigint references public.certificados (id),
  venta_id       bigint,
  leida          boolean not null default false,
  leida_en       timestamptz,
  leida_por      uuid references public.perfiles (id),
  creado_en      timestamptz not null default now()
);

create index alertas_no_leidas on public.alertas (creado_en desc) where not leida;

-- Marca como leídas las alertas indicadas, o todas si p_ids es null. Devuelve cuántas cambió.
create function public.marcar_alertas_leidas(p_ids bigint[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cant integer;
begin
  perform public._exigir_admin();

  update public.alertas
  set leida = true, leida_en = now(), leida_por = auth.uid()
  where not leida
    and (p_ids is null or id = any (p_ids));

  get diagnostics v_cant = row_count;
  return v_cant;
end;
$$;
