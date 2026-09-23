# RollersMaps 1.4.0 — Revisión 25
23 de septiembre de 2026

## Cambios del GPS
Se tomaron como referencia visual los dos videos de WhatsApp del 22 de septiembre entregados por el propietario.

- Pantalla oscura con tiempo, velocidad y distancia grandes, con cambio entre Datos y Mapa.
- Pausar, Reanudar y Finalizar. La pausa se conserva al reiniciar y su tiempo queda fuera de la duración activa.
- Al reanudar se abre un segmento GPS nuevo: el traslado durante la pausa no suma distancia ni se dibuja como parte del recorrido.
- Resumen antes de guardar con nombre editable, distancia, tiempo activo y promedio.
- Guardado local con respaldo posterior cuando haya conexión; apertura del detalle del recorrido guardado.
- Detalle desde Mis rutas con mapa ampliable, métricas, renombrado e imagen para compartir. El tiempo incluye horas, minutos y segundos.
- Icono de patín en línea rollerblade de Pictogrammers; origen y licencias conservados en assets/licenses.
- Si falla la reactivación del GPS al recuperar una sesión, esta queda en pausa para evitar sumar tiempo sin ubicación.

El mapa de esta entrega continúa usando MapLibre/OpenFreeMap. La integración con Google está planificada en el documento separado; no se activó facturación.

## Conservación
La actualización de SQLite agrega columnas para pausa y segmentos. No reemplaza tablas ni borra rutas anteriores. Las rutas antiguas con LineString y las nuevas con MultiLineString son compatibles con la lectura del historial y el respaldo existente.

Los cambios no requieren una migración de Supabase. No se modificaron cuentas, grupos, solicitudes, configuración SMTP ni datos de producción durante esta entrega.

## Verificación realizada
- Tipos de aplicación y pruebas, lint y 55 pruebas en 7 archivos: aprobados.
- Casos nuevos sobre SQLite real: pausa sin puntos ni tiempo adicionales, reinicio, reanudación después de un traslado, separación entre cuentas, rechazo de señal antigua/imprecisa, migración desde revisión 24 y nombre final guardado.
- Pruebas de geometría: cortes entre segmentos y lectura de rutas anteriores; velocidad a cero cuando caduca la señal; formato exacto de tiempo.
- Compilación Android release para arm64-v8a y x86_64: exitosa.
- Instalación en emulator-5554 mediante actualización que conserva datos: exitosa.
- Paquete instalado: cl.santiagorollers.rollersmaps.preview.
- Versión comprobada en Android: 1.4.0, versionCode 25.
- Android Studio continúa abierto.

El emulador estaba sin sesión. Se solicitó al propietario ingresar directamente, sin compartir su contraseña. La comprobación visual completa del nuevo GPS autenticado no se realizó en esta entrega. Quedan pendientes también recorrido real en teléfono, pantalla bloqueada, consumo de batería, precisión en movimiento y validación iOS. Las pruebas automáticas no sustituyen estas comprobaciones.

## Instalador
Archivo: RollersMaps-1.4.0-revision-25-preview.apk
SHA256: 2753D65A4E87196BDBB8F029B1E71C752420EBFC14067917D49141142F6C5044

Es una vista previa instalada por separado; no una publicación en tiendas.

## Registro y continuidad
Código y documentación registrados en la rama feature/1.4.0-groups. El instalador anterior se conserva y existe una copia local de Git previa a los cambios.
Plan siguiente: docs/PLAN-REGISTRO-Y-GOOGLE-MAPS.md.

## Aceptación pendiente con sesión
1. Abrir Iniciar recorrido y comprobar el patín y el cambio Datos/Mapa.
2. Grabar unos metros; pausar y verificar que el tiempo quede fijo.
3. Reanudar y finalizar; revisar título, tiempo y distancia; guardar.
4. Abrir Ver recorrido, ampliar el mapa y compartir.
5. Repetir sin conexión y comprobar respaldo posterior.
6. Probar cierre y reapertura durante una pausa y registro con pantalla bloqueada.
