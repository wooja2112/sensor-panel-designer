// Writes a real AIDA64 SensorPanel bundle (.spzip): a zip containing the
// panel definition text file plus every image it references as sibling
// files — reverse-engineered from AIDA64's own official downloadable
// template (SensorPanel-Core-2625-1024x600.spzip, SWVER 8.25.8226 Beta,
// SPVER 200), not guessed. Confirmed structure:
//
//   <SPVER>200</SPVER><SWVER>...</SWVER>
//   <SPWIDTH>W</SPWIDTH><SPHEIGHT>H</SPHEIGHT><SPBGCOLOR>-1</SPBGCOLOR>
//   <ID>IMG</ID><BGIMG>1</BGIMG><ITMX>0</ITMX><ITMY>0</ITMY><IMGFIL>background.png</IMGFIL>
//   <ID>IMG</ID><BGIMG>0</BGIMG><RESIZW>w</RESIZW><RESIZH>h</RESIZH><ITMX>x</ITMX><ITMY>y</ITMY><IMGFIL>name.png</IMGFIL>
//   <ID>[GAUGE]TCPU</ID><LBL>CPU</LBL><TYP>Custom</TYP><SIZ>S</SIZ>
//     <RESIZW>w</RESIZW><RESIZH>h</RESIZH><MINVAL>0</MINVAL><MAXVAL>90</MAXVAL>
//     <SHWICO>0</SHWICO><SHWVAL>0</SHWVAL><TXTSIZ>18</TXTSIZ><FNTNAM>Segoe UI</FNTNAM>
//     <VALCOL>16695303</VALCOL><VALBI>10</VALBI><ITMX>x</ITMX><ITMY>y</ITMY>
//     <STAFLS>a.png|b.png|...|p.png</STAFLS>   (always exactly 16, '|'-joined)
//
// The file itself is UTF-16LE with a BOM, CRLF between items, no XML
// escaping and no item count — a reader just consumes items until EOF.
// Extra zip entries (including design.sensorpaneldesign) are ignored by
// AIDA64, which is how our own exports round-trip through Open.
//
// The one thing this cannot fill in: [GAUGE] items key off a real hardware
// sensor mnemonic (TCPU, SMASTVOL, SCPUUTI, ...) read live from the machine
// running AIDA64, which this app has no access to. Items exported disabled
// (a leading "-" on the ID) don't show up in AIDA64 at all — confirmed by
// testing a real import — so instead, any gauge without an explicit
// aidaSensorId falls back to SCPUUTI ("CPU Utilization", confirmed from the
// same official template, a natural 0-100% metric) and is always enabled.
import { renderBackground } from './backgroundRender';
import { frameOnCount, gaugeSensorRange, isStaticGaugeMode } from './gaugeRender';
import type { ThemesMap } from './gaugeRender';
import type { GaugeInstance, PanelConfig } from '../types';
import { loadImage, preloadImages } from './imageCache';
import { JSZip } from './zip';
import { designImageSrcs, renderGaugeCanvas } from './compose';
import { DESIGN_SIDECAR_NAME, serializePanelFile } from './file';

const AIDA_STATE_COUNT = 16;
const DEFAULT_SENSOR_ID = 'SCPUUTI'; // AIDA64's real mnemonic for "CPU Utilization"

// AIDA64 (a Delphi/VCL app) stores colors as a Windows COLORREF: 0x00BBGGRR,
// i.e. red in the low byte — not the RRGGBB order a web #hex uses.
function hexToColorRef(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return r + g * 256 + b * 65536;
}

function slugify(name: string, fallback: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || fallback;
}

// Tag values are plain text with no escaping in this format, so a stray
// "<" or ">" in a user-chosen name would corrupt the tag stream.
function sanitizeTagText(text: string): string {
  return text.replace(/[<>]/g, '');
}

function sanitizeSensorId(id: string): string {
  return id.toUpperCase().replace(/[^A-Z0-9_]/g, '');
}

async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Canvas PNG encoding failed.'))), 'image/png');
  });
}

function renderGauge(gauge: GaugeInstance, themes: ThemesMap, onCount: number): HTMLCanvasElement {
  return renderGaugeCanvas(gauge, themes, onCount);
}

export type AidaItem =
  | { kind: 'image'; file: string; x: number; y: number; width: number; height: number }
  | {
    kind: 'gauge';
    // Raw user input; sanitized here, and blank falls back to SCPUUTI.
    sensorId: string;
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
    min: number;
    max: number;
    stateFiles: string[];
  };

