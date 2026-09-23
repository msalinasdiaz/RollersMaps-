import type { TrackingSnapshot } from '@/lib/tracking-store';
export function currentSpeedKmh(snapshot: TrackingSnapshot | null, now = Date.now()): number {
  if (snapshot?.status !== 'active') return 0;
  const last=snapshot.route.at(-1), previous=snapshot.route.at(-2);
  if (!last || now-last.timestamp>10000 || now<last.timestamp) return 0;
  if (last.reportedSpeedKmh !== null) return last.reportedSpeedKmh;
  if (!previous || (last.segment??0)!==(previous.segment??0) || last.timestamp<=previous.timestamp) return 0;
  const rad=Math.PI/180;
  const x=(last.longitude-previous.longitude)*rad*Math.cos((last.latitude+previous.latitude)*rad/2);
  const y=(last.latitude-previous.latitude)*rad;
  return Math.min(55,Math.hypot(x,y)*6371000/(last.timestamp-previous.timestamp)*3600);
}
export function formatTrackingTime(seconds: number) {
  const total=Math.max(0,Math.floor(seconds));
  return [Math.floor(total/3600),Math.floor(total%3600/60),total%60].map(v=>String(v).padStart(2,'0')).join(':');
}
