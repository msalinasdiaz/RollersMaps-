import {createClient} from 'npm:@supabase/supabase-js@2.116.0';
import {createFinalizationHandler} from '../_shared/finish-account-deletions-handler.ts';
import type {StoredObject} from '../_shared/delete-account-handler.ts';
const url=Deno.env.get('SUPABASE_URL')!,serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(createFinalizationHandler({
 authorize:async(token)=>{if(token===serviceKey)return true;const identity=await admin.auth.getUser(token);if(identity.error||!identity.data.user)return false;const caller=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});const role=await caller.rpc('is_platform_admin');return !role.error&&role.data===true;},
 pending:async()=>{const result=await admin.rpc('get_pending_account_deletions');if(result.error||!Array.isArray(result.data))throw new Error('queue_failed');return result.data;},
 prepare:async(userId)=>{const result=await admin.rpc('prepare_account_deletion',{p_user_id:userId,p_session_id:null});if(result.error||!Array.isArray(result.data))throw new Error('prepare_failed');return result.data as StoredObject[];},
 remove:async(bucket,paths)=>{const result=await admin.storage.from(bucket).remove(paths);if(result.error)throw new Error('storage_failed');},
 // Tombstones already block Data API, Storage and privileged RPCs. Official
 // Auth deletion removes remaining sessions even if the first signOut failed.
 deleteUser:async(userId)=>{const result=await admin.auth.admin.deleteUser(userId,false);if(result.error)throw new Error('auth_delete_failed');},
}));
