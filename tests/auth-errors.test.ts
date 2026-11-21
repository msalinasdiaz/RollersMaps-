import { describe, expect, it } from 'vitest';
import { authErrorMessage } from '@/lib/auth-errors';

describe('Mensajes de autenticación', () => {
  it.each([
    [{ code: 'over_email_send_rate_limit', status: 429 }, /servicio de correo.*límite de envíos/i],
    ['Email rate limit exceeded', /servicio de correo.*límite de envíos/i],
    [{ message: 'Too many emails sent' }, /servicio de correo.*límite de envíos/i],
    [{ code: 'over_request_rate_limit' }, /demasiadas solicitudes/i],
    [{ status: 429 }, /demasiadas solicitudes/i],
    ['Too many requests', /demasiadas solicitudes/i],
    [{ code: 'email_address_not_authorized' }, /administración.*habilitar el envío/i],
    ['Email address is not authorized', /administración.*habilitar el envío/i],
    [{ code: 'email_not_confirmed' }, /confirma el correo/i],
    ['Email not confirmed', /confirma el correo/i],
    [{ code: 'invalid_credentials' }, /revisa tu correo y contraseña/i],
    ['Invalid login credentials', /revisa tu correo y contraseña/i],
    [{ code: 'user_already_exists' }, /ya tiene una cuenta/i],
    [{ code: 'email_exists' }, /ya tiene una cuenta/i],
    ['User already registered', /ya tiene una cuenta/i],
    [{ code: 'email_address_invalid' }, /correo válida/i],
    ['Email address "example" is invalid', /correo válida/i],
    [{ code: 'validation_failed', message: 'Unable to validate email address: invalid format' }, /correo válida/i],
    [{ code: 'signup_disabled' }, /creación de cuentas.*deshabilitada/i],
    [{ code: 'email_provider_disabled' }, /creación de cuentas.*deshabilitada/i],
    ['Signups not allowed for this instance', /creación de cuentas.*deshabilitada/i],
    [{ code: 'weak_password' }, /contraseña más segura/i],
    ['Password should be at least 8 characters', /contraseña más segura/i],
    ['Password must contain uppercase characters', /contraseña más segura/i],
    [{ code: 'smtp_send_failed' }, /servicio de correo necesita revisión/i],
    [{ code: 'email_send_failed' }, /servicio de correo necesita revisión/i],
    ['Error sending confirmation email', /servicio de correo necesita revisión/i],
    ['SMTP authentication failed', /servicio de correo necesita revisión/i],
    [{ code: 'unexpected_failure', message: 'Database error saving new user' }, /crear tu cuenta.*problema del servicio/i],
    [{ code: 'database_save_error' }, /crear tu cuenta.*problema del servicio/i],
    [new TypeError('Network request failed'), /revisa tu conexión/i],
    [new TypeError('Failed to fetch'), /revisa tu conexión/i],
    [{ code: 'request_timeout' }, /revisa tu conexión/i],
    [{ name: 'AuthRetryableFetchError', status: 0 }, /revisa tu conexión/i],
    [{ name: 'AbortError' }, /revisa tu conexión/i],
  ])('traduce %j de forma comprensible', (error, expected) => {
    expect(authErrorMessage(error)).toMatch(expected);
  });

  it('distingue la cuota de correos de una espera corta entre solicitudes', () => {
    const result = authErrorMessage({ code: 'over_email_send_rate_limit', status: 429, message: 'retry after 60 seconds' });
    expect(result).toMatch(/límite de envíos/i);
    expect(result).not.toMatch(/\d|segundo|minuto/i);
  });

  it.each([
    { code: 'otp_expired' },
    { code: 'flow_state_expired' },
    { code: 'flow_state_not_found' },
    { code: 'validation_failed', message: 'Email link is invalid or has expired' },
    { code: 'validation_failed', message: 'Invalid or expired link' },
    { message: 'Confirmation link already used' },
    { message: 'OTP has expired' },
    { message: 'Flow state not found' },
  ])('explica cómo recuperar un enlace vencido o usado: %j', error => {
    expect(authErrorMessage(error)).toBe('El enlace de confirmación venció o ya fue usado. Solicita un nuevo correo e inténtalo otra vez.');
  });

  it.each([
    { code: 'bad_code_verifier' },
    { message: 'Code verifier does not match expected value' },
    { message: 'Code verifier missing' },
  ])('ofrece una acción para un enlace PKCE abierto en otro dispositivo: %j', error => {
    expect(authErrorMessage(error)).toBe('Abre el enlace desde el mismo teléfono donde creaste la cuenta. Si no funciona, solicita un nuevo correo de confirmación.');
  });

  it('no expone los tokens presentes en un error de confirmación', () => {
    const result = authErrorMessage({ code: 'validation_failed', message: 'Email link is invalid or expired: access_token=private-token private@example.cl' });
    expect(result).toMatch(/enlace de confirmación venció/i);
    expect(result).not.toMatch(/private|token|@/i);
  });

  it('prioriza un código conocido sobre el mensaje y el estado HTTP', () => {
    expect(authErrorMessage({ code: 'EMAIL_ADDRESS_NOT_AUTHORIZED', status: 429, message: 'Invalid login credentials' })).toMatch(/administración.*habilitar el envío/i);
  });

  it.each([null, undefined, 42, {}, { code: 'toString' }, { code: '__proto__' }, { name: 'AuthRetryableFetchError', status: 503 }])('acepta errores incompletos sin inventar su causa: %j', error => {
    expect(authErrorMessage(error)).toBe('No pudimos completar la solicitud. Inténtalo nuevamente más tarde.');
  });

  it.each([
    'Private auth failure: password=secret123 access_token=private-token',
    { code: 'unexpected_failure', message: 'Internal auth secret=private-token for private@example.cl' },
    { code: 'unknown_new_code', message: 'private@example.cl password=secret123', status: 500 },
  ])('no devuelve datos internos de errores desconocidos', error => {
    const result = authErrorMessage(error);
    expect(result).toBe('No pudimos completar la solicitud. Inténtalo nuevamente más tarde.');
    expect(result).not.toMatch(/private|secret|token|@|password=/i);
  });
});
