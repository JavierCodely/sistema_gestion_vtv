-- Seguridad: RLS, permisos y Realtime.
-- Principio: el cliente LEE con RLS; toda escritura con reglas de negocio
-- (ventas, turnos, gastos, stock, efectivo, alertas) pasa por RPC security definer.
-- El CRUD simple de catálogo lo hace el admin directo sobre la tabla, con columnas acotadas.

-- 1) Partir de cero: nada para anon/authenticated, ni ahora ni en objetos futuros.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- 2) RLS en todas las tablas.
alter table public.perfiles                enable row level security;
alter table public.cajas                   enable row level security;
alter table public.turnos                  enable row level security;
alter table public.categorias_servicio     enable row level security;
alter table public.servicios               enable row level security;
alter table public.certificados            enable row level security;
alter table public.movimientos_certificado enable row level security;
alter table public.compras_certificado     enable row level security;
alter table public.caja_efectivo           enable row level security;
alter table public.movimientos_efectivo    enable row level security;
alter table public.categorias_gasto        enable row level security;
alter table public.gastos                  enable row level security;
alter table public.alertas                 enable row level security;
alter table public.ventas                  enable row level security;

-- 3) Funciones expuestas a usuarios autenticados.
grant execute on function
  public.rol_actual(),
  public.es_admin(),
  public.fecha_local(timestamptz),
  public.certificado_para_servicio(bigint),
  public.abrir_turno(bigint),
  public.cerrar_turno(text, bigint),
  public.registrar_venta(bigint, public.medio_pago, text),
  public.anular_venta(bigint, text),
  public.registrar_gasto(bigint, numeric, public.fuente_fondos, text),
  public.anular_gasto(bigint, text),
  public.registrar_compra_certificado(bigint, integer, numeric, public.fuente_fondos, text),
  public.ajustar_stock_certificado(bigint, integer, text),
  public.movimiento_efectivo(public.tipo_mov_efectivo, numeric, text),
  public.marcar_alertas_leidas(bigint[])
to authenticated;

-- 4) Lectura.
grant select on
  public.perfiles, public.cajas, public.turnos, public.categorias_servicio, public.servicios,
  public.certificados, public.movimientos_certificado, public.compras_certificado,
  public.caja_efectivo, public.movimientos_efectivo, public.categorias_gasto, public.gastos,
  public.alertas, public.ventas,
  public.v_movimientos_caja, public.v_turnos, public.v_resumen_diario,
  public.v_stock_certificados, public.v_gastos_por_categoria
to authenticated;

-- Catálogos: cualquier usuario activo.
create policy "usuarios activos leen cajas" on public.cajas
  for select to authenticated using ((select public.rol_actual()) is not null);
create policy "usuarios activos leen categorias de servicio" on public.categorias_servicio
  for select to authenticated using ((select public.rol_actual()) is not null);
create policy "usuarios activos leen servicios" on public.servicios
  for select to authenticated using ((select public.rol_actual()) is not null);
create policy "usuarios activos leen certificados" on public.certificados
  for select to authenticated using ((select public.rol_actual()) is not null);
create policy "usuarios activos leen categorias de gasto" on public.categorias_gasto
  for select to authenticated using ((select public.rol_actual()) is not null);
create policy "usuarios activos leen saldo de efectivo" on public.caja_efectivo
  for select to authenticated using ((select public.rol_actual()) is not null);

-- Datos propios (o todo, si es admin).
create policy "propio perfil o admin" on public.perfiles
  for select to authenticated using (id = (select auth.uid()) or (select public.es_admin()));
create policy "turnos propios o admin" on public.turnos
  for select to authenticated
  using ((usuario_id = (select auth.uid()) and (select public.rol_actual()) is not null)
         or (select public.es_admin()));
create policy "ventas propias o admin" on public.ventas
  for select to authenticated
  using ((usuario_id = (select auth.uid()) and (select public.rol_actual()) is not null)
         or (select public.es_admin()));
create policy "gastos propios o admin" on public.gastos
  for select to authenticated
  using ((usuario_id = (select auth.uid()) and (select public.rol_actual()) is not null)
         or (select public.es_admin()));

-- Solo admin.
create policy "admin lee kardex" on public.movimientos_certificado
  for select to authenticated using ((select public.es_admin()));
create policy "admin lee compras" on public.compras_certificado
  for select to authenticated using ((select public.es_admin()));
create policy "admin lee libro de efectivo" on public.movimientos_efectivo
  for select to authenticated using ((select public.es_admin()));
create policy "admin lee alertas" on public.alertas
  for select to authenticated using ((select public.es_admin()));

-- 5) Escritura directa del admin (CRUD de catálogo), con columnas acotadas.
grant insert (nombre, activa), update (nombre, activa), delete on public.cajas to authenticated;
grant insert (nombre, activa), update (nombre, activa), delete on public.categorias_servicio to authenticated;
grant insert (nombre, categoria_id, precio, requiere_certificado, activo),
      update (nombre, categoria_id, precio, requiere_certificado, activo),
      delete on public.servicios to authenticated;
-- stock_hojas y costo_promedio quedan fuera: solo los mueven las RPC.
grant insert (nombre, unidad_compra, hojas_por_unidad, alcance, categoria_id, servicio_id, stock_minimo, activo),
      update (nombre, unidad_compra, hojas_por_unidad, alcance, categoria_id, servicio_id, stock_minimo, activo),
      delete on public.certificados to authenticated;
grant insert (nombre, padre_id, habilitada_caja, activa),
      update (nombre, padre_id, habilitada_caja, activa),
      delete on public.categorias_gasto to authenticated;

create policy "admin crea cajas" on public.cajas for insert to authenticated with check ((select public.es_admin()));
create policy "admin edita cajas" on public.cajas for update to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));
create policy "admin borra cajas" on public.cajas for delete to authenticated using ((select public.es_admin()));

create policy "admin crea categorias de servicio" on public.categorias_servicio for insert to authenticated with check ((select public.es_admin()));
create policy "admin edita categorias de servicio" on public.categorias_servicio for update to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));
create policy "admin borra categorias de servicio" on public.categorias_servicio for delete to authenticated using ((select public.es_admin()));

create policy "admin crea servicios" on public.servicios for insert to authenticated with check ((select public.es_admin()));
create policy "admin edita servicios" on public.servicios for update to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));
create policy "admin borra servicios" on public.servicios for delete to authenticated using ((select public.es_admin()));

create policy "admin crea certificados" on public.certificados for insert to authenticated with check ((select public.es_admin()));
create policy "admin edita certificados" on public.certificados for update to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));
create policy "admin borra certificados" on public.certificados for delete to authenticated using ((select public.es_admin()));

create policy "admin crea categorias de gasto" on public.categorias_gasto for insert to authenticated with check ((select public.es_admin()));
create policy "admin edita categorias de gasto" on public.categorias_gasto for update to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));
create policy "admin borra categorias de gasto" on public.categorias_gasto for delete to authenticated using ((select public.es_admin()));

-- 6) Realtime para el contador de alertas (respeta la RLS de select).
alter publication supabase_realtime add table public.alertas;
