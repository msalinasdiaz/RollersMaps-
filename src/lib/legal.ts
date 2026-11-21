export const LEGAL_VERSION = '2026-10-06';
export const LEGAL_CONTACT = 'rollersmaps.cl@gmail.com';
export const LEGAL_RESPONSIBLE = 'Manuel Salinas';

export type LegalSection = 'privacy' | 'terms' | 'deletion';
export const legalDocuments: Record<LegalSection, { title: string; paragraphs: string[] }> = {
  privacy: {
    title: 'Privacidad',
    paragraphs: [
      `RollersMaps es una aplicación de patinaje administrada por ${LEGAL_RESPONSIBLE}. Consultas y solicitudes de privacidad: ${LEGAL_CONTACT}. Versión de esta política: ${LEGAL_VERSION}.`,
      'Tratamos tu correo para la cuenta y recuperación, nombre de perfil, pertenencia a grupos, inscripciones y contenido que publicas. Usamos Supabase para autenticación, base de datos y almacenamiento. No vendemos tus datos ni usamos tu ubicación para publicidad.',
      'El GPS registra coordenadas, fecha y métricas durante la grabación que tú inicias. Con permiso, continúa con la pantalla apagada y en segundo plano hasta pausar o finalizar. Los recorridos se conservan en el teléfono para funcionar sin conexión. El respaldo envía el trazado y sus métricas a tu cuenta privada en Supabase; los organizadores no reciben tu historial GPS privado.',
      'Google Maps se utiliza en el mapa Android. MapLibre y OpenFreeMap se utilizan en iPhone y para preparar imágenes compartidas. Las solicitudes de mapas se comunican con sus proveedores y pueden incluir dirección IP e información de la zona que consultas. Sus prácticas se rigen también por sus políticas. No activamos un servicio de venta de ubicación ni un SDK publicitario.',
      'Los nombres, descripciones y logos de grupos son visibles a otras cuentas según sus permisos; los calendarios requieren pertenencia al grupo. Los logos nuevos requieren revisión. Las imágenes que compartas voluntariamente incluyen mapa, extremos, fecha y métricas: revísalas antes de enviarlas. El destinatario conserva su copia fuera del control de RollersMaps.',
      'Conservamos datos de cuenta y recorridos mientras mantengas la cuenta. Puedes eliminarla desde Cuenta o solicitarlo al correo indicado, sin reinstalar la app. Antes de borrar una cuenta dueña de grupos, coordinamos la transferencia de propiedad para proteger a sus integrantes. No cerramos grupos automáticamente.',
      'La eliminación retira la cuenta, recorridos cloud, membresías, inscripciones e imágenes subidas. En el teléfono que ejecuta la eliminación se detiene GPS y se retiran sus datos locales. Otros teléfonos deben conectarse para reconocer la baja; puedes borrar los datos locales o desinstalar la app. Las copias que hayas compartido con terceros no se pueden retirar automáticamente.',
      'Los reportes y registros administrativos pueden conservarse para atender abuso y seguridad durante un máximo de 90 días, con identificadores del usuario eliminados al cerrar su cuenta. Las copias técnicas de seguridad del proveedor vencen según el servicio contratado; no se utilizan para reactivar tu cuenta. Puedes solicitar acceso, rectificación y eliminación escribiendo al contacto indicado; se verifica identidad antes de entregar datos o procesar cambios.',
      'Restringimos acceso según usuario y función, protegemos tokens en almacenamiento seguro del teléfono y usamos conexiones cifradas. Los permisos de ubicación y fotos se pueden cambiar en ajustes del sistema. La app no solicita cámara ni micrófono para logos. No publiques información privada de otras personas.',
    ],
  },
  terms: {
    title: 'Términos y reglas de comunidad',
    paragraphs: [
      `Responsable: ${LEGAL_RESPONSIBLE}. Contacto de soporte y moderación: ${LEGAL_CONTACT}. Versión: ${LEGAL_VERSION}. Debes aceptar estas reglas antes de crear o subir contenido.`,
      'RollersMaps permite organizar actividades y registrar recorridos. La ubicación y las métricas pueden fallar por señal, batería, permisos o condiciones del teléfono. No es una herramienta de emergencia ni garantiza seguridad del recorrido. Respeta normas de tránsito, condiciones de la ruta y uso de casco.',
      'Publica sólo información e imágenes que tengas derecho a utilizar. Queda prohibido contenido sexual explícito, amenazas, acoso, discriminación, violencia, explotación de menores, estafas, promoción de delitos y datos personales de terceros sin autorización. No uses grupos ni logos para suplantar identidad.',
      'Los grupos nuevos y logos se revisan antes de publicar. Los reportes permiten solicitar revisión de grupos, actividades y usuarios. La administración puede retirar contenido, suspender cuentas y restringir grupos por incumplimiento; se puede pedir revisión de una decisión al contacto de moderación. Revisamos reportes con prioridad según gravedad y procuramos responder dentro de 72 horas.',
      'Puedes bloquear usuarios para ocultar su contenido en tu cuenta y desbloquearlos desde Cuenta. La administración de un grupo puede además retirar o bloquear membresías. Un bloqueo personal no sustituye denunciar amenazas o abuso.',
      'El contenido de grupos y actividades se muestra a sus participantes según permisos. Al transferir un grupo, su información compartida sigue disponible a los integrantes. Al borrar tu cuenta se retiran tus datos y archivos asociados; los grupos se transfieren antes para no perjudicar a terceros. Las retenciones limitadas de seguridad se explican en Privacidad.',
      'Podemos actualizar estas reglas. Si cambia la versión de aceptación, será necesario revisar y aceptar nuevamente antes de publicar contenido. Las modificaciones no autorizan nuevos usos publicitarios de tu GPS sin información y consentimiento apropiados.',
    ],
  },
  deletion: {
    title: 'Eliminar mi cuenta',
    paragraphs: [
      `Puedes iniciar la eliminación desde Cuenta > Eliminar mi cuenta, o escribir a ${LEGAL_CONTACT} con el asunto «Eliminar mi cuenta de RollersMaps». La solicitud por correo funciona aunque hayas desinstalado la app. No envíes contraseñas ni documentos de identidad por correo.`,
      'Indica el correo de tu cuenta; verificaremos que la solicitud te pertenece antes de borrar. Si eres dueño de grupos, coordinaremos su transferencia. No cerramos grupos sin una decisión explícita. Puedes solicitar ayuda para esa transferencia sin reinstalar la app.',
      'Se eliminan cuenta, recorridos cloud, membresías, inscripciones e imágenes subidas. La app detiene el GPS y limpia tus recorridos locales en el teléfono que ejecuta la eliminación. No se pueden retirar copias que compartiste con otras personas. Los reportes de seguridad se anonimizan y vencen dentro de 90 días.',
      'La baja es irreversible. Si hay un fallo de red, no se mostrará una confirmación falsa; conserva el mensaje y contacta soporte para conocer el estado. Las solicitudes verificadas por soporte se atienden lo antes posible, con objetivo de resolución de siete días; la coordinación de propiedad de grupos puede necesitar pasos adicionales que te informaremos.',
    ],
  },
};
