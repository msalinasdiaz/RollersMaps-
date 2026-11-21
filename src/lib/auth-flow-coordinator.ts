export type AuthFlowCoordinator = {
  enqueue<T>(operation: () => Promise<T>): Promise<T>;
  openLink(url: string, operation: () => Promise<void>): Promise<void>;
};

/** Serializes auth mutations and shares identical links only while they are pending. */
export function createAuthFlowCoordinator(): AuthFlowCoordinator {
  let tail: Promise<void> = Promise.resolve();
  const inFlightLinks = new Map<string, Promise<void>>();

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.then(operation);
    // Each caller receives its own failure; the next mutation can still run.
    tail = result.then(() => undefined, () => undefined);
    return result;
  }

  function openLink(url: string, operation: () => Promise<void>): Promise<void> {
    const existing = inFlightLinks.get(url);
    if (existing) return existing;

    const result = enqueue(operation);
    inFlightLinks.set(url, result);
    const clear = () => {
      if (inFlightLinks.get(url) === result) inFlightLinks.delete(url);
    };
    // Both branches resolve the cleanup promise, including when the link fails.
    void result.then(clear, clear);
    return result;
  }

  return { enqueue, openLink };
}

/** Resolves the launch link before restoring a session that it may replace. */
export async function restoreAuthOnLaunch<T>(
  getInitialUrl: () => Promise<string | null>,
  openLink: (url: string) => Promise<void>,
  restoreSession: () => Promise<T>,
): Promise<T> {
  let initialUrl: string | null = null;
  try {
    initialUrl = await getInitialUrl();
  } catch {
    // Failure to read the launch URL must not prevent an ordinary app launch.
  }
  if (initialUrl) await openLink(initialUrl);
  return restoreSession();
}
