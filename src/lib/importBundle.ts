// Opens .sensorpaneldesign JSON, or a .spzip / .infopanel zip.
//
// Our own zip exports include a root `design.sensorpaneldesign` sidecar
// (see lib/file.ts). AIDA64 and InfoPanel ignore unknown root files, so
// that path is lossless. Third-party bundles only store pre-rendered PNGs
// plus layout/sensor tags — those reconstruct as positioned bitmaps
// (`importedImage`) rather than live DrawOptions.
import type JSZip from 'jszip';
import { JSZip as Zip } from './zip';
import { DESIGN_SIDECAR_NAME, SENSOR_PANEL_FILE_VERSION, parsePanelFile, type SensorPanelFile } from './file';
import { defaultBackgroundOptions } from './backgroundRender';
import { DEFAULT_THEMES } from './gaugeRender';
import { defaultPanelConfig, normalizeGauge, type GaugeInstance, type ImportedText } from '../types';
import { measureImportedText } from './importedText';

export interface AidaParsedItem {
  id: string;
  tags: Record<string, string>;
}

export interface AidaParsedPanel {
  width: number;
  height: number;
  bgColor: string;
  items: AidaParsedItem[];
}

export interface InfoPanelParsedItem {
  type: 'image' | 'gauge' | 'text';
  name: string;
  x: number;
  y: number;
  // 0 means “use the PNG’s native size”, matching InfoPanel’s DisplayItem
  // defaults (Width/Height start at 0 and XmlSerializer omits them).
  width: number;
  height: number;
  // Percent, default 100 — also omitted from XML when unchanged.
  scale: number;
  filePaths: string[];
  hwinfoSensorLabel: string;
  text: ImportedText | null;
}

export interface InfoPanelParsedProfile {
  width: number;
  height: number;
  color: string;
  transparent: boolean;
  items: InfoPanelParsedItem[];
}

export function colorRefToHex(n: number): string {
  if (n < 0) return '#ffffff';
  const r = n & 255;
  const g = (n >> 8) & 255;
  const b = (n >> 16) & 255;
  return `#${[r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')}`;
}

export function decodeAidaDefBytes(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

function parseAidaTags(chunk: string): Record<string, string> {
  const tags: Record<string, string> = {};
  const re = /<([A-Z0-9]+)>([^<]*)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(chunk))) {
    tags[m[1].toUpperCase()] = m[2];
  }
  return tags;
}

export function parseAidaPanelText(text: string): AidaParsedPanel {
  const chunks = text.split(/(?=<ID>)/i).map(s => s.trim()).filter(Boolean);
  let width = 480;
  let height = 272;
  let bgColor = '#ffffff';
  const items: AidaParsedItem[] = [];
  for (const chunk of chunks) {
    const tags = parseAidaTags(chunk);
    if (tags.SPWIDTH) width = parseInt(tags.SPWIDTH, 10) || width;
    if (tags.SPHEIGHT) height = parseInt(tags.SPHEIGHT, 10) || height;
    if (tags.SPBGCOLOR != null && tags.SPBGCOLOR !== '') {
      const n = parseInt(tags.SPBGCOLOR, 10);
      if (!Number.isNaN(n) && n >= 0) bgColor = colorRefToHex(n);
    }
    if (tags.ID) items.push({ id: tags.ID, tags });
  }
  return { width, height, bgColor, items };
}

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function xmlTag(block: string, tag: string): string | undefined {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? decodeXml(m[1]) : undefined;
}

