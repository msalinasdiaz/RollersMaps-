# RollersMaps

Aplicación móvil de Santiago Rollers para consultar rutas y clases, inscribirse,
registrar recorridos GPS y administrar actividades personales.

**Versión:** 1.3.0

**Creador y titular:** Manuel Salinas

**Licencia:** propietaria; consulta [LICENSE](LICENSE).

## Inicio rápido

Requisitos: Node.js 22.13 o superior, npm y las herramientas de Android cuando
se necesite una compilación local.

```bash
npm install
npx expo start
```

Crea `.env.local` sin subirlo a Git:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=TU_CLAVE_PUBLICABLE
```

## Comandos

- `npm start`: inicia Expo.
- `npm run android`: abre la compilación Android de desarrollo.
- `npm run web`: inicia la versión web.
- `npm run lint`: ejecuta el análisis estático.
- `npx tsc --noEmit`: valida TypeScript.
- `cd android && gradlew.bat assembleRelease`: genera el APK release local.

## Documentación

- [Manual técnico](docs/MANUAL-TECNICO.md)
- [Migración Supabase 1.3.0](supabase/migrations/20260912_user_activities_v130.sql)

## Seguridad

Las claves privadas de Supabase, credenciales de firma y contraseñas nunca deben
guardarse en Git. La aplicación cliente utiliza solamente la clave publicable y
protege los datos personales con Row Level Security.

Copyright © 2026 Manuel Salinas. Todos los derechos reservados.
