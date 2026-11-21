import { describe, expect, it } from 'vitest';
import { safeIncomingPath } from '../src/lib/incoming-link';

describe('Native links before routing', () => {
  it.each([
    'rollersmaps://reset-password?code=synthetic-code',
    'rollersmaps://auth#access_token=synthetic-token&refresh_token=synthetic-refresh',
    'rollersmaps://group?id=123&label=Pat%C3%ADn%20%26%20ruta',
    '/legal?section=privacy',
  ])('preserves valid links and their encoding: %s', path => {
    expect(safeIncomingPath(path)).toBe(path);
  });
  it.each(['%', '%E0%A4', '%FF'.repeat(1000), '%C0%AF', 'x'.repeat(8193)])('rejects malformed or oversized input', input => {
    expect(safeIncomingPath(`rollersmaps://auth?code=${input}`)).toBe('/');
  });
});
