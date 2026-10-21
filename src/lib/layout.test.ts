import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { centerSelection, makeSameSize, spaceEvenly } from './layout';
import { computeGaugeOuterRadius, type GaugeMode } from './gaugeRender';
import { normalizeGauge, type GaugeInstance } from '../types';

function gauge(id: string, x: number, y: number, width: number, height: number, mode: GaugeMode = 'bar'): GaugeInstance {
  return normalizeGauge({ id, x, y, width, height, opts: { mode } });
}

const byId = (gauges: GaugeInstance[], id: string) => gauges.find(g => g.id === id)!;

describe('spaceEvenly', () => {
  it('steps by selection order between fixed first and last gauges', () => {
    const gauges = [
      gauge('a', 0, 0, 20, 20),
      gauge('b', 40, 0, 20, 20),
      gauge('c', 250, 90, 20, 20),
      gauge('d', 300, 0, 20, 20),
      gauge('e', 500, 500, 20, 20),
    ];
    // c is selected before b, so c takes the first step even though b sits nearer a.
    const next = spaceEvenly(gauges, ['a', 'c', 'b', 'd']);
    expect([byId(next, 'c').x, byId(next, 'c').y]).toEqual([100, 0]);
    expect([byId(next, 'b').x, byId(next, 'b').y]).toEqual([200, 0]);
    expect(byId(next, 'a')).toBe(gauges[0]);
    expect(byId(next, 'd')).toBe(gauges[3]);
    expect(byId(next, 'e')).toBe(gauges[4]);
  });

  it('places by center so different sizes still line up', () => {
    const gauges = [gauge('a', 0, 0, 20, 20), gauge('big', 0, 0, 60, 60), gauge('z', 200, 200, 20, 20)];
    const big = byId(spaceEvenly(gauges, ['a', 'big', 'z']), 'big');
    expect([big.x + big.width / 2, big.y + big.height / 2]).toEqual([110, 110]);
  });

  it('needs at least three gauges', () => {
    const gauges = [gauge('a', 0, 0, 20, 20), gauge('b', 90, 0, 20, 20)];
    expect(spaceEvenly(gauges, ['a', 'b'])).toBe(gauges);
  });
});

describe('centerSelection', () => {
  it('centers the group bounding box and keeps relative positions', () => {
    const gauges = [gauge('a', 10, 5, 20, 20), gauge('b', 50, 40, 30, 30), gauge('c', 0, 0, 10, 10)];
    const x = centerSelection(gauges, ['a', 'b'], 'x', 400, 300);
    // Group spans 10..80, so it moves to 155..225 on a 400px panel.
    expect([byId(x, 'a').x, byId(x, 'b').x]).toEqual([165, 205]);
    expect(byId(x, 'a').y).toBe(5);
    expect(byId(x, 'c')).toBe(gauges[2]);
    const y = centerSelection(gauges, ['a', 'b'], 'y', 400, 300);
    // Group spans 5..70, so it moves down 112.5px, rounded to 113, on a 300px panel.
    expect([byId(y, 'a').y, byId(y, 'b').y]).toEqual([118, 153]);
  });

  it('does nothing with an empty selection', () => {
    const gauges = [gauge('a', 10, 5, 20, 20)];
    expect(centerSelection(gauges, [], 'x', 400, 300)).toBe(gauges);
  });
});

describe('makeSameSize', () => {
  it('copies the anchor box for non-ring gauges and leaves others alone', () => {
    const gauges = [gauge('anchor', 0, 0, 100, 40), gauge('b', 0, 0, 50, 50), gauge('c', 0, 0, 7, 7)];
    const next = makeSameSize(gauges, ['anchor', 'b']);
    expect([byId(next, 'b').width, byId(next, 'b').height]).toEqual([100, 40]);
    expect(byId(next, 'anchor')).toBe(gauges[0]);
    expect(byId(next, 'c')).toBe(gauges[2]);
    expect(makeSameSize(gauges, ['anchor'])).toBe(gauges);
  });

  describe('ring gauges', () => {
    // Ring layout measures its "100%" label; Node has no canvas, so stand in
    // a fixed-width font.
    beforeAll(() => {
      vi.stubGlobal('document', {
        createElement: () => ({
          getContext: () => ({ font: '', measureText: (text: string) => ({ width: text.length * 8 }) }),
        }),
      });
    });
    afterAll(() => vi.unstubAllGlobals());

    it('matches the visible ring radius rather than the box', () => {
      const anchor = gauge('anchor', 0, 0, 200, 200, 'circ');
      const thick = normalizeGauge({ id: 'thick', width: 100, height: 100, opts: { mode: 'needle', sw: 40 } });
      const next = makeSameSize([anchor, thick], ['anchor', 'thick']);
      const resized = byId(next, 'thick');
      const target = computeGaugeOuterRadius(anchor.width, anchor.height, anchor.opts);
      const got = computeGaugeOuterRadius(resized.width, resized.height, resized.opts);
      expect(Math.abs(got - target)).toBeLessThan(1);
      expect(resized.width).toBe(resized.height);
    });

    it('falls back to the anchor box when a ring is paired with a bar', () => {
      const anchor = gauge('anchor', 0, 0, 200, 200, 'circ');
      const bar = gauge('bar', 0, 0, 240, 60);
      const next = makeSameSize([anchor, bar], ['anchor', 'bar']);
      expect([byId(next, 'bar').width, byId(next, 'bar').height]).toEqual([200, 200]);
    });
  });
});
