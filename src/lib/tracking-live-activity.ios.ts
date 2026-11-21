import SkatingActivity from '../widgets/SkatingActivity.ios';
import { getTrackingSnapshot } from './tracking-store';
import { liveActivityState } from './live-activity-state';

let queue: Promise<void> = Promise.resolve();
let lastUpdate = 0;
let lastStatus: string | undefined;
let lastRecord: string | undefined;
function enqueue(work: () => Promise<void>) {
  // A denied Live Activity must never stop GPS acquisition or local persistence.
  queue = queue.then(work).catch(() => undefined);
  return queue;
}
export function endTrackingLiveActivity(): Promise<void> {
  return enqueue(async () => {
    for (const instance of SkatingActivity.getInstances()) await instance.end('immediate');
    lastRecord = undefined; lastStatus = undefined; lastUpdate = 0;
  });
}
export function syncTrackingLiveActivity(options: { allowStart?: boolean; force?: boolean } = {}): Promise<void> {
  return enqueue(async () => {
    const snapshot = getTrackingSnapshot();
    let instances = SkatingActivity.getInstances();
    if (!snapshot || snapshot.status === 'pending_save') {
      for (const instance of instances) await instance.end('immediate');
      lastRecord = undefined; lastStatus = undefined; return;
    }
    if (lastRecord && lastRecord !== snapshot.recordId) {
      for (const instance of instances) await instance.end('immediate');
      instances = [];
    }
    const now = Date.now(), state = liveActivityState(snapshot, now);
    if (!options.force && now - lastUpdate < 5000 && lastStatus === state.status && lastRecord === snapshot.recordId) return;
    const staleDate = new Date(state.timerEnd);
    if (instances.length) {
      await instances[0].update(state, staleDate);
      for (const duplicate of instances.slice(1)) await duplicate.end('immediate');
    } else if (options.allowStart) {
      SkatingActivity.start(state, 'rollersmaps://track?view=map', staleDate);
    }
    lastUpdate = now; lastStatus = state.status; lastRecord = snapshot.recordId;
  });
}
