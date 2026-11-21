export type StringStorage = {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
};

type Manifest = { generation: string; chunks: number };
const CHUNK_CHARACTERS = 400;
const MAX_CHUNKS = 512;

/** Commit the manifest last, so a failed write cannot replace a complete session. */
export function createSecureAuthStorage(secure: StringStorage, legacy?: StringStorage): StringStorage {
  const queues = new Map<string, Promise<unknown>>();
  let revision = 0;
  const base = (key: string) => 'rollersmaps.auth.' + encodeURIComponent(key).replace(/%/g, '_');
  const chunkKey = (key: string, manifest: Manifest, index: number) => `${base(key)}.${manifest.generation}.${index}`;

  function serial<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = queues.get(key) ?? Promise.resolve();
    const result = previous.catch(() => undefined).then(operation);
    queues.set(key, result);
    void result.then(() => { if (queues.get(key) === result) queues.delete(key); }, () => { if (queues.get(key) === result) queues.delete(key); });
    return result;
  }
  async function readManifest(key: string): Promise<Manifest | null> {
    const raw = await secure.getItem(base(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Manifest;
    if (!/^\d+-\d+$/.test(parsed.generation) || !Number.isInteger(parsed.chunks) || parsed.chunks < 1 || parsed.chunks > MAX_CHUNKS) {
      throw new Error('No pudimos leer la sesión guardada de forma segura.');
    }
    return parsed;
  }
  async function eraseChunks(key: string, manifest: Manifest | null) {
    if (!manifest) return;
    await Promise.all(Array.from({ length: manifest.chunks }, (_, index) => secure.removeItem(chunkKey(key, manifest, index))));
  }
  async function write(key: string, value: string) {
    const characters = Array.from(value);
    const chunks = Math.max(1, Math.ceil(characters.length / CHUNK_CHARACTERS));
    if (chunks > MAX_CHUNKS) throw new Error('La sesión es demasiado grande para guardarla de forma segura.');
    const previous = await readManifest(key);
    const manifest = { generation: `${Date.now()}-${++revision}`, chunks };
    try {
      for (let index = 0; index < chunks; index++) {
        await secure.setItem(chunkKey(key, manifest, index), characters.slice(index * CHUNK_CHARACTERS, (index + 1) * CHUNK_CHARACTERS).join(''));
      }
      await secure.setItem(base(key), JSON.stringify(manifest));
    } catch (error) {
      await eraseChunks(key, manifest).catch(() => undefined);
      throw error;
    }
    // Never fall back to plaintext if the secure store is unavailable.
    await legacy?.removeItem(key);
    await eraseChunks(key, previous);
  }
  return {
    getItem: (key) => serial(key, async () => {
      const manifest = await readManifest(key);
      if (manifest) {
        let value = '';
        for (let index = 0; index < manifest.chunks; index++) {
          const chunk = await secure.getItem(chunkKey(key, manifest, index));
          if (chunk === null) throw new Error('La sesión guardada está incompleta. Vuelve a ingresar.');
          value += chunk;
        }
        // Finish a legacy migration that was interrupted after the secure commit.
        await legacy?.removeItem(key);
        return value;
      }
      const oldValue = await legacy?.getItem(key);
      if (oldValue == null) return null;
      await write(key, oldValue);
      return oldValue;
    }),
    setItem: (key, value) => serial(key, () => write(key, value)),
    removeItem: (key) => serial(key, async () => {
      const manifest = await readManifest(key);
      await secure.removeItem(base(key));
      await eraseChunks(key, manifest);
      await legacy?.removeItem(key);
    }),
  };
}
