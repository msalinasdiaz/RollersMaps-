import { describe, expect, it, vi } from 'vitest';
import { createAuthFlowCoordinator, restoreAuthOnLaunch } from '@/lib/auth-flow-coordinator';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('Coordinación de cambios de autenticación', () => {
  it('completa el enlace antes de actualizar la contraseña y luego cancelar', async () => {
    const coordinator = createAuthFlowCoordinator();
    const linkStarted = deferred<void>();
    const linkFinished = deferred<void>();
    const events: string[] = [];
    const link = coordinator.openLink('rollersmaps://reset-password?code=first', async () => {
      events.push('link:start');
      linkStarted.resolve(undefined);
      await linkFinished.promise;
      events.push('link:finish');
    });
    const update = coordinator.enqueue(async () => {
      events.push('update');
      return { userId: 'first' };
    });
    const cancel = coordinator.enqueue(async () => { events.push('cancel'); });

    await linkStarted.promise;
    expect(events).toEqual(['link:start']);
    linkFinished.resolve(undefined);
    await link;
    expect(await update).toEqual({ userId: 'first' });
    await cancel;
    expect(events).toEqual(['link:start', 'link:finish', 'update', 'cancel']);
  });

  it('deja activo el enlace nuevo cuando llega durante un cambio de contraseña', async () => {
    const coordinator = createAuthFlowCoordinator();
    const updateStarted = deferred<void>();
    const updateFinished = deferred<void>();
    let currentUser = 'first';
    let recovering = true;
    const update = coordinator.enqueue(async () => {
      updateStarted.resolve(undefined);
      await updateFinished.promise;
      currentUser = 'first';
      recovering = false;
    });
    await updateStarted.promise;
    const nextLink = coordinator.openLink('rollersmaps://reset-password?code=second', async () => {
      currentUser = 'second';
      recovering = true;
    });

    expect(currentUser).toBe('first');
    updateFinished.resolve(undefined);
    await Promise.all([update, nextLink]);
    expect(currentUser).toBe('second');
    expect(recovering).toBe(true);
  });

  it('aplica el enlace nuevo después de una cancelación que todavía estaba pendiente', async () => {
    const coordinator = createAuthFlowCoordinator();
    const cancelStarted = deferred<void>();
    const cancelFinished = deferred<void>();
    let currentUser: string | null = 'first';
    const cancel = coordinator.enqueue(async () => {
      cancelStarted.resolve(undefined);
      await cancelFinished.promise;
      currentUser = null;
    });
    await cancelStarted.promise;
    const nextLink = coordinator.openLink('rollersmaps://reset-password?code=second', async () => { currentUser = 'second'; });
    cancelFinished.resolve(undefined);
    await Promise.all([cancel, nextLink]);
    expect(currentUser).toBe('second');
  });

  it('comparte una sola operación para enlaces idénticos que siguen pendientes', async () => {
    const coordinator = createAuthFlowCoordinator();
    const finished = deferred<void>();
    const operation = vi.fn(() => finished.promise);
    const duplicate = vi.fn(async () => undefined);
    const first = coordinator.openLink('rollersmaps://reset-password?code=first', operation);
    const second = coordinator.openLink('rollersmaps://reset-password?code=first', duplicate);
    expect(second).toBe(first);
    await Promise.resolve();
    expect(operation).toHaveBeenCalledTimes(1);
    expect(duplicate).not.toHaveBeenCalled();
    finished.resolve(undefined);
    await Promise.all([first, second]);
  });

  it('procesa enlaces diferentes en orden aunque el primero todavía esté pendiente', async () => {
    const coordinator = createAuthFlowCoordinator();
    const firstStarted = deferred<void>();
    const firstFinished = deferred<void>();
    const events: string[] = [];
    const first = coordinator.openLink('rollersmaps://reset-password?code=first', async () => {
      firstStarted.resolve(undefined);
      await firstFinished.promise;
      events.push('first');
    });
    const second = coordinator.openLink('rollersmaps://reset-password?code=second', async () => { events.push('second'); });
    await firstStarted.promise;
    expect(events).toEqual([]);
    firstFinished.resolve(undefined);
    await Promise.all([first, second]);
    expect(events).toEqual(['first', 'second']);
  });

  it('permite abrir otra vez el mismo enlace cuando terminó su operación anterior', async () => {
    const coordinator = createAuthFlowCoordinator();
    const operation = vi.fn(async () => undefined);
    await coordinator.openLink('rollersmaps://reset-password?code=first', operation);
    await coordinator.openLink('rollersmaps://reset-password?code=first', operation);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('propaga el error de una operación y permite que continúe la siguiente', async () => {
    const coordinator = createAuthFlowCoordinator();
    const failed = coordinator.enqueue(async () => { throw new Error('Update failed'); });
    const next = coordinator.enqueue(async () => 'recovered');
    await expect(failed).rejects.toThrow('Update failed');
    expect(await next).toBe('recovered');
  });

  it('limpia un enlace fallido y permite otro intento sin rechazos huérfanos', async () => {
    const coordinator = createAuthFlowCoordinator();
    const failed = coordinator.openLink('rollersmaps://reset-password?code=first', async () => { throw new Error('Link failed'); });
    await expect(failed).rejects.toThrow('Link failed');
    const retry = vi.fn(async () => undefined);
    await coordinator.openLink('rollersmaps://reset-password?code=first', retry);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('captura también errores sincrónicos para que la cola pueda continuar', async () => {
    const coordinator = createAuthFlowCoordinator();
    const failed = coordinator.enqueue(() => { throw new Error('Synchronous failure'); });
    await expect(failed).rejects.toThrow('Synchronous failure');
    expect(await coordinator.enqueue(async () => 42)).toBe(42);
  });
});

describe('Restauración de autenticación al abrir la app', () => {
  it('espera el enlace inicial y su procesamiento antes de restaurar la sesión', async () => {
    const initialUrl = deferred<string | null>();
    const linkStarted = deferred<void>();
    const linkFinished = deferred<void>();
    const openLink = vi.fn(async () => {
      linkStarted.resolve(undefined);
      await linkFinished.promise;
    });
    const restore = vi.fn(async () => ({ userId: 'recovered-user' }));
    const result = restoreAuthOnLaunch(() => initialUrl.promise, openLink, restore);

    expect(openLink).not.toHaveBeenCalled();
    expect(restore).not.toHaveBeenCalled();
    initialUrl.resolve('rollersmaps://reset-password?code=first');
    await linkStarted.promise;
    expect(openLink).toHaveBeenCalledExactlyOnceWith('rollersmaps://reset-password?code=first');
    expect(restore).not.toHaveBeenCalled();
    linkFinished.resolve(undefined);
    expect(await result).toEqual({ userId: 'recovered-user' });
    expect(restore).toHaveBeenCalledTimes(1);
  });

  it('restaura una sesión normal cuando no hay URL inicial', async () => {
    const openLink = vi.fn(async () => undefined);
    const restore = vi.fn(async () => 'saved-session');
    expect(await restoreAuthOnLaunch(async () => null, openLink, restore)).toBe('saved-session');
    expect(openLink).not.toHaveBeenCalled();
    expect(restore).toHaveBeenCalledTimes(1);
  });

  it('restaura la sesión aunque falle la lectura de la URL inicial', async () => {
    const openLink = vi.fn(async () => undefined);
    const restore = vi.fn(async () => 'saved-session');
    expect(await restoreAuthOnLaunch(async () => { throw new Error('Linking unavailable'); }, openLink, restore)).toBe('saved-session');
    expect(openLink).not.toHaveBeenCalled();
    expect(restore).toHaveBeenCalledTimes(1);
  });

  it('propaga un fallo no manejado al procesar el enlace', async () => {
    const restore = vi.fn(async () => 'saved-session');
    await expect(restoreAuthOnLaunch(async () => 'rollersmaps://reset-password?code=first', async () => { throw new Error('Link failed'); }, restore)).rejects.toThrow('Link failed');
    expect(restore).not.toHaveBeenCalled();
  });

  it('propaga los errores de restauración para que la app deje de esperar', async () => {
    await expect(restoreAuthOnLaunch(async () => null, async () => undefined, async () => { throw new Error('Session unavailable'); })).rejects.toThrow('Session unavailable');
  });
});
