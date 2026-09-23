# Panel RollersMaps en uxspa.cl
23 de septiembre de 2026

## Publicado y verificado
Acceso: https://rollersmaps-admin.uxspa.cl/

El panel administrativo ya funciona en el hosting del propietario, con DNS y HTTPS activos. No depende de ChatGPT para ejecutarse. Se entra con la misma cuenta y contraseña de RollersMaps; las credenciales de cPanel no sirven para iniciar sesión en la app.

La pantalla de acceso es pública. El contenido administrativo requiere una sesión válida y los permisos de Supabase. El administrador general puede consultar todos los grupos y solicitudes, aprobar/rechazar y eliminar grupos con confirmación por nombre y auditoría. Los administradores de grupos conservan sus permisos propios.

## Despliegue
- Subdominio: rollersmaps-admin.uxspa.cl.
- DNS: creado en el alojamiento que administra uxspa.cl; resolución comprobada hacia 138.117.148.165.
- Carpeta asignada por cPanel: /home4/cux114846/public_html/rollersmaps-admin.uxspa.cl.
- Código de la compilación: 92f8ce04d0550ad020f1948efd31b683731f7fe5.
- Compilación: npm run build:cpanel; archivos estáticos, sin Node/PHP en ejecución.
- Se cargaron los siete archivos del paquete, incluidos .htaccess y los recursos de assets. No se cargaron variables de entorno, contraseñas, claves privadas, código del servidor ni una copia de la base de datos.
- AutoSSL solicitado y certificado verificado por navegador sin excepciones. TLS 1.3 para rollersmaps-admin.uxspa.cl.
- Comprobación: 2026-09-23T18:35:04.487Z.
- HTTP redirige a HTTPS; bloqueo de marcos externos y de listado de directorios; política de recursos limitada al propio sitio y Supabase.

La política del hosting ubica los subdominios dentro de public_html. Se creó una carpeta nueva para RollersMaps y no se reemplazaron archivos del sitio corporativo ni de la intranet. uxspa.cl conserva respuesta HTTP 200.

## Comprobaciones
- Los seis archivos descargables coinciden byte a byte con la compilación local. El servidor aplica la configuración del séptimo archivo, .htaccess.
- Acceso sin sesión y presentación a 1440 y 390 píxeles correctos, imágenes cargadas y sin errores de JavaScript.
- Conexión real con Supabase Auth y manejo de credenciales inválidas comprobados usando un correo ficticio. No se creó ninguna cuenta.
- Seis escenarios de interfaz sobre el sitio publicado: administrador general, móvil, administrador de grupo, error de permisos, error al eliminar y visitante sin sesión. Las respuestas de datos se simularon y las operaciones no llegaron a la base real.
- No se eliminaron grupos reales. La aceptación entrando con la cuenta personal del propietario queda pendiente.

## Datos y costos
Supabase sigue almacenando las cuentas, grupos y recorridos, con los permisos actuales. La base ya es independiente de ChatGPT. Cambiar el dominio no exige trasladar los datos ni contratar una base adicional en cPanel. No se contrataron servicios ni se modificó la facturación.

El dominio ya está disponible para autenticar un futuro remitente de correo. Sigue pendiente elegir/configurar SMTP y revisar el registro público de extremo a extremo. Google Maps también sigue pendiente de proyecto, facturación y claves restringidas. El informe de preparación detalla costos y optimización.

## Mantenimiento
Para una actualización, compilar y validar primero; respaldar los archivos publicados de esta carpeta; cargar los recursos nuevos y al final index.html; verificar HTTPS, acceso, permisos y conservar el paquete anterior para revertir. No cargar .env ni claves privadas. La carpeta de la web corporativa y sus demás archivos quedan fuera del despliegue.

El panel anterior en https://rollersmaps-admin.msalinasdiaz.chatgpt.site se conserva durante la transición. Ya no es necesario para utilizar el acceso del dominio propio.

## Evidencia entregada
- RollersMaps-Admin-cPanel-revision-26.zip: paquete publicado.
- Publicacion-panel-uxspa-revision-26.json: comprobaciones y sumas SHA256.
- Panel-RollersMaps-acceso-movil.png: captura del nuevo acceso.
- RollersMaps-Admin-codigo-revision-26.zip: copia del código versionado, sin secretos ni dependencias.

No se guardó la contraseña temporal en la documentación ni en los archivos del proyecto.
