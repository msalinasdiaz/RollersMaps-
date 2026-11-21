const messages = {
  emailLimit: 'El servicio de correo alcanzó su límite de envíos. Espera e inténtalo más tarde.',
  requestLimit: 'Se hicieron demasiadas solicitudes. Espera un momento antes de intentarlo nuevamente.',
  emailNotAuthorized: 'El servicio de correo aún no permite registrar esta dirección. La administración debe habilitar el envío para nuevos usuarios.',
  emailNotConfirmed: 'Confirma el correo que te enviamos antes de ingresar. Puedes solicitar un nuevo correo de confirmación.',
  confirmationLinkExpired: 'El enlace de confirmación venció o ya fue usado. Solicita un nuevo correo e inténtalo otra vez.',
  confirmationVerifier: 'Abre el enlace desde el mismo teléfono donde creaste la cuenta. Si no funciona, solicita un nuevo correo de confirmación.',
  invalidCredentials: 'Revisa tu correo y contraseña e inténtalo de nuevo.',
  alreadyRegistered: 'Este correo ya tiene una cuenta. Inicia sesión con ese correo.',
  invalidEmail: 'Ingresa una dirección de correo válida.',
  signupDisabled: 'La creación de cuentas está deshabilitada temporalmente. Inténtalo más tarde.',
  weakPassword: 'Usa una contraseña más segura, con mayúsculas, minúsculas, números y símbolos.',
  emailSendFailed: 'No pudimos enviar el correo. El servicio de correo necesita revisión; inténtalo más tarde.',
  databaseSaveFailed: 'No pudimos crear tu cuenta por un problema del servicio. Inténtalo más tarde.',
  network: 'No pudimos conectar. Revisa tu conexión e inténtalo nuevamente.',
  fallback: 'No pudimos completar la solicitud. Inténtalo nuevamente más tarde.',
};

const codeMessages: Record<string, string> = {
  over_email_send_rate_limit: messages.emailLimit,
  over_request_rate_limit: messages.requestLimit,
  email_address_not_authorized: messages.emailNotAuthorized,
  email_not_confirmed: messages.emailNotConfirmed,
  otp_expired: messages.confirmationLinkExpired,
  flow_state_expired: messages.confirmationLinkExpired,
  flow_state_not_found: messages.confirmationLinkExpired,
  bad_code_verifier: messages.confirmationVerifier,
  invalid_credentials: messages.invalidCredentials,
  email_exists: messages.alreadyRegistered,
  user_already_exists: messages.alreadyRegistered,
  email_address_invalid: messages.invalidEmail,
  signup_disabled: messages.signupDisabled,
  email_provider_disabled: messages.signupDisabled,
  weak_password: messages.weakPassword,
  email_send_failed: messages.emailSendFailed,
  smtp_send_failed: messages.emailSendFailed,
  database_save_error: messages.databaseSaveFailed,
  network_error: messages.network,
  request_timeout: messages.network,
};

/** Converts Auth failures to fixed messages without exposing backend details. */
export function authErrorMessage(error: unknown): string {
  const details = typeof error === 'object' && error !== null
    ? error as { code?: unknown; message?: unknown; status?: unknown; name?: unknown }
    : {};
  const code = typeof details.code === 'string' ? details.code.toLowerCase() : '';
  const message = (typeof error === 'string' ? error : typeof details.message === 'string' ? details.message : '').toLowerCase();
  const name = typeof details.name === 'string' ? details.name : '';

  if (Object.prototype.hasOwnProperty.call(codeMessages, code)) return codeMessages[code];

  // Older Auth responses do not always include an error code.
  if (/email.*(?:rate limit|too many|limit.*(?:exceeded|reached))|(?:rate limit|too many).*email/.test(message)) return messages.emailLimit;
  if (/email (?:address )?(?:is )?not authorized|not authorized to (?:send|receive).*email/.test(message)) return messages.emailNotAuthorized;
  if (/email (?:is )?not confirmed|unconfirmed email/.test(message)) return messages.emailNotConfirmed;
  if (/code verifier.*(?:invalid|does not match|missing|non-empty)/.test(message)) return messages.confirmationVerifier;
  if (/(?:link|otp).*?(?:expired|invalid|already (?:used|consumed))|(?:expired|invalid).*?link|flow state.*(?:expired|not found)/.test(message)) return messages.confirmationLinkExpired;
  if (/invalid (?:login )?credentials/.test(message)) return messages.invalidCredentials;
  if (/(?:user|email|account).*(?:already (?:registered|exists)|has already been registered)/.test(message)) return messages.alreadyRegistered;
  if (/invalid email|email.*(?:invalid|not valid)|(?:unable to validate|invalid).*email/.test(message)) return messages.invalidEmail;
  if (/sign\s?ups?.*(?:disabled|not allowed)|email (?:provider|logins?).*disabled/.test(message)) return messages.signupDisabled;
  if (/weak password|password.*(?:too (?:short|weak)|at least|minimum|must (?:contain|include)|should be)/.test(message)) return messages.weakPassword;
  if (/smtp|(?:error|failed|failure|unable).*(?:send|sending).*email|email.*(?:send|delivery).*(?:failed|failure|error)/.test(message)) return messages.emailSendFailed;
  if (/database error.*(?:sav|creat)|(?:sav|creat).*user.*database|profiles.*constraint/.test(message)) return messages.databaseSaveFailed;
  if (details.status === 429 || /too many requests|rate limit (?:exceeded|reached)/.test(message)) return messages.requestLimit;
  if (/network request failed|failed to fetch|fetch failed|network error|request (?:timed out|timeout)|connection (?:failed|lost)|offline/.test(message)
    || name === 'AbortError' || name === 'TimeoutError'
    || (name === 'AuthRetryableFetchError' && (details.status === 0 || details.status === undefined))) return messages.network;

  return messages.fallback;
}
