// Multi-select layout actions. Each takes the full gauge list plus the
// ordered selection (selectedIds[0] is the anchor) and returns the next list,
// or the same array when there is nothing to do.
import type { GaugeInstance } from '../types';
import type { GaugeMode } from './gaugeRender';
import { computeGaugeOuterRadius, solveRingBoxForOuterRadius } from './gaugeRender';

// circ and needle are both drawn as a ring of some radius, so "make same
// size" can equalize how big they actually look (see computeGaugeOuterRadius
// below); bar and container are fundamentally different shapes with no
// comparable notion of radius, so they just fall back to a literal
// width/height match.
const RING_MODES: GaugeMode[] = ['circ', 'needle'];

export function makeSameSize(gauges: GaugeInstance[], selectedIds: string[]): GaugeInstance[] {
  const ref = gauges.find(g => g.id === selectedIds[0]);
  if (!ref || selectedIds.length < 2) return gauges;
  // A shared bounding box isn't the same as looking the same size: a
  // needle and a circular gauge both draw a ring inside their box, but
  // how much of the box that ring actually fills depends on each
  // gauge's own stroke width/label/outer-ring settings too (see
  // computeGaugeOuterRadius) — so between two ring gauges, solve for a
  // box whose ring edge matches the anchor's rather than just copying
  // width/height. Any other mode pairing (bar, container, or a ring
  // mode paired with one of those) has no comparable notion of "same
  // visual size", so it falls back to a literal box match.
  const refIsRing = RING_MODES.includes(ref.opts.mode);
  const refRadius = refIsRing ? computeGaugeOuterRadius(ref.width, ref.height, ref.opts) : 0;
  return gauges.map(g => {
    if (g.id === ref.id || !selectedIds.includes(g.id)) return g;
    if (refIsRing && RING_MODES.includes(g.opts.mode)) {
      const { width, height } = solveRingBoxForOuterRadius(refRadius, g.width, g.height, g.opts);
      return { ...g, width, height };
    }
    return { ...g, width: ref.width, height: ref.height };
  });
}

// Distributes the gauges selected *between* the 1st and last-selected one
// (both of which stay put) at even steps along the straight line joining
// their centers — selection order decides each gauge's step, not its
// current on-panel position, matching how "make same size" also treats
// selectedIds[0] as a fixed anchor rather than re-deriving order spatially.
export function spaceEvenly(gauges: GaugeInstance[], selectedIds: string[]): GaugeInstance[] {
  const n = selectedIds.length;
  if (n < 3) return gauges;
  const first = gauges.find(g => g.id === selectedIds[0]);
  const last = gauges.find(g => g.id === selectedIds[n - 1]);
  if (!first || !last) return gauges;
  const firstCenterX = first.x + first.width / 2;
  const firstCenterY = first.y + first.height / 2;
  const lastCenterX = last.x + last.width / 2;
  const lastCenterY = last.y + last.height / 2;
  return gauges.map(g => {
    const step = selectedIds.indexOf(g.id);
    if (step <= 0 || step >= n - 1) return g; // first/last anchors + non-selected untouched
    const t = step / (n - 1);
    const cx = firstCenterX + t * (lastCenterX - firstCenterX);
    const cy = firstCenterY + t * (lastCenterY - firstCenterY);
    return { ...g, x: Math.round(cx - g.width / 2), y: Math.round(cy - g.height / 2) };
  });
}

// Centers the whole selection as a group — the group's bounding box
// (spanning every selected gauge) lands on the panel's center, but each
// gauge keeps its position *relative to the others*, so a multi-select
// moves together rather than collapsing onto a single point. With exactly
// one gauge selected this reduces to centering that gauge alone, same as
// GaugePanel's own Center H/V (which stays in place for the single-select
// case rather than routing through here).
export function centerSelection(
  gauges: GaugeInstance[], selectedIds: string[], axis: 'x' | 'y', panelWidth: number, panelHeight: number,
): GaugeInstance[] {
  const selected = gauges.filter(g => selectedIds.includes(g.id));
  if (selected.length === 0) return gauges;
  if (axis === 'x') {
    const minX = Math.min(...selected.map(g => g.x));
    const maxX = Math.max(...selected.map(g => g.x + g.width));
    const dx = Math.round((panelWidth - (minX + maxX)) / 2);
    return gauges.map(g => selectedIds.includes(g.id) ? { ...g, x: g.x + dx } : g);
  }
  const minY = Math.min(...selected.map(g => g.y));
  const maxY = Math.max(...selected.map(g => g.y + g.height));
  const dy = Math.round((panelHeight - (minY + maxY)) / 2);
  return gauges.map(g => selectedIds.includes(g.id) ? { ...g, y: g.y + dy } : g);
}

export type Stack = 'forward' | 'backward' | 'toFront' | 'toBack';

// Moves the selection through the draw order (later in the list is drawn on
// top). A selected gauge only swaps past unselected ones, so a selected run
// moves together and keeps its own order.
export function restack(gauges: GaugeInstance[], selectedIds: string[], stack: Stack): GaugeInstance[] {
  const sel = (g: GaugeInstance) => selectedIds.includes(g.id);
  const next = [...gauges];
  if (stack === 'forward') {
    for (let i = next.length - 2; i >= 0; i--) {
      if (sel(next[i]) && !sel(next[i + 1])) [next[i], next[i + 1]] = [next[i + 1], next[i]];
    }
    return next;
  }
  if (stack === 'backward') {
    for (let i = 1; i < next.length; i++) {
      if (sel(next[i]) && !sel(next[i - 1])) [next[i], next[i - 1]] = [next[i - 1], next[i]];
    }
    return next;
  }
  const picked = gauges.filter(sel);
  const rest = gauges.filter(g => !sel(g));
  return stack === 'toFront' ? [...rest, ...picked] : [...picked, ...rest];
}