function xmlInt(block: string, tag: string, fallback = 0): number {
  const raw = xmlTag(block, tag);
  if (raw == null) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function xmlBool(block: string, tag: string, fallback = false): boolean {
  const raw = xmlTag(block, tag);
  if (raw == null) return fallback;
  return raw.trim().toLowerCase() === 'true';
}

function xmlFloat(block: string, tag: string, fallback = 1): number {
  const raw = xmlTag(block, tag);
  if (raw == null) return fallback;
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function formatDotNetDate(format: string, date: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const h24 = date.getHours();
  const h12 = h24 % 12 || 12;
  const values: Record<string, string> = {
    yyyy: String(date.getFullYear()),
    tt: h24 >= 12 ? 'PM' : 'AM',
    HH: pad(h24),
    hh: pad(h12),
    MM: pad(date.getMonth() + 1),
    mm: pad(date.getMinutes()),
    ss: pad(date.getSeconds()),
    dd: pad(date.getDate()),
    M: String(date.getMonth() + 1),
    d: String(date.getDate()),
    H: String(h24),
    h: String(h12),
  };
  // Longest tokens first, via placeholders, so `M` cannot rewrite `AM`.
  const order = ['yyyy', 'tt', 'HH', 'hh', 'MM', 'mm', 'ss', 'dd', 'M', 'd', 'H', 'h'];
  let result = format;
  const held: string[] = [];
  for (const tok of order) {
    const ph = `\u0001${held.length}\u0001`;
    held.push(values[tok]);
    result = result.split(tok).join(ph);
  }
  held.forEach((value, i) => {
    result = result.split(`\u0001${i}\u0001`).join(value);
  });
  return result;
}

export function sampleSensorDisplayText(opts: {
  name: string;
  unit: string;
  showUnit: boolean;
  showName: boolean;
  uppercase: boolean;
  precision: number;
  overridePrecision: boolean;
}): string {
  let unit = opts.unit;
  if (!unit && opts.showUnit) {
    if (/temp/i.test(opts.name)) unit = '°C';
    else if (/util|usage|percent|load/i.test(opts.name)) unit = '%';
  }
  let value = '68';
  if (/temp/i.test(opts.name) || /°\s*c/i.test(unit) || unit.toLowerCase() === 'c') value = '56';
  else if (/fps/i.test(opts.name)) value = '0';
  if (opts.overridePrecision) {
    const n = Number(value);
    value = opts.precision <= 0 ? String(Math.floor(n)) : n.toFixed(opts.precision);
  }
  let text = value;
  if (opts.showUnit) text += unit;
  if (opts.showName) text = `${opts.name} ${text}`;
  return opts.uppercase ? text.toUpperCase() : text;
}

function infoPanelColor(raw: string | undefined): string {
  if (!raw) return '#000000';
  const h = raw.replace('#', '').trim();
  if (h.length === 8) {
    const a = parseInt(h.slice(0, 2), 16) / 255;
    const r = parseInt(h.slice(2, 4), 16);
    const g = parseInt(h.slice(4, 6), 16);
    const b = parseInt(h.slice(6, 8), 16);
    if (!Number.isFinite(a + r + g + b)) return '#000000';
    if (a >= 1) return `#${h.slice(2).toLowerCase()}`;
    return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
  }
  if (h.length === 6) return `#${h.toLowerCase()}`;
  return raw.startsWith('#') ? raw : `#${raw}`;
}

function parseImportedText(kind: string, own: string, name: string, fontScale: number): ImportedText | null {
  if (!/TextDisplayItem|SensorDisplayItem|ClockDisplayItem|CalendarDisplayItem/i.test(kind)) return null;
  const uppercase = xmlBool(own, 'Uppercase');
  const format = xmlTag(own, 'Format');
  let text: string;
  if (/ClockDisplayItem/i.test(kind)) {
    text = formatDotNetDate(format || 'hh:mm:ss tt', new Date());
    if (uppercase) text = text.toUpperCase();
  } else if (/CalendarDisplayItem/i.test(kind)) {
    text = formatDotNetDate(format || 'dd/MM/yyyy', new Date());
    if (uppercase) text = text.toUpperCase();
  } else if (/SensorDisplayItem/i.test(kind)) {
    text = sampleSensorDisplayText({
      name,
      unit: xmlTag(own, 'Unit') ?? '',
      showUnit: xmlBool(own, 'ShowUnit', true),
      showName: xmlBool(own, 'ShowName', false),
      uppercase,
      precision: xmlInt(own, 'Precision', 0),
      overridePrecision: xmlBool(own, 'OverridePrecision', false),
    });
  } else {
    text = uppercase ? name.toUpperCase() : name;
  }
  const center = xmlBool(own, 'CenterAlign');
  const right = xmlBool(own, 'RightAlign');
  return {
    text,
    font: xmlTag(own, 'Font') || 'Segoe UI',
    fontSize: Math.max(1, Math.round(xmlInt(own, 'FontSize', 20) * fontScale)),
    bold: xmlBool(own, 'Bold'),
    italic: xmlBool(own, 'Italic'),
    color: infoPanelColor(xmlTag(own, 'Color')),
    align: center ? 'center' : right ? 'right' : 'left',
  };
}

function itemType(kind: string): InfoPanelParsedItem['type'] | null {
  if (/GaugeDisplayItem/i.test(kind)) return 'gauge';
  if (/SensorImageDisplayItem|HttpImageDisplayItem|ImageDisplayItem/i.test(kind)) return 'image';
  if (/TextDisplayItem|SensorDisplayItem|ClockDisplayItem|CalendarDisplayItem/i.test(kind)) return 'text';
  return null;
}

// Nested <Images> carry their own X/Y/Width that InfoPanel ignores for
// layout (see infopanel.ts). Strip them so parent tags win.
function itemOwnXml(block: string): string {
  return block.replace(/<Images\b[\s\S]*?<\/Images>/gi, '');
}

function xsiType(attrs: string): string {
  return /xsi:type\s*=\s*"([^"]+)"/i.exec(attrs)?.[1] ?? '';
}

