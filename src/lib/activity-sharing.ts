import { withRequestTimeout } from '@/lib/async-request';

type ShareImageActions = {
  available: () => Promise<boolean>; capture: () => Promise<string>;
  share: (uri: string) => Promise<void>; release: (uri: string) => void;
};
/** Captures are transient, including a late capture after a native timeout. */
export async function shareCapturedImage(actions: ShareImageActions, timeoutMs = 20000): Promise<boolean> {
  if (!await withRequestTimeout(() => actions.available(), timeoutMs)) return false;
  let imageUri: string | null = null, discardLateCapture = false;
  try {
    const capturedUri = await withRequestTimeout(() => actions.capture().then(uri => {
      if (discardLateCapture) { actions.release(uri); return uri; }
      return uri;
    }), timeoutMs);
    imageUri = capturedUri;
    // This promise represents a user-operated share sheet, not a network load.
    await actions.share(capturedUri);
    return true;
  } finally {
    discardLateCapture = true;
    if (imageUri) actions.release(imageUri);
  }
}
