import { expect, it } from 'vitest';
import { routeGpx } from '@/lib/route-gpx';

const a = { latitude: -33.437, longitude: -70.651 };
const b = { latitude: -33.432, longitude: -70.645 };
it('exports the points in tap order with an XML-safe route name', () => {
  const gpx = routeGpx('Parque & <Centro>', [a, b]);
  expect(gpx).toContain('<name>Parque &amp; &lt;Centro&gt;</name>');
  expect(gpx).toContain('<trkpt lat="-33.437" lon="-70.651"/>\n<trkpt lat="-33.432" lon="-70.645"/>');
});
it('rejects empty, single-position and out-of-range tracks', () => {
  for (const points of [[], [a], [a, a], [a, { ...b, longitude: 181 }]]) {
    expect(() => routeGpx('Centro', points)).toThrow();
  }
});
