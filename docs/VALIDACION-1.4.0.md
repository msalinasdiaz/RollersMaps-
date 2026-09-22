# RollersMaps 1.4.0 — Informe de avance y validación

20 de septiembre de 2026 · Trabajo autorizado por Manuel Salinas

## Actualización del 21 de septiembre de 2026

El producto requiere ahora cuenta para mapa, GPS, historial y grupos. El modo
invitado descrito abajo corresponde a la validación histórica del 20 de septiembre.
Los cambios, pruebas y límites de esta revisión están en [VALIDACION-REGISTRO.md](VALIDACION-REGISTRO.md).

Supabase se activó el 21 de septiembre, con respaldo restaurado y validación
remota. Los bloqueos de conexión y falta de respaldo descritos más abajo
corresponden exclusivamente al estado histórico del 20 de septiembre.

## Estado de la entrega anterior

La implementación móvil y la migración están preparadas y probadas localmente.
El panel administrativo actualizado está publicado, conservando su acceso privado:
[RollersMaps Admin](https://rollersmaps-admin.msalinasdiaz.chatgpt.site).

La funcionalidad de grupos **todavía no está activada en la base real**. La API
de Supabase devuelve `404 / PGRST202` para `get_groups`, y la conexión SQL directa
agotó dos veces su tiempo de espera. Se solicitaron el host, puerto y usuario de
**Connect → Session pooler**. No se ha enviado la contraseña a otro servicio,
guardado en el código ni aplicado una migración remota.

## Qué se implementó

| Área | Resultado |
|---|---|
| Uso libre | Mapa, GPS e historial local sin cuenta ni membresía |
| Comunidades | Directorio, solicitud o ingreso abierto, creación de grupos |
| Calendarios | Lectura e inscripción reservadas a miembros activos del grupo |
| Administración | Solicitudes, miembros, suspensiones, roles, transferencia y actividades |
| Historial | Múltiples recorridos, renombrado y opción de compartir cualquiera |
| Respaldo | Copia local primero, sincronización por cuenta e identificador estable |
| Diseño | Inicio, Calendario, Grupos y Mis rutas; botón de compartir visible al desplazarse |
| Eficiencia | Carga compartida, trazado reutilizado, escrituras GPS serializadas y conteos en servidor |

La membresía está separada de cualquier suscripción de pago. No se añadieron
cobros, procesadores de pago ni una afiliación automática de los usuarios actuales.

## Pruebas automáticas

La rutina `npm run verify` ejecuta comprobaciones de tipos de la aplicación y
las pruebas, análisis de calidad y la suite completa. Último resultado: **25
pruebas aprobadas**, sin errores de tipos o calidad.

Se agregó `.github/workflows/verify.yml` para repetir estas comprobaciones con
cada cambio en `main` y las ramas `feature/**`, además de solicitudes de
integración. Usa Node.js 24 y permisos de lectura; no necesita credenciales de
Supabase ni aplica cambios a producción. Las acciones oficiales de
[checkout](https://github.com/actions/checkout) y
[setup-node](https://github.com/actions/setup-node) están fijadas por commit.
El resultado de la primera ejecución remota se registra en la entrega final.

| Conjunto | Casos | Qué comprueba |
|---|---:|---|
| PostgreSQL local / PGlite | 11 | Migración repetible, permisos reales, aislamiento, solicitudes, cupos, retiros, bloqueos y administración |
| SQLite / GPS | 9 | Filtrado, orden de escrituras, sesiones pendientes, múltiples recorridos, recuperación y separación de cuentas |
| Respaldo de recorridos | 5 | Reintentos, identidad, exclusión de invitados y ausencia de duplicados por envíos repetidos |

El esquema usado por las pruebas es una reproducción local de la estructura
esperada. Todavía debe compararse con el esquema real. La prueba de último cupo
es secuencial; falta probar dos conexiones PostgreSQL simultáneas en el entorno
de integración.

## Validación en Android

Se compilaron una aplicación de desarrollo y una aplicación autónoma. La
autónoma se instaló como `cl.santiagorollers.rollersmaps.preview`, separada de la
versión estable. Entorno: emulador Android 37.1, x86_64, ubicación simulada.

Comprobaciones realizadas en la interfaz real:

1. Inicio y mapa accesibles como invitado.
2. Solicitud de ubicación precisa y explicación del permiso de segundo plano.
3. Registro de puntos simulados y servicio de ubicación activo al volver desde
   segundo plano.
4. Finalización y guardado local del primer recorrido.
5. Segunda salida guardada por separado, sin sobrescribir la primera.
6. Historial con dos recorridos; cambio de nombre a «Prueba GPS 2».
7. Cierre completo y reapertura de la aplicación: ambos recorridos y el nuevo
   nombre permanecen.
8. Vista previa de un recorrido anterior con mapa, marca y métricas; generación
   de imagen y apertura del menú de compartir de Android.
9. Calendario de invitado sin información de actividades privadas.

Las capturas entregadas son de la aplicación en ejecución. Las rutas son pruebas
simuladas y sus tiempos no son una medición deportiva ni una prueba de batería.
Una pausa de trabajo quedó incluida en la duración del primer recorrido.

La revisión visual detectó un botón de compartir parcialmente fuera de pantalla.
Se movió a un pie fijo, separado de la vista previa desplazable; esta corrección
se incluye en la compilación final de prueba. La última instalación conservó
ambos recorridos y se volvió a verificar el botón completo, el mapa cargado y la
apertura del menú nativo para compartir la imagen.

## Panel administrativo

Comprobaciones de TypeScript, Oxlint y compilación de producción aprobadas.
Publicación confirmada por Sites, versión 2. El panel mantiene compatibilidad con
`admin_users` exclusivamente mientras falta `get_groups`; otros errores no
habilitan esa alternativa.

La revisión de la sesión autenticada en el navegador está pendiente: la
herramienta de control del navegador del equipo no pudo iniciar. Publicar el
panel no modifica Supabase ni valida las operaciones de la nueva base real.

## Respaldo y trazabilidad

| Elemento | Referencia |
|---|---|
| Base móvil estable | `04bbbc7da4090b62c19bd5c8a34699a83d61c0d0` |
| Etiqueta estable, local y remota | `backup/v1.3.3-before-groups-20260920` |
| Implementación principal | `812181c7114789d30ee74690c8c4c9fcfb0edc22` |
| Rama de trabajo, local y remota | `feature/1.4.0-groups` |
| Base del panel | `5414061eb3a3a12b649980379a41faf84ba269f4` |
| Panel publicado | `5fb146a8fdf5495279b81a3d1f2d5534a1dd257f` |
| Etiqueta anterior del panel | `backup/admin-before-groups-20260920` |

Los archivos `.bundle` permiten recuperar el historial Git aun sin conexión al
repositorio remoto. La rama principal móvil conserva la versión estable. El
instalador de prueba no reemplaza esa aplicación y usa firma local de prueba.
El respaldo de la base de datos sigue pendiente: Git no contiene sus datos.

## Prioridades para continuar

**P0 — Activación de grupos:** obtener los datos de conexión de Session pooler,
ejecutar la revisión de solo lectura, respaldar esquema y datos, verificar las
funciones y políticas antiguas y aplicar la migración. Después probar con cuentas
reales de propietario, miembro, pendiente y persona de otro grupo.

**P1 — Validación de publicación:** probar dos reservas simultáneas para el último
cupo, una salida física con pantalla bloqueada y pérdida de conexión, y la
compilación/ejecución iOS con macOS y un dispositivo compatible. Confirmar también
la administración web autenticada y el respaldo real de los recorridos.

**P2 — Mantenimiento:** revisar las dependencias dentro de versiones compatibles
con Expo 57 y reducir el paquete inicial del panel. La auditoría informó 16
alertas moderadas propagadas desde dos dependencias, sin altas ni críticas:
`decode-uri-component` y `uuid`. No se ejecutó una actualización forzada porque
las propuestas automáticas retroceden componentes principales a versiones
incompatibles. El paquete web también tiene un aviso de tamaño mayor a 500 kB.

## Material entregado

- Modelo del producto y manual actualizado.
- Informe de pruebas y punto de continuidad.
- Migración SQL y revisión previa de solo lectura.
- Respaldos Git de la versión estable y del trabajo actual.
- Instalador Android autónomo de prueba y capturas verificadas.

Esta entrega es una versión de prueba; la activación de la base y las validaciones
indicadas siguen siendo necesarias antes de reemplazar la versión estable.
