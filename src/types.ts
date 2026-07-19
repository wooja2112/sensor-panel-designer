import type { BackgroundOptions } from './lib/backgroundRender';
import { defaultBackgroundOptions } from './lib/backgroundRender';
import type { DrawOptions, GaugeMode, ThemesMap } from './lib/gaugeRender';
import { defaultDrawOptions, defaultSizeForMode } from './lib/gaugeRender';

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
}

export interface PanelConfig {
  width: number;
  height: number;
  background: BackgroundOptions;
}

let nextId = 1;
export function makeGaugeId(): string {
  return `gauge-${nextId++}-${Date.now().toString(36)}`;
}

export function createGaugeInstance(mode: GaugeMode, themeKey: string, x: number, y: number): GaugeInstance {
  const { width, height } = defaultSizeForMode(mode);
  return {
    id: makeGaugeId(),
    name: mode === 'bar' ? 'Bar gauge' : mode === 'circ' ? 'Circular gauge' : mode === 'needle' ? 'Needle gauge' : 'Container',
    x: Math.round(x - width / 2),
    y: Math.round(y - height / 2),
    width,
    height,
    previewValue: 68,
    themeKey,
    opts: defaultDrawOptions(mode),
    aidaSensorId: '',
  };
}

// A gauge instance stores a themeKey (a reference into the shared, editable
// ThemesMap) rather than owning its own copy of theme colors — this is the
// point where that reference gets resolved into the concrete DrawOptions
// drawOn() needs.
export function resolveDrawOptions(gauge: GaugeInstance, themes: ThemesMap): DrawOptions {
  const themeColors = themes[gauge.themeKey] ?? Object.values(themes)[0];
  return { ...gauge.opts, themeColors };
}

export function defaultPanelConfig(): PanelConfig {
  return {
    width: 480,
    height: 320,
    background: defaultBackgroundOptions(),
  };
}
