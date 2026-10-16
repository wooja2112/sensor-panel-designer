import { renderBackground } from './backgroundRender';
import { drawOn, previewValueToOnCount } from './gaugeRender';
import type { ThemesMap } from './gaugeRender';
import type { GaugeInstance, PanelConfig } from '../types';
import { resolveDrawOptions } from '../types';
import { getCachedImage } from './imageCache';

export function designImageSrcs(panel: PanelConfig, gauges: GaugeInstance[]): string[] {
  const srcs: string[] = [];
  if (panel.background.image) srcs.push(panel.background.image);
  for (const gauge of gauges) {
    if (gauge.importedImage) srcs.push(gauge.importedImage);
  }
  return srcs;
}

// One gauge onto its own canvas — used by the panel compositor and every
// exporter, so imported bitmaps and live drawOn() stay on the same path.
export function renderGaugeCanvas(gauge: GaugeInstance, themes: ThemesMap, onCount: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(gauge.width));
  canvas.height = Math.max(1, Math.round(gauge.height));
  if (gauge.importedImage) {
    const img = getCachedImage(gauge.importedImage);
    if (img) canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  }
  drawOn(canvas, onCount, resolveDrawOptions(gauge, themes));
  return canvas;
}

// Shared by both the live workspace preview and the "export panel PNG" flow,
// so what you see is exactly what gets exported.
export function renderPanel(canvas: HTMLCanvasElement, panel: PanelConfig, gauges: GaugeInstance[], themes: ThemesMap) {
  canvas.width = panel.width;
  canvas.height = panel.height;
  const ctx = canvas.getContext('2d')!;
  renderBackground(ctx, panel.width, panel.height, panel.background);

  for (const gauge of gauges) {
    const opts = resolveDrawOptions(gauge, themes);
    const onCount = previewValueToOnCount(gauge.previewValue, opts.nSegs);
    // drawOn may resize `off` (swapping width/height) for a 90°/270°-rotated
    // bar gauge, so it's centered at the gauge's original center rather than
    // placed by top-left corner — that keeps it aligned with the selection
    // outline, which rotates in place around that same center (CSS
    // transform default origin) in CanvasWorkspace.
    const off = renderGaugeCanvas(gauge, themes, onCount);
    const centerX = gauge.x + gauge.width / 2;
    const centerY = gauge.y + gauge.height / 2;
    ctx.drawImage(off, centerX - off.width / 2, centerY - off.height / 2);
  }
}

export function timestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

export function downloadCanvasPng(canvas: HTMLCanvasElement, filename: string) {
  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}
