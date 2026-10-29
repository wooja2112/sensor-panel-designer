// Measuring and drawing text-mode gauges (labels, including ones
// reconstructed from InfoPanel text items). A label can be rotated about its
// box center and stays inside its box, so exports and compositing need no
// special casing.
import type { ImportedText } from '../types';
import type { DrawOptions } from './gaugeRender';

export function importedTextFont(t: ImportedText): string {
  const family = /[^a-zA-Z0-9-]/.test(t.font) ? `"${t.font.replace(/"/g, '')}"` : t.font;
  return `${t.italic ? 'italic ' : ''}${t.bold ? '700 ' : '400 '}${t.fontSize}px ${family}, sans-serif`;
}

export function importedTextFromOpts(opts: DrawOptions): ImportedText {
  return {
    text: opts.textContent,
    font: opts.textFont,
    fontSize: opts.textFontSize,
    bold: opts.textBold,
    italic: opts.textItalic,
    color: opts.textColor,
    align: opts.textAlign,
  };
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
  // Height follows drawTextLine, which hangs the text from the em-square
  // top rather than the ink top, so the ink sits lower by the font's ascent
  // minus the glyphs' — measuring from the ink alone clipped it.
  ctx.textBaseline = 'top';
  const top = ctx.measureText(t.text);
  const hang = Math.ceil(Math.max(0, top.actualBoundingBoxAscent ?? 0));
  const belowTop = Math.ceil(Math.max(top.actualBoundingBoxDescent ?? t.fontSize * 1.05, t.fontSize * 0.75 + 1));
  return {
    width: left + right + pad * 2,
    height: hang + belowTop + pad * 2,
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

export function normalizeRotation(deg: number): number {
  return Number.isFinite(deg) ? ((deg % 360) + 360) % 360 : 0;
}

function isQuarterTurn(deg: number): boolean {
  return deg === 90 || deg === 270;
}

// The un-rotated frame the text is laid out in before it's turned about the
// box center. Right angles keep the box's own (swapped for 90°/270°) frame
// so alignment still means something; other angles use the measured text
// size.
export function textFrameSize(t: ImportedText, rotation: number, boxWidth: number, boxHeight: number): { width: number; height: number } {
  const rot = normalizeRotation(rotation);
  if (rot === 0 || rot === 180) return { width: boxWidth, height: boxHeight };
  if (isQuarterTurn(rot)) return { width: boxHeight, height: boxWidth };
  return measureImportedText(t);
}

// Axis-aligned bounds of a width x height rectangle rotated by `rotation`.
export function rotatedBounds(width: number, height: number, rotation: number): { width: number; height: number } {
  const rot = normalizeRotation(rotation);
  if (rot === 0 || rot === 180) return { width, height };
  if (isQuarterTurn(rot)) return { width: height, height: width };
  const a = rot * Math.PI / 180;
  const sin = Math.abs(Math.sin(a)), cos = Math.abs(Math.cos(a));
  return { width: Math.ceil(width * cos + height * sin), height: Math.ceil(width * sin + height * cos) };
}

export function drawImportedText(ctx: CanvasRenderingContext2D, t: ImportedText, width: number, height: number, rotation = 0) {
  const rot = normalizeRotation(rotation);
  if (rot === 0) {
    drawTextLine(ctx, t, width);
    return;
  }
  const frame = textFrameSize(t, rot, width, height);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(rot * Math.PI / 180);
  ctx.translate(-frame.width / 2, -frame.height / 2);
  drawTextLine(ctx, t, frame.width);
  ctx.restore();
}

function drawTextLine(ctx: CanvasRenderingContext2D, t: ImportedText, width: number) {
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