export function parseProfileArgb(value: string): { color: string; transparent: boolean } {
  const h = value.replace('#', '').trim();
  if (h.length === 8) {
    return {
      color: `#${h.slice(2).toLowerCase()}`,
      transparent: h.slice(0, 2).toLowerCase() === '00',
    };
  }
  if (h.length === 6) return { color: `#${h.toLowerCase()}`, transparent: false };
  return { color: '#ffffff', transparent: false };
}

export function parseInfoPanelName(name: string): { name: string; hwinfoSensorLabel: string } {
  const m = name.match(/^(.*) \(HWInfo: (.*)\)\s*$/);
  if (m) return { name: m[1], hwinfoSensorLabel: m[2] };
  return { name, hwinfoSensorLabel: '' };
}

export function parseInfoPanelXml(profileXml: string, displayItemsXml: string): InfoPanelParsedProfile {
  const width = xmlInt(profileXml, 'Width', defaultPanelConfig().width);
  const height = xmlInt(profileXml, 'Height', defaultPanelConfig().height);
  const fontScale = xmlFloat(profileXml, 'FontScale', 1);
  const argb = parseProfileArgb(xmlTag(profileXml, 'BackgroundColor') ?? '#FFFFFFFF');
  const items: InfoPanelParsedItem[] = [];
  // xsi:type can sit after xmlns on the opening tag; require the attribute
  // anywhere, not only as the first one.
  const re = /<DisplayItem\b([^>]*)>([\s\S]*?)<\/DisplayItem>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(displayItemsXml))) {
    const kind = xsiType(m[1]);
    const type = itemType(kind);
    if (!type) continue;
    const block = m[2];
    const own = itemOwnXml(block);
    if (xmlBool(own, 'Hidden')) continue;
    const parsedName = parseInfoPanelName(xmlTag(own, 'Name') ?? 'Item');
    const filePaths = [...block.matchAll(/<FilePath>([^<]*)<\/FilePath>/gi)].map(p => decodeXml(p[1]));
    items.push({
      type,
      name: parsedName.name,
      // DisplayItem.X/Y default to 100, and XmlSerializer omits defaults.
      x: xmlInt(own, 'X', 100),
      y: xmlInt(own, 'Y', 100),
      width: xmlInt(own, 'Width', 0),
      height: xmlInt(own, 'Height', 0),
      scale: xmlInt(own, 'Scale', 100),
      filePaths,
      hwinfoSensorLabel: parsedName.hwinfoSensorLabel,
      text: type === 'text' ? parseImportedText(kind, own, parsedName.name, fontScale) : null,
    });
  }
  return { width, height, color: argb.color, transparent: argb.transparent, items };
}

function zipPathNorm(name: string): string {
  return name.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
}

function findZipFile(zip: JSZip, ...candidates: string[]) {
  const files = Object.keys(zip.files).filter(k => !zip.files[k].dir);
  for (const cand of candidates) {
    const want = zipPathNorm(cand);
    const key = files.find(k => {
      const n = zipPathNorm(k);
      return n === want || n.endsWith(`/${want}`);
    });
    if (key) return zip.files[key];
  }
  return undefined;
}

function uint8ToDataUrl(bytes: Uint8Array, mime: string): string {
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = dv.getUint32(16);
  const height = dv.getUint32(20);
  if (!width || !height) return null;
  return { width, height };
}

function imageMime(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[8] === 0x57 && bytes[9] === 0x45) return 'image/webp';
  return 'image/png';
}

async function zipPngDataUrl(zip: JSZip, path: string): Promise<string | null> {
  const img = await zipImage(zip, path);
  return img?.dataUrl ?? null;
}

