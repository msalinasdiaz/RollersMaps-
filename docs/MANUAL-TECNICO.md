# Manual técnico integral de RollersMaps

**Versión documentada:** 1.3.3  
**Fecha de actualización:** 17 de septiembre de 2026  
**Creador y titular:** Manuel Salinas  
**Aplicación:** RollersMaps  
**Bundle / package:** `cl.santiagorollers.rollersmaps`  
**Repositorio:** `msalinasdiaz/RollersMaps-`  
**Licencia:** propietaria (`UNLICENSED`)

---

## 1. Objetivo del documento

Este manual describe el estado técnico completo de RollersMaps 1.3.3, incluyendo arquitectura, desarrollo, configuración local, dependencias, compilación Android e iOS, instalación en un iPhone físico, firma Apple, Supabase, GPS, seguimiento en segundo plano, QA, seguridad, estrategia Git, troubleshooting y recuperación.

Su objetivo es que una nueva estación de desarrollo pueda reconstruirse desde cero sin depender de conocimiento informal, y que cualquier cambio futuro pueda validarse sin perder las versiones estables existentes.

El documento refleja el estado verificado al 17 de septiembre de 2026:

- Android ya contaba con una versión estable y funcional.
- iOS fue compilado correctamente con Xcode 27 e iOS 27.
- La aplicación fue instalada en un iPhone físico.
- La firma de desarrollo fue configurada y confiada en el dispositivo.
- La compatibilidad con el ciclo de vida `UIScene` exigido por iOS 27 fue habilitada.
- Supabase quedó operativo en el Mac mediante `.env.local`.
- El GPS fue probado en el iPhone físico y funciona correctamente.
- Se mantienen ramas estables separadas para Android e iOS antes de iniciar cambios de interfaz.

---

## 2. Estado y estrategia de ramas

El repositorio utiliza una única base de código Expo / React Native y no dos proyectos separados. Android e iOS comparten lógica, pantallas, Supabase, modelos, GPS y componentes. Las diferencias nativas se administran mediante Expo, plugins y configuración por plataforma.

### 2.1 Ramas estables

| Rama | Propósito | Estado |
|---|---|---|
| `main` | Base histórica / línea principal previa | Conservada |
| `android-stable-v1.3.3` | Punto estable de Android antes de los cambios iOS | Congelada como referencia |
| `ios-stable-v1.3.3` | Punto estable con soporte iOS 27, iPhone físico, Supabase y GPS | Verificada |

### 2.2 Regla para trabajo nuevo

Los cambios de interfaz no deben hacerse directamente sobre una rama estable. Crear una rama de trabajo desde la base elegida, por ejemplo:

```bash
git switch ios-stable-v1.3.3
git pull
git switch -c ui-redesign
```

Cuando el rediseño esté validado en ambas plataformas, podrá fusionarse según la estrategia acordada.

### 2.3 Regla de preservación

Las ramas `android-stable-v1.3.3` e `ios-stable-v1.3.3` se consideran puntos de recuperación. No deben recibir cambios funcionales experimentales.

---

## 3. Propósito funcional de RollersMaps

RollersMaps es la aplicación móvil de Santiago Rollers. Su objetivo es concentrar en una sola aplicación las funciones necesarias para participantes y organizadores relacionadas con actividades de patinaje.

Funciones implementadas o contempladas por la base actual:

- creación y autenticación de usuarios;
- perfil de usuario;
- agenda de rutas y clases;
- inscripción y cancelación de actividades;
- visualización de rutas;
- mapa basado en MapLibre;
- ubicación del usuario;
- registro GPS de recorridos;
- persistencia local del recorrido durante el tracking;
- guardado del historial en Supabase;
- asociación de un recorrido con una actividad grupal;
- historial de actividades;
- renombrado de registros GPS;
- generación de imagen 9:16 para compartir una actividad;
- soporte de tema claro/oscuro;
- soporte para Android e iOS desde la misma base de código.

---

## 4. Arquitectura general

```text
RollersMaps
│
├── Expo / React Native
│   ├── Expo Router
│   ├── React 19
│   ├── React Native 0.86
│   └── TypeScript
│
├── Interfaz
│   ├── Pantallas basadas en src/app
│   ├── Componentes reutilizables
│   ├── Tema claro / oscuro
│   └── Splash nativo de Expo
│
├── Datos
│   ├── Supabase Auth
│   ├── PostgreSQL
│   ├── RPC / consultas
│   └── Row Level Security
│
├── Tracking GPS
│   ├── expo-location
│   ├── expo-task-manager
│   ├── tarea de ubicación en background
│   ├── SQLite local
│   └── filtrado de puntos GPS
│
├── Mapas
│   ├── MapLibre React Native
│   └── OpenFreeMap
│
├── Compartir
│   ├── react-native-view-shot
│   └── expo-sharing
│
└── Plataformas nativas
    ├── Android generado por Expo Prebuild
    └── iOS generado por Expo Prebuild
```

La aplicación usa el modelo de **Continuous Native Generation** de Expo: las carpetas nativas `ios/` y `android/` pueden regenerarse desde la configuración Expo y están excluidas de Git.

---

## 5. Stack y versiones verificadas

### 5.1 Núcleo

| Componente | Versión |
|---|---:|
| Aplicación | 1.3.3 |
| Expo SDK | `~57.0.23` |
| Expo Router | `~57.0.21` |
| React | `19.2.3` |
| React Native | `0.86.3` |
| TypeScript | `~6.0.3` |
| React Native Web | `~0.21.0` |

### 5.2 Servicios y librerías principales

