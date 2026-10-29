import type { BackgroundOptions } from './lib/backgroundRender';
import { defaultBackgroundOptions } from './lib/backgroundRender';
import type { DrawOptions, GaugeMode, ThemeColors, ThemesMap } from './lib/gaugeRender';
import { DEFAULT_THEMES, defaultDrawOptions, defaultSizeForMode } from './lib/gaugeRender';
import { sanitizeImageSrc } from './lib/imageCache';

export interface GaugeInstance {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  previewValue: number; // 0-100, drives the live preview and single-frame export
  themeKey: string; // key into the shared ThemesMap
  opts: DrawOptions; // themeColors is kept in sync with themeKey before each draw
  // Real AIDA64 hardware-sensor mnemonic (e.g. "TCPU", "SMASTVOL") to bind
  // this gauge to when exporting an AIDA64 .spzip bundle — see lib/aida64.ts.
  // Left blank, the exported item defaults to "CPU Utilization" (SCPUUTI)
  // and stays enabled, since AIDA64 hides disabled items entirely.
  aidaSensorId: string;
  // A human-readable HWInfo sensor name (e.g. "CPU Package") to remind the
  // user which live sensor to bind this gauge to after importing into
  // InfoPanel — see lib/infopanel.ts. This is a label, not a real binding:
  // HWInfo/LibreHardwareMonitor sensor IDs are machine-specific hashes this
  // app can't know in advance, so the label just gets folded into the
  // exported item's name as a reminder.
  hwinfoSensorLabel: string;
  // Bitmap for image-mode gauges (and for imported AIDA/InfoPanel frames
  // that couldn't be reconstructed as live DrawOptions). When set, compose
  // draws this instead of drawOn().
  importedImage: string | null;
}

export interface ImportedText {
  text: string;
  font: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  color: string;
  align: 'left' | 'center' | 'right';
}

export interface PanelConfig {
  width: number;
  height: number;
  background: BackgroundOptions;
}

// The largest panel or gauge edge, in px. Anything bigger can exhaust memory
// when rendered and exceeds browsers' canvas size limits.
export const MAX_CANVAS_SIZE = 8192;

export function clampCanvasSize(v: number): number {
  return Number.isFinite(v) ? Math.min(MAX_CANVAS_SIZE, Math.max(1, v)) : 1;
}

// The UI offers up to 50 segments; renderers loop once per segment, so a
// corrupt file's nSegs must not reach them unbounded.
export const MAX_SEGMENTS = 100;

let nextId = 1;
export function makeGaugeId(): string {
  return `gauge-${nextId++}-${Date.now().toString(36)}`;
}

export function createGaugeInstance(mode: GaugeMode, themeKey: string, x: number, y: number): GaugeInstance {
  const { width, height } = defaultSizeForMode(mode);
  return {
    id: makeGaugeId(),
    name: mode === 'bar' ? 'Bar gauge' : mode === 'circ' ? 'Circular gauge' : mode === 'needle' ? 'Needle gauge' : mode === 'text' ? 'Label' : mode === 'image' ? 'Image' : 'Container',
    x: Math.round(x - width / 2),
    y: Math.round(y - height / 2),
    width,
    height,
    previewValue: 68,
    themeKey,
    opts: defaultDrawOptions(mode),
    aidaSensorId: '',
    hwinfoSensorLabel: '',
    importedImage: null,
  };
}

export function cloneGaugeInstance(src: GaugeInstance): GaugeInstance {
  return {
    ...src,
    id: makeGaugeId(),
    name: `${src.name} copy`,
    x: src.x + 16,
    y: src.y + 16,
    opts: { ...src.opts, containerCorners: [...src.opts.containerCorners] },
  };
}

