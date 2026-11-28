  -- =====================================================================
  -- Migración 51: Estadísticas del admin (decisión del negocio, 2026-11-25)
  --
  -- Solo lectura y solo admin. La BD arma todos los números; el frontend los dibuja.
  -- Rango por día de negocio (hora AR), ambas fechas obligatorias. Las ventas anuladas no cuentan
  -- (salvo en `anuladas_*`). Las ventas con fecha pasada cuentan en su fecha (sin patente no suman
  -- vehículos), salvo en los horarios: su hora es opcional (00:00) y deformaría las horas pico.
  -- El rango se filtra por `creado_en` entre el inicio de `desde` y el de `hasta + 1` en hora AR
  -- (`_inicio_dia_local`): así usa el índice `ventas_creado` en vez de recorrer todas las ventas.
  --
  -- * `estadisticas_vehiculos(desde, hasta)`: 1 fila. Ventas, total, ticket promedio, ventas sin
  --   patente, **vehículos** (patentes distintas), **nuevos** (primera venta de la patente) y **que
  --   vuelven** (la patente ya tenía una venta antes del rango), **repetidos** (más de una venta en el
  --   rango sin contar la vuelta de una condicional) y anuladas (cantidad y monto).
  -- * `estadisticas_categorias(desde, hasta)`: tipo de vehículo = categoría de servicio (nombre
  --   actual): ventas, vehículos distintos y total, de más a menos vehículos.
  -- * `estadisticas_condicionales(desde, hasta)`: 1 fila sobre las condicionales vendidas en el rango:
  --   cuántas, al 50%, volvieron en plazo, volvieron fuera de plazo, se cobraron de nuevo
  --   (`condicional_vencida_de`), siguen vigentes sin volver y vencieron sin volver.
  -- * `estadisticas_horarios(desde, hasta)`: `agrupacion` = `dia` (los 7 días, 1 = lunes) y `hora`
  --   (de la primera a la última hora con ventas, sin huecos), con cantidad y total.
  -- * `comparacion_anual(anio)`: 12 filas (una por mes) con ventas, total y vehículos del año y del
  --   anterior.
  -- =====================================================================

  create function public._inicio_dia_local(p_dia date)
  returns timestamptz
  language sql
  immutable
  parallel safe
  set search_path = ''
  as $$
    select p_dia::timestamp at time zone 'America/Argentina/Buenos_Aires'
  $$;

  revoke all on function public._inicio_dia_local(date) from public, authenticated, anon;

  create function public._validar_rango_estadisticas(p_desde date, p_hasta date)
  returns void
  language plpgsql
  immutable
  set search_path = ''
  as $$
  begin
    if p_desde is null or p_hasta is null then
      raise exception 'Indicá las fechas desde y hasta' using errcode = '22023';
    end if;
    perform public._validar_rango_reporte(p_desde, p_hasta);
  end;
  $$;

  revoke all on function public._validar_rango_estadisticas(date, date) from public, authenticated, anon;

  -- Vehículos ----------------------------------------------------------------------------------------
  create function public.estadisticas_vehiculos(p_desde date, p_hasta date)
  returns table (
    ventas_cantidad       bigint,
    ventas_total          numeric(14,2),
    ticket_promedio       numeric(14,2),
    ventas_sin_patente    bigint,
    vehiculos             bigint,
    vehiculos_nuevos      bigint,
    vehiculos_que_vuelven bigint,
    vehiculos_repetidos   bigint,
    anuladas_cantidad     bigint,
    anuladas_total        numeric(14,2)
  )
  language plpgsql
  stable
  security definer
  set search_path = ''
  as $$
  declare
    v_inicio timestamptz;
    v_fin    timestamptz;
  begin
    perform public._exigir_admin();
    perform public._validar_rango_estadisticas(p_desde, p_hasta);
    v_inicio := public._inicio_dia_local(p_desde);
    v_fin := public._inicio_dia_local(p_hasta + 1);

    return query
    with del_rango as (
      select v.patente, v.precio, v.anulada, v.vuelta_de
      from public.ventas v
      where v.creado_en >= v_inicio and v.creado_en < v_fin
    ),
    validas as (
      select * from del_rango where not anulada
    ),
    patentes as (
      select d.patente,
            count(*) filter (where d.vuelta_de is null) as visitas,
            exists (
              select 1 from public.ventas a
              where a.patente = d.patente and not a.anulada and a.creado_en < v_inicio
            ) as ya_vino
      from validas d
      where d.patente is not null
      group by d.patente
    )
    select
      (select count(*) from validas),
      (select coalesce(sum(precio), 0) from validas)::numeric(14,2),
      (select coalesce(round(avg(precio), 2), 0) from validas)::numeric(14,2),
      (select count(*) from validas where patente is null),
      (select count(*) from patentes),
      (select count(*) from patentes where not ya_vino),
      (select count(*) from patentes where ya_vino),
      (select count(*) from patentes where visitas > 1),
      (select count(*) from del_rango where anulada),
      (select coalesce(sum(precio), 0) from del_rango where anulada)::numeric(14,2);
  end;
  $$;

  revoke execute on function public.estadisticas_vehiculos(date, date) from public, anon;
  grant execute on function public.estadisticas_vehiculos(date, date) to authenticated;

  -- Tipo de vehículo (categoría) ---------------------------------------------------------------------
  create function public.estadisticas_categorias(p_desde date, p_hasta date)
  returns table (
    categoria_id bigint,
    nombre       text,
    ventas       bigint,
    vehiculos    bigint,
    total        numeric(14,2)
  )
  language plpgsql
  stable
  security definer
  set search_path = ''
  as $$
  begin
    perform public._exigir_admin();
    perform public._validar_rango_estadisticas(p_desde, p_hasta);

    return query
    select v.categoria_id,
          coalesce(max(c.nombre), 'Sin categoría'),
          count(*),
          count(distinct v.patente),
          sum(v.precio)::numeric(14,2)
    from public.ventas v
    left join public.categorias_servicio c on c.id = v.categoria_id
    where not v.anulada
      and v.creado_en >= public._inicio_dia_local(p_desde)
      and v.creado_en < public._inicio_dia_local(p_hasta + 1)
    group by v.categoria_id
    order by 4 desc, 3 desc, 2;
  end;
  $$;

  revoke execute on function public.estadisticas_categorias(date, date) from public, anon;
  grant execute on function public.estadisticas_categorias(date, date) to authenticated;

  -- Condicionales ------------------------------------------------------------------------------------
  create function public.estadisticas_condicionales(p_desde date, p_hasta date)
  returns table (
    condicionales          bigint,
    al_50                  bigint,
    volvieron_en_plazo     bigint,
    volvieron_fuera_plazo  bigint,
    cobradas_de_nuevo      bigint,
    vigentes_sin_volver    bigint,
    vencidas_sin_volver    bigint
  )
  language plpgsql
  stable
  security definer
  set search_path = ''
  as $$
  declare
    v_hoy date := public.fecha_local(now());
  begin
    perform public._exigir_admin();
    perform public._validar_rango_estadisticas(p_desde, p_hasta);

    return query
    with condicionales as (
      select c.condicional_vence, c.condicional_saldo,
            vu.vuelta_fuera_de_plazo as fuera_de_plazo,
            vu.id is not null as volvio,
            exists (
              select 1 from public.ventas r
              where r.condicional_vencida_de = c.id and not r.anulada
            ) as recobrada
      from public.ventas c
      left join public.ventas vu on vu.vuelta_de = c.id and not vu.anulada
      where not c.anulada
        and c.condicional_vence is not null
        and c.creado_en >= public._inicio_dia_local(p_desde)
        and c.creado_en < public._inicio_dia_local(p_hasta + 1)
    )
    select
      count(*),
      count(*) filter (where condicional_saldo > 0),
      count(*) filter (where volvio and not fuera_de_plazo),
      count(*) filter (where volvio and fuera_de_plazo),
      count(*) filter (where not volvio and recobrada),
      count(*) filter (where not volvio and not recobrada and condicional_vence >= v_hoy),
      count(*) filter (where not volvio and not recobrada and condicional_vence < v_hoy)
    from condicionales;
  end;
  $$;

  revoke execute on function public.estadisticas_condicionales(date, date) from public, anon;
  grant execute on function public.estadisticas_condicionales(date, date) to authenticated;

  -- Horarios pico ------------------------------------------------------------------------------------
  create function public.estadisticas_horarios(p_desde date, p_hasta date)
  returns table (
    agrupacion text,
    valor      integer,
    cantidad   bigint,
    total      numeric(14,2)
  )
  language plpgsql
  stable
  security definer
  set search_path = ''
  as $$
  begin
    perform public._exigir_admin();
    perform public._validar_rango_estadisticas(p_desde, p_hasta);

    return query
    with del_rango as (
      select (v.creado_en at time zone 'America/Argentina/Buenos_Aires') as local, v.precio
      from public.ventas v
      where not v.anulada
        and v.cargada_en is null
        and v.creado_en >= public._inicio_dia_local(p_desde)
        and v.creado_en < public._inicio_dia_local(p_hasta + 1)
    ),
    por_dia as (
      select extract(isodow from d.local)::integer as dia, count(*) as cant, sum(d.precio) as monto
      from del_rango d group by 1
    ),
    por_hora as (
      select extract(hour from d.local)::integer as hora, count(*) as cant, sum(d.precio) as monto
      from del_rango d group by 1
    )
    select 'dia'::text, g.dia, coalesce(p.cant, 0), coalesce(p.monto, 0)::numeric(14,2)
    from generate_series(1, 7) as g(dia)
    left join por_dia p on p.dia = g.dia
    union all
    select 'hora'::text, g.hora, coalesce(p.cant, 0), coalesce(p.monto, 0)::numeric(14,2)
    from generate_series(
          coalesce((select min(hora) from por_hora), 0),
          coalesce((select max(hora) from por_hora), -1)
        ) as g(hora)
    left join por_hora p on p.hora = g.hora
    order by 1, 2;
  end;
  $$;

  revoke execute on function public.estadisticas_horarios(date, date) from public, anon;
  grant execute on function public.estadisticas_horarios(date, date) to authenticated;

  -- Año contra año -----------------------------------------------------------------------------------
  create function public.comparacion_anual(p_anio integer)
  returns table (
    mes                integer,
    ventas             bigint,
    total              numeric(14,2),
    vehiculos          bigint,
    ventas_anterior    bigint,
    total_anterior     numeric(14,2),
    vehiculos_anterior bigint
  )
  language plpgsql
  stable
  security definer
  set search_path = ''
  as $$
  begin
    perform public._exigir_admin();
    if p_anio is null or p_anio < 2000 or p_anio > 2100 then
      raise exception 'Elegí un año entre 2000 y 2100' using errcode = '22023';
    end if;

    return query
    with del_rango as (
      select extract(year from public.fecha_local(v.creado_en))::integer as anio,
            extract(month from public.fecha_local(v.creado_en))::integer as m,
            v.patente, v.precio
      from public.ventas v
      where not v.anulada
        and v.creado_en >= public._inicio_dia_local(make_date(p_anio - 1, 1, 1))
        and v.creado_en < public._inicio_dia_local(make_date(p_anio + 1, 1, 1))
    ),
    por_mes as (
      select d.anio, d.m, count(*) as cant, sum(d.precio) as monto, count(distinct d.patente) as autos
      from del_rango d group by 1, 2
    )
    select g.m,
          coalesce(a.cant, 0), coalesce(a.monto, 0)::numeric(14,2), coalesce(a.autos, 0),
          coalesce(b.cant, 0), coalesce(b.monto, 0)::numeric(14,2), coalesce(b.autos, 0)
    from generate_series(1, 12) as g(m)
    left join por_mes a on a.anio = p_anio and a.m = g.m
    left join por_mes b on b.anio = p_anio - 1 and b.m = g.m
    order by g.m;
  end;
  $$;

  revoke execute on function public.comparacion_anual(integer) from public, anon;
  grant execute on function public.comparacion_anual(integer) to authenticated;
