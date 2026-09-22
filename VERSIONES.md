# Versiones de RollersMaps

Actualizado el 22 de septiembre de 2026.

**Avance actual: 1.4.0, revisión 23 — calendario semanal, logos y aprobación central de grupos.**

[Ver cambios y validación](docs/VALIDACION-REVISION-23.md). La última etiqueta publicada sigue siendo beta.2.

**Última etiqueta publicada: [v1.4.0-beta.2](https://github.com/msalinasdiaz/RollersMaps-/tree/v1.4.0-beta.2) — registro obligatorio.**
**Base estable Android: [v1.3.3](https://github.com/msalinasdiaz/RollersMaps-/tree/v1.3.3).**
**Variante iOS existente: [v1.3.3-ios](https://github.com/msalinasdiaz/RollersMaps-/tree/v1.3.3-ios).**

Cada etiqueta conserva una fotografía del código. Se puede consultar o descargar
desde [las etiquetas de GitHub](https://github.com/msalinasdiaz/RollersMaps-/tags).
Las versiones beta son avances de prueba y no una publicación en tiendas.

| Etiqueta | Revisión de la app | Qué permite distinguir |
|---|---:|---|
| [v1.4.0-beta.2](https://github.com/msalinasdiaz/RollersMaps-/tree/v1.4.0-beta.2) | 22 | Registro obligatorio; bienvenida; recuperación expresa de rutas antiguas; grupos y permisos activados en Supabase; 33 pruebas aprobadas. |
| [v1.4.0-beta.1](https://github.com/msalinasdiaz/RollersMaps-/tree/v1.4.0-beta.1) | 21 | Primer avance de grupos y calendarios privados, guardado de múltiples recorridos y sincronización; anterior al registro obligatorio. |
| [v1.3.3-ios](https://github.com/msalinasdiaz/RollersMaps-/tree/v1.3.3-ios) | 20 | Variante iOS mantenida en su rama propia, con adaptaciones y manual específicos. |
| [v1.3.3](https://github.com/msalinasdiaz/RollersMaps-/tree/v1.3.3) | 20 | Base estable Android: persistencia del GPS y correcciones al compartir actividades. |
| [v1.3.2](https://github.com/msalinasdiaz/RollersMaps-/tree/v1.3.2) | 19 | Pantalla dedicada de seguimiento GPS y reorganización de navegación. |
| [v1.3.0](https://github.com/msalinasdiaz/RollersMaps-/tree/v1.3.0) | 17 | Versión histórica con identidad visual, calendario, mapa e historial de actividades. |

No se creó una etiqueta 1.3.1 porque no hay un punto de entrega identificado con
esa versión en este historial.

## Cambios del avance actual

Comparación de [beta.1 con beta.2](https://github.com/msalinasdiaz/RollersMaps-/compare/v1.4.0-beta.1...v1.4.0-beta.2):

- Se requiere cuenta para mapa, GPS, historial, distancias, compartir y grupos.
- Tener cuenta no exige pertenecer a un grupo ni pagar una suscripción.
- El calendario de cada grupo exige membresía activa de ese grupo.
- La bienvenida ofrece crear cuenta e iniciar sesión.
- Los recorridos antiguos sin cuenta se conservan y se recuperan al confirmar
  «Son mis rutas». El respaldo en la nube es una acción independiente.
- Se activaron las migraciones de Supabase con respaldo previo, ensayo sobre
  una copia restaurada y comprobación de conservación y permisos.

El APK conserva versión interna 1.4.0 y revisión 22. La etiqueta beta.2 identifica
este avance de prueba; no cambia el instalador que ya fue compilado y validado.

Detalles: [manual](docs/MANUAL-1.4.0.md) e
[informe de validación](docs/VALIDACION-REGISTRO.md).

Siguen pendientes la aceptación completa con correo y cuentas reales, GPS con
pantalla bloqueada en teléfono físico, iOS y revisión de distribución.

## Cómo continuar

- `feature/1.4.0-groups`: trabajo actual de la versión 1.4.0.
- `main` y `android-stable-v1.3.3`: base estable Android.
- `ios-stable-v1.3.3`: variante iOS existente.
- Las etiquetas `backup/...` conservan los puntos previos a cambios importantes.

Las etiquetas publicadas no se moverán para reemplazar una versión: un nuevo
avance recibe una etiqueta nueva. Las carpetas del código no se duplican por
versión; Git conserva cada una completa.

El estado de Supabase se guarda por separado. Abrir una etiqueta antigua no
revierte la base de datos ni sus permisos. La beta.1 documenta el estado anterior:
sus instrucciones históricas no deben usarse para sobrescribir la configuración
actual.

Los respaldos privados de base, contraseñas, archivos de entorno y herramientas
temporales quedan fuera de Git. El repositorio contiene código, migraciones
y documentación.
