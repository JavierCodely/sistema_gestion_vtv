# Instalación de la base en producción (SQL Editor)

Ejecutar en el SQL Editor del Dashboard de Supabase, **en este orden**:

| Orden | Script | Qué hace | Cuándo |
|---|---|---|---|
| 1 | `01_esquema_completo.sql` | Todas las migraciones de `supabase/migrations/` en una transacción: tablas, funciones, vistas, RLS, categorías de gasto precargadas | Una sola vez, en un proyecto vacío |
| 2 | Dashboard → Authentication → Users → **Add user** | Crear el primer usuario (email + contraseña ≥ 8, marcar *Auto Confirm User*) | Después del paso 1 |
| 3 | `02_promover_primer_admin.sql` | Lo convierte en administrador (editar el email en la línea marcada) | Después del paso 2 |

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
| `90_deshacer_primer_admin.sql` | Solo el usuario indicado (login + perfil). Se niega si ya tiene operaciones registradas | Repetir pasos 2 y 3 |
| `99_borrar_todo.sql` | **Todo**: tablas y datos, funciones, tipos, usuarios de Authentication e historial de migraciones. Exige escribir `BORRAR TODO` en el script | Repetir desde el paso 1 |

Los dos corren en una transacción: si algo falla, no se borra nada. **Nunca** uses `99` con datos reales.

## Mantenimiento
- `01_esquema_completo.sql` es **generado**: no editarlo. Tras cambiar `supabase/migrations/`,
  correr `npm run sql:produccion`. `npm run verificar` falla si quedó desactualizado.
- Cambios futuros en una base ya instalada: ejecutar solo las migraciones nuevas
  (o `npx supabase db push`), nunca de nuevo el esquema completo.
- `supabase/seed.sql` (usuarios `admin1234` / `cajero1234`) es solo para desarrollo local: **nunca** en producción.
