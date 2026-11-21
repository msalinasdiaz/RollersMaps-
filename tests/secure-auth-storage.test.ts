import { describe, expect, it } from 'vitest';
import { createSecureAuthStorage, type StringStorage } from '@/lib/secure-auth-storage';

function memory() {
  const values = new Map<string, string>();
  const storage: StringStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: (key) => { values.delete(key); } };
  return { values, storage };
}

describe('Persistencia segura de Auth', () => {
  it('migra una sesión extensa con unicode antes de retirar la copia antigua', async () => {
    const secure = memory(); const legacy = memory();
    const value = '🛼'.repeat(2100);
    legacy.values.set('session', value);
    const storage = createSecureAuthStorage(secure.storage, legacy.storage);
    expect(await storage.getItem('session')).toBe(value);
    expect(legacy.values.has('session')).toBe(false);
    expect(Math.max(...Array.from(secure.values.values(), (chunk) => Buffer.byteLength(chunk, 'utf8')))).toBeLessThan(2048);
    expect(await storage.getItem('session')).toBe(value);
  });
  it('un fallo de cifrado conserva la sesión anterior y no crea fallback plano', async () => {
    const secure = memory(); const legacy = memory(); let fail = false;
    const storage = createSecureAuthStorage({ ...secure.storage, setItem: (key, value) => { if (fail) throw new Error('locked'); return secure.storage.setItem(key, value); } }, legacy.storage);
    await storage.setItem('session', 'previous'); fail = true;
    await expect(storage.setItem('session', 'next')).rejects.toThrow('locked');
    expect(await storage.getItem('session')).toBe('previous');
    expect(legacy.values.size).toBe(0);
  });
  it('serializa actualización y retirada; elimina manifiesto y fragmentos', async () => {
    const secure = memory(); const storage = createSecureAuthStorage(secure.storage);
    await Promise.all([storage.setItem('session', 'a'.repeat(2400)), storage.setItem('session', 'b'), storage.removeItem('session')]);
    expect(await storage.getItem('session')).toBeNull(); expect(secure.values.size).toBe(0);
  });
});