| Componente | Versión / función |
|---|---|
| `@supabase/supabase-js` | `^2.116.0` |
| `@maplibre/maplibre-react-native` | `^11.3.10` |
| `expo-location` | `~57.0.18` |
| `expo-task-manager` | `~57.0.18` |
| `expo-sqlite` | `~57.0.3` |
| `expo-sharing` | `~57.0.20` |
| `react-native-view-shot` | `5.1.0` |
| `expo-build-properties` | `~57.0.20` |
| `expo-dev-client` | `~57.0.19` |
| `react-native-reanimated` | `4.5.1` |
| `react-native-worklets` | `0.10.1` |

### 5.3 Entorno Mac verificado

- Apple Silicon / ARM64.
- Homebrew en `/opt/homebrew`.
- Node.js `22.23.2`.
- npm `10.9.8`.
- Xcode `27.0`.
- macOS 27.0 durante la validación.
- Dispositivo físico con iOS 27.0.

Expo SDK 57 requiere Node.js 22.13 o superior. La estación iOS quedó fijada en Node 22 para reducir incompatibilidades con tooling y dependencias transitivas.

---

## 6. Identidad, versión y configuración de aplicación

### 6.1 Identificadores

- Nombre visible: `RollersMaps`.
- Slug Expo: `rollers-maps`.
- Deep link scheme: `rollersmaps://`.
- Android package: `cl.santiagorollers.rollersmaps`.
- iOS bundle identifier: `cl.santiagorollers.rollersmaps`.

### 6.2 Versionado actual

- Versión pública: `1.3.3`.
- Android `versionCode`: `20`.
- iOS `buildNumber`: `20`.

Cada release distribuible debe incrementar como mínimo el build interno de la plataforma correspondiente. Si cambia la funcionalidad visible o se publica una nueva versión, también debe revisarse la versión semántica.

---

## 7. Estructura del repositorio

```text
RollersMaps-/
├── AGENTS.md
├── app.json
├── eas.json
├── package.json
├── package-lock.json
├── tsconfig.json
├── eslint.config.js
├── README.md
├── LICENSE
│
├── assets/
│   └── images/
│       ├── iconos
│       ├── splash
│       └── recursos gráficos
│
├── docs/
│   └── MANUAL-TECNICO.md
│
├── src/
│   ├── app/
│   │   ├── (tabs)/
│   │   ├── _layout.tsx
│   │   └── track.tsx
│   ├── components/
│   ├── contexts/
│   ├── data/
│   ├── hooks/
│   ├── lib/
│   │   ├── supabase.ts
│   │   └── tracking-store.ts
│   └── tasks/
│       └── background-location.ts
│
├── scripts/
└── supabase/
    └── migrations/
```

### 7.1 Carpetas nativas

`ios/` y `android/` están en `.gitignore` y se generan localmente mediante Expo Prebuild. No se consideran fuente autoritativa del proyecto.

Esto permite regenerar proyectos nativos cuando cambia la configuración de `app.json`, plugins o dependencias nativas.

---

## 8. Archivos deliberadamente excluidos de Git

El `.gitignore` excluye, entre otros:

```text
node_modules/
.expo/
.env*.local
/ios
/android
*.jks
*.p8
*.p12
*.key
*.mobileprovision
```

### Regla crítica

Nunca subir:

- `.env.local`;
- claves privadas de Supabase;
- `service_role`;
- certificados Apple;
- perfiles de aprovisionamiento;
- keystores Android;
- contraseñas;
- tokens GitHub;
- archivos `.p8`, `.p12`, `.key` o `.mobileprovision`.

---

## 9. Preparación de un Mac desde cero

### 9.1 Instalar Homebrew

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

En Apple Silicon, agregar Homebrew al `PATH`:

```bash
echo >> ~/.zprofile
echo 'eval "$(/opt/homebrew/bin/brew shellenv zsh)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv zsh)"
```

Validar:

```bash
brew --version
```

### 9.2 Instalar Node 22

```bash
brew install node@22
```

Si existe otra versión activa:

```bash
brew unlink node@24
brew link --overwrite --force node@22
hash -r
```

Validar:

```bash
node -v
npm -v
npx -v
```

Configuración verificada:

```text
Node v22.23.2
npm 10.9.8
npx 10.9.8
```

### 9.3 Instalar GitHub CLI

```bash
brew install gh
gh auth login
```

Seleccionar:

```text
GitHub.com
HTTPS
Login with a web browser
```

Validar:

```bash
gh auth status
```

GitHub no acepta contraseñas de cuenta para `git push` por HTTPS. Debe usarse GitHub CLI, credential helper o un token adecuado.

---

## 10. Clonar y preparar el proyecto

```bash
cd ~/Documents
git clone https://github.com/msalinasdiaz/RollersMaps-.git
cd RollersMaps-
```

Para reproducibilidad, preferir:

```bash
npm ci
```

`npm ci` instala exactamente lo definido en `package-lock.json`.

### 10.1 Verificación inicial

```bash
npx expo-doctor
npm run lint
npx tsc --noEmit
```

Estado esperado del doctor en el punto estable:

```text
21/21 checks passed. No issues detected!
```

---

## 11. Recuperación de dependencias corruptas

Durante la preparación del Mac se observó el error:

```text
ERR_INVALID_PACKAGE_CONFIG
.../node_modules/expo/node_modules/@expo/cli/package.json
```

La recuperación validada fue:

```bash
rm -rf node_modules
npm cache verify
npm ci
```

Comprobación opcional:

```bash
node -e "JSON.parse(require('fs').readFileSync('node_modules/expo/node_modules/@expo/cli/package.json','utf8')); console.log('Expo CLI OK')"
```

