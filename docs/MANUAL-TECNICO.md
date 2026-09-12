# Manual técnico de RollersMaps

**Versión documentada:** 1.3.0

**Fecha:** 12 de septiembre de 2026

**Creador y titular:** Manuel Salinas

**Aplicación:** `cl.santiagorollers.rollersmaps`

## 1. Propósito

RollersMaps es la aplicación móvil de Santiago Rollers. Permite crear una
cuenta, consultar rutas y clases, inscribirse a actividades, revisar el nivel
técnico, registrar un recorrido GPS y administrar el historial personal.

La versión 1.3.0 añade:

- pantalla dedicada **Mis actividades**;
- resumen liviano en Inicio;
- renombrado de recorridos GPS;
- tarjeta vertical 9:16 para compartir la última actividad;
- mapa con trazado, marcador de inicio y marcador de término;
- asociación del registro GPS a la ruta o clase donde el usuario está inscrito;
- conteo simple de participantes para usuarios inscritos;
- logo transparente y centrado en Inicio;
- derechos de autor de Manuel Salinas.

## 2. Arquitectura

```text
App Expo / React Native
├── Expo Router: navegación por archivos
├── Contexto de sesión: autenticación e inscripciones
├── Hooks de datos: agenda, rutas e historial GPS
├── Supabase
│   ├── Auth: cuentas y sesiones
│   ├── PostgreSQL: perfiles, rutas, actividades e historial
│   ├── RPC: agenda e inscripción
│   └── RLS: cada usuario ve y modifica solo su historial
├── Expo Location: ubicación y seguimiento en primer plano
├── MapLibre + OpenFreeMap: mapas y trazados
└── View Shot + Expo Sharing: imagen 9:16 y hoja nativa de compartir
```

El cliente se comunica directamente con Supabase usando la clave publicable.
La autorización real se aplica en PostgreSQL mediante Row Level Security (RLS);
la clave publicable no reemplaza las políticas de acceso.

## 3. Stack y versiones

### Núcleo

| Componente | Versión |
|---|---:|
| Expo SDK | 57.0.22 |
| Expo Router | 57.0.21 |
| React | 19.2.3 |
| React Native | 0.86.3 |
| TypeScript | 6.0.3 |
| React Native Web | 0.21.0 |
| Motor JavaScript Android | Hermes |
| Arquitectura RN | Nueva arquitectura habilitada |

### Servicios y funciones

| Componente | Versión / uso |
|---|---|
| Supabase JS | 2.116.0 |
| MapLibre React Native | 11.3.10 |
| Expo Location | 57.0.17 |
| Expo Sharing | 57.0.19 |
| React Native View Shot | 5.1.0 |
| Expo SQLite | 57.0.3; almacenamiento persistente de sesión |
| OpenFreeMap | estilo de mapa remoto `liberty` |

Las versiones exactas y transitivas quedan bloqueadas en `package-lock.json`.

### Herramientas de desarrollo verificadas

- Windows 11.
- Node.js 24.20.0 en la estación actual; Expo SDK 57 requiere Node 22.13 o
  superior.
- npm 11.19.0.
- Microsoft OpenJDK 17 para la compilación local.
- Android Gradle Plugin administrado por Expo/React Native.

### Configuración Android resuelta

- Build Tools: 36.0.0.
- `minSdk`: 24, Android 7.0 o superior.
- `compileSdk`: 36.
- `targetSdk`: 36.
- NDK: 27.1.12297006.
- Kotlin: 2.1.20.
- KSP: 2.1.20-2.0.1.
- Arquitecturas del APK universal: ARMv7, ARM64, x86 y x86_64.

### Plataformas

- Android: plataforma principal y compilada.
- iOS: configuración incluida; requiere macOS/Xcode y firma Apple para validar
  y distribuir.
- Web: salida estática disponible, pero GPS, captura de mapa y compartir deben
  validarse por separado; la experiencia de producción prioriza móvil.

## 4. Identidad y versionado

- Nombre visible: RollersMaps.
- Esquema de enlace: `rollersmaps://`.
- Android package: `cl.santiagorollers.rollersmaps`.
- iOS bundle identifier: `cl.santiagorollers.rollersmaps`.
- Versión pública: 1.3.0.
- Android `versionCode`: 17.
- iOS `buildNumber`: 17.

Cada publicación debe aumentar la versión pública cuando corresponda y siempre
aumentar `versionCode` / `buildNumber`.

## 5. Estructura del repositorio

