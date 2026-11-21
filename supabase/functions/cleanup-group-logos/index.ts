import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { corsHeaders, jsonResponse } from '../_shared/delete-account-handler.ts';
const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token || token.length > 20000) return jsonResponse({ error: 'unauthorized' }, 401);
  try {
    if (token !== serviceKey) {
      const { data, error } = await admin.auth.getUser(token); if (error || !data.user) return jsonResponse({ error: 'unauthorized' }, 401);
      const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
      const role = await caller.rpc('is_platform_admin'); if (role.error || role.data !== true) return jsonResponse({ error: 'forbidden' }, 403);
    }
    const { data, error } = await admin.rpc('get_unused_group_logos'); if (error || !Array.isArray(data)) throw new Error('query_failed');
    let removed = 0;
    for (let offset = 0; offset < data.length; offset += 100) {
      const paths = data.slice(offset, offset + 100).map((object: { bucket: string; path: string }) => { if (object.bucket !== 'group-logos' || typeof object.path !== 'string') throw new Error('invalid_storage_result');return object.path; });
      const result = await admin.storage.from('group-logos').remove(paths); if (result.error) throw new Error('storage_failed');removed += paths.length;
    }
    return jsonResponse({ removed });
  } catch { return jsonResponse({ error: 'cleanup_incomplete' }, 503); }
});
