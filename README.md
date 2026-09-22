# RollersMaps

Aplicación para patinar libre y participar en comunidades. Mapa, GPS, guardado
local y compartir recorridos disponibles con una cuenta, sin necesidad de pertenecer a un grupo. Los
calendarios y las reservas requieren membresía activa en su grupo.

**Versión en preparación:** 1.4.0 · **Base estable:** 1.3.3

**Creador y titular:** Manuel Salinas · **Licencia:** propietaria, ver [LICENSE](LICENSE).

## Desarrollo

Node.js 24 recomendado para ejecutar también las pruebas SQLite. Instalar con
`npm ci` y abrir Expo con `npm start`. La aplicación necesita una compilación
nativa por MapLibre y el seguimiento en segundo plano; no basta Expo Go.

Crear `.env.local` sin subirlo a Git, con las variables públicas
`EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
No colocar contraseñas de la base ni claves administrativas en el cliente.

## Comprobación automática

`npm run verify` comprueba los tipos de aplicación y pruebas, analiza la calidad
del código y ejecuta la suite completa. `npm test` ejecuta solo las pruebas.
PostgreSQL local (PGlite) y SQLite prueban permisos y persistencia sin tocar producción.

GitHub Actions ejecuta la misma rutina en cada cambio de `main` y `feature/**`,
y en solicitudes de integración. Usa Node.js 24, dependencias del archivo de
bloqueo y permisos de lectura. No requiere secretos de Supabase ni despliega.

Además se verificó el último cupo con dos conexiones simultáneas sobre una copia
restaurada en PostgreSQL 17.11. El GPS físico, iOS y la aceptación con cuentas reales
siguen siendo controles previos a la publicación.

## Android de prueba

Después de generar Android con Expo, `npm run preview:prepare` adapta el proyecto
nativo generado. Compilar con `assembleRelease -ProllersMapsPreview=true` instala
el paquete `cl.santiagorollers.rollersmaps.preview`, separado de la app estable.
La preparación solo cambia la carpeta Android generada e ignorada por Git.
La firma local es de prueba; no es una firma de distribución de tienda.

## Base de datos y documentación

- [Modelo acordado](docs/PLAN-1.4.0.md).
- [Manual actualizado](docs/MANUAL-1.4.0.md).
- [Informe histórico del 20 de septiembre](docs/VALIDACION-1.4.0.md).
- [Revisión de solo lectura previa](supabase/preflight-v140.sql).
- [Migración de grupos](supabase/migrations/20260920_groups_v140.sql).
- [Registro obligatorio: aplicar después de grupos](supabase/migrations/20260921_account_required.sql).
- [Validación del registro](docs/VALIDACION-REGISTRO.md).
- [Manual histórico 1.3.0](docs/MANUAL-TECNICO.md).

Las dos migraciones se aplicaron en Supabase el 21 de septiembre de 2026, después
de respaldar la base, restaurar los esquemas de la app y autenticación localmente
y ensayar los cambios. Se verificaron conservación de datos y permisos remotos.
El informe vigente es [VALIDACION-REGISTRO.md](docs/VALIDACION-REGISTRO.md).
Ante nuevas migraciones, repetir revisión y respaldo. Git no respalda datos de Supabase.

La etiqueta `backup/v1.3.3-before-groups-20260920` conserva la versión estable.
El trabajo de grupos se mantiene en `feature/1.4.0-groups`.

Copyright © 2026 Manuel Salinas. Todos los derechos reservados.
