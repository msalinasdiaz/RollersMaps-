# RollersMaps 1.4.0 — Registro obligatorio

21 de septiembre de 2026 · Revisión Android 22

## Decisión acordada

Toda persona necesita una cuenta para usar RollersMaps. No necesita pertenecer a
un grupo ni tener una suscripción de pago para guardar recorridos, consultar
distancias e historial o compartir sus rutas. La membresía activa de cada grupo
habilita únicamente el calendario y las inscripciones de ese grupo.

La bienvenida presenta el texto aprobado:

> **Tus rutas, tus kilómetros y tu comunidad**
>
> Crea tu cuenta en RollersMaps para guardar tus recorridos, consultar las
> distancias y revisar tu historial.
>
> Descubre grupos de patinaje y únete para acceder a sus calendarios y participar
> en sus actividades.

Acciones: **Crear cuenta** e **Iniciar sesión**. Se retiró «Continuar sin cuenta».

## Cambios y conservación de datos

- La navegación espera la restauración de la sesión antes de mostrar pantallas.
- Mapa, GPS, historial, grupos, calendario y administración requieren sesión.
- Cerrar sesión retira las pantallas privadas de la navegación.
- El registro se abre desde «Crear cuenta»; si se requiere confirmar el correo,
  vuelve al formulario de ingreso con una explicación.
- El formulario evita envíos duplicados, permite reintentar tras fallos de red
  y valida nombres de 2 a 60 caracteres conforme al esquema real.
- La bienvenida no consulta el directorio ni los calendarios.
- No se pueden iniciar nuevos recorridos de invitado.
- Los recorridos antiguos sin cuenta se conservan. «Mis rutas» ofrece recuperarlos
  y solicita confirmar «Son mis rutas» antes de vincularlos a la cuenta actual.
- La recuperación funciona localmente, conserva trazado, métricas e identificador
  y no publica ni envía automáticamente los recorridos. La nube utiliza la acción
  separada «Respaldar mis rutas».
- Los recorridos de otra cuenta no se incorporan al historial actual.
- Se conserva el guardado local durante pérdida de conexión. Crear cuenta,
  iniciar o renovar una sesión y respaldar en la nube requieren conectividad.

## Validación automática y Android

`npm run verify`: tipos de aplicación, tipos de pruebas, ESLint y **33 pruebas
aprobadas**, sin errores ni advertencias de calidad.

| Área | Casos | Alcance |
|---|---:|---|
| PostgreSQL local / PGlite | 12 | Permisos, grupos, calendarios, catálogo y migraciones repetibles |
| SQLite / GPS | 12 | Guardado, recuperación antigua, aislamiento y exigencia de cuenta |
| Respaldo | 5 | Identidad, reintentos y exclusión de invitados sin solicitud expresa |
| Declaración de navegación | 4 | Restauración, acceso registrado y retiro de pantallas privadas |

Las pruebas de navegación renderizan el diseño real con adaptadores nativos.
Además, se instaló el APK autónomo en Android: cinco enlaces privados (GPS,
Mis rutas, grupos, calendario y crear grupo) abiertos desde cero sin sesión
regresaron a la bienvenida. Se revisaron visualmente bienvenida, registro e
ingreso, los campos vacíos y la validación del nombre. No se enviaron correos
ni se crearon cuentas permanentes durante estas pruebas.

Compilación Android aprobada: versión 1.4.0, revisión 22, arquitecturas arm64-v8a
y x86_64. Paquete separado: `cl.santiagorollers.rollersmaps.preview`.
La firma es de prueba, no de tienda. Gradle mostró avisos de compatibilidad futura
de dependencias; la compilación terminó correctamente.

## Supabase activado

**Ambas migraciones quedaron aplicadas el 21 de septiembre de 2026 a las 23:08
de Santiago**, en una sola transacción: primero `20260920_groups_v140.sql`
y luego `20260921_account_required.sql`. La conexión Session pooler verificó
el certificado TLS. La contraseña no se guardó en archivos ni se incorporó a Git.

Antes se generó un respaldo completo en formato custom con `pg_dump 17.11`.
Se verificó su catálogo de 644 entradas y se restauraron sin errores los esquemas
`public` y `auth` en PostgreSQL 17.11 local. Las migraciones y permisos se
ensayaron allí antes de modificar Supabase.

| Datos conservados | Cantidad |
|---|---:|
| Actividades | 7 |
| Inscripciones | 20 |
| Recorridos personales | 19 |
| Perfiles | 12 |
| Rutas del catálogo | 4 |
| Administrador existente | 1 |

Las sumas de comprobación coincidieron antes y después en cada tabla, excluyendo
únicamente las columnas nuevas y la fecha de actualización de las actividades:
el disparador existente actualizó esa fecha al asignarles su grupo. Se conservaron
identificadores, trazados, métricas y estados de inscripción.

Solo el administrador existente quedó como propietario de Santiago Rollers.
Las otras cuentas deben solicitar su ingreso y ser aprobadas para consultar
ese calendario. Los permisos nuevos también se aplican a versiones antiguas.

Se completaron 14 comprobaciones de migración, permisos y conservación en Supabase.
Las cuentas y actividades temporales solo existieron en una transacción revertida.
Se verificaron denegación anónima, calendario privado, solicitud pendiente,
aprobación, aislamiento administrativo, cupos, cancelación y salida del grupo.
Cinco consultas HTTP adicionales confirmaron respuesta 401 / permiso denegado
sin cuenta para grupos, rutas y calendarios.

Se probó el último cupo con dos conexiones simultáneas en PostgreSQL local
restaurado: una confirmó; la otra esperó el bloqueo y fue rechazada. Esta prueba
de concurrencia fue local, no una prueba de carga de Supabase.

## Respaldo y pendientes

Punto previo: `0d918a341f44b9c06167967378170250007bd53f`, conservado por
`backup/v1.4.0-before-registration-20260921` y un bundle verificado.
La rama sigue siendo `feature/1.4.0-groups`; `main` conserva el código estable.

Se guardaron localmente respaldo de base, historial del código, APK, capturas
e informes de validación. Los respaldos de la base contienen información privada
y no forman parte del repositorio.

Pendientes antes de publicar en tiendas:

- Registro y confirmación de correo completos con una cuenta real; ingreso,
  renovación y cierre de sesión en dispositivo.
- Panel web con sesión real de administrador y recorrido completo con una cuenta
  de miembro. Sus permisos de servidor ya se comprobaron.
- Salida GPS con pantalla bloqueada en teléfono físico y pruebas iOS.
- Revisión de dependencias y firma de distribución.

El código está guardado en Git local. Su subida al repositorio público requiere
la autorización explícita solicitada. No se publicó este avance ni se enviaron
respaldos de datos a GitHub.

## Referencias técnicas

- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/).
- [Rutas protegidas de Expo Router](https://docs.expo.dev/router/advanced/protected/).
- [Conexiones de Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).

La navegación protegida complementa los permisos comprobados en el servidor.
