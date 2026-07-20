// Shrinks a gauge's bounding box down to the tightest rectangle that still
// contains everything it actually draws (ring, ticks, needle, label text,
// container glow, ...) — found by rendering the gauge alone and scanning
// its alpha channel, so it works for every mode without needing to know
// each one's own layout math.
import { drawOn, previewValueToOnCount } from './gaugeRender';
import type { ThemesMap } from './gaugeRender';
import type { GaugeInstance } from '../types';
import { resolveDrawOptions } from '../types';

const ALPHA_THRESHOLD = 8; // ignores near-invisible antialiasing fringe

export function fitGaugeToContent(gauge: GaugeInstance, themes: ThemesMap): Pick<GaugeInstance, 'x' | 'y' | 'width' | 'height'> | null {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(gauge.width));
  canvas.height = Math.max(1, Math.round(gauge.height));
  const opts = resolveDrawOptions(gauge, themes);
  const onCount = previewValueToOnCount(gauge.previewValue, opts.nSegs);
  // A solid bgColor would make the whole box "content" — force transparent
  // for this measurement pass only; the gauge's own bgColor is untouched.
  drawOn(canvas, onCount, { ...opts, bgColor: 'transparent' });

  // drawOn resizes the canvas (swapping width/height) for a 90°/270°-rotated
  // bar gauge — see gaugeRender.ts — so read the actual post-draw size
  // rather than assuming it still matches gauge.width/height.
  const cw = canvas.width, ch = canvas.height;
  const swapped = cw !== Math.max(1, Math.round(gauge.width)) || ch !== Math.max(1, Math.round(gauge.height));

  const ctx = canvas.getContext('2d')!;
  const data = ctx.getImageData(0, 0, cw, ch).data;
  let minX = cw, minY = ch, maxX = -1, maxY = -1;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      if (data[(y * cw + x) * 4 + 3] > ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null; // fully transparent — nothing to fit to

  // Mirrors compose.ts's placement of this same (possibly swapped) canvas:
  // centered on the gauge's own center point, not its top-left corner.
  const centerX = gauge.x + gauge.width / 2;
  const centerY = gauge.y + gauge.height / 2;
  const boxLeft = centerX - cw / 2;
  const boxTop = centerY - ch / 2;

  const contentW = maxX - minX + 1;
  const contentH = maxY - minY + 1;
  const contentCenterX = boxLeft + minX + contentW / 2;
  const contentCenterY = boxTop + minY + contentH / 2;

  // Swap the tight dims back to logical width/height so they mean the same
  // thing they always do for this gauge (see the "swapped" comment above).
  const width = Math.max(1, Math.round(swapped ? contentH : contentW));
  const height = Math.max(1, Math.round(swapped ? contentW : contentH));

  return {
    x: Math.round(contentCenterX - width / 2),
    y: Math.round(contentCenterY - height / 2),
    width,
    height,
  };
}
