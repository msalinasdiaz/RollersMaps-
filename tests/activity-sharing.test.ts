import { afterEach, describe, expect, it, vi } from 'vitest';
import { shareCapturedImage } from '@/lib/activity-sharing';
import { withRequestTimeout } from '@/lib/async-request';
afterEach(() => vi.useRealTimers());
const actions = () => ({ available: vi.fn(async () => true), capture: vi.fn(async () => 'file:///cache/capture.png'), share: vi.fn(async () => {}), release: vi.fn() });
describe('Capturas temporales y tiempos de espera', () => {
  it('libera la imagen al completar la hoja de compartir', async () => {
    const a = actions(); expect(await shareCapturedImage(a)).toBe(true);
    expect(a.release).toHaveBeenCalledExactlyOnceWith('file:///cache/capture.png');
  });
  it('libera también una captura cuando compartir falla o se cancela con error', async () => {
    const a = actions(); a.share.mockRejectedValue(new Error('cancelled'));
    await expect(shareCapturedImage(a)).rejects.toThrow('cancelled'); expect(a.release).toHaveBeenCalledTimes(1);
  });
  it('no genera temporales cuando no se puede compartir', async () => {
    const a = actions(); a.available.mockResolvedValue(false); expect(await shareCapturedImage(a)).toBe(false);
    expect(a.capture).not.toHaveBeenCalled(); expect(a.release).not.toHaveBeenCalled();
  });
  it('limpia una captura que llega después de agotar el plazo', async () => {
    vi.useFakeTimers(); const a = actions(); let resolveCapture!: (uri: string) => void;
    a.capture.mockImplementation(() => new Promise(resolve => { resolveCapture = resolve; }));
    const failed = expect(shareCapturedImage(a, 10)).rejects.toThrow('tardó');
    await vi.advanceTimersByTimeAsync(10); await failed;
    resolveCapture('file:///cache/late.png'); await Promise.resolve();
    expect(a.release).toHaveBeenCalledExactlyOnceWith('file:///cache/late.png'); expect(a.share).not.toHaveBeenCalled();
  });
  it('aborta las peticiones demoradas y elimina su temporizador al resolver', async () => {
    vi.useFakeTimers(); let signal!: AbortSignal;
    const failed = expect(withRequestTimeout(s => { signal = s; return new Promise(() => {}); }, 10)).rejects.toThrow('tardó');
    await vi.advanceTimersByTimeAsync(10); await failed; expect(signal.aborted).toBe(true);
    expect(await withRequestTimeout(async () => 7, 10)).toBe(7); expect(vi.getTimerCount()).toBe(0);
  });
});
