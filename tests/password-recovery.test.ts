import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { changeRecoveredPassword, requestPasswordRecovery } from '@/lib/password-recovery';

function recoveryEmailStub(result: unknown = { data: {}, error: null }) {
  return { resetPasswordForEmail: vi.fn().mockResolvedValue(result) };
}

function passwordStub(result: unknown = { data: { user: { id: 'recovered-user' } }, error: null }) {
  return { updateUser: vi.fn().mockResolvedValue(result) };
}

function recoveryAuth(stub: ReturnType<typeof recoveryEmailStub>) {
  return stub as unknown as Pick<SupabaseClient['auth'], 'resetPasswordForEmail'>;
}

function passwordAuth(stub: ReturnType<typeof passwordStub>) {
  return stub as unknown as Pick<SupabaseClient['auth'], 'updateUser'>;
}

describe('Solicitud de recuperación de contraseña', () => {
  it('normaliza el correo y solicita un único enlace de regreso a la app', async () => {
    const auth = recoveryEmailStub();
    expect(await requestPasswordRecovery(recoveryAuth(auth), ' FRAN+PRUEBA@UXSPA.CL ', 'rollersmaps://reset-password')).toBeNull();
    expect(auth.resetPasswordForEmail).toHaveBeenCalledExactlyOnceWith('fran+prueba@uxspa.cl', { redirectTo: 'rollersmaps://reset-password' });
  });

  it('acepta la respuesta neutra del servicio sin consultar si la cuenta existe', async () => {
    const auth = recoveryEmailStub({ data: {}, error: null });
    expect(await requestPasswordRecovery(recoveryAuth(auth), 'cuenta@example.org', 'rollersmaps://reset-password')).toBeNull();
    expect(auth.resetPasswordForEmail).toHaveBeenCalledTimes(1);
  });

  it.each(['', ' ', 'sin-arroba', 'fran@', 'fran @uxspa.cl', 'fran@@uxspa.cl'])('rechaza el correo inválido sin enviar una solicitud: %s', async email => {
    const auth = recoveryEmailStub();
    expect(await requestPasswordRecovery(recoveryAuth(auth), email, 'rollersmaps://reset-password')).toBe('Ingresa una dirección de correo válida.');
    expect(auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('muestra el límite de envíos y no reintenta automáticamente', async () => {
    const auth = recoveryEmailStub({ data: null, error: { code: 'over_email_send_rate_limit', message: 'Email rate limit exceeded' } });
    expect(await requestPasswordRecovery(recoveryAuth(auth), 'fran@uxspa.cl', 'rollersmaps://reset-password')).toBe('El servicio de correo alcanzó su límite de envíos. Espera e inténtalo más tarde.');
    expect(auth.resetPasswordForEmail).toHaveBeenCalledTimes(1);
  });

  it('traduce una excepción de red sin reintentar ni anunciar éxito', async () => {
    const auth = recoveryEmailStub();
    auth.resetPasswordForEmail.mockRejectedValueOnce(new TypeError('Network request failed'));
    expect(await requestPasswordRecovery(recoveryAuth(auth), 'fran@uxspa.cl', 'rollersmaps://reset-password')).toBe('No pudimos conectar. Revisa tu conexión e inténtalo nuevamente.');
    expect(auth.resetPasswordForEmail).toHaveBeenCalledTimes(1);
  });

  it('no expone detalles internos de un rechazo desconocido', async () => {
    const auth = recoveryEmailStub({ data: null, error: { message: 'Private backend detail: secret-token' } });
    const result = await requestPasswordRecovery(recoveryAuth(auth), 'fran@uxspa.cl', 'rollersmaps://reset-password');
    expect(result).toBeTruthy();
    expect(result).not.toContain('secret-token');
  });
});

describe('Cambio de contraseña recuperada', () => {
  it('envía sólo la contraseña exacta, conservando espacios', async () => {
    const auth = passwordStub();
    expect(await changeRecoveredPassword(passwordAuth(auth), ' secret 123 ', ' secret 123 ')).toBeNull();
    expect(auth.updateUser).toHaveBeenCalledExactlyOnceWith({ password: ' secret 123 ' });
  });

  it('acepta una contraseña de exactamente ocho caracteres', async () => {
    const auth = passwordStub();
    expect(await changeRecoveredPassword(passwordAuth(auth), 'Secret12', 'Secret12')).toBeNull();
    expect(auth.updateUser).toHaveBeenCalledExactlyOnceWith({ password: 'Secret12' });
  });

  it.each(['', 'abc', 'Secret1'])('rechaza una contraseña corta sin llamar al servicio: %s', async password => {
    const auth = passwordStub();
    expect(await changeRecoveredPassword(passwordAuth(auth), password, password)).toBe('La contraseña debe tener al menos 8 caracteres.');
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it.each(['otra clave', 'Secret123 ', 'secret123', ''])('rechaza una confirmación diferente sin llamar al servicio: %s', async confirmation => {
    const auth = passwordStub();
    expect(await changeRecoveredPassword(passwordAuth(auth), 'Secret123', confirmation)).toBe('Las contraseñas no coinciden.');
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('no anuncia éxito cuando la respuesta no contiene un usuario', async () => {
    const auth = passwordStub({ data: { user: null }, error: null });
    expect(await changeRecoveredPassword(passwordAuth(auth), 'Secret123', 'Secret123')).toBe('No pudimos actualizar tu contraseña. Abre nuevamente el enlace de recuperación e inténtalo otra vez.');
    expect(auth.updateUser).toHaveBeenCalledTimes(1);
  });

  it('traduce un rechazo de contraseña y no repite el cambio automáticamente', async () => {
    const auth = passwordStub({ data: { user: null }, error: { code: 'weak_password' } });
    expect(await changeRecoveredPassword(passwordAuth(auth), 'Secret123', 'Secret123')).toBe('Usa una contraseña más segura, con mayúsculas, minúsculas, números y símbolos.');
    expect(auth.updateUser).toHaveBeenCalledTimes(1);
  });

  it('pide una contraseña diferente si el servicio rechaza reutilizar la anterior', async () => {
    const auth = passwordStub({ data: { user: null }, error: { code: 'same_password' } });
    expect(await changeRecoveredPassword(passwordAuth(auth), 'Secret123', 'Secret123')).toBe('Elige una contraseña diferente a la anterior.');
    expect(auth.updateUser).toHaveBeenCalledTimes(1);
  });

  it.each(['otp_expired', 'flow_state_expired', 'flow_state_not_found', 'session_expired', 'session_not_found', 'refresh_token_not_found', 'refresh_token_already_used'])('pide otro enlace cuando ya no existe una sesión válida: %s', async code => {
    const auth = passwordStub({ data: { user: null }, error: { code } });
    expect(await changeRecoveredPassword(passwordAuth(auth), 'Secret123', 'Secret123')).toBe('El enlace de recuperación venció o ya fue usado. Solicita uno nuevo para cambiar tu contraseña.');
    expect(auth.updateUser).toHaveBeenCalledTimes(1);
  });

  it('traduce una sesión faltante identificada por el nombre del error', async () => {
    const auth = passwordStub();
    auth.updateUser.mockRejectedValueOnce({ name: 'AuthSessionMissingError', message: 'Internal session detail' });
    expect(await changeRecoveredPassword(passwordAuth(auth), 'Secret123', 'Secret123')).toBe('El enlace de recuperación venció o ya fue usado. Solicita uno nuevo para cambiar tu contraseña.');
    expect(auth.updateUser).toHaveBeenCalledTimes(1);
  });

  it('muestra errores aunque la respuesta contenga un usuario', async () => {
    const auth = passwordStub({ data: { user: { id: 'recovered-user' } }, error: { code: 'over_request_rate_limit' } });
    expect(await changeRecoveredPassword(passwordAuth(auth), 'Secret123', 'Secret123')).toBeTruthy();
    expect(auth.updateUser).toHaveBeenCalledTimes(1);
  });

  it('traduce una excepción de red sin anunciar éxito ni reintentar', async () => {
    const auth = passwordStub();
    auth.updateUser.mockRejectedValueOnce(new TypeError('Network request failed'));
    expect(await changeRecoveredPassword(passwordAuth(auth), 'Secret123', 'Secret123')).toBe('No pudimos conectar. Revisa tu conexión e inténtalo nuevamente.');
    expect(auth.updateUser).toHaveBeenCalledTimes(1);
  });
});
