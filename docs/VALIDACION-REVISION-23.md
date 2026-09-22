# RollersMaps 1.4.0 — Revisión 23
22 de septiembre de 2026

## Cambios
- Calendario semanal con fechas laterales, tipos por color, navegación entre semanas y días anteriores plegados.
- Inicio presenta «Próxima actividad» y «Ver próxima actividad». Se conserva «Tus comunidades».
- Los participantes no ven capacidad, cantidad de inscritos ni cupos restantes. La API devuelve cantidades nulas y un indicador de inscripción habilitada; solo los administradores del grupo reciben cantidades.
- Los propietarios y administradores pueden elegir una imagen, revisarla y guardar el logo en Ajustes. Se conserva su proporción y transparencia, se normaliza a PNG de hasta 512 píxeles y se limita a 2 MB.
- Los logos se almacenan en un contenedor privado. Las cuentas pueden verlos y solo administradores del grupo pueden subirlos o asignarlos.
- Crear un grupo envía una solicitud privada, con una sola solicitud pendiente o rechazada por cuenta durante 48 horas.
- Solo el administrador general existente puede aprobar o rechazar comunidades desde Grupos → Solicitudes de nuevos grupos.
- Un grupo pendiente no admite miembros, actividades ni logos. Al aprobarse, su creador pasa a propietario activo.
- Las solicitudes pendientes o rechazadas dejan de aparecer al vencer las 48 horas. La limpieza se ejecuta cada minuto y elimina la solicitud y su membresía pendiente.
- La limpieza bloquea cada solicitud para evitar una carrera con la aprobación, excluye grupos aprobados y no elimina grupos con actividades.
- Los grupos y contenidos ya existentes conservan su estado.

## Verificaciones
npm run verify: tipos de aplicación, tipos de pruebas, calidad y **45 pruebas aprobadas**.
Incluye privacidad de cupos, reserva con cantidades nulas, cancelación en actividades cerradas, fechas, permisos de logos, aislamiento de grupos, solicitud privada, límite por cuenta, denegación de autoaprobación, aprobación, rechazo, vencimiento y conservación de grupos aprobados.

Las dos migraciones se ensayaron en Supabase en una transacción revertida antes de su activación. Se comprobó la conservación de todas las filas de actividades, inscripciones, recorridos, perfiles, grupos, membresías y catálogo mediante cantidades y sumas de comprobación.

## Respaldos
El directorio local ignorado por Git work/calendar-logos-backup conserva el bundle Git anterior, el instalador de la revisión 22 y respaldos privados de los esquemas public, auth y storage en formato PostgreSQL custom, con catálogo verificado de 515 entradas.
Las contraseñas no se incorporaron a archivos ni al repositorio.

## Migraciones
Después de las migraciones de grupos y registro obligatorio:
1. supabase/migrations/20260922_calendar_privacy_logos.sql
2. supabase/migrations/20260922_group_approval.sql

La segunda activa pg_cron cuando está disponible y crea rollersmaps-expired-group-requests. La limpieza no puede invocarse por participantes ni administradores de grupo. La aprobación utiliza admin_users, independiente de los roles de cada comunidad.

Los clientes anteriores deben actualizarse para usar la nueva disponibilidad de inscripción sin cantidades.

## Alcance
Paquete Android de prueba: cl.santiagorollers.rollersmaps.preview, versión 1.4.0, revisión 23.
La publicación en tiendas, iOS y las pruebas GPS en teléfono físico quedan fuera de esta entrega.

## Resultado de instalación y activación
La revisión 23 se compiló e instaló correctamente en el emulador, conservando la sesión del participante Flash. Se revisaron visualmente calendario e Inicio con datos reales y se comprobó la denegación de acceso a la aprobación central desde esa cuenta.

Las migraciones quedaron activas en Supabase y la tarea de limpieza registró ejecución succeeded. La cuenta general existente se mantuvo sin cambios. No se crearon cuentas, grupos de prueba ni inscripciones permanentes en producción.

La selección y carga completa de un logo requiere una comprobación con la sesión administrativa; se validaron el código nativo, la compilación y los permisos de almacenamiento y asignación con PostgreSQL. Las pruebas de interfaz verificaron las ramas de miembro y administrador para cupos.

La exportación web de la app móvil no se completó por la dependencia de wa-sqlite.wasm existente en Expo SQLite. No se modificó ni desplegó el panel web en esta entrega Android.
