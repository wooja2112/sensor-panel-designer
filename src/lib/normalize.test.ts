import { describe, expect, it } from 'vitest';
import { DEFAULT_THEMES, barCanvasIsSwapped, defaultDrawOptions, gaugeSensorRange } from './gaugeRender';
import { isAllowedImageSrc, sanitizeImageSrc } from './imageCache';
import { parseIntegerInput, parseNumberInput } from './number';
import { parsePanelFile } from './file';
import { MAX_CANVAS_SIZE, MAX_SEGMENTS, cloneGaugeInstance, normalizeGauge, normalizePanel, normalizeThemes, remapThemeKeys } from '../types';

describe('parseNumberInput', () => {
  it('keeps negatives instead of coercing them to the fallback', () => {
    expect(parseNumberInput('-40')).toBe(-40);
    expect(parseIntegerInput('-40')).toBe(-40);
    expect(parseNumberInput('')).toBe(0);
    expect(parseNumberInput('nope', 3)).toBe(3);
  });
});

describe('normalizeGauge', () => {
  it('fills DrawOptions added after older project files were saved', () => {
    const g = normalizeGauge({
      id: 'g1',
      name: 'Old needle',
      x: 0,
      y: 0,
      width: 160,
      height: 160,
      previewValue: 50,
      themeKey: 'classic',
      opts: { mode: 'needle', nSegs: 0 },
    });
    const defaults = defaultDrawOptions('needle');
    expect(g.opts.dialTitle).toBe(defaults.dialTitle);
    expect(g.opts.needleStyle).toBe('plain');
    expect(g.opts.mercuryColor).toBe(defaults.mercuryColor);
    expect(g.opts.barStyle).toBe('flat');
    expect(g.aidaSensorId).toBe('');
    expect(g.hwinfoSensorLabel).toBe('');
    expect(g.importedImage).toBeNull();
    expect(g.opts.textContent).toBe('Label');
    expect(() => g.opts.dialTitle.split('\n')).not.toThrow();
  });

  it('promotes a legacy importedText container to text mode', () => {
    const g = normalizeGauge({
      name: 'UTILITIZATION',
      opts: { mode: 'container' },
      importedText: {
        text: '68%', font: 'Segoe UI', fontSize: 18, bold: true, italic: false, color: '#ffffff', align: 'center',
      },
    });
    expect(g.opts.mode).toBe('text');
    expect(g.opts.textContent).toBe('68%');
    expect(g.opts.textBold).toBe(true);
    expect(g.opts.textAlign).toBe('center');
  });

  it('caps sizes and segment counts that a corrupt file could make unrenderable', () => {
    const g = normalizeGauge({ width: 1e12, height: -5, opts: { mode: 'bar' } });
    expect([g.width, g.height]).toEqual([MAX_CANVAS_SIZE, 1]);
    const segs = (n: number) => normalizeGauge({ opts: { mode: 'bar', nSegs: n } }).opts.nSegs;
    expect(segs(1e9)).toBe(MAX_SEGMENTS);
    expect(segs(-3)).toBe(0);
    expect(segs(7.6)).toBe(8);
    expect(segs(12)).toBe(12);
    const p = normalizePanel({ width: 200000, height: 0 });
    expect([p.width, p.height]).toEqual([MAX_CANVAS_SIZE, 1]);
  });

  it('turns a hidden percent sign from older files into no unit', () => {
    expect(normalizeGauge({ opts: { mode: 'circ', labelShowPercent: false } }).opts.labelUnit).toBe('none');
    expect(normalizeGauge({ opts: { mode: 'circ', labelShowPercent: false, labelUnit: 'celsius' } }).opts.labelUnit).toBe('celsius');
    const g = normalizeGauge({ opts: { mode: 'circ' } });
    expect(g.opts.labelUnit).toBe('percent');
    expect([g.opts.ringStyle, g.opts.barGlow, g.opts.thermoScales]).toEqual(['arc', false, 'both']);
    expect('labelShowPercent' in g.opts).toBe(false);
  });
});

describe('remapThemeKeys', () => {
  it('rewrites every gauge pointing at the old key and leaves others alone', () => {
    const a = normalizeGauge({ id: 'a', themeKey: 'classic', opts: { mode: 'bar' } });
    const b = normalizeGauge({ id: 'b', themeKey: 'ember', opts: { mode: 'circ' } });
    const c = normalizeGauge({ id: 'c', themeKey: 'classic', opts: { mode: 'needle' } });
    const next = remapThemeKeys([a, b, c], 'classic', 'ocean');
    expect(next.map(g => g.themeKey)).toEqual(['ocean', 'ember', 'ocean']);
    const same = [a];
    expect(remapThemeKeys(same, 'classic', 'classic')).toBe(same);
  });
});

