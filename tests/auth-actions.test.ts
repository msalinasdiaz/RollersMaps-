import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { registerAccount, resendAccountConfirmation, validAuthEmail } from '@/lib/auth-actions';

function authStub(signUpResult: unknown) {
  return { signUp: vi.fn().mockResolvedValue(signUpResult), resend: vi.fn().mockResolvedValue({ error: null }) };
}
function client(stub: ReturnType<typeof authStub>) {
  return stub as unknown as Pick<SupabaseClient['auth'], 'signUp' | 'resend'>;
}

describe('Registro y confirmación', () => {
  it('sin aceptación no crea cuenta ni envía correo', async () => {
    const auth = authStub(null);
    expect((await registerAccount(client(auth), 'Fran', 'fran@example.invalid', 'synthetic-password', 'rollersmaps://', false)).error).toContain('acepta');
    expect(auth.signUp).not.toHaveBeenCalled();
  });
  it('normaliza correo y nombre, conserva la contraseña y dirige la confirmación a la app', async () => {
    const auth = authStub({ data: { user: { id: 'test-user' }, session: null }, error: null });
    expect(await registerAccount(client(auth), ' Fran Pérez ', ' FRAN@UXSPA.CL ', ' secret 123 ', 'rollersmaps://', true)).toEqual({ confirmationSent: true, error: null });
    expect(auth.signUp).toHaveBeenCalledExactlyOnceWith({ email: 'fran@uxspa.cl', password: ' secret 123 ', options: { data: { display_name: 'Fran Pérez', terms_version: '2026-10-06' }, emailRedirectTo: 'rollersmaps://' } });
  });
  it('una cuenta que ya recibe sesión no espera un correo', async () => {
    const auth = authStub({ data: { user: { id: 'test-user' }, session: { access_token: 'fake' } }, error: null });
    expect(await registerAccount(client(auth), 'Fran', 'fran@uxspa.cl', 'password123', 'rollersmaps://', true)).toEqual({ confirmationSent: false, error: null });
  });
  it('un rechazo del servidor nunca anuncia que envió confirmación ni reintenta automáticamente', async () => {
    const auth = authStub({ data: { user: null, session: null }, error: { code: 'over_email_send_rate_limit', message: 'Email rate limit exceeded' } });
    const result = await registerAccount(client(auth), 'Fran', 'fran@uxspa.cl', 'password123', 'rollersmaps://', true);
    expect(result.confirmationSent).toBe(false);
    expect(result.error).toBeTruthy();
    expect(auth.signUp).toHaveBeenCalledTimes(1);
  });
  it('una respuesta incompleta no se trata como una cuenta creada', async () => {
    const auth = authStub({ data: { user: null, session: null }, error: null });
    expect(await registerAccount(client(auth), 'Fran', 'fran@uxspa.cl', 'password123', 'rollersmaps://', true)).toEqual({ confirmationSent: false, error: 'No pudimos completar el registro. Inténtalo nuevamente.' });
  });
  it('la respuesta oculta para una dirección existente sigue siendo genérica', async () => {
    const auth = authStub({ data: { user: { id: 'obfuscated', identities: [] }, session: null }, error: null });
    expect(await registerAccount(client(auth), 'Fran', 'fran@uxspa.cl', 'password123', 'rollersmaps://', true)).toEqual({ confirmationSent: true, error: null });
  });
  it('un fallo de red permite reintentar sin inventar un envío de correo', async () => {
    const auth = authStub(null);
    auth.signUp.mockRejectedValueOnce(new TypeError('Network request failed'));
    const first = await registerAccount(client(auth), 'Fran', 'fran@uxspa.cl', 'password123', 'rollersmaps://', true);
    expect(first.confirmationSent).toBe(false);
    expect(first.error).toBeTruthy();
    auth.signUp.mockResolvedValueOnce({ data: { user: { id: 'test-user' }, session: null }, error: null });
    expect((await registerAccount(client(auth), 'Fran', 'fran@uxspa.cl', 'password123', 'rollersmaps://', true)).error).toBeNull();
  });
  it('reenvía expresamente al correo indicado usando el mismo enlace de regreso', async () => {
    const auth = authStub(null);
    expect(await resendAccountConfirmation(client(auth), ' FRAN@UXSPA.CL ', 'rollersmaps://')).toBeNull();
    expect(auth.resend).toHaveBeenCalledExactlyOnceWith({ type: 'signup', email: 'fran@uxspa.cl', options: { emailRedirectTo: 'rollersmaps://' } });
    expect(auth.signUp).not.toHaveBeenCalled();
  });
  it('un reenvío rechazado muestra un error y no se repite solo', async () => {
    const auth = authStub(null);
    auth.resend.mockResolvedValueOnce({ error: { code: 'over_request_rate_limit', status: 429 } });
    expect(await resendAccountConfirmation(client(auth), 'fran@uxspa.cl', 'rollersmaps://')).toBeTruthy();
    expect(auth.resend).toHaveBeenCalledTimes(1);
  });
  it.each(['sin-arroba', 'fran@', 'fran @uxspa.cl', 'fran@@uxspa.cl'])('detecta correo mal escrito: %s', email => {
    expect(validAuthEmail(email)).toBe(false);
  });
  it.each(['fran@uxspa.cl', ' fran+prueba@uxspa.cl ', 'fran.perez@example.org'])('acepta correo válido: %s', email => {
    expect(validAuthEmail(email)).toBe(true);
  });
});
