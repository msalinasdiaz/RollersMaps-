import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { createSecureAuthStorage } from './secure-auth-storage';

const legacyStorage = {
  getItem: (key: string) => globalThis.localStorage.getItem(key),
  setItem: (key: string, value: string) => globalThis.localStorage.setItem(key, value),
  removeItem: (key: string) => globalThis.localStorage.removeItem(key),
};

export const authStorage = Platform.OS === 'web' ? legacyStorage : createSecureAuthStorage({
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
}, legacyStorage);
