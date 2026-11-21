import { supabase } from './supabase';
export type AccountDeletionStatus = { pending: boolean; owned_groups: { id: string; name: string }[] };
export const DELETE_ACCOUNT_CONFIRMATION = 'ELIMINAR MI CUENTA';
export class AccountDeletionPendingError extends Error {}
export async function getAccountDeletionStatus(): Promise<AccountDeletionStatus> { const { data, error } = await supabase.rpc('get_account_deletion_status'); if (error || !data || !Array.isArray(data.owned_groups)) throw new Error('No pudimos comprobar tu cuenta. Reintenta con conexión.'); return data as AccountDeletionStatus; }
export async function requestAccountDeletion(confirmation: string): Promise<void> {
  if (confirmation.trim() !== DELETE_ACCOUNT_CONFIRMATION) throw new Error('Escribe ELIMINAR MI CUENTA para confirmar.');
  const { data, error } = await supabase.functions.invoke('delete-account', { body: { confirmation: DELETE_ACCOUNT_CONFIRMATION } });
  if (error || data?.deleted !== true) {
    let code = data?.error;let pending=data?.deletion_pending===true;
    if (error && 'context' in error && error.context instanceof Response) { try { const result=await error.context.json();code=result.error;pending=result.deletion_pending===true; } catch { /* Fixed fallback does not leak server details. */ } }
    if (code === 'owned_groups') throw new Error('Transfiere primero los grupos de los que eres dueño. Puedes pedir ayuda a soporte.');
    if (code === 'reauthenticate' || code === 'unauthorized') throw new Error('Vuelve a iniciar sesión antes de eliminar la cuenta.');
    const message='No pudimos confirmar la eliminación. La solicitud está en la cola de soporte; escribe a rollersmaps.cl@gmail.com para confirmar su estado. No necesitas repetirla con la sesión anterior.';
    if(pending)throw new AccountDeletionPendingError(message);
    throw new Error('No pudimos iniciar la eliminación. Revisa tu conexión o contacta rollersmaps.cl@gmail.com.');
  }
}
