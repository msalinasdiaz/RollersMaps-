import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { completeAuthLink, isPasswordRecoveryLink } from '@/lib/auth-links';

function stub() {
  return { exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }), setSession: vi.fn().mockResolvedValue({ error: null }) };
}
function client(auth: ReturnType<typeof stub>) {
  return auth as unknown as Pick<SupabaseClient['auth'], 'exchangeCodeForSession' | 'setSession'>;
}
describe('Enlaces de confirmación', () => {
  it('intercambia código por sesión y propaga un rechazo del servidor', async () => {
    const auth = stub();
    auth.exchangeCodeForSession.mockResolvedValueOnce({ error: { code: 'flow_state_expired' } });
    expect(await completeAuthLink(client(auth), 'rollersmaps://?code=test-code')).toContain('enlace');
    expect(auth.exchangeCodeForSession).toHaveBeenCalledExactlyOnceWith('test-code');
    expect(auth.setSession).not.toHaveBeenCalled();
  });
  it('restaura la sesión de un enlace implícito', async () => {
    const auth = stub();
    expect(await completeAuthLink(client(auth), 'rollersmaps://#access_token=test-access&refresh_token=test-refresh')).toBeNull();
    expect(auth.setSession).toHaveBeenCalledExactlyOnceWith({ access_token: 'test-access', refresh_token: 'test-refresh' });
  });
  it.each(['#', '?'])('explica un enlace vencido en %s sin intentar iniciar sesión', async separator => {
    const auth = stub();
    const result = await completeAuthLink(client(auth), `rollersmaps://${separator}error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`);
    expect(result).toContain('enlace');
    expect(auth.setSession).not.toHaveBeenCalled();
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });
  it('captura fallos de red sin dejar una promesa rechazada ni exponer tokens', async () => {
    const auth = stub();
    auth.setSession.mockRejectedValueOnce(new TypeError('Network request failed'));
    const result = await completeAuthLink(client(auth), 'rollersmaps://#access_token=private&refresh_token=private');
    expect(result).toContain('conexión');
    expect(result).not.toContain('private');
  });
  it('un enlace incompleto pide otra confirmación', async () => {
    const auth = stub();
    expect(await completeAuthLink(client(auth), 'rollersmaps://#access_token=test-access')).toContain('incompleto');
    expect(auth.setSession).not.toHaveBeenCalled();
  });
  it('ignora enlaces de navegación que no son de autenticación', async () => {
    const auth = stub();
    expect(await completeAuthLink(client(auth), 'rollersmaps://auth')).toBeNull();
    expect(auth.setSession).not.toHaveBeenCalled();
  });
});

const recoverySession = {
  access_token: 'test-access', refresh_token: 'test-refresh', token_type: 'bearer',
  expires_in: 3600, user: { id: 'recovery-user' },
} as Session;

