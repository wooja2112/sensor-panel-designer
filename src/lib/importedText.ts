import type { ImportedText } from '../types';

export function importedTextFont(t: ImportedText): string {
  const family = /[^a-zA-Z0-9-]/.test(t.font) ? `"${t.font.replace(/"/g, '')}"` : t.font;
  return `${t.italic ? 'italic ' : ''}${t.bold ? '700 ' : '400 '}${t.fontSize}px ${family}, sans-serif`;
}

function textPad(fontSize: number): number {
  return Math.max(2, Math.ceil(fontSize * 0.12));
}

function glyphMetrics(ctx: CanvasRenderingContext2D, t: ImportedText) {
  ctx.font = importedTextFont(t);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const m = ctx.measureText(t.text);
  const pad = textPad(t.fontSize);
  const left = Math.ceil(Math.max(0, -(m.actualBoundingBoxLeft ?? 0)));
  const right = Math.ceil(Math.max(m.width, m.actualBoundingBoxRight ?? m.width));
  const ascent = Math.ceil(Math.max(m.actualBoundingBoxAscent ?? t.fontSize * 0.85, t.fontSize * 0.75));
  const descent = Math.ceil(Math.max(m.actualBoundingBoxDescent ?? t.fontSize * 0.2, 1));
  return {
    pad,
    left,
    width: left + right + pad * 2,
    height: ascent + descent + pad * 2,
    baseline: pad + ascent,
  };
}

export function measureImportedText(t: ImportedText, boxWidth = 0, boxHeight = 0): { width: number; height: number } {
  let width = 0;
  let height = 0;
  if (typeof document !== 'undefined') {
    const ctx = document.createElement('canvas').getContext('2d');
    if (ctx) {
      const m = glyphMetrics(ctx, t);
      width = m.width;
      height = m.height;
    }
  }
  if (!width) width = Math.max(1, Math.ceil(t.text.length * t.fontSize * 0.6));
  if (!height) height = Math.max(1, Math.ceil(t.fontSize * 1.5));
  // InfoPanel often stores a Width/Height that is the layout slot, not the
  // ink box — never shrink below the measured glyphs or the tops clip.
  if (boxWidth > 0) width = Math.max(width, boxWidth);
  if (boxHeight > 0) height = Math.max(height, boxHeight);
  return { width: Math.max(1, width), height: Math.max(1, height) };
}

export function drawImportedText(ctx: CanvasRenderingContext2D, t: ImportedText, width: number, _height: number) {
  ctx.font = importedTextFont(t);
  ctx.fillStyle = t.color;
  ctx.textAlign = t.align;
  ctx.textBaseline = 'top';
  const x = t.align === 'right' ? width - 1 : t.align === 'center' ? width / 2 : textPad(t.fontSize);
  // Hang-above-em-square (some display fonts) plus padding — centering on
  // 'middle' was clipping cap-height after InfoPanel import.
  const hang = ctx.measureText(t.text).actualBoundingBoxAscent ?? 0;
  const y = textPad(t.fontSize) + Math.ceil(Math.max(0, hang));
  ctx.fillText(t.text, x, y);
}
