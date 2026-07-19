import { renderBackground } from './backgroundRender';
import { drawOn, previewValueToOnCount } from './gaugeRender';
import type { ThemesMap } from './gaugeRender';
import type { GaugeInstance, PanelConfig } from '../types';
import { resolveDrawOptions } from '../types';

// Shared by both the live workspace preview and the "export panel PNG" flow,
// so what you see is exactly what gets exported.
export function renderPanel(canvas: HTMLCanvasElement, panel: PanelConfig, gauges: GaugeInstance[], themes: ThemesMap) {
  canvas.width = panel.width;
  canvas.height = panel.height;
  const ctx = canvas.getContext('2d')!;
  renderBackground(ctx, panel.width, panel.height, panel.background);

  for (const gauge of gauges) {
    const off = document.createElement('canvas');
    off.width = Math.max(1, Math.round(gauge.width));
    off.height = Math.max(1, Math.round(gauge.height));
    const opts = resolveDrawOptions(gauge, themes);
    const onCount = previewValueToOnCount(gauge.previewValue, opts.nSegs);
    // drawOn may resize `off` (swapping width/height) for a 90°/270°-rotated
    // bar gauge, so it's centered at the gauge's original center rather than
    // placed by top-left corner — that keeps it aligned with the selection
    // outline, which rotates in place around that same center (CSS
    // transform default origin) in CanvasWorkspace.
    drawOn(off, onCount, opts);
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