export interface AidaPanelSpec {
  width: number;
  height: number;
  bgColor: string;
  backgroundFile: string;
  items: AidaItem[];
}

export function isDefaultedAidaSensorId(sensorId: string): boolean {
  return !sanitizeSensorId(sensorId);
}

function aidaItemLine(item: AidaItem): string {
  if (item.kind === 'image') {
    return (
      `<ID>IMG</ID><BGIMG>0</BGIMG><RESIZW>${item.width}</RESIZW><RESIZH>${item.height}</RESIZH>` +
      `<ITMX>${item.x}</ITMX><ITMY>${item.y}</ITMY><IMGFIL>${item.file}</IMGFIL>`
    );
  }
  const idTag = `[GAUGE]${sanitizeSensorId(item.sensorId) || DEFAULT_SENSOR_ID}`;
  return (
    `<ID>${idTag}</ID><LBL>${sanitizeTagText(item.label)}</LBL><TYP>Custom</TYP><SIZ>S</SIZ>` +
    `<RESIZW>${item.width}</RESIZW><RESIZH>${item.height}</RESIZH>` +
    `<MINVAL>${item.min}</MINVAL><MAXVAL>${item.max}</MAXVAL><SHWICO>0</SHWICO><SHWVAL>0</SHWVAL>` +
    `<TXTSIZ>12</TXTSIZ><FNTNAM>Segoe UI</FNTNAM><VALCOL>16777215</VALCOL><VALBI>00</VALBI>` +
    `<ITMX>${item.x}</ITMX><ITMY>${item.y}</ITMY><STAFLS>${item.stateFiles.join('|')}</STAFLS>`
  );
}

export function buildAidaPanelText(spec: AidaPanelSpec): string {
  const lines = [
    `<SPVER>200</SPVER><SWVER>Sensor Panel Designer</SWVER>`,
    `<SPWIDTH>${spec.width}</SPWIDTH><SPHEIGHT>${spec.height}</SPHEIGHT><SPBGCOLOR>${hexToColorRef(spec.bgColor)}</SPBGCOLOR>`,
    `<ID>IMG</ID><BGIMG>1</BGIMG><ITMX>0</ITMX><ITMY>0</ITMY><IMGFIL>${spec.backgroundFile}</IMGFIL>`,
    ...spec.items.map(aidaItemLine),
  ];
  return lines.join('\r\n') + '\r\n';
}

// AIDA64 always divides a Custom gauge's MINVAL..MAXVAL span into exactly
// 16 states, regardless of how many segments this app's own preview uses —
// so state stepping here is independent of the gauge's nSegs.
export function aidaStateOnCounts(nSegs: number): number[] {
  return Array.from({ length: AIDA_STATE_COUNT }, (_, state) => frameOnCount(state, AIDA_STATE_COUNT, nSegs));
}

export interface BundleFile {
  name: string;
  data: Blob | Uint8Array;
}

export type Aida64ExportProgress = (message: string) => void;

