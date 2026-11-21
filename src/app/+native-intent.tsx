import { safeIncomingPath } from '@/lib/incoming-link';

export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  return safeIncomingPath(path);
}