Resultado esperado:

```text
Expo CLI OK
```

No ejecutar `npm audit fix --force` de forma automática sobre esta aplicación. Puede introducir cambios mayores o versiones incompatibles con Expo SDK 57.

---

## 12. Variables de entorno y Supabase

La configuración local se almacena en:

```text
.env.local
```

Contenido esperado:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=TU_CLAVE_PUBLICABLE
```

El cliente se inicializa en `src/lib/supabase.ts`.

Si falta cualquiera de las dos variables, la aplicación detiene el inicio con un error explícito indicando que falta la configuración de Supabase.

### 12.1 Comprobación segura

No imprimir la clave completa. Para verificar que ambas variables existen:

```bash
grep '^EXPO_PUBLIC_' .env.local | sed 's/=.*/=<configurado>/'
```

### 12.2 Reiniciar Metro al cambiar `.env.local`

```bash
npx expo start --dev-client --clear
```

Expo debe indicar que cargó `.env.local` y exportó las variables `EXPO_PUBLIC_*`.

### 12.3 Seguridad de Supabase

La aplicación móvil solo debe utilizar la clave **publicable**.

Nunca usar en cliente:

- `service_role`;
- claves secretas del proyecto;
- credenciales administrativas.

La autorización efectiva debe implementarse mediante Row Level Security y políticas en PostgreSQL.

---

## 13. Supabase Auth y persistencia de sesión

El cliente Supabase configura:

- `autoRefreshToken: true`;
- `detectSessionInUrl: false`;
- `persistSession: true`;
- `globalThis.localStorage` implementado por `expo-sqlite/localStorage/install`.

Esto permite conservar la sesión del usuario entre aperturas de la app sin depender de almacenamiento web tradicional.

El esquema de enlace de la aplicación es:

```text
rollersmaps://
```

La configuración de Auth y URLs de retorno debe mantenerse alineada con ese esquema.

---

## 14. Base de datos y modelo funcional

Tablas principales utilizadas por el producto:

- `profiles`;
- `activities`;
- `registrations`;
- `routes`;
- `user_activities`.

La migración de historial GPS está versionada en:

```text
supabase/migrations/20260912_user_activities_v130.sql
```

### 14.1 Seguridad RLS

La regla general es que el usuario autenticado solo puede consultar o modificar datos personales asociados a su propio `auth.uid()`.

Toda nueva tabla con información privada debe crearse con RLS y políticas explícitas antes de producción.

---

## 15. Mapas

RollersMaps utiliza MapLibre React Native.

La capa de mapa depende de un proveedor remoto de estilo/tiles, por lo que:

- se necesita red para descargar contenido no cacheado;
- los errores de red deben manejarse sin bloquear el resto de la app;
- debe conservarse la atribución exigida por el proveedor;
- antes de producción debe revisarse disponibilidad y términos de uso del proveedor cartográfico.

---

## 16. Arquitectura del tracking GPS

El tracking no depende únicamente de memoria React. Una sesión activa se guarda localmente en SQLite para reducir pérdida de datos si la UI se desmonta, la aplicación cambia de estado o el sistema gestiona recursos.

### 16.1 Base local

Archivo lógico:

```text
rollersmaps-tracking.db
```

SQLite usa:

```sql
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
```

Tablas locales:

```text
tracking_session
tracking_points
```

### 16.2 Estado de sesión

Una sesión puede quedar en:

```text
active
pending_save
```

`active` significa que todavía se capturan puntos.  
`pending_save` significa que terminó el tracking local, pero falta completar o confirmar el guardado remoto.

### 16.3 Reanudación

Al iniciar la app, `src/app/_layout.tsx` consulta `getTrackingSnapshot()`.

Si encuentra una sesión con estado `active`, vuelve a solicitar el servicio de ubicación activo mediante `startActiveLocationService()`.

El objetivo es evitar que un recorrido quede huérfano por un reinicio de UI.

---

## 17. Configuración del servicio GPS

La tarea de background se registra mediante Expo Task Manager con el nombre:

```text
rollersmaps-active-route-location
```

La configuración actual del servicio usa:

- precisión: `BestForNavigation`;
- tipo de actividad: `Fitness`;
- `distanceInterval: 3` metros;
- `timeInterval: 2000` ms;
- `pausesUpdatesAutomatically: false`;
- `showsBackgroundLocationIndicator: true`;
- actualizaciones diferidas desactivadas;
- foreground service Android persistente mientras existe tracking.

En Android la notificación de servicio muestra un texto indicando que el recorrido continúa registrándose en segundo plano.

---

## 18. Filtro y calidad de puntos GPS

Antes de sumar distancia, cada punto pasa por validaciones.

### 18.1 Exactitud máxima admitida

```text
50 metros
```

Un punto con exactitud nula, inválida o superior a 50 m se descarta.

### 18.2 Velocidad plausible máxima

```text
55 km/h
```

Si la velocidad implícita entre dos puntos supera ese límite, el segmento se rechaza.

### 18.3 Segmento máximo

```text
250 metros
```

Un salto superior se considera probablemente espurio y se descarta.

### 18.4 Ruido mínimo

Existe un umbral dinámico basado en precisión con mínimo base de 4 m y tope práctico de 10 m para evitar sumar movimiento GPS cuando el usuario está prácticamente quieto.

### 18.5 Distancia

La distancia entre coordenadas se calcula con fórmula geodésica basada en radio terrestre de 6.371.000 m.

### 18.6 Puntos rechazados

La sesión mantiene un contador `rejectedPoints` para poder diagnosticar calidad de tracking y filtros demasiado agresivos.

---

## 19. Permisos de ubicación

### 19.1 Android

La configuración declara:

```text
ACCESS_COARSE_LOCATION
ACCESS_FINE_LOCATION
ACCESS_BACKGROUND_LOCATION
FOREGROUND_SERVICE
FOREGROUND_SERVICE_LOCATION
RECEIVE_BOOT_COMPLETED
```

También bloquea permisos no requeridos heredados o problemáticos:

```text
SYSTEM_ALERT_WINDOW
READ_EXTERNAL_STORAGE
WRITE_EXTERNAL_STORAGE
```

### 19.2 iOS

`expo-location` está configurado con:

```json
"isIosBackgroundLocationEnabled": true
```

Mensajes de permiso configurados:

- ubicación en uso: mostrar ubicación y registrar recorridos;
- ubicación siempre/en segundo plano: mantener el recorrido incluso con pantalla apagada o app en background.

### 19.3 Regla de producto

Pedir permisos solo cuando son necesarios y explicar el motivo antes o durante la solicitud. Un rechazo no debe dejar la aplicación inutilizable; solo debe impedir las funciones dependientes de ubicación.

---

## 20. Instalación y configuración de Xcode

### 20.1 Seleccionar Xcode como toolchain activo

Si Expo indica que Xcode no está completamente instalado:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
sudo xcodebuild -runFirstLaunch
```