describe('cloneGaugeInstance', () => {
  it('gives each copy a unique id and offsets it', () => {
    const src = normalizeGauge({ id: 'g1', name: 'CPU', x: 10, y: 20, opts: { mode: 'bar' } });
    const a = cloneGaugeInstance(src);
    const b = cloneGaugeInstance(src);
    expect(a.id).not.toBe(src.id);
    expect(a.id).not.toBe(b.id);
    expect(a.name).toBe('CPU copy');
    expect(a.x).toBe(26);
    expect(a.y).toBe(36);
    expect(a.opts.containerCorners).not.toBe(src.opts.containerCorners);
    expect(a.opts.containerCorners).toEqual(src.opts.containerCorners);
  });
});

describe('barCanvasIsSwapped', () => {
  it('swaps a 90° bar but not a thermometer with leftover rotation', () => {
    const bar = defaultDrawOptions('bar');
    expect(barCanvasIsSwapped({ ...bar, rotation: 90 })).toBe(true);
    expect(barCanvasIsSwapped({ ...bar, barStyle: 'thermometer', rotation: 90 })).toBe(false);
    expect(barCanvasIsSwapped({ ...bar, rotation: 0 })).toBe(false);
  });
});

describe('gaugeSensorRange', () => {
  it('exports default thermometer 32–212°F as 0–100°C', () => {
    const opts = { ...defaultDrawOptions('bar'), barStyle: 'thermometer' as const };
    expect(gaugeSensorRange(opts)).toEqual({ min: 0, max: 100 });
  });

  it('exports a custom thermometer range in °C', () => {
    const opts = {
      ...defaultDrawOptions('bar'),
      barStyle: 'thermometer' as const,
      thermoMinF: 68, // 20°C
      thermoMaxF: 194, // 90°C
    };
    expect(gaugeSensorRange(opts)).toEqual({ min: 20, max: 90 });
  });

  it('exports the value range of non-thermometer gauges', () => {
    expect(gaugeSensorRange({ ...defaultDrawOptions('bar'), dialMin: 0, dialMax: 150 })).toEqual({ min: 0, max: 150 });
    expect(gaugeSensorRange({ ...defaultDrawOptions('circ'), dialMin: 40, dialMax: 40 })).toEqual({ min: 40, max: 41 });
  });

  it('exports classic dial min/max and defaults other gauges to 0–100', () => {
    const classic = {
      ...defaultDrawOptions('needle'),
      needleStyle: 'classic' as const,
      dialMin: 0,
      dialMax: 8000,
    };
    expect(gaugeSensorRange(classic)).toEqual({ min: 0, max: 8000 });
    expect(gaugeSensorRange(defaultDrawOptions('bar'))).toEqual({ min: 0, max: 100 });
    expect(gaugeSensorRange(defaultDrawOptions('circ'))).toEqual({ min: 0, max: 100 });
  });
});

describe('normalizeThemes', () => {
  it('repairs malformed theme fields and keeps their keys', () => {
    const themes = normalizeThemes({
      custom: { zone: ['#111', '#222'], mono: 'nope', solid: 5 },
      good: { zone: ['#1', '#2', '#3'], mono: ['#4', '#5', '#6'], solid: '#7' },
      broken: null,
    });
    expect(Object.keys(themes)).toEqual(['custom', 'good']);
    expect(themes.custom).toEqual(DEFAULT_THEMES.classic);
    expect(themes.good).toEqual({ zone: ['#1', '#2', '#3'], mono: ['#4', '#5', '#6'], solid: '#7' });
  });

  it('falls back to the built-in themes when nothing usable is left', () => {
    expect(normalizeThemes({ only: 'string' })).toEqual(DEFAULT_THEMES);
    expect(normalizeThemes([])).toEqual(DEFAULT_THEMES);
    expect(normalizeThemes(null)).toEqual(DEFAULT_THEMES);
  });
});

describe('image src sanitization', () => {
  it('allows inlined images and rejects remote URLs', () => {
    expect(isAllowedImageSrc('data:image/png;base64,abc')).toBe(true);
    expect(isAllowedImageSrc('blob:https://example/1')).toBe(true);
    expect(isAllowedImageSrc('https://evil.example/x.png')).toBe(false);
    expect(sanitizeImageSrc('https://evil.example/x.png')).toBeNull();
  });
});

describe('parsePanelFile', () => {
  it('backfills gauges and drops remote background images', () => {
    const json = JSON.stringify({
      version: 1,
      panel: {
        width: 480,
        height: 320,
        background: { color: '#000', image: 'https://evil.example/bg.png' },
      },
      gauges: [{
        id: 'g1',
        name: 'Legacy',
        x: 0, y: 0, width: 240, height: 60,
        previewValue: 10,
        themeKey: 'classic',
        opts: { mode: 'bar' },
      }],
      themes: { classic: { zone: ['#000', '#000', '#000'], mono: ['#000', '#000', '#000'], solid: '#000' } },
    });
    const file = parsePanelFile(json);
    expect(file.panel.background.image).toBeNull();
    expect(file.gauges[0].opts.mercuryColor).toBeTruthy();
    expect(file.gauges[0].opts.dialTitle).toBe('');
  });
});
