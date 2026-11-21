export class RequestTimeoutError extends Error {
  constructor() { super('La solicitud tardó demasiado.'); this.name = 'RequestTimeoutError'; }
}
/** Abort the fetch as well as rejecting the caller; a late response is ignored. */
export async function withRequestTimeout<T>(work: (signal: AbortSignal) => PromiseLike<T>, timeoutMs = 15000): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => work(controller.signal)),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new RequestTimeoutError()); }, timeoutMs); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}
