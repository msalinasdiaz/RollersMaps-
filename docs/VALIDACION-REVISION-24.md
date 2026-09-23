# RollersMaps 1.4.0 — Revisión 24
22 de septiembre de 2026

Se corrigió la diferencia entre administrar un grupo y administrar toda la plataforma. La cuenta general existente puede consultar todas las comunidades, incluidas las de otros creadores, y revisar solicitudes pendientes, aprobadas y rechazadas.

## App
Inicio → Administración general → Grupos y aprobaciones.
Grupos → Administración general · Todos los grupos.
Búsqueda por grupo, ciudad o creador; filtros con cantidades; aprobación y rechazo; actualización periódica y al volver a primer plano.
Los errores de comprobación del rol muestran un aviso con opción de reintentar.

## Panel web
La cuenta general abre directamente Grupos y aprobaciones. Funciona incluso sin membresías propias.
Se conserva el acceso a las actividades y miembros de los grupos que administra.
Los administradores de cada grupo conservan únicamente su ámbito habitual.

## Datos y permisos
Nueva migración: supabase/migrations/20260922_platform_groups.sql.
get_platform_groups requiere is_platform_admin en el servidor. No cambia las membresías ni amplía los permisos sobre actividades, cupos o miembros de otros grupos.
Los grupos aprobados se conservan. Pendientes y rechazados desaparecen al vencer las 48 horas desde su creación, según la regla ya vigente.
Se realizó respaldo, ensayo con reversión y aplicación; cantidades y sumas de comprobación confirmaron que los datos existentes no cambiaron.

## Verificación
- Tipos, calidad y 48 pruebas automáticas aprobadas.
- Pruebas aisladas del panel en navegador: administración general, administrador sin grupos propios, administrador de un grupo, error de validación, filtros, aprobación y rechazo.
- Compilación Android arm64-v8a y x86_64; instalación preservando la sesión.
- Comprobación real en el emulador: 4 grupos, 1 pendiente, 3 aprobados, 0 rechazados; Franchute patina pendiente y Roller patín de otra creadora visibles.
- No se aprobaron ni rechazaron solicitudes reales durante las pruebas.
- APK de vista previa: cl.santiagorollers.rollersmaps.preview, revisión 24.
- SHA256: CEF1AEBA6BCB7055CD960902EEC57446DFD4A949AAAEDF3E6ECFE4DA3A3E3831.

La publicación en tiendas y la instalación en un teléfono físico no forman parte de esta comprobación.

## Publicación web confirmada
El panel se publicó correctamente el 22 de septiembre de 2026 a las 17:39 (America/Santiago).
URL: https://rollersmaps-admin.msalinasdiaz.chatgpt.site
Estado confirmado por Sites: succeeded.
Código publicado: 502c2c422541a753193777b14989a89576f80c00.
Versión de Sites: appgprj_6aa5644aa5f08191b2fbd76b825d27f1~appgver_8bff156478ec81918f8d1ea66e1e399b.
Despliegue: appgdep_6ab2e774705c8191a0c2561ffc52df40.
La audiencia privada se conservó.

El acceso desde Inicio se comprobó con la sesión real de Manu. Se probaron además los filtros sin aprobar ni rechazar solicitudes reales.
