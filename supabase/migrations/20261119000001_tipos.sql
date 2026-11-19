-- Tipos enumerados y utilidades comunes.

create type public.rol_usuario as enum ('admin', 'cajero');
create type public.medio_pago as enum ('efectivo', 'transferencia', 'tarjeta');
create type public.fuente_fondos as enum ('efectivo', 'transferencia');
create type public.unidad_compra as enum ('caja', 'libreta', 'unidad');
create type public.alcance_certificado as enum ('global', 'categoria', 'servicio');
create type public.tipo_mov_certificado as enum ('compra', 'venta', 'ajuste');
create type public.tipo_mov_efectivo as enum (
  'fondo_inicial', 'ingreso', 'retiro',
  'venta', 'anulacion_venta',
  'gasto', 'anulacion_gasto'
);
create type public.tipo_alerta as enum ('venta_sin_stock', 'stock_bajo');

-- Fecha "de negocio": el día se cuenta en hora argentina.
create function public.fecha_local(ts timestamptz)
returns date
language sql
immutable
parallel safe
set search_path = ''
as $$
  select (ts at time zone 'America/Argentina/Buenos_Aires')::date
$$;

create function public.tg_actualizado_en()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

-- Valida que un texto obligatorio no venga vacío (si no, lanza p_mensaje). Devuelve el texto recortado.
create function public._texto_obligatorio(p_valor text, p_mensaje text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_valor is null or btrim(p_valor) = '' then
    raise exception '%', p_mensaje using errcode = '22023';
  end if;
  return btrim(p_valor);
end;
$$;