Validar:

```bash
xcode-select -p
xcodebuild -version
```

Ruta esperada:

```text
/Applications/Xcode.app/Contents/Developer
```

### 20.2 Cuenta Apple

En Xcode:

```text
Xcode > Settings > Accounts
```

Agregar la cuenta Apple del desarrollador.

### 20.3 Dispositivo físico

Conectar el iPhone por USB, aceptar la relación de confianza y activar:

```text
Ajustes > Privacidad y seguridad > Modo de desarrollador
```

Luego verificar el dispositivo en:

```text
Xcode > Window > Devices and Simulators
```

---

## 21. Firma de desarrollo iOS

El proyecto usa:

```text
Bundle Identifier: cl.santiagorollers.rollersmaps
```

En Xcode:

```text
TARGETS > RollersMaps > Signing & Capabilities
```

Configuración recomendada para desarrollo:

```text
Automatically manage signing: ON
Team: equipo/personal team autorizado
```

### 21.1 Solicitud del llavero

macOS puede mostrar un mensaje del tipo:

```text
codesign quiere acceder a la llave Apple Development...
```

La contraseña solicitada es la contraseña del llavero/login del Mac, no necesariamente la contraseña del Apple ID.

### 21.2 Certificado no confiado en iPhone

Si aparece:

```text
Developer App Certificate is not trusted
```

En el iPhone:

```text
Ajustes > General > VPN y gestión de dispositivos
```

Seleccionar el certificado de desarrollo y marcarlo como confiable.

Con un Personal Team gratuito, la firma y los perfiles de prueba tienen duración limitada y pueden requerir reinstalación periódica.

---

## 22. Compatibilidad iOS 27 / Xcode 27 y UIScene

Al compilar inicialmente con Xcode 27, la aplicación podía instalarse pero fallaba al lanzar con:

```text
Application failed to launch: UIScene life cycle is required for apps built with this SDK.
```

### 22.1 Solución implementada

Se actualizó Expo a una versión compatible de SDK 57 y se agregó:

```text
expo-build-properties
```

En `app.json`:

```json
[
  "expo-build-properties",
  {
    "ios": {
      "enableSceneSupport": true
    }
  }
]
```

Esto permite que Expo genere el soporte de `UIScene` requerido por el SDK de iOS 27.

### 22.2 Regenerar iOS después de cambios nativos

```bash
npx expo prebuild --clean --platform ios
```

Luego:

```bash
npx expo run:ios --device
```

No editar el `AppDelegate` generado manualmente salvo que exista un requisito nativo explícito y documentado.

---

## 23. Development Build en iPhone

RollersMaps usa `expo-dev-client` para probar la aplicación real, no solamente Expo Go.

### 23.1 Primera compilación / cambios nativos

```bash
npx expo run:ios --device
```

Seleccionar el dispositivo físico cuando aparezca la lista.

Cuando la compilación finaliza correctamente se obtiene:

```text
Build Succeeded
Installing .../RollersMaps.app
Complete 100%
```

### 23.2 Desarrollo diario sin cambios nativos

```bash
npx expo start --dev-client
```

O para limpiar caché:

```bash
npx expo start --dev-client --clear
```

No es necesario recompilar Xcode para cambios normales de TypeScript, JSX, estilos, hooks o lógica JavaScript.

### 23.3 Cuándo recompilar

Recompilar cuando cambie:

- un plugin Expo nativo;
- `app.json` en áreas nativas;
- permisos;
- Bundle ID;
- dependencias con código nativo;
- configuración de `expo-build-properties`;
- capabilities de Xcode.

---

## 24. Splash y arranque de aplicación

La versión previa utilizaba un splash animado personalizado con:

```text
SplashScreen.preventAutoHideAsync()
AnimatedSplashOverlay
```

Durante la estabilización de iOS 27 se retiró ese control manual del `RootLayout`. El punto estable iOS actual utiliza el splash nativo de Expo y permite que la aplicación continúe al montar el árbol principal.

El componente de animación puede seguir existiendo en el repositorio, pero no forma parte del flujo de inicio estable actual.

### 24.1 Diagnóstico que evitó confusión

Una pantalla que parecía detenida en el inicio terminó exponiendo un error de aplicación causado por la ausencia de `.env.local` en el Mac recién clonado.

Regla de diagnóstico:

