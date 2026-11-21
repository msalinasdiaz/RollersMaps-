// Validate native links before Expo Router's query decoder sees malformed input.
// Keep the original encoding: decoding here would change token/query semantics.
export function safeIncomingPath(path: string): string {
  if (typeof path !== 'string' || path.length > 8192) return '/';
  try { decodeURIComponent(path); return path; }
  catch { return '/'; }
}
