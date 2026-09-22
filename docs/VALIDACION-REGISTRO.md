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
- El formulario de registro se abre directamente desde «Crear cuenta»; si se
  requiere confirmar el correo, vuelve al formulario de ingreso con una explicación.
- El formulario evita envíos duplicados y permite reintentar tras un fallo de red.
- La bienvenida no consulta el directorio ni los calendarios.
- No se pueden iniciar nuevos recorridos de invitado en el almacenamiento local.
- Los recorridos antiguos sin cuenta se conservan. «Mis rutas» ofrece recuperarlos
  y solicita confirmar «Son mis rutas» antes de vincularlos a la cuenta actual.
- La recuperación funciona localmente, conserva trazado, métricas e identificador
  y no publica ni envía automáticamente los recorridos. El respaldo en la nube
  se realiza con la acción separada «Respaldar mis rutas».
- Los recorridos vinculados a otra cuenta no se incorporan al historial actual.
- Se conserva el guardado local durante pérdida de conexión. Crear cuenta,
  iniciar o renovar una sesión y respaldar en la nube requieren conectividad.

## Validación automática

`npm run verify`: tipos de aplicación, tipos de pruebas, ESLint y **33 pruebas
aprobadas**, sin errores ni advertencias de calidad.

| Área | Casos | Alcance |
|---|---:|---|
| PostgreSQL local / PGlite | 12 | Permisos, grupos, calendarios, catálogo y migraciones repetibles |
| SQLite / GPS | 12 | Guardado, recuperación de versiones anteriores, aislamiento y exigencia de cuenta |
| Respaldo | 5 | Identidad, reintentos y exclusión de invitados sin solicitud expresa |
| Declaración de navegación | 4 | Restauración de sesión, acceso registrado y retiro de pantallas privadas |

Las pruebas de navegación renderizan el diseño real con adaptadores de las
bibliotecas nativas. No equivalen por sí solas a una prueba de enlaces directos
en un teléfono; la verificación Android se registra al completar el instalador.

## Base de datos

Se preparó `supabase/migrations/20260921_account_required.sql`, que exige cuenta
para consultar los grupos y el catálogo. Debe aplicarse **después** de
`20260920_groups_v140.sql`. No cambia las membresías, actividades ni recorridos.

Ambas migraciones están probadas sobre PostgreSQL local. **No se aplicaron a la
base real.** Antes de hacerlo sigue pendiente obtener la conexión administrativa,
revisar el esquema existente y respaldar esquema y datos. Luego deben verificarse
registro, confirmación de correo, ingreso y permisos con cuentas reales.

## Respaldo y pendientes

Punto previo: `0d918a341f44b9c06167967378170250007bd53f`, conservado por la etiqueta
`backup/v1.4.0-before-registration-20260921` y un bundle verificado.
La rama de trabajo sigue siendo `feature/1.4.0-groups`; `main` conserva la estable.

Se mantienen pendientes la activación de Supabase, las operaciones administrativas
web autenticadas, dos reservas simultáneas con conexiones reales, una salida GPS
en teléfono físico y las pruebas iOS. No se ha publicado una versión en tiendas.

## Referencias técnicas

- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/).
- [Rutas protegidas de Expo Router](https://docs.expo.dev/router/advanced/protected/).
- [Conexión administrativa de Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).

La protección de navegación complementa los permisos de la base de datos;
no sustituye su activación y validación en el servidor.