1. confirmar que Metro recibe la conexión del dispositivo;
2. revisar consola Metro;
3. revisar pantalla de errores del development client;
4. validar variables de entorno;
5. recién después modificar splash o navegación.

---

## 25. Compilación Android

### 25.1 Desarrollo

```bash
npm run android
```

Equivalente a:

```bash
expo run:android
```

### 25.2 Regeneración nativa

```bash
npx expo prebuild --clean --platform android
```

### 25.3 APK local

En entorno Windows/Android correctamente preparado:

```powershell
cd android
.\gradlew.bat assembleRelease
```

Salida típica:

```text
android/app/build/outputs/apk/release/app-release.apk
```

### 25.4 Producción

Preferir AAB y firma de producción mediante EAS o keystore administrada de forma segura.

```bash
eas build --platform android --profile production
```

Nunca publicar una build firmada con clave de depuración.

---

## 26. Comandos de desarrollo recomendados

### Dependencias

```bash
npm ci
```

### Estado de Expo

```bash
npx expo-doctor
```

### Corregir versiones Expo compatibles

```bash
npx expo install --fix
```

### Lint

```bash
npm run lint
```

### TypeScript

```bash
npx tsc --noEmit
```

### Metro para development build

```bash
npx expo start --dev-client
```

### Limpiar Metro

```bash
npx expo start --dev-client --clear
```

### iPhone físico

```bash
npx expo run:ios --device
```

### Ver cambios Git

```bash
git status
git diff
```

---

## 27. Flujo Git recomendado

### 27.1 Antes de modificar

```bash
git status
git pull
```

### 27.2 Crear rama de feature

```bash
git switch -c feature/nombre-cambio
```

Para el rediseño de interfaz:

```bash
git switch ios-stable-v1.3.3
git pull
git switch -c ui-redesign
```

### 27.3 Commit

```bash
git add <archivos>
git commit -m "feat: descripción clara"
```

### 27.4 Push

```bash
git push -u origin nombre-rama
```

### 27.5 Convención sugerida

```text
feat: nueva funcionalidad
fix: corrección
ui: cambios visuales
refactor: reorganización sin cambio funcional
docs: documentación
chore: mantenimiento
qa: cambios o artefactos de pruebas
```

---

## 28. Política QA

Todo cambio que afecte interfaz, navegación, Supabase, permisos, GPS o datos debe validarse en una rama distinta a las ramas estables.

Se recomienda separar QA en cinco capas:

1. **Static QA:** lint, TypeScript, Expo Doctor.
2. **Functional QA:** flujo de usuario.
3. **Platform QA:** Android e iOS.
4. **Device QA:** dispositivo físico, permisos, sensores, red.
5. **Regression QA:** comprobar que funciones previamente estables siguen operativas.

---

## 29. Gate técnico mínimo antes de QA manual

Todos deben pasar:

```bash
npm ci
npx expo-doctor
npm run lint
npx tsc --noEmit
```

Resultado objetivo:

```text
Expo Doctor: 21/21
TypeScript: 0 errores
Lint: sin errores bloqueantes
Build: exitosa en la plataforma objetivo
```

---

## 30. Matriz QA de funcionalidades

| Área | Caso | Resultado esperado |
|---|---|---|
| Arranque | Abrir app en frío | Llega a UI principal sin bloqueo |
| Supabase | `.env.local` correcto | Cliente se inicializa |
| Supabase | `.env.local` ausente | Error claro; no fallo silencioso |
| Auth | Login válido | Sesión persistente |
| Auth | Credenciales inválidas | Mensaje entendible |
| Auth | Cerrar sesión | Datos de sesión eliminados/actualizados |
| Agenda | Cargar actividades | Lista consistente con backend |
| Inscripción | Inscribirse | Estado cambia y persiste |
| Inscripción | Cancelar | Backend y UI quedan sincronizados |
| Mapa | Abrir mapa | Render correcto y controles utilizables |
| GPS | Permiso aceptado | Centrado y tracking habilitados |
| GPS | Permiso rechazado | App continúa; tracking no inicia |
| GPS | Iniciar recorrido | Se crea sesión local |
| GPS | Movimiento real | Distancia aumenta coherentemente |
| GPS | Estar quieto | Ruido no infla distancia significativamente |
| GPS | Finalizar | Sesión pasa a `pending_save`/guardado |
| GPS | Guardar | Registro aparece en historial |
| GPS | Reinicio de UI | Sesión activa puede recuperarse |
| Background | App en segundo plano | Tracking debe continuar si permisos lo permiten |
| Background | Pantalla bloqueada | Validar continuidad y consumo |
| Red | Sin Internet | UI no debe colapsar |
| Red | Recuperar Internet | Datos vuelven a sincronizarse |
| Historial | Renombrar | Persiste después de relanzar |
| Compartir | Actividad con ruta válida | Se genera imagen 9:16 |
| Compartir | Menos de 2 puntos | Compartir se bloquea correctamente |
| Tema | Claro / oscuro | Texto y contraste legibles |
| Rotación | Portrait | Orientación se mantiene como definida |
| Actualización | Reinstalar dev build | Datos esperados se mantienen según almacenamiento |

---

## 31. QA iOS específico

### 31.1 Estado verificado

En un iPhone físico con iOS 27 se verificó:

- build nativa exitosa;
- instalación exitosa;
- certificado de desarrollo confiado;
- arranque de la aplicación;
- conexión con Metro;
- carga de configuración Supabase;
- funcionamiento general de GPS.

### 31.2 Casos aún recomendados antes de release público

