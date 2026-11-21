import type { SupabaseClient } from '@supabase/supabase-js';
import { validAuthEmail } from '@/lib/auth-actions';
import { authErrorMessage } from '@/lib/auth-errors';

type RecoveryEmailAuth = Pick<SupabaseClient['auth'], 'resetPasswordForEmail'>;
type RecoveredPasswordAuth = Pick<SupabaseClient['auth'], 'updateUser'>;

function passwordChangeErrorMessage(error: unknown): string {
  const details = typeof error === 'object' && error !== null
    ? error as { code?: unknown; name?: unknown }
    : {};
  if (details.code === 'same_password') return 'Elige una contraseña diferente a la anterior.';
  if (['otp_expired', 'flow_state_expired', 'flow_state_not_found', 'session_expired', 'session_not_found', 'refresh_token_not_found', 'refresh_token_already_used'].includes(String(details.code))
    || details.name === 'AuthSessionMissingError') {
    return 'El enlace de recuperación venció o ya fue usado. Solicita uno nuevo para cambiar tu contraseña.';
  }
  return authErrorMessage(error);
}

/** Requests one recovery email; callers show the same success message for every address. */
export async function requestPasswordRecovery(auth: RecoveryEmailAuth, email: string, redirectTo: string): Promise<string | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!validAuthEmail(normalizedEmail)) return 'Ingresa una dirección de correo válida.';

  try {
    const { error } = await auth.resetPasswordForEmail(normalizedEmail, { redirectTo });
    return error ? authErrorMessage(error) : null;
  } catch (error) {
    return authErrorMessage(error);
  }
}

/** Updates the password of the session established by the recovery link. */
export async function changeRecoveredPassword(auth: RecoveredPasswordAuth, password: string, confirmation: string): Promise<string | null> {
  if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if (password !== confirmation) return 'Las contraseñas no coinciden.';

  try {
    const { data, error } = await auth.updateUser({ password });
    if (error) return passwordChangeErrorMessage(error);
    if (!data?.user) return 'No pudimos actualizar tu contraseña. Abre nuevamente el enlace de recuperación e inténtalo otra vez.';
    return null;
  } catch (error) {
    return passwordChangeErrorMessage(error);
  }
}
