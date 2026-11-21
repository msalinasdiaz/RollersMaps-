import 'expo-sqlite/localStorage/install';
import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import { authStorage } from './auth-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Falta la configuración de Supabase. Revisa el archivo .env.local.');
}

const authStorageKey=`sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
export async function clearStoredAuthSession(){for(const suffix of ['', '-code-verifier','-user'])await authStorage.removeItem(authStorageKey+suffix);}
export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: false,
    persistSession: true,
    flowType: 'pkce',
    storage: authStorage,
    storageKey: authStorageKey,
  },
});