```text
assets/images/                  Identidad, iconos y splash
docs/                           Documentación técnica
src/app/                        Pantallas y rutas de Expo Router
src/components/                 Navegación y componentes compartidos
src/contexts/demo-session.tsx   Sesión, perfil e inscripciones
src/data/                       Modelos y transformación de agenda
src/hooks/                      Acceso a Supabase
src/lib/supabase.ts             Cliente de Supabase
supabase/migrations/            Cambios reproducibles de base de datos
android/                        Proyecto nativo generado
app.json                        Configuración Expo
eas.json                        Perfiles de compilación EAS
```

## 6. Navegación y experiencia

- **Inicio:** próxima actividad, acceso rápido al GPS y solo la última
  inscripción más el último registro. No reemplaza el historial.
- **Calendario:** agenda de siete días e inscripción/cancelación.
- **Rutas:** catálogo por nivel, clases y mapa/GPS.
- **Mis actividades:** lista completa dividida entre Inscripciones y Registros
  GPS. Tiene una cuarta pestaña propia y también se abre desde “Ver todas” en
  Inicio.

Esta arquitectura aplica revelación progresiva: el Inicio presenta lo esencial
y el detalle queda en una pantalla secundaria. Las listas usan tarjetas
compactas y filtros para no saturar cuando aumente el historial.

## 7. Autenticación y enlaces

Supabase Auth usa correo y contraseña. La confirmación vuelve a la aplicación
mediante el esquema `rollersmaps://`.

En Supabase:

1. Authentication > URL Configuration.
2. Site URL: `rollersmaps://login-callback/`.
3. Redirect URLs: agregar `rollersmaps://**`.
4. Mantener habilitado el proveedor Email.
5. Personalizar la plantilla de confirmación y configurar SMTP propio antes de
   producción para evitar el remitente genérico de Supabase.

La app también acepta confirmación por PKCE (`code`) y tokens de sesión en el
fragmento del enlace.

## 8. Variables de entorno

