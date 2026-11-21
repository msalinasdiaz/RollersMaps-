import { supabase } from './supabase';
import { LEGAL_VERSION } from './legal';
export type ContentKind = 'group' | 'activity' | 'user';
export const reportReasons = { harassment: 'Acoso o amenazas', sexual_content: 'Contenido sexual', violence: 'Violencia', discrimination: 'Discriminación', privacy: 'Datos privados', fraud: 'Fraude o suplantación', other: 'Otro motivo' };
export type ReportReason = keyof typeof reportReasons;
export async function hasAcceptedTerms(): Promise<boolean> { const { data, error } = await supabase.rpc('has_accepted_terms'); if (error) throw new Error('No pudimos comprobar tu aceptación. Reintenta con conexión.'); return data === true; }
export async function acceptCurrentTerms(): Promise<void> { const { error } = await supabase.rpc('accept_terms', { p_version: LEGAL_VERSION }); if (error) throw new Error('No pudimos guardar tu aceptación. Inténtalo nuevamente.'); }
export async function submitContentReport(kind: ContentKind, targetId: string, reason: ReportReason, details = '') { const { error } = await supabase.rpc('submit_content_report', { p_kind: kind, p_target_id: targetId, p_reason: reason, p_details: details.trim() }); if (error) throw new Error('No pudimos enviar el reporte. Comprueba el contenido y el límite de 20 reportes diarios.'); }
export async function blockUser(userId: string) { const { error } = await supabase.rpc('set_user_block', { p_user_id: userId, p_blocked: true });if (error) throw new Error('No pudimos bloquear esta cuenta.'); }
export async function unblockUser(userId: string) { const { error } = await supabase.rpc('set_user_block', { p_user_id: userId, p_blocked: false });if (error) throw new Error('No pudimos desbloquear esta cuenta.'); }