describe('Enlaces de recuperación de contraseña', () => {
  it.each([
    'rollersmaps://#type=recovery',
    'rollersmaps://?type=recovery',
    'rollersmaps://reset-password',
    'rollersmaps://reset-password/',
    'rollersmaps:///reset-password/',
  ])('reconoce el enlace de recuperación %s', url => {
    expect(isPasswordRecoveryLink(url)).toBe(true);
  });
  it.each([
    'rollersmaps://auth',
    'rollersmaps://#type=signup',
    'rollersmaps://?code=signin-code',
    'rollersmaps://reset-password-fake/',
    'not-a-url',
  ])('no confunde otro enlace con recuperación: %s', url => {
    expect(isPasswordRecoveryLink(url)).toBe(false);
  });
  it.each(['#', '?'])('la sesión implícita válida en %s habilita la recuperación después de validarla', async separator => {
    const auth = stub();
    const onRecoverySession = vi.fn();
    auth.setSession.mockResolvedValueOnce({ data: { session: recoverySession }, error: null });
    const result = await completeAuthLink(client(auth), `rollersmaps://${separator}type=recovery&access_token=test-access&refresh_token=test-refresh`, onRecoverySession);
    expect(result).toBeNull();
    expect(auth.setSession).toHaveBeenCalledExactlyOnceWith({ access_token: 'test-access', refresh_token: 'test-refresh' });
    expect(onRecoverySession).toHaveBeenCalledExactlyOnceWith(recoverySession);
  });
  it.each([
    'rollersmaps://reset-password/?code=recovery-code',
    'rollersmaps://?type=recovery&code=recovery-code',
    'rollersmaps://#type=recovery&code=recovery-code',
  ])('un código PKCE de recuperación sólo habilita la sesión validada: %s', async url => {
    const auth = stub();
    const onRecoverySession = vi.fn();
    auth.exchangeCodeForSession.mockResolvedValueOnce({ data: { session: recoverySession }, error: null });
    expect(await completeAuthLink(client(auth), url, onRecoverySession)).toBeNull();
    expect(auth.exchangeCodeForSession).toHaveBeenCalledExactlyOnceWith('recovery-code');
    expect(auth.setSession).not.toHaveBeenCalled();
    expect(onRecoverySession).toHaveBeenCalledExactlyOnceWith(recoverySession);
  });
  it.each([
    'rollersmaps://reset-password/',
    'rollersmaps://#type=recovery',
    'rollersmaps://#type=recovery&access_token=test-access',
    'rollersmaps://reset-password/#refresh_token=test-refresh',
  ])('un enlace incompleto no aprovecha ninguna sesión previa: %s', async url => {
    const auth = stub();
    const onRecoverySession = vi.fn();
    // Even a client capable of returning a current session must receive new link credentials.
    auth.setSession.mockResolvedValue({ data: { session: recoverySession }, error: null });
    const result = await completeAuthLink(client(auth), url, onRecoverySession);
    expect(result).toContain('recuperación está incompleto');
    expect(result).toContain('Olvidé mi contraseña');
    expect(auth.setSession).not.toHaveBeenCalled();
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(onRecoverySession).not.toHaveBeenCalled();
  });
  it.each([
    'rollersmaps://reset-password/#error=access_denied&error_code=otp_expired',
    'rollersmaps://?type=recovery&error=access_denied&error_code=otp_expired',
  ])('un enlace vencido nunca habilita la recuperación: %s', async url => {
    const auth = stub();
    const onRecoverySession = vi.fn();
    const result = await completeAuthLink(client(auth), url, onRecoverySession);
    expect(result).toContain('recuperación venció o ya fue usado');
    expect(result).toContain('nuevo correo desde «Olvidé mi contraseña»');
    expect(result).not.toContain('confirmación');
    expect(auth.setSession).not.toHaveBeenCalled();
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(onRecoverySession).not.toHaveBeenCalled();
  });
  it.each([
    'rollersmaps://reset-password/?code=recovery-code',
    'rollersmaps://reset-password/#access_token=test-access&refresh_token=test-refresh',
  ])('un éxito sin sesión válida no habilita la recuperación: %s', async url => {
    const auth = stub();
    const onRecoverySession = vi.fn();
    auth.exchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: null });
    auth.setSession.mockResolvedValue({ data: { session: null }, error: null });
    expect(await completeAuthLink(client(auth), url, onRecoverySession)).toContain('Olvidé mi contraseña');
    expect(onRecoverySession).not.toHaveBeenCalled();
  });
  it.each(['flow_state_expired', 'flow_state_not_found', 'otp_expired'])('un código rechazado con %s pide otro correo de recuperación', async code => {
    const auth = stub();
    const onRecoverySession = vi.fn();
    auth.exchangeCodeForSession.mockResolvedValueOnce({ data: { session: null }, error: { code } });
    const result = await completeAuthLink(client(auth), 'rollersmaps://reset-password/?code=recovery-code', onRecoverySession);
    expect(result).toContain('recuperación venció o ya fue usado');
    expect(result).toContain('nuevo correo desde «Olvidé mi contraseña»');
    expect(result).not.toContain('confirmación');
    expect(onRecoverySession).not.toHaveBeenCalled();
  });
  it('un fallo de red no habilita recuperación ni expone credenciales del enlace', async () => {
    const auth = stub();
    const onRecoverySession = vi.fn();
    auth.setSession.mockRejectedValueOnce(new TypeError('Network request failed'));
    const result = await completeAuthLink(client(auth), 'rollersmaps://reset-password/#access_token=private-access&refresh_token=private-refresh', onRecoverySession);
    expect(result).toContain('conexión');
    expect(result).not.toContain('private');
    expect(onRecoverySession).not.toHaveBeenCalled();
  });
  it.each([
    'rollersmaps://#access_token=test-access&refresh_token=test-refresh&type=signup',
    'rollersmaps://?code=signin-code',
  ])('una confirmación o inicio de sesión válido conserva su flujo normal: %s', async url => {
    const auth = stub();
    const onRecoverySession = vi.fn();
    auth.exchangeCodeForSession.mockResolvedValue({ data: { session: recoverySession }, error: null });
    auth.setSession.mockResolvedValue({ data: { session: recoverySession }, error: null });
    expect(await completeAuthLink(client(auth), url, onRecoverySession)).toBeNull();
    expect(onRecoverySession).not.toHaveBeenCalled();
  });
});

describe('Validación del destino de Auth', () => {
  it.each(['https://evil.example/reset-password/#access_token=a&refresh_token=b', 'rollersmaps://group#access_token=a&refresh_token=b', 'rollersmaps://reset-password?code=a#code=b', 'rollersmaps://?code=a&access_token=b&refresh_token=c'])('rechaza credenciales en destino o combinación inválida: %s', async url => {
    const auth = stub();
    expect(await completeAuthLink(client(auth), url)).toContain('no es válido');
    expect(auth.setSession).not.toHaveBeenCalled(); expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });
  it('ignora navegación ordinaria y no clasifica HTTPS desconocido como recuperación', async () => {
    const auth = stub();
    expect(await completeAuthLink(client(auth), 'rollersmaps://group?id=abc')).toBeNull();
    expect(isPasswordRecoveryLink('https://evil.example/reset-password')).toBe(false);
  });
  it('no cambia una sesión implícita cuando el usuario cancela la confirmación', async () => {
    const auth = stub();
    expect(await completeAuthLink(client(auth), 'rollersmaps://#access_token=a&refresh_token=b', undefined, async () => false)).toBeNull();
    expect(auth.setSession).not.toHaveBeenCalled();
  });
});
