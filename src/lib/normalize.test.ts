import { describe, expect, it } from 'vitest';
import { barCanvasIsSwapped, defaultDrawOptions, gaugeSensorRange } from './gaugeRender';
import { isAllowedImageSrc, sanitizeImageSrc } from './imageCache';
import { parseIntegerInput, parseNumberInput } from './number';
import { parsePanelFile } from './file';
import { normalizeGauge } from '../types';

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
    expect(() => g.opts.dialTitle.split('\n')).not.toThrow();
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

  it('exports classic dial min/max and leaves other gauges at 0–100', () => {
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