- recorrido largo de 30-60 minutos;
- pantalla apagada durante tracking;
- background durante al menos 10 minutos;
- llamada telefónica/interrupción y retorno;
- modo bajo consumo;
- pérdida de señal GPS;
- pérdida y recuperación de Wi-Fi/datos móviles;
- reinicio del proceso de app con sesión activa;
- verificación de consumo de batería;
- prueba con permiso `While Using` y luego `Always`;
- prueba con permiso revocado desde Settings;
- actualización desde una build anterior.

---

## 32. QA Android de regresión

Antes de fusionar cambios iOS o de interfaz hacia la línea común:

1. compilar Android nuevamente;
2. abrir la aplicación desde cero;
3. validar login;
4. validar mapa;
5. validar permisos de ubicación;
6. iniciar tracking;
7. enviar app a segundo plano;
8. confirmar notificación de foreground service;
9. volver a app;
10. finalizar y guardar recorrido;
11. revisar historial;
12. probar compartir;
13. probar tema claro/oscuro;
14. probar botón Atrás/predictive back;
15. confirmar que no aparecieron permisos extras.

---

## 33. QA de GPS detallado

### 33.1 Prueba estática

Objetivo: verificar que el ruido GPS no sume distancia excesiva.

Procedimiento:

1. iniciar una actividad al aire libre;
2. permanecer quieto 5 minutos;
3. finalizar;
4. revisar distancia total;
5. revisar `rejectedPoints` en debugging si se instrumenta.

### 33.2 Caminata controlada

1. usar un trayecto conocido;
2. iniciar tracking;
3. recorrer distancia medida aproximada;
4. finalizar;
5. comparar contra referencia.

### 33.3 Patinaje real

Probar:

- aceleración;
- frenado;
- curvas cerradas;
- detenciones en semáforo;
- edificios altos;
- pasos bajo estructuras;
- pérdida temporal de precisión.

El filtro de 55 km/h está pensado para descartar saltos no plausibles dentro del uso objetivo de la aplicación; si se cambia el perfil de uso, este límite debe revisarse.

---

## 34. QA de background

La capacidad está implementada, pero debe certificarse de forma explícita antes de declarar garantía de tracking con pantalla bloqueada.

Casos:

```text
A. Pantalla encendida -> Home -> volver
B. Home durante 5 min -> volver
C. Bloquear pantalla 5 min -> desbloquear
D. Bloquear 20 min -> desbloquear
E. Cambiar Wi-Fi/datos
F. Modo bajo consumo
G. App bajo presión de memoria
H. Interrupción llamada/cámara
```

Validar en cada caso:

- continuidad temporal;
- continuidad geométrica;
- distancia razonable;
- ausencia de saltos grandes;
- capacidad de finalizar y guardar.

---

## 35. QA de Supabase y seguridad de datos

Usar al menos dos usuarios distintos.

Pruebas:

1. Usuario A crea/guarda historial.
2. Usuario B inicia sesión.
3. Usuario B no debe poder consultar historial privado de A.
4. Usuario B no debe poder renombrar/eliminar registros de A.
5. Usuario A sí debe poder modificar sus datos autorizados.
6. Cerrar sesión y verificar que no se muestre información privada anterior.

Una clave publicable de Supabase no reemplaza RLS. Toda protección debe resistir un cliente manipulado.

---

## 36. QA de red y errores

Probar cada flujo con:

- Wi-Fi estable;
- datos móviles;
- modo avión;
- red lenta;
- pérdida de red durante una operación;
- recuperación posterior.

La UI debe evitar:

- loaders infinitos;
- pantallas blancas;
- navegación bloqueada;
- duplicación de operaciones;
- pérdida silenciosa de datos locales.

---

## 37. Seguridad

### 37.1 Secretos

No almacenar secretos en Git.

### 37.2 Clave publicable Supabase

Puede ser utilizada por la aplicación cliente, pero no debe confundirse con una clave administrativa.

### 37.3 Apple

No guardar certificados, perfiles ni claves privadas en el repo.

### 37.4 Android

No guardar keystore de producción ni contraseñas en texto plano.

### 37.5 GitHub

No usar contraseña de cuenta para pushes HTTPS. Usar `gh auth login` o mecanismos modernos de autenticación.

---

## 38. Troubleshooting: Homebrew no reconocido

Síntoma:

```text
zsh: command not found: brew
```

Solución Apple Silicon:

```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv zsh)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv zsh)"
```

Validar:

```bash
brew --version
```

---

## 39. Troubleshooting: versión Node incorrecta

Si existe Node 24 enlazado y se desea usar Node 22:

```bash
brew unlink node@24
brew link --overwrite --force node@22
hash -r
```

Verificar:

```bash
node -v
```

---

## 40. Troubleshooting: Expo CLI / package.json corrupto

Síntoma:

```text
ERR_INVALID_PACKAGE_CONFIG
```

Solución:

```bash
rm -rf node_modules
npm cache verify
npm ci
npx expo-doctor
```

---

## 41. Troubleshooting: paquetes Expo desalineados

Síntoma de `expo-doctor`:

```text
Check that packages match versions required by installed Expo SDK
```

Solución:

```bash
npx expo install --fix
npx expo-doctor
```

Evitar actualizar manualmente dependencias Expo con `npm install paquete@latest` sin revisar compatibilidad del SDK.

---

## 42. Troubleshooting: plugin `expo-build-properties` no encontrado

Síntoma:

```text
PluginError: Failed to resolve plugin for module "expo-build-properties"
```

Significa que `app.json` referencia el plugin pero el paquete no está instalado.

Solución:

```bash
npx expo install expo-build-properties
npm list expo-build-properties --depth=0
npx expo-doctor
```

