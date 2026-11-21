import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { authErrorMessage } from './auth-errors';

type LinkAuthClient = Pick<SupabaseClient['auth'], 'exchangeCodeForSession' | 'setSession'>;

const recoveryLinkIncomplete = 'El enlace de recuperación está incompleto. Solicita un nuevo correo desde «Olvidé mi contraseña».';
const invalidLink = 'Este enlace de cuenta no es válido. Abre el enlace original que recibiste.';
const authParameters = ['code', 'access_token', 'refresh_token', 'type', 'error', 'error_code'];

function allowedAuthDestination(parsed: URL): boolean {
  if (parsed.protocol !== 'rollersmaps:' || parsed.username || parsed.password || parsed.port) return false;
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.replace(/\/+$/, '');
  return (host === '' && (path === '' || path === '/reset-password' || path === '/auth'))
    || ((host === 'reset-password' || host === 'auth') && path === '');
}

function conflictingParameters(parsed: URL, hash: URLSearchParams): boolean {
  for (const key of authParameters) {
    const queryValues = parsed.searchParams.getAll(key);
    const hashValues = hash.getAll(key);
    if (queryValues.length > 1 || hashValues.length > 1 || (queryValues.length && hashValues.length)) return true;
  }
  const has = (key: string) => parsed.searchParams.has(key) || hash.has(key);
  return has('code') && (has('access_token') || has('refresh_token'));
}

function linkErrorMessage(error: unknown, isRecovery: boolean): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
  if (isRecovery && (code === 'otp_expired' || code === 'flow_state_expired' || code === 'flow_state_not_found')) {
    return 'El enlace de recuperación venció o ya fue usado. Solicita un nuevo correo desde «Olvidé mi contraseña».';
  }
  return authErrorMessage(error);
}

function recoveryUrl(parsed: URL, hash: URLSearchParams): boolean {
  const type = parsed.searchParams.get('type') ?? hash.get('type');
  const path = parsed.pathname.replace(/\/+$/, '');
  return type === 'recovery' || parsed.hostname === 'reset-password' || path === '/reset-password';
}

export function isPasswordRecoveryLink(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hash = new URLSearchParams(parsed.hash.replace(/^#/, ''));
    return allowedAuthDestination(parsed) && !conflictingParameters(parsed, hash) && recoveryUrl(parsed, hash);
  } catch {
    return false;
  }
}

export async function completeAuthLink(
  auth: LinkAuthClient,
  url: string,
  onRecoverySession?: (session: Session) => void,
  beforeImplicitSession?: (accessToken: string) => Promise<boolean>,
): Promise<string | null> {
  let isRecovery = false;
  try {
    const parsed = new URL(url);
    const hash = new URLSearchParams(parsed.hash.replace(/^#/, ''));
    if (!allowedAuthDestination(parsed)) return authParameters.some((key) => parsed.searchParams.has(key) || hash.has(key)) ? invalidLink : null;
    if (conflictingParameters(parsed, hash)) return invalidLink;
    const param = (key: string) => parsed.searchParams.get(key) ?? hash.get(key);
    isRecovery = recoveryUrl(parsed, hash);
    if (param('error') || param('error_code')) {
      return linkErrorMessage({ code: param('error_code'), message: param('error_description') }, isRecovery);
    }
    const code = param('code');
    if (code) {
      const { data, error } = await auth.exchangeCodeForSession(code);
      if (error) return linkErrorMessage(error, isRecovery);
      if (isRecovery) {
        if (!data?.session) return recoveryLinkIncomplete;
        onRecoverySession?.(data.session);
      }
      return null;
    }
    const accessToken = param('access_token');
    const refreshToken = param('refresh_token');
    if (accessToken && refreshToken) {
      if (beforeImplicitSession && !await beforeImplicitSession(accessToken)) return null;
      const { data, error } = await auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (error) return linkErrorMessage(error, isRecovery);
      if (isRecovery) {
        if (!data?.session) return recoveryLinkIncomplete;
        onRecoverySession?.(data.session);
      }
      return null;
    }
    if (isRecovery) return recoveryLinkIncomplete;
    if (accessToken || refreshToken) return 'El enlace está incompleto. Solicita un nuevo correo de confirmación.';
    return null;
  } catch (error) {
    return linkErrorMessage(error, isRecovery);
  }
}
