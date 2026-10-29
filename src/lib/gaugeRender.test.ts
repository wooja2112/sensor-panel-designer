import { describe, expect, it } from 'vitest';
import { arcAngles, cssFontFamily, defaultDrawOptions, valueLabelColor, valueLabelFont, valueLabelText } from './gaugeRender';
import { adjustImagePixels } from './backgroundRender';
import { normalizeRotation, rotatedBounds } from './importedText';

describe('value labels', () => {
  it('fall back to the default sans at the auto size', () => {
    expect(valueLabelFont(defaultDrawOptions('bar'), 18)).toEqual({ font: '500 18px sans-serif', size: 18 });
    const opts = { ...defaultDrawOptions('bar'), labelFont: 'Segoe UI', labelFontSize: 40 };
    expect(valueLabelFont(opts, 18)).toEqual({ font: '500 40px "Segoe UI", sans-serif', size: 40 });
    expect(cssFontFamily('Consolas')).toBe('Consolas, sans-serif');
  });

  it('can drop the percent sign and take a fixed color', () => {
    const opts = defaultDrawOptions('circ');
    expect(valueLabelText(70, opts)).toBe('70%');
    expect(valueLabelColor(opts, () => '#zone')).toBe('#zone');
    const plain = { ...opts, labelUnit: 'none' as const, labelColor: '#ff8800' };
    expect(valueLabelText(70, plain)).toBe('70');
    expect(valueLabelColor(plain, () => '#zone')).toBe('#ff8800');
  });

  it('show the value within the gauge range for units other than %', () => {
    const opts = { ...defaultDrawOptions('circ'), dialMin: 0, dialMax: 150 };
    expect(valueLabelText(50, opts)).toBe('50%');
    expect(valueLabelText(50, { ...opts, labelUnit: 'custom', labelUnitText: ' FPS ' })).toBe('75 FPS');
    expect(valueLabelText(50, { ...opts, labelUnit: 'custom', labelUnitText: '' })).toBe('75');
    const temp = { ...opts, dialMin: 20, dialMax: 100 };
    expect(valueLabelText(25, { ...temp, labelUnit: 'celsius' })).toBe('40°C');
    expect(valueLabelText(100, { ...temp, labelUnit: 'fahrenheit' })).toBe('100°F');
  });
});

describe('arcAngles', () => {
  it('sweeps exactly the span, centered on the top', () => {
    for (const span of [90, 180, 220, 300, 360]) {
      const { sd, ed } = arcAngles(span);
      expect(ed - sd).toBe(span);
      // Midpoint at 270° is straight up in canvas coordinates.
      expect((sd + ed) / 2).toBe(270);
    }
  });
});

describe('rotatedBounds', () => {
  it('swaps at quarter turns and grows in between', () => {
    expect(rotatedBounds(100, 20, 90)).toEqual({ width: 20, height: 100 });
    expect(rotatedBounds(100, 20, -90)).toEqual({ width: 20, height: 100 });
    expect(rotatedBounds(100, 20, 180)).toEqual({ width: 100, height: 20 });
    expect(rotatedBounds(100, 20, 45)).toEqual({ width: 85, height: 85 });
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(Number.NaN)).toBe(0);
  });
});

describe('adjustImagePixels', () => {
  it('grays out with Rec. 709 luma and scales brightness, clamped', () => {
    const px = () => new Uint8ClampedArray([200, 0, 0, 255, 100, 0, 0, 128]);
    const gray = px();
    adjustImagePixels(gray, true, 100);
    expect([...gray.slice(0, 4)]).toEqual([43, 43, 43, 255]);
    const bright = px();
    adjustImagePixels(bright, false, 200);
    expect([...bright]).toEqual([255, 0, 0, 255, 200, 0, 0, 128]);
    const dark = px();
    adjustImagePixels(dark, false, 50);
    expect([...dark]).toEqual([100, 0, 0, 255, 50, 0, 0, 128]);
  });
});