---

## 43. Troubleshooting: Xcode no configurado

Síntoma:

```text
Xcode must be fully installed before you can continue
```

Solución:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
sudo xcodebuild -runFirstLaunch
```

---

## 44. Troubleshooting: no hay certificado de firma

Síntoma:

```text
No code signing certificates are available to use
```

Pasos:

1. abrir Xcode;
2. agregar Apple Account;
3. abrir proyecto iOS generado;
4. seleccionar target RollersMaps;
5. activar Automatically manage signing;
6. seleccionar Team;
7. volver a compilar.

---

## 45. Troubleshooting: certificado no confiado

Síntoma:

```text
Developer App Certificate is not trusted
```

En iPhone:

```text
Ajustes > General > VPN y gestión de dispositivos
```

Confiar explícitamente en el certificado del desarrollador.

---

## 46. Troubleshooting: UIScene requerido

Síntoma:

```text
UIScene life cycle is required for apps built with this SDK
```

Verificar:

- Expo `57.0.23` o compatible;
- `expo-build-properties` instalado;
- `enableSceneSupport: true` en `app.json`;
- regeneración limpia de iOS.

```bash
npx expo prebuild --clean --platform ios
npx expo run:ios --device
```

---

## 47. Troubleshooting: app parece detenida en splash

Orden recomendado:

1. verificar que Metro sigue ejecutándose;
2. cerrar y abrir la app;
3. revisar consola Metro;
4. revisar error visible del development client;
5. validar `.env.local`;
6. verificar imports del `RootLayout`;
7. solo después revisar lógica de splash.

En la instalación inicial del nuevo Mac, la causa funcional encontrada fue la falta del archivo `.env.local` con la configuración de Supabase.

---

## 48. Troubleshooting: falta configuración Supabase

Síntoma:

```text
Falta la configuración de Supabase. Revisa el archivo .env.local.
```

Crear:

```text
.env.local
```

Con:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=TU_CLAVE_PUBLICABLE
```

Reiniciar Metro:

```bash
npx expo start --dev-client --clear
```

No subir el archivo a Git.

---

## 49. Troubleshooting: Git pide password y rechaza push

Síntoma:

```text
Password authentication is not supported for Git operations
```

Solución:

```bash
brew install gh
gh auth login
gh auth status
```

Después repetir:

```bash
git push
```

---

## 50. Procedimiento de rollback

Si un cambio rompe iOS:

```bash
git switch ios-stable-v1.3.3
npm ci
npx expo start --dev-client --clear
```

Si cambió configuración nativa:

```bash
npx expo prebuild --clean --platform ios
npx expo run:ios --device
```

Si un cambio rompe Android:

```bash
git switch android-stable-v1.3.3
npm ci
```

Luego regenerar/compilar Android según el entorno.

Nunca corregir una rama estable con cambios experimentales directamente. Crear una rama de fix desde el punto estable.

---

## 51. Procedimiento previo a modificar la interfaz

Antes del rediseño:

```bash
git switch ios-stable-v1.3.3
git pull
git status
git switch -c ui-redesign
```

Baseline mínimo que debe registrarse antes del primer cambio visual:

- captura de Inicio;
- captura de Calendario;
- captura de Rutas;
- captura de Mis actividades;
- captura de tracking;
- funcionamiento GPS confirmado;
- login confirmado;
- mapa confirmado.

Después de cada bloque de cambios:

```bash
npm run lint
npx tsc --noEmit
npx expo-doctor
```

Y QA visual en iPhone y Android antes del merge.

---

## 52. Criterios de aceptación para el rediseño UI

El nuevo diseño no debe modificar sin intención:

- contratos con Supabase;
- IDs de actividades;
- permisos;
- lógica de tracking;
- filtros GPS;
- esquema SQLite;
- navegación funcional;
- Bundle ID/package;
- versionado de build;
- políticas RLS.

El rediseño debe validar:

- legibilidad;
- contraste;
- safe areas;
- Dynamic Type cuando corresponda;
- pantallas pequeñas y grandes;
- dark mode;
- estados loading/empty/error;
- teclado;
- scroll;
- accesibilidad táctil;
- feedback de acciones.

---

## 53. Performance y batería

El GPS de alta precisión y tracking continuo tienen costo energético.

Monitorear especialmente:

- `BestForNavigation`;
- actualizaciones cada ~2 s;
- intervalo por distancia de 3 m;
- background prolongado;
- renderizado continuo del mapa.

Antes de producción masiva conviene comparar batería en recorridos de 30, 60 y 120 minutos y, si es necesario, ajustar frecuencia/precisión sin degradar de forma importante la calidad del trazado.

---

## 54. Observabilidad recomendada

Actualmente el diagnóstico se apoya principalmente en Metro, Xcode, logs de aplicación y Supabase.

Para una etapa de producción se recomienda incorporar:

- crash reporting;
- logging estructurado;
- métricas de errores Supabase;
- telemetría de fallas de GPS sin almacenar coordenadas innecesariamente;
- versión/build en cada reporte;
- dispositivo/SO de forma no invasiva;
- correlación de errores de red.

Evitar registrar secretos, tokens completos o rutas GPS privadas en logs centrales sin una política explícita.

---

## 55. Publicación iOS futura

Para distribución más allá del dispositivo de desarrollo se requerirá revisar:

- Apple Developer Program;
- App ID y capabilities;
- certificados/distribution profiles;
- App Store Connect;
- política de privacidad;
- strings de privacidad para ubicación;
- capturas y metadata;
- TestFlight;
- revisión de background location;
- cumplimiento de uso de datos.

