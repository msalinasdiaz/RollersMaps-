import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { createDeleteAccountHandler, type StoredObject } from '../_shared/delete-account-handler.ts';
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
Deno.serve(createDeleteAccountHandler({
  verify: async (token) => {
    const { data, error } = await admin.auth.getUser(token); if (error || !data.user) return null;
    // Decode only after Auth has verified the token; metadata is never authorization.
    try { const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); if (claims.sub !== data.user.id || !uuid.test(claims.session_id)) return null; return { userId: data.user.id, sessionId: claims.session_id }; } catch { return null; }
  },
  prepare: async (userId, sessionId) => { const { data, error } = await admin.rpc('prepare_account_deletion', { p_user_id: userId, p_session_id: sessionId }); if (error) throw new Error(error.message); if (!Array.isArray(data)) throw new Error('invalid_storage_result'); return data as StoredObject[]; },
  revoke: async (token) => { const { error } = await admin.auth.admin.signOut(token, 'global'); if (error) throw new Error('revoke_failed'); },
  remove: async (bucket, paths) => { const { error } = await admin.storage.from(bucket).remove(paths); if (error) throw new Error('storage_failed'); },
  deleteUser: async (userId) => { const { error } = await admin.auth.admin.deleteUser(userId, false); if (error) throw new Error('auth_delete_failed'); },
}));
