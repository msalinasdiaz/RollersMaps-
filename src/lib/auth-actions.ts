import type { SupabaseClient } from '@supabase/supabase-js';
import { authErrorMessage } from './auth-errors';
import { LEGAL_VERSION } from './legal';

type AuthClient = Pick<SupabaseClient['auth'], 'signUp' | 'resend'>;
export type SignUpResult = { confirmationSent: boolean; error: string | null };

export function validAuthEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export async function registerAccount(auth: AuthClient, displayName: string, email: string, password: string, redirectTo: string, acceptedTerms: boolean): Promise<SignUpResult> {
  if (!acceptedTerms) return { confirmationSent: false, error: 'Revisa y acepta los términos y la política de privacidad antes de crear tu cuenta.' };
  try {
    const { data, error } = await auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { display_name: displayName.trim(), terms_version: LEGAL_VERSION }, emailRedirectTo: redirectTo },
    });
    if (error) return { confirmationSent: false, error: authErrorMessage(error) };
    if (!data.user) return { confirmationSent: false, error: 'No pudimos completar el registro. Inténtalo nuevamente.' };
    return { confirmationSent: !data.session, error: null };
  } catch (error) {
    return { confirmationSent: false, error: authErrorMessage(error) };
  }
}

export async function resendAccountConfirmation(auth: AuthClient, email: string, redirectTo: string): Promise<string | null> {
  try {
    const { error } = await auth.resend({
      type: 'signup', email: email.trim().toLowerCase(), options: { emailRedirectTo: redirectTo },
    });
    return error ? authErrorMessage(error) : null;
  } catch (error) {
    return authErrorMessage(error);
  }
}
