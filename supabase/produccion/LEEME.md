# Instalación de la base en producción (SQL Editor)

Ejecutar en el SQL Editor del Dashboard de Supabase, **en este orden**:

| Orden | Script | Qué hace | Cuándo |
|---|---|---|---|
| 1 | `01_esquema_completo.sql` | Todas las migraciones de `supabase/migrations/` en una transacción: tablas, funciones, vistas, RLS, categorías de gasto precargadas | Una sola vez, en un proyecto vacío |
| 2 | Dashboard → Authentication → Users → **Add user** | Crear el primer usuario (email + contraseña ≥ 8, marcar *Auto Confirm User*) | Después del paso 1 |
| 3 | `02_promover_primer_admin.sql` | Lo convierte en administrador (editar email, nombre y apellido en las líneas marcadas) | Después del paso 2 |

Después del paso 1, registrá las migraciones como aplicadas (desde la carpeta del proyecto, con
`npx supabase link` hecho), para que un futuro `supabase db push` no las aplique de nuevo:

```
npx supabase migration repair --status applied <versiones>
```

El comando exacto, con todas las versiones, está en el **encabezado de `01_esquema_completo.sql`**
(se regenera solo con cada migración nueva: copialo de ahí).

Además, en el Dashboard → Authentication:
- Desactivar **Allow new users to sign up** (los usuarios los crea el admin desde la app).
- **Minimum password length**: 8.
- Activar **Secure password change**.

Y desplegar la Edge Function: `npx supabase functions deploy admin-usuarios`.

## Volver a probar desde cero (solo proyectos de prueba)

| Script | Qué borra | Después |
|---|---|---|
| `50_reiniciar_datos.sql` | Los **datos**, sin tocar el esquema: ventas (con las condicionales, enteras o al 50%, y sus vueltas), turnos, gastos, compras, kardex, caja de cambio (a $ 0), Fondos, alertas y comprobantes; opcional: catálogo (cajas, servicios, certificados, descuentos, impuestos). Opcional también: rubros y subcategorías de gasto (vuelven a los de fábrica). Conserva **todos los usuarios** y la configuración de ARCA. Exige escribir `EMPEZAR DE CERO`; con facturas autorizadas en producción, además `BORRAR FACTURAS REALES` | Fondos → Efectivo → "Fondo inicial" y abrir turnos |
| `51_borrar_gastos.sql` | Todos los **gastos** (salvo los automáticos de compras de certificados) y, opcional, sus rubros y subcategorías (o volver a los de fábrica). Recalcula el libro y el saldo de la caja de cambio: la plata de los gastos en efectivo vuelve. Exige escribir `BORRAR GASTOS` | — |
| `52_borrar_usuarios.sql` | **Usuarios** (login, email y perfil): todos, o todos menos el admin indicado. Solo si no tienen operaciones (si tienen, correr antes `50_reiniciar_datos.sql`). Exige escribir `BORRAR USUARIOS` | Si no quedó nadie: repetir pasos 2 y 3 |
| `90_deshacer_primer_admin.sql` | Solo el usuario indicado (login + perfil). Se niega si ya tiene operaciones registradas | Repetir pasos 2 y 3 |
| `99_borrar_todo.sql` | **Todo**: tablas y datos, funciones, tipos, usuarios de Authentication e historial de migraciones. Exige escribir `BORRAR TODO` en el script | Repetir desde el paso 1 |

Los dos corren en una transacción: si algo falla, no se borra nada. **Nunca** uses `99` con datos reales.

## Mantenimiento
- `01_esquema_completo.sql` es **generado**: no editarlo. Tras cambiar `supabase/migrations/`,
  correr `npm run sql:produccion`. `npm run verificar` falla si quedó desactualizado.
- Cambios futuros en una base ya instalada: ejecutar solo las migraciones nuevas
  (o `npx supabase db push`), nunca de nuevo el esquema completo.
- `supabase/seed.sql` (usuarios `admin1234` / `cajero1234`) es solo para desarrollo local: **nunca** en producción.