// Backfills fields that didn't exist yet when an older .sensorpaneldesign
// file (or localStorage autosave) was written, so loading one doesn't leave
// a gauge with `undefined` where code expects a string (e.g. .trim() in
// lib/infopanel.ts) — same version bucket (SENSOR_PANEL_FILE_VERSION) just
// gained a new optional-in-practice field rather than a real breaking change.
export function normalizeGauge(gauge: Partial<Omit<GaugeInstance, 'opts'>> & {
  opts?: Partial<DrawOptions> & { labelShowPercent?: boolean };
  importedText?: ImportedText | null;
}): GaugeInstance {
  const legacyText = gauge.importedText ?? null;
  let mode = gauge.opts?.mode ?? 'bar';
  if (legacyText && (mode === 'container' || mode === 'bar')) mode = 'text';
  if (gauge.importedImage && mode === 'container') mode = 'image';
  const defaults = defaultDrawOptions(mode);
  const { labelShowPercent, ...incoming }: Partial<DrawOptions> & { labelShowPercent?: boolean } = gauge.opts ?? {};
  const size = defaultSizeForMode(mode);
  const nSegs = Number(incoming.nSegs ?? defaults.nSegs);
  const opts: DrawOptions = {
    ...defaults,
    ...incoming,
    mode,
    nSegs: Number.isFinite(nSegs) ? Math.min(MAX_SEGMENTS, Math.max(0, Math.round(nSegs))) : defaults.nSegs,
    // labelShowPercent: false predates labelUnit and meant a bare number.
    labelUnit: incoming.labelUnit ?? (labelShowPercent === false ? 'none' : defaults.labelUnit),
    containerCorners: Array.isArray(incoming.containerCorners)
      ? [...incoming.containerCorners]
      : [...defaults.containerCorners],
    themeColors: incoming.themeColors ?? defaults.themeColors,
    textContent: incoming.textContent ?? legacyText?.text ?? defaults.textContent,
    textFont: incoming.textFont ?? legacyText?.font ?? defaults.textFont,
    textFontSize: incoming.textFontSize ?? legacyText?.fontSize ?? defaults.textFontSize,
    textBold: incoming.textBold ?? legacyText?.bold ?? defaults.textBold,
    textItalic: incoming.textItalic ?? legacyText?.italic ?? defaults.textItalic,
    textColor: incoming.textColor ?? legacyText?.color ?? defaults.textColor,
    textAlign: incoming.textAlign ?? legacyText?.align ?? defaults.textAlign,
  };
  return {
    id: gauge.id || makeGaugeId(),
    name: gauge.name ?? 'Gauge',
    x: gauge.x ?? 0,
    y: gauge.y ?? 0,
    width: clampCanvasSize(gauge.width ?? size.width),
    height: clampCanvasSize(gauge.height ?? size.height),
    previewValue: gauge.previewValue ?? 68,
    themeKey: gauge.themeKey ?? 'classic',
    opts,
    aidaSensorId: gauge.aidaSensorId ?? '',
    hwinfoSensorLabel: gauge.hwinfoSensorLabel ?? '',
    importedImage: sanitizeImageSrc(gauge.importedImage ?? null),
  };
}

export function normalizePanel(panel: Partial<PanelConfig> & { background?: Partial<BackgroundOptions> }): PanelConfig {
  const defaults = defaultPanelConfig();
  const background = {
    ...defaults.background,
    ...(panel.background ?? {}),
    image: sanitizeImageSrc(panel.background?.image ?? null),
  };
  return {
    width: clampCanvasSize(panel.width ?? defaults.width),
    height: clampCanvasSize(panel.height ?? defaults.height),
    background,
  };
}

function isColorTriple(value: unknown): value is [string, string, string] {
  return Array.isArray(value) && value.length === 3 && value.every(c => typeof c === 'string');
}

// Loaded files are trusted for shape only as far as this checks: a theme
// missing zone/mono/solid would otherwise throw inside drawOn on next paint,
// so bad fields are repaired from the classic theme and keys are kept.
export function normalizeThemes(themes: unknown): ThemesMap {
  if (!themes || typeof themes !== 'object' || Array.isArray(themes)) {
    return structuredClone(DEFAULT_THEMES);
  }
  const fallback = DEFAULT_THEMES.classic;
  const out: ThemesMap = {};
  for (const [key, raw] of Object.entries(themes)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const theme = raw as Partial<Record<keyof ThemeColors, unknown>>;
    out[key] = {
      zone: isColorTriple(theme.zone) ? [...theme.zone] : [...fallback.zone],
      mono: isColorTriple(theme.mono) ? [...theme.mono] : [...fallback.mono],
      solid: typeof theme.solid === 'string' ? theme.solid : fallback.solid,
    };
  }
  return Object.keys(out).length > 0 ? out : structuredClone(DEFAULT_THEMES);
}

// A gauge instance stores a themeKey (a reference into the shared, editable
// ThemesMap) rather than owning its own copy of theme colors — this is the
// point where that reference gets resolved into the concrete DrawOptions
// drawOn() needs.
export function resolveDrawOptions(gauge: GaugeInstance, themes: ThemesMap): DrawOptions {
  const themeColors = themes[gauge.themeKey] ?? Object.values(themes)[0];
  return { ...gauge.opts, themeColors };
}

export function remapThemeKeys(gauges: GaugeInstance[], from: string, to: string): GaugeInstance[] {
  if (from === to) return gauges;
  return gauges.map(g => g.themeKey === from ? { ...g, themeKey: to } : g);
}

export function defaultPanelConfig(): PanelConfig {
  return {
    width: 480,
    height: 320,
    background: defaultBackgroundOptions(),
  };
}

// The size a brand-new design starts at. defaultPanelConfig() stays 480×320:
// it's the fallback for files and bundles that omit a size.
export function newDesignPanelConfig(): PanelConfig {
  return { ...defaultPanelConfig(), width: 3840, height: 1100 };
}