Archivo local `.env.local`:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=TU_CLAVE_PUBLICABLE
```

Reglas:

- no subir `.env.local` a Git;
- no usar `service_role` dentro de la app;
- no incluir credenciales de firma Android o Apple en el repositorio;
- rotar una clave si fue expuesta fuera del canal previsto.

## 9. Modelo de datos

### Tablas principales

- `profiles`: nombre, nivel y comuna del usuario.
- `activities`: clases, rutas y actividades publicadas.
- `registrations`: relación usuario/actividad y estado.
- `routes`: catálogo de rutas y dificultad.
- `user_activities`: historial GPS privado.

### `user_activities`

Campos relevantes:

- `user_id`: propietario;
- `title`: nombre editable;
- `activity_type`: `group_activity`, `guided_route` heredado o
  `free_route`;
- `group_activity_id`: ruta o clase grupal asociada;
- `started_at`, `ended_at`, duración, distancia y velocidad media;
- `route_geojson`: LineString con coordenadas `[longitud, latitud]`;
- `source`: `rollersmaps`;
- `external_provider`, `external_record_id`, `sync_status`: reserva para
  Health Connect / integración futura.

Ejecutar `supabase/migrations/20260912_user_activities_v130.sql` para crear o
actualizar la tabla. El script es repetible, mantiene registros existentes y
activa RLS.

### Seguridad RLS

El usuario autenticado puede seleccionar, insertar, renombrar y eliminar
únicamente filas cuyo `user_id` coincide con `auth.uid()`. El renombrado
también filtra `user_id` desde el cliente como defensa adicional.

## 10. Registro GPS

La ubicación se solicita solo al centrar el mapa o iniciar un registro. El
seguimiento funciona en primer plano:

- precisión alta;
- actualización objetivo cada 3 segundos o 5 metros;
- segmentos menores a 3 metros se descartan como ruido;
- saltos mayores a 500 metros se descartan como posiciones inválidas;
- se conservan hasta 1.000 puntos recientes por recorrido;
- al finalizar se calcula duración, distancia y velocidad media;
- el historial se guarda privado en Supabase.

No se declara ubicación en segundo plano. Si la app se cierra o el sistema la
suspende, el registro puede detenerse.

El manifiesto bloquea explícitamente `SYSTEM_ALERT_WINDOW` y los permisos
heredados de lectura/escritura de almacenamiento externo. La tarjeta compartida
usa un archivo temporal privado mediante FileProvider.

## 11. Compartir la última actividad

Desde Mis actividades > Registros GPS:

1. el primer registro se marca “Último registro”;
2. “Compartir última” abre una vista previa 9:16;
3. MapLibre encuadra el trazado completo;
4. la imagen incluye logo, nombre, fecha, distancia, tiempo, velocidad, inicio
   y fin;
5. View Shot captura PNG 1080 × 1920;
6. Expo Sharing abre la hoja nativa con Instagram, WhatsApp y otras apps
   instaladas.

No se publica automáticamente ni se entrega el archivo a una red sin la acción
del usuario. Si el registro no tiene al menos dos puntos GPS, compartir queda
deshabilitado.

## 12. Mapas y red

El mapa usa MapLibre y el estilo remoto de OpenFreeMap. Se requiere conexión
para cargar teselas nuevas. La atribución se mantiene visible tanto en el mapa
de uso normal como en la tarjeta social generada para el usuario.

Antes de producción se debe revisar disponibilidad, atribución y términos
vigentes del proveedor cartográfico y definir un plan de contingencia.

## 13. Compilación

### Validación

```bash
npm install
npm run lint
npx tsc --noEmit
npx expo-doctor
```

### APK local

En Windows, configurar Java 17 del Android Studio y Android SDK:

```powershell
cd android
.\gradlew.bat assembleRelease
```

Salida estándar:
`android/app/build/outputs/apk/release/app-release.apk`.

La configuración actual permite una compilación de prueba firmada con la clave
de depuración. **No se debe publicar esa firma en Google Play.**

### Producción

Usar EAS Build o una keystore de producción respaldada:

```bash
eas build --platform android --profile production
```

Para Google Play se recomienda AAB. Guardar keystore, alias y contraseñas en un
gestor seguro; perder la firma puede bloquear futuras actualizaciones.

## 14. Pruebas mínimas antes de publicar

1. Crear una cuenta nueva y confirmar el correo desde el mismo teléfono.
2. Iniciar y cerrar sesión.
3. Probar teclado y scroll en registro y login.
4. Inscribirse y confirmar el mensaje obligatorio de casco.
5. Verificar que el participante inscrito ve el total de participantes, no la
   fracción de cupos.
6. Inscribirse a dos o más actividades y revisar la lista filtrada.
7. Confirmar que “Elige la actividad” muestra nombres reales de ruta/clase.
8. Registrar GPS, finalizar y verificar su aparición en Inicio y Mis
   actividades.
9. Renombrar y volver a abrir la app para comprobar persistencia.
10. Compartir la última actividad y revisar PNG en Instagram/WhatsApp.
11. Confirmar que otro usuario no puede leer ni modificar ese historial.
12. Probar sin permiso de ubicación, sin GPS y sin conexión.
13. Probar tema claro/oscuro del sistema y tamaños de letra.
14. Validar en al menos un Android pequeño y uno de pantalla grande.
15. Ejecutar pruebas internas de Google Play con al menos 10 usuarios reales.

## 15. Publicación en Google Play

1. Completar ícono, capturas, descripción, correo de soporte y política de
   privacidad.
2. Declarar recolección de cuenta, ubicación y actividad física con precisión.
3. Explicar que la ubicación se usa al registrar un recorrido.
4. Cargar AAB firmado con versión superior.
5. Configurar prueba interna y distribuir el enlace a los testers.
6. Registrar resultados y fallas por modelo/SO.
7. Corregir bloqueos y repetir la prueba.
8. Pasar a prueba cerrada/producción según los requisitos vigentes de la cuenta
   de Play Console.

Los requisitos de Google Play cambian; deben verificarse en la consola y
documentación oficial en la fecha de publicación.

## 16. Health Connect y Google Fit

La integración no está activa. Para una versión nueva:

- preferir Health Connect en Android;
- pedir solo permisos necesarios (distancia, velocidad o ejercicio);
- agregar consentimiento y revocación;
- evitar duplicados con `external_record_id`;
- definir importación, exportación o ambas;
- actualizar Data Safety y política de privacidad;
- validar requisitos vigentes de Google.

Los campos de sincronización ya existen para evitar una migración destructiva.

## 17. Respaldo, monitoreo y operación

- Revisar logs y consumo en Supabase.
- Activar respaldos adecuados al plan antes de producción.
- Configurar SMTP y dominio de correo propios.
- Mantener una migración SQL por versión.
- Registrar cambios en un archivo de versión.
- No editar datos de producción manualmente sin respaldo.
- Definir contacto de soporte y procedimiento de eliminación de cuenta/datos.

## 18. Propiedad intelectual

Copyright © 2026 Manuel Salinas. Todos los derechos reservados.

El repositorio usa una licencia propietaria. Las dependencias de terceros
conservan sus licencias.
