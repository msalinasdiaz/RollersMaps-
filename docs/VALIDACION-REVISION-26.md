# RollersMaps 1.4.0 — Revisión 26
23 de septiembre de 2026

## Resultado
Se agregó Eliminar grupo en Administración general, tanto en la app como en el panel web. Funciona para grupos propios y de otros creadores, aprobados, pendientes o rechazados.

La función requiere el rol de administrador general en el servidor. Ser dueño o administrador de un grupo no otorga este permiso. Antes de eliminar se debe escribir el nombre exacto y confirmar la operación.

La confirmación explica que se eliminan grupo, membresías, actividades e inscripciones. Los recorridos GPS personales conservan trazado, nombre y métricas; se quita la asociación a la actividad eliminada. También se permite respaldar un GPS pendiente que se grabó sin conexión antes de eliminar el grupo.

El historial de eliminaciones muestra nombre, fecha, administrador y cantidades afectadas. Conserva las últimas 100 entradas visibles; la tabla de auditoría no se recorta automáticamente. Las cuentas comunes no pueden consultar ni modificar ese historial. El archivo de un logo previo no se borra del almacenamiento; su referencia se conserva en la auditoría.

## Base de datos
Migración: supabase/migrations/20260923_platform_group_deletion.sql.
Aplicada el 23 de septiembre de 2026 a las 13:14:32 UTC.
SHA256 de la migración: 03fd83414a70d457268c3e28e00d8021b106aa301f09fc3496d8aac6dd7c7563.

La activación creó estructura, funciones y protección de referencias. No ejecutó una eliminación real, no creó usuarios o grupos de prueba en producción y no exportó tablas privadas.

Se compararon cantidades y sumas de comprobación antes y después: 4 grupos, 15 membresías, 13 actividades, 24 inscripciones y 28 recorridos personales, sin cambios en los datos existentes.

El ensayo inicial con exportación privada y registros temporales fue rechazado por revisión automática. Se sustituyó por pruebas aisladas en PostgreSQL local, lectura de estructura en producción y la activación aditiva indicada.

## Verificación
- Tipos, lint y 58 pruebas automáticas aprobadas.
- Pruebas PostgreSQL aisladas: permisos, confirmación incorrecta, eliminación de grupo ajeno, solicitudes pendientes/rechazadas, conservación de GPS, respaldo posterior sin conexión, auditoría e intento duplicado.
- Panel en navegador: administrador general; móvil de 390 px; administrador de grupo; error de permisos; error al eliminar; visitante sin sesión. Se probaron cancelación, bloqueo por nombre incorrecto y actualización del historial. Todas aprobadas con datos simulados.
- Compilación Android arm64-v8a y x86_64: exitosa.
- Instalación conservando datos en emulator-5554: exitosa.
- Versión Android comprobada: 1.4.0 / 26.
- El GPS mejorado de la revisión 25 está incluido.

La prueba visual autenticada dentro de la app, GPS en teléfono físico e iOS siguen pendientes. La prueba de borrado en producción se deja al uso explícito del propietario: no se borró ningún grupo suyo para probar.

## Instalador
RollersMaps-1.4.0-revision-26-preview.apk
SHA256: 849ACC415FC8BFCFFE2EAEB8F28FA8B0BA86015C9EFC7AB721940057AA2E2A95
Paquete: cl.santiagorollers.rollersmaps.preview.
No es una publicación en tiendas.

## Dominio propio
uxspa.cl fue confirmado por el propietario. Se preparó y probó una compilación del panel para cPanel, sin dependencia de ChatGPT en ejecución, con destino previsto rollersmaps-admin.uxspa.cl.
El subdominio, DNS y HTTPS no se han activado todavía: falta una sesión de cPanel del propietario. El panel y los datos seguirán usando las cuentas y permisos actuales de Supabase.
Paquete entregable: RollersMaps-Admin-cPanel-revision-26.zip.
Instrucciones: Panel-RollersMaps-en-uxspa.md.

El informe de registro público y Google Maps sigue vigente; ahora se dispone del dominio para configurar el remitente. SMTP y Google Maps todavía no se han activado.

## Publicación web confirmada
El panel existente se publicó correctamente: https://rollersmaps-admin.msalinasdiaz.chatgpt.site
Estado: succeeded.
Confirmación: 2026-09-23T18:21:10.290152+00:00.
Código publicado: 92f8ce04d0550ad020f1948efd31b683731f7fe5.
Versión: appgprj_6aa5644aa5f08191b2fbd76b825d27f1~appgver_b4949c0689508191b131371820e21b3e.
Despliegue: appgdep_6ab4187de03c819194b09414e3f107ae.
Se conservó el acceso privado del sitio actual. La publicación de uxspa.cl sigue pendiente de inicio de sesión en cPanel.
