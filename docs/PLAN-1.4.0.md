# RollersMaps 1.4.0 — Patinar libre y comunidades

## Acuerdo de producto — actualizado el 21 de septiembre de 2026

RollersMaps sirve a cualquier persona que patine. Una cuenta puede pertenecer a varios grupos; la pertenencia a uno no abre los calendarios de los demás. La membresía es independiente de cualquier pago.

- Mapa, GPS, historial local y compartir recorridos propios disponibles sin grupo.
- Cuenta obligatoria para usar mapa, GPS, historial, distancias, compartir y grupos. La bienvenida permite crear cuenta o iniciar sesión.
- No hay modo invitado nuevo. Los recorridos antiguos sin cuenta se conservan y se recuperan únicamente al confirmar que son propios, sin necesitar red.
- Directorio de grupos para usuarios registrados; calendarios y reservas accesibles solo a miembros activos de cada grupo.
- Santiago Rollers: ingreso por aprobación. Cada grupo puede elegir ingreso abierto o por aprobación.
- Propietario y administradores gestionan solo su grupo. Miembro, pendiente, bloqueado y salida son estados explícitos.
- Los usuarios existentes no se convierten automáticamente en miembros. Los administradores existentes gestionan Santiago Rollers; se conservan las inscripciones y los recorridos.

## Modelo de uso

```mermaid
flowchart TD
  W[Bienvenida] --> A[Crear cuenta o iniciar sesión]
  A --> B[Patinar libre]
  B --> C[Mapa y GPS]
  C --> D[Guardar en el teléfono]
  D --> E[Compartir imagen]
  D --> F[Respaldo privado en la cuenta]
  A --> G[Descubrir grupos]
  G --> H[Unirse o solicitar ingreso]
  H --> I[Membresía activa del grupo]
  I --> J[Calendario del grupo]
  J --> K[Reservar o cancelar cupo]
```

## Navegación

Cuatro pestañas: Inicio, Calendario, Grupos y Mis rutas. Inicio ofrece Patinar como acción principal y un acceso secundario al catálogo. El calendario reúne solo los grupos propios y permite filtrarlos. Sin membresías muestra una invitación a descubrir grupos; un error de carga nunca se presenta como una agenda vacía.

## Implementación por etapas

1. Registrar pruebas previas y crear respaldo Git verificable.
2. Migración compatible de grupos, membresías y permisos, con pruebas de aislamiento, solicitudes, administración y último cupo.
3. Guardado local de múltiples recorridos terminados y sincronización idempotente. Mantener un solo recorrido activo.
4. Adaptar pantallas y administración, con estados de carga, error y lista vacía; evitar consultas repetidas y vaciar datos al cambiar de cuenta.
5. Pruebas automatizadas, compilación Android y recorrido en emulador. Registrar por separado lo que requiere teléfonos físicos o acceso administrativo remoto.

## Respaldo y reversión

- Base: 04bbbc7da4090b62c19bd5c8a34699a83d61c0d0 (1.3.3).
- Etiqueta: backup/v1.3.3-before-groups-20260920.
- Rama: feature/1.4.0-groups.
- Bundle verificado: RollersMaps-v1.3.3-respaldo.bundle, con historial completo.
- Validación previa: TypeScript y ESLint sin errores.
- Nunca revertir permisos de producción para recuperar una interfaz antigua: el despliegue de base de datos exige respaldo propio, ya que Git respalda código y no datos de Supabase.

## Criterios de aceptación

- Sin sesión no se accede por navegación ni enlaces directos al GPS, historial, grupos o calendarios.
- Con cuenta y sin grupos se guardan varios recorridos, se consulta su distancia y se conserva el historial al reiniciar.
- Las rutas antiguas de invitado no se mezclan automáticamente con ninguna cuenta; recuperarlas conserva trazado, métricas e identificadores.
- Cerrar sesión vuelve a la bienvenida. La pertenencia a grupos no es requisito para las funciones personales.
- Un usuario de A no lee ni modifica calendarios, reservas o miembros de B.
- Una solicitud pendiente no habilita el calendario; aprobarla sí, retirarla revoca el acceso.
- Dos reservas concurrentes para el último cupo producen solo una confirmación.
- Reintentar sincronización no duplica recorridos ni cambia de propietario.
- Salir de un grupo no borra recorridos personales.
- La administración funciona dentro del grupo y preserva los identificadores de actividades existentes.
- Compilación, comprobación de tipos, lint, pruebas y evidencia visual documentadas.

## Fuentes consultadas

- https://support.strava.com/en-us/articles/15402172-clubs-on-strava
- https://support.strava.com/en-us/articles/15401898-how-do-i-create-and-manage-group-events-for-my-club
- https://docs.expo.dev/versions/v57.0.0/

## Estado histórico de continuidad — 20 de septiembre de 2026

El acuerdo de acceso de esta sección fue sustituido el 21 de septiembre por registro obligatorio. Consultar VALIDACION-REGISTRO.md para el cambio posterior.

Implementación de grupos, permisos, pantallas y guardado local terminada en la
rama de trabajo. Hay 25 pruebas automáticas aprobadas, comprobaciones de tipos
y calidad aprobadas, y compilaciones Android de desarrollo y autónoma exitosas.
La etiqueta de la versión estable también está en el repositorio remoto original.

El panel administrativo se publicó con compatibilidad para el esquema anterior.
Su audiencia privada se conserva. La aplicación de prueba se instala con un
identificador separado, sin reemplazar la estable.

La base remota NO se ha modificado. La conexión directa agotó el tiempo de espera;
se solicitaron host, puerto y usuario de Session pooler. La contraseña recibida
no se guardó en código ni documentación. Falta revisar el esquema real, respaldar
la base, activar la migración y validar las operaciones entre cuentas reales.

La revisión visual Android y el recorrido de prueba se registran por separado.
El GPS en teléfonos físicos, iOS y la reserva simultánea con dos conexiones reales
siguen pendientes. El manual vigente es MANUAL-1.4.0.md.