La build de development instalada directamente con Xcode no equivale a una build App Store.

---

## 56. Publicación Google Play futura

Antes de Play Store:

- generar AAB de release;
- usar keystore de producción;
- incrementar `versionCode`;
- completar Data Safety;
- documentar uso de ubicación foreground/background;
- política de privacidad;
- prueba interna/cerrada;
- verificar requisitos vigentes de Google Play.

---

## 57. Checklist de release candidate

### Código

- [ ] `npm ci` limpio.
- [ ] `npx expo-doctor` sin fallos.
- [ ] lint correcto.
- [ ] TypeScript correcto.
- [ ] versionado actualizado.
- [ ] `.env.local` fuera de Git.
- [ ] sin secretos en diff.

### Android

- [ ] build exitosa.
- [ ] login.
- [ ] mapa.
- [ ] GPS foreground.
- [ ] GPS background.
- [ ] guardado.
- [ ] historial.
- [ ] compartir.
- [ ] permisos revisados.

### iOS

- [ ] build exitosa.
- [ ] firma válida.
- [ ] arranque.
- [ ] login.
- [ ] mapa.
- [ ] GPS foreground.
- [ ] GPS background/pantalla bloqueada.
- [ ] guardado.
- [ ] historial.
- [ ] compartir.
- [ ] permisos revisados.

### Backend

- [ ] RLS revisada.
- [ ] migraciones aplicadas.
- [ ] backups disponibles.
- [ ] Auth operativo.
- [ ] SMTP revisado si se utiliza correo real.

---

## 58. Deuda técnica / puntos a revisar

1. Reintroducir o rediseñar el splash animado solo después de validar estabilidad en iOS 27.
2. Automatizar QA estático en CI.
3. Añadir tests unitarios a filtros GPS y cálculo de distancia.
4. Añadir tests de integración para sesiones activas/pending save.
5. Probar tracking prolongado con pantalla bloqueada en Android e iOS.
6. Medir consumo de batería.
7. Definir política formal de errores y observabilidad.
8. Validar estrategia offline para agenda y mapas.
9. Revisar proveedor cartográfico y términos antes de producción.
10. Incorporar pipeline de release reproducible.
11. Añadir matriz formal de dispositivos soportados.
12. Documentar procedimiento de migración de base por cada release futuro.

---

## 59. Historial técnico de estabilización iOS 27

Resumen de los principales problemas encontrados y su resolución:

1. **Homebrew instalado pero no visible:** se agregó `/opt/homebrew` al PATH.
2. **Node/npm ausentes:** se instaló Node con Homebrew.
3. **Node 24 generó un estado problemático de dependencias:** se normalizó el entorno en Node 22.
4. **Dependencias dañadas:** se eliminó `node_modules` y se reconstruyó con `npm ci`.
5. **Expo Doctor detectó versiones patch antiguas:** se alinearon con Expo SDK 57.
6. **Xcode instalado pero no seleccionado:** se corrigió con `xcode-select` y `xcodebuild -runFirstLaunch`.
7. **Sin certificado de firma:** se configuró Apple Account y Signing & Capabilities.
8. **Certificado no confiado en iPhone:** se autorizó desde VPN y gestión de dispositivos.
9. **iOS 27 exigió UIScene:** se habilitó `enableSceneSupport` con `expo-build-properties`.
10. **Plugin referenciado pero ausente:** se instaló `expo-build-properties` correctamente.
11. **Build iOS exitosa:** Xcode compiló e instaló el development build en el iPhone.
12. **App aparentemente detenida:** se diagnosticó el arranque y se simplificó el splash manual.
13. **Error real de aplicación:** faltaba `.env.local` porque no forma parte de Git.
14. **Supabase configurado:** se creó `.env.local` y se reinició Metro.
15. **Aplicación operativa:** UI, Supabase y GPS quedaron funcionales en el dispositivo físico.
16. **Preservación:** se crearon ramas estables de Android e iOS antes del rediseño.

---

## 60. Comandos rápidos de recuperación de estación iOS

```bash
# 1. Seleccionar Node 22
brew unlink node@24 2>/dev/null || true
brew link --overwrite --force node@22
hash -r

# 2. Proyecto
cd ~/Documents/RollersMaps-

# 3. Dependencias
rm -rf node_modules
npm cache verify
npm ci

# 4. Validación
npx expo-doctor
npm run lint
npx tsc --noEmit

# 5. Configuración local
# Crear .env.local manualmente con las dos EXPO_PUBLIC_* de Supabase

# 6. Regenerar iOS si es necesario
npx expo prebuild --clean --platform ios

# 7. Instalar en iPhone
npx expo run:ios --device

# 8. Desarrollo normal posterior
npx expo start --dev-client --clear
```

---

## 61. Propiedad intelectual

Copyright © 2026 Manuel Salinas. Todos los derechos reservados.

El repositorio utiliza una licencia propietaria. Las dependencias de terceros mantienen sus licencias, condiciones y obligaciones correspondientes.

---

## 62. Principio operativo final

La fuente de verdad de RollersMaps es el repositorio Git, la configuración declarativa de Expo, las migraciones de Supabase y este manual. Las carpetas nativas generadas, las credenciales locales y los archivos `.env.local` son artefactos de estación y no deben convertirse en dependencias ocultas del proyecto.

Antes de cualquier cambio mayor:

1. partir desde una rama estable;
2. crear una rama de trabajo;
3. mantener secretos fuera de Git;
4. pasar QA estático;
5. probar en dispositivo real;
6. verificar Android e iOS si el cambio es compartido;
7. documentar cualquier nueva dependencia, permiso, migración o requisito de entorno.