async function zipImage(zip: JSZip, path: string): Promise<{ dataUrl: string; width: number; height: number } | null> {
  const base = path.replace(/\\/g, '/').split('/').pop() ?? path;
  let entry = findZipFile(zip, path, base, `assets/${base}`, `assets\\${base}`);
  if (!entry) {
    const files = Object.keys(zip.files).filter(k => !zip.files[k].dir);
    const matches = files.filter(k => (zipPathNorm(k).split('/').pop() ?? '') === zipPathNorm(base));
    if (matches.length > 0) entry = zip.files[matches[0]];
  }
  if (!entry) return null;
  const bytes = await entry.async('uint8array');
  const size = pngSize(bytes) ?? await rasterSize(bytes);
  return {
    dataUrl: uint8ToDataUrl(bytes, imageMime(bytes)),
    width: size?.width ?? 0,
    height: size?.height ?? 0,
  };
}

async function rasterSize(bytes: Uint8Array): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    const bmp = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
    const size = { width: bmp.width, height: bmp.height };
    bmp.close();
    return size.width && size.height ? size : null;
  } catch {
    return null;
  }
}

function visualSize(item: InfoPanelParsedItem, imageW: number, imageH: number): { width: number; height: number } {
  const scale = (item.scale || 100) / 100;
  let width = item.width || 0;
  let height = item.height || 0;
  if (width === 0) width = imageW;
  if (height === 0) height = imageH;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function pickFrame(paths: string[], fraction: number): string | undefined {
  if (paths.length === 0) return undefined;
  const idx = Math.min(paths.length - 1, Math.max(0, Math.round((paths.length - 1) * fraction)));
  return paths[idx];
}

function bitmapGauge(partial: {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  importedImage?: string | null;
  importedText?: ImportedText | null;
  aidaSensorId?: string;
  hwinfoSensorLabel?: string;
  mode?: GaugeInstance['opts']['mode'];
}): GaugeInstance {
  return normalizeGauge({
    name: partial.name,
    x: Math.round(partial.x),
    y: Math.round(partial.y),
    width: Math.max(1, Math.round(partial.width)),
    height: Math.max(1, Math.round(partial.height)),
    previewValue: 68,
    themeKey: 'classic',
    aidaSensorId: partial.aidaSensorId ?? '',
    hwinfoSensorLabel: partial.hwinfoSensorLabel ?? '',
    importedImage: partial.importedImage ?? null,
    importedText: partial.importedText ?? null,
    opts: { mode: partial.mode ?? 'container' },
  });
}

function aidaSensorIdFromItemId(id: string): string {
  return id.replace(/^-/, '').replace(/^\[GAUGE\]/i, '').replace(/[^A-Z0-9_]/gi, '').toUpperCase();
}

async function importAidaZip(zip: JSZip): Promise<SensorPanelFile> {
  const def = findZipFile(zip, 'panel.sp2');
  if (!def) throw new Error('That .spzip is missing panel.sp2.');
  const parsed = parseAidaPanelText(decodeAidaDefBytes(await def.async('uint8array')));
  let backgroundImage: string | null = null;
  const gauges: GaugeInstance[] = [];

  for (const item of parsed.items) {
    const id = item.id;
    const isImg = /^IMG$/i.test(id);
    const isGauge = /\[GAUGE\]/i.test(id);
    if (isImg && item.tags.BGIMG === '1') {
      const file = item.tags.IMGFIL;
      if (file) backgroundImage = await zipPngDataUrl(zip, file);
      continue;
    }
    if (isImg) {
      const file = item.tags.IMGFIL;
      gauges.push(bitmapGauge({
        name: item.tags.LBL || file?.replace(/\.png$/i, '') || 'Image',
        x: parseInt(item.tags.ITMX ?? '0', 10) || 0,
        y: parseInt(item.tags.ITMY ?? '0', 10) || 0,
        width: parseInt(item.tags.RESIZW ?? '1', 10) || 1,
        height: parseInt(item.tags.RESIZH ?? '1', 10) || 1,
        importedImage: file ? await zipPngDataUrl(zip, file) : null,
        mode: 'image',
      }));
      continue;
    }
    if (isGauge) {
      const frames = (item.tags.STAFLS ?? '').split('|').map(s => s.trim()).filter(Boolean);
      const file = pickFrame(frames, 0.68);
      gauges.push(bitmapGauge({
        name: item.tags.LBL || aidaSensorIdFromItemId(id) || 'Gauge',
        x: parseInt(item.tags.ITMX ?? '0', 10) || 0,
        y: parseInt(item.tags.ITMY ?? '0', 10) || 0,
        width: parseInt(item.tags.RESIZW ?? '1', 10) || 1,
        height: parseInt(item.tags.RESIZH ?? '1', 10) || 1,
        importedImage: file ? await zipPngDataUrl(zip, file) : null,
        aidaSensorId: aidaSensorIdFromItemId(id),
        mode: 'bar',
      }));
    }
  }

  const panel = {
    width: parsed.width,
    height: parsed.height,
    background: {
      ...defaultBackgroundOptions(),
      color: parsed.bgColor,
      image: backgroundImage,
      imageFit: 'actual' as const,
      pattern: 'none' as const,
    },
  };

  return {
    version: SENSOR_PANEL_FILE_VERSION,
    panel,
    gauges,
    themes: structuredClone(DEFAULT_THEMES),
  };
}

function isFullPanelBackground(
  item: InfoPanelParsedItem, size: { width: number; height: number }, panelW: number, panelH: number,
): boolean {
  if (item.type !== 'image') return false;
  if (item.x !== 0 || item.y !== 0) return false;
  const covers = size.width >= panelW * 0.85 && size.height >= panelH * 0.85;
  const named = /background|border/i.test(item.name);
  return covers || named;
}

async function importInfoPanelZip(zip: JSZip): Promise<SensorPanelFile> {
  const profileEntry = findZipFile(zip, 'Profile.xml');
  const itemsEntry = findZipFile(zip, 'DisplayItems.xml');
  if (!profileEntry || !itemsEntry) {
    throw new Error('That .infopanel is missing Profile.xml or DisplayItems.xml.');
  }
  const parsed = parseInfoPanelXml(await profileEntry.async('string'), await itemsEntry.async('string'));
  let backgroundImage: string | null = null;
  const gauges: GaugeInstance[] = [];

  for (const item of parsed.items) {
    if (item.type === 'text' && item.text) {
      const size = measureImportedText(item.text, item.width, item.height);
      const x = item.text.align === 'right' && item.width === 0 ? item.x - size.width : item.x;
      gauges.push(bitmapGauge({
        name: item.name || item.text.text,
        x,
        y: item.y,
        width: size.width,
        height: size.height,
        importedText: item.text,
        hwinfoSensorLabel: item.hwinfoSensorLabel,
        mode: 'text',
      }));
      continue;
    }
    const file = pickFrame(item.filePaths, item.type === 'gauge' ? 0.68 : 0);
    if (!file) continue;
    const image = await zipImage(zip, file);
    if (!image) continue;
    const size = visualSize(item, image.width, image.height);
    if (isFullPanelBackground(item, size, parsed.width, parsed.height)) {
      backgroundImage = image.dataUrl;
      continue;
    }
    gauges.push(bitmapGauge({
      name: item.name || 'Item',
      x: item.x,
      y: item.y,
      width: size.width,
      height: size.height,
      importedImage: image.dataUrl,
      hwinfoSensorLabel: item.hwinfoSensorLabel,
      mode: item.type === 'gauge' ? 'bar' : 'image',
    }));
  }

  return {
    version: SENSOR_PANEL_FILE_VERSION,
    panel: {
      width: parsed.width,
      height: parsed.height,
      background: {
        ...defaultBackgroundOptions(),
        color: parsed.color,
        transparentBackground: parsed.transparent,
        image: backgroundImage,
        imageFit: 'actual',
        pattern: 'none',
      },
    },
    gauges,
    themes: structuredClone(DEFAULT_THEMES),
  };
}

async function importZipBundle(file: Blob): Promise<SensorPanelFile> {
  const zip = await Zip.loadAsync(await file.arrayBuffer());
  const sidecar = findZipFile(zip, DESIGN_SIDECAR_NAME);
  if (sidecar) return parsePanelFile(await sidecar.async('string'));
  if (findZipFile(zip, 'panel.sp2')) return importAidaZip(zip);
  if (findZipFile(zip, 'Profile.xml') || findZipFile(zip, 'DisplayItems.xml')) return importInfoPanelZip(zip);
  throw new Error('That zip is not a recognized sensor panel bundle.');
}

function looksLikeZip(file: File, header: Uint8Array): boolean {
  const name = file.name.toLowerCase();
  if (name.endsWith('.spzip') || name.endsWith('.infopanel') || name.endsWith('.zip')) return true;
  if (file.type === 'application/zip' || file.type === 'application/x-zip-compressed') return true;
  return header[0] === 0x50 && header[1] === 0x4b;
}

export async function importDesignFile(file: File): Promise<SensorPanelFile> {
  const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (looksLikeZip(file, header)) return importZipBundle(file);
  return parsePanelFile(await file.text());
}