async function buildBundleParts(panel: PanelConfig, gauges: GaugeInstance[], themes: ThemesMap, onProgress?: Aida64ExportProgress) {
  const files: BundleFile[] = [];
  const items: AidaItem[] = [];
  const usedNames = new Set<string>();
  const defaultedGaugeNames: string[] = [];

  function uniqueName(base: string): string {
    let name = base;
    let n = 2;
    while (usedNames.has(name)) name = `${base.replace(/\.png$/, '')}-${n++}.png`;
    usedNames.add(name);
    return name;
  }

  onProgress?.('Rendering panel background…');
  await preloadImages(designImageSrcs(panel, gauges));
  if (panel.background.image) {
    try {
      await loadImage(panel.background.image);
    } catch {
      // Export without the image rather than blocking the whole bundle.
    }
  }
  const bgCanvas = document.createElement('canvas');
  bgCanvas.width = Math.max(1, Math.round(panel.width));
  bgCanvas.height = Math.max(1, Math.round(panel.height));
  renderBackground(bgCanvas.getContext('2d')!, bgCanvas.width, bgCanvas.height, panel.background);
  const bgName = uniqueName('background.png');
  files.push({ name: bgName, data: await canvasToPngBlob(bgCanvas) });

  let anon = 1;
  let gaugeIndex = 0;
  for (const gauge of gauges) {
    gaugeIndex++;
    const slug = slugify(gauge.name, `gauge-${anon++}`);

    if (isStaticGaugeMode(gauge.opts.mode)) {
      onProgress?.(`Rendering "${gauge.name}" (${gaugeIndex}/${gauges.length})…`);
      const canvas = renderGauge(gauge, themes, 0);
      const name = uniqueName(`${slug}.png`);
      files.push({ name, data: await canvasToPngBlob(canvas) });
      items.push({
        kind: 'image',
        file: name,
        x: Math.round(gauge.x),
        y: Math.round(gauge.y),
        width: Math.round(gauge.width),
        height: Math.round(gauge.height),
      });
      continue;
    }

    const stateNames: string[] = [];
    const stateOnCounts = aidaStateOnCounts(gauge.opts.nSegs);
    // drawOn may resize the canvas (swapping width/height) for a
    // 90°/270°-rotated bar gauge, so RESIZW/RESIZH/ITMX/ITMY below use the
    // *actual* rendered pixel size rather than gauge.width/height — otherwise
    // AIDA64 would stretch the correctly-rotated PNG back into the wrong,
    // un-rotated box. All 16 states share the same size, so any one canvas's
    // dimensions after rendering are representative.
    let renderedWidth = Math.round(gauge.width);
    let renderedHeight = Math.round(gauge.height);
    for (let state = 0; state < AIDA_STATE_COUNT; state++) {
      onProgress?.(`Rendering "${gauge.name}" (${gaugeIndex}/${gauges.length}) — state ${state + 1}/${AIDA_STATE_COUNT}…`);
      const canvas = renderGauge(gauge, themes, stateOnCounts[state]);
      renderedWidth = canvas.width;
      renderedHeight = canvas.height;
      const name = uniqueName(`${slug}-${String(state).padStart(2, '0')}.png`);
      files.push({ name, data: await canvasToPngBlob(canvas) });
      stateNames.push(name);
    }

    // Centered on the gauge's original (un-rotated) bounding box, matching
    // how the app's own panel compositor places a resized render (compose.ts).
    const itmX = Math.round(gauge.x + gauge.width / 2 - renderedWidth / 2);
    const itmY = Math.round(gauge.y + gauge.height / 2 - renderedHeight / 2);

    if (isDefaultedAidaSensorId(gauge.aidaSensorId)) defaultedGaugeNames.push(gauge.name);
    const range = gaugeSensorRange(gauge.opts);
    items.push({
      kind: 'gauge',
      sensorId: gauge.aidaSensorId,
      label: gauge.name,
      x: itmX,
      y: itmY,
      width: renderedWidth,
      height: renderedHeight,
      min: range.min,
      max: range.max,
      stateFiles: stateNames,
    });
  }

  const defText = buildAidaPanelText({
    width: bgCanvas.width,
    height: bgCanvas.height,
    bgColor: panel.background.transparentBackground ? '#ffffff' : panel.background.color,
    backgroundFile: bgName,
    items,
  });

  return { defText, files, defaultedGaugeNames };
}

// AIDA64's own exports are UTF-16LE with a BOM; matching that byte-for-byte
// rather than guessing UTF-8 would also be accepted.
export function toUtf16LEBytes(text: string): Uint8Array {
  const buf = new Uint8Array(2 + text.length * 2);
  buf[0] = 0xff;
  buf[1] = 0xfe;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    buf[2 + i * 2] = code & 0xff;
    buf[2 + i * 2 + 1] = (code >> 8) & 0xff;
  }
  return buf;
}

export function buildAidaZip(defText: string, sidecarJson: string, files: BundleFile[]): JSZip {
  const zip = new JSZip();
  zip.file('panel.sp2', toUtf16LEBytes(defText));
  zip.file(DESIGN_SIDECAR_NAME, sidecarJson);
  for (const f of files) zip.file(f.name, f.data);
  return zip;
}

export async function downloadAida64Bundle(
  panel: PanelConfig, gauges: GaugeInstance[], themes: ThemesMap, filename: string, onProgress?: Aida64ExportProgress,
): Promise<{ defaultedGaugeNames: string[] }> {
  const { defText, files, defaultedGaugeNames } = await buildBundleParts(panel, gauges, themes, onProgress);

  onProgress?.(`Packaging .spzip (${files.length + 1} files)…`);
  const zip = buildAidaZip(defText, serializePanelFile(panel, gauges, themes), files);

  // PNGs are already compressed — DEFLATE-recompressing them buys almost
  // nothing but costs real time in JSZip's pure-JS deflate, so store them
  // uncompressed instead.
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });

  onProgress?.('Starting download…');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);

  return { defaultedGaugeNames };
}
