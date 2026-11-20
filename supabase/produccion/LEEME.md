# Instalación de la base en producción (SQL Editor)

Ejecutar en el SQL Editor del Dashboard de Supabase, **en este orden**:

| Orden | Script | Qué hace | Cuándo |
|---|---|---|---|
| 1 | `01_esquema_completo.sql` | Las 14 migraciones de `supabase/migrations/` en una transacción: tablas, funciones, vistas, RLS, categorías de gasto precargadas | Una sola vez, en un proyecto vacío |
| 2 | Dashboard → Authentication → Users → **Add user** | Crear el primer usuario (email + contraseña ≥ 8, marcar *Auto Confirm User*) | Después del paso 1 |
| 3 | `02_promover_primer_admin.sql` | Lo convierte en administrador (editar el email en la línea marcada) | Después del paso 2 |

Después del paso 1, registrá las migraciones como aplicadas (desde la carpeta del proyecto, con
`npx supabase link` hecho), para que un futuro `supabase db push` no las aplique de nuevo:

```
npx supabase migration repair --status applied 20261119000001 20261119000002 20261119000003 20261119000004 20261119000005 20261119000006 20261119000007 20261119000008 20261119000009 20261119000010 20261119000011 20261119000012 20261119000013 20261120000014
```

Además, en el Dashboard → Authentication:
- Desactivar **Allow new users to sign up** (los usuarios los crea el admin desde la app).
- **Minimum password length**: 8.
- Activar **Secure password change**.

Y desplegar la Edge Function: `npx supabase functions deploy admin-usuarios`.

## Mantenimiento
- `01_esquema_completo.sql` es **generado**: no editarlo. Tras cambiar `supabase/migrations/`,
  correr `npm run sql:produccion`. `npm run verificar` falla si quedó desactualizado.
- Cambios futuros en una base ya instalada: ejecutar solo las migraciones nuevas
  (o `npx supabase db push`), nunca de nuevo el esquema completo.
- `supabase/seed.sql` (usuarios `admin1234` / `cajero1234`) es solo para desarrollo local: **nunca** en producción.
