# RollersMaps: registro público y Google Maps
23 de septiembre de 2026 · Decisión propuesta y preparación

## Recomendación
Conservar Supabase, conectar un proveedor de correo transaccional y añadir después el acceso con Google. Para mapas, usar el SDK nativo de Google sin Map ID y dibujar nuestros puntos GPS localmente. Esta entrega prepara la separación del mapa; todavía utiliza MapLibre/OpenFreeMap y no activa cobros ni proveedores nuevos.

## Qué está comprobado hoy
La configuración pública de Auth responde correctamente: registro habilitado, confirmación de correo requerida, correo habilitado y acceso con Google deshabilitado. Esa consulta no permite identificar el proveedor SMTP actual ni su cuota: esto se debe comprobar en el panel antes de atribuirle la causa de los bloqueos.

Hay tres límites distintos: espera entre reenvíos, cuota de correos y pausa del proyecto gratuito por inactividad. No se solucionan todos contratando un plan.

El correo predeterminado de Supabase sirve para pruebas: limita destinatarios a miembros autorizados del equipo y permite actualmente dos mensajes por hora. Un SMTP propio permite enviar a otros destinatarios, pero comienza con una cuota de Auth de 30 mensajes/hora que debe ajustarse al volumen previsto. [SMTP de Supabase](https://supabase.com/docs/guides/auth/auth-smtp).

La espera habitual de 60 segundos para volver a solicitar determinados correos es una protección de Auth; debe mostrarse con un contador y un mensaje claro, manteniendo la confirmación de correo. [Límites de Auth](https://supabase.com/docs/guides/auth/rate-limits).

## Correo: comparación de costos
USD, antes de impuestos y dominio; precios consultados en la fecha indicada. Los reenvíos y recuperaciones también consumen mensajes.

| Opción | Precio base | Cuándo elegirla |
|---|---:|---|
| Resend Free | USD 0; 3.000 mensajes/mes, máximo 100/día | Piloto pequeño, con altas escalonadas. |
| Resend Pro | Desde USD 20/mes; 50.000 mensajes, sin tope diario del plan | Lanzamiento con configuración sencilla. Revisar excedentes. |
| Amazon SES, tarifa por uso | USD 0,10 por 1.000 mensajes, más datos y extras | Menor costo variable, con más preparación técnica. |

Fuentes: [Resend](https://resend.com/pricing) y [Amazon SES](https://aws.amazon.com/ses/pricing/). Ejemplo calculado: 10.000 correos en SES cuestan aproximadamente USD 1 de envío base, antes de datos y extras.

SES exige salir del entorno de pruebas para enviar libremente. Dentro de ese entorno hay restricciones de destinatarios y cuotas. [Acceso a producción de SES](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html).

Mi elección: Resend gratuito para probar con pocas personas; SES si la prioridad es costo y podemos preparar su habilitación antes del lanzamiento. Resend Pro es la opción más simple si se necesita abrir registros rápidamente y superar 100 correos diarios. Ningún proveedor garantiza entregabilidad absoluta.

## Supabase frente a cambiar de plataforma
Supabase Free incluye 50.000 usuarios activos mensuales y una base de 500 MB, pero puede pausarse tras una semana de inactividad. Pro parte de USD 25/mes para un primer proyecto Micro, incorpora 8 GB de disco y respaldos diarios conservados siete días. Recursos extra pueden aumentar el total. [Precios de Supabase](https://supabase.com/pricing).

Para el piloto podemos continuar gratis con SMTP propio. Para apertura pública sostenida recomiendo presupuestar Pro por continuidad y respaldos. Esto no reemplaza el proveedor SMTP.

Firebase Auth es una alternativa, pero también tiene cuotas: por ejemplo, Spark limita ciertos correos de verificación y recuperación. Migrar implica revisar usuarios, sesiones y permisos que hoy se apoyan en Supabase. Mi evaluación: el ahorro no justifica esa migración en esta etapa. [Cuotas oficiales de Firebase Auth](https://firebase.google.com/docs/auth/limits).

Antes de subir plan por cantidad de usuarios, medir tamaño de recorridos, base y transferencia. Los trazados GPS pueden consumir almacenamiento mucho antes de agotar la cuota de usuarios.

## Implementación del registro, en orden
1. Confirmar dominio propio y acceso a sus registros DNS; quedó consultado al propietario.
2. Configurar un remitente y autenticar el dominio con los registros que entregue el proveedor. Guardar credenciales SMTP únicamente en Supabase.
3. Ajustar cuotas de Auth según el proveedor y el pico esperado de altas, conservando protección contra abuso y evitando reintentos automáticos repetidos.
4. Revisar confirmación y recuperación: enlace hacia la app, sesión restaurada, enlaces vencidos, reenvío con contador y mensajes comprensibles.
5. Probar con cuentas de prueba y distintos proveedores de correo: alta, confirmación, inicio, cierre y recuperación. No enviar pruebas a destinatarios ajenos.
6. Añadir acceso con Google, conservando correo como alternativa. Configurar OAuth y enlaces permitidos de forma independiente de las claves de Maps. [Guía de Google y Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google).
7. Hacer un piloto acotado, observar rechazos/latencia y abrir gradualmente. Activar Pro cuando corresponda a continuidad, capacidad y presupuesto.

## Google Maps: elección de integración
El SKU Maps SDK tiene uso gratuito ilimitado en la lista vigente. En Android/iOS corresponde al mapa cargado sin Map ID. Usar Map ID cambia la carga al SKU Dynamic Maps, que tiene 10.000 cargas gratuitas al mes y después USD 7 por 1.000 en el primer tramo. La versión web también usa Dynamic Maps. [Precios](https://developers.google.com/maps/billing-and-pricing/pricing) y [condiciones de cada SKU](https://developers.google.com/maps/billing-and-pricing/sku-details).

Ejemplo calculado: 1.000 personas que abren el mapa 20 veces suman 20.000 cargas/mes. Con el mapa nativo básico, el SKU indicado cuesta USD 0. Si esas cargas fueran Dynamic Maps, serían aproximadamente USD 70. No incluye búsquedas, rutas, navegación u otros servicios.

Se requiere una cuenta de facturación y una clave válida aunque el uso básico indicado no tenga cobro. [Facturación Android](https://developers.google.com/maps/documentation/android-sdk/usage-and-billing).

### Optimización propuesta
- Usar react-native-maps compatible con Expo 57 y proveedor Google, sin Map ID. El componente TrackingMap creado en esta revisión separa presentación y almacenamiento para facilitar el cambio. Revisar también mapa principal e imagen para compartir. [Integración Expo](https://docs.expo.dev/versions/v57.0.0/sdk/map-view/).
- Calcular distancia, velocidad y tiempo en el teléfono. Dibujar los segmentos grabados como líneas propias. No llamar Routes, Directions ni Roads por cada punto GPS.
- Mantener el guardado local y sincronizar el recorrido terminado. La pantalla de datos no necesita montar un mapa.
- En el historial, cargar primero resúmenes y descargar el trazado al abrir un recorrido; es una optimización pendiente. Simplificar solo la geometría de visualización, preservando el registro original.
- Habilitar inicialmente solo Maps SDK para Android/iOS. Agregar Places o rutas calculadas solo cuando exista una función concreta que los necesite.
- Separar claves por plataforma y entorno; restringir Android por paquete y certificado, iOS por identificador y cada clave por API. [Seguridad de claves](https://developers.google.com/maps/api-security-best-practices).
- Mantener visibles logotipo y atribución. Revisar las condiciones específicas antes de migrar imágenes compartidas o funciones sin conexión. [Políticas de Android](https://developers.google.com/maps/documentation/android-sdk/policies).

Configurar alertas y cuotas por API para las funciones pagadas. Un presupuesto de solo alertas no detiene cargos. Los nuevos topes de gasto de Cloud Billing solo cubren servicios elegibles; la lista actual no incluye Maps, por lo que no debemos depender de ellos para bloquear sus cobros. [Presupuestos](https://docs.cloud.google.com/billing/docs/how-to/budgets) y [servicios elegibles](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps).

## Estado al entregar
Preparación y evaluación terminadas. Pendientes para activar servicios: dominio/remitente, proveedor SMTP, proyecto Google Cloud con facturación y claves restringidas. Todavía no se cambió el proveedor de mapas ni la configuración de Auth. El siguiente paso es configurar el registro público, comprobarlo de extremo a extremo y luego integrar Google Maps.
