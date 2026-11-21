export type StoredObject = { bucket: string; path: string };
export type DeletionDependencies = {
  verify: (token: string) => Promise<{ userId: string; sessionId: string } | null>;
  prepare: (userId: string, sessionId: string) => Promise<StoredObject[]>;
  revoke: (token: string) => Promise<void>;
  remove: (bucket: string, paths: string[]) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
};
export const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
export const deletionConfirmation = 'ELIMINAR MI CUENTA';
export function jsonResponse(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }); }
export async function readSmallJson(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Error('invalid_request');
  if (Number(request.headers.get('content-length') ?? '0') > 2048 || !request.body) throw new Error('invalid_request');
  const reader = request.body.getReader(); const parts: Uint8Array[] = []; let size = 0;
  try { while (true) { const result = await reader.read(); if (result.done) break; size += result.value.length; if (size > 2048) { await reader.cancel(); throw new Error('invalid_request'); } parts.push(result.value); } } finally { reader.releaseLock(); }
  const body = new Uint8Array(size); let offset = 0; for (const part of parts) { body.set(part, offset); offset += part.length; }
  return JSON.parse(new TextDecoder().decode(body));
}
export function createDeleteAccountHandler(dependencies: DeletionDependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
    if (request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);
    let body: unknown;
    try { body = await readSmallJson(request); } catch { return jsonResponse({ error: 'invalid_request' }, 400); }
    if (typeof body !== 'object' || body === null || Array.isArray(body) || Object.keys(body).some((key) => key !== 'confirmation') || (body as { confirmation?: unknown }).confirmation !== deletionConfirmation) return jsonResponse({ error: 'confirmation_required' }, 400);
    const bearer = request.headers.get('authorization');
    if (!bearer?.startsWith('Bearer ') || bearer.length > 20000) return jsonResponse({ error: 'unauthorized' }, 401);
    const token = bearer.slice(7);
    let pending = false;
    try {
      const identity = await dependencies.verify(token);
      if (!identity) return jsonResponse({ error: 'unauthorized' }, 401);
      const objects = await dependencies.prepare(identity.userId, identity.sessionId);
      pending = true;
      await dependencies.revoke(token);
      const buckets = new Map<string, string[]>();
      for (const object of objects) { if (typeof object.bucket !== 'string' || typeof object.path !== 'string' || !object.bucket || !object.path) throw new Error('invalid_storage_result'); const paths = buckets.get(object.bucket) ?? []; paths.push(object.path); buckets.set(object.bucket, paths); }
      for (const [bucket, paths] of buckets) for (let index = 0; index < paths.length; index += 100) await dependencies.remove(bucket, paths.slice(index, index + 100));
      await dependencies.deleteUser(identity.userId);
      return jsonResponse({ deleted: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('Transfiere primero')) return jsonResponse({ error: 'owned_groups' }, 409);
      if (message.includes('Inicia sesión nuevamente')) return jsonResponse({ error: 'reauthenticate' }, 401);
      return jsonResponse({ error: 'deletion_incomplete', deletion_pending: pending }, 503);
    }
  };
}
