// Controls for the panel's size and background (ported from
// PanelBackgroundBuilder's App.jsx, restyled with the shared ui-primitives).
import { useRef, useState } from 'react';
import {
  MIN_DIAMETER, MAX_DIAMETER, SIDE_OPTIONS,
  MIN_BORDER, MAX_BORDER, MIN_GRADIENT_ANGLE, MAX_GRADIENT_ANGLE,
  MIN_TITLE_BAR_HEIGHT, MAX_TITLE_BAR_HEIGHT, MIN_CORNER_RADIUS, MAX_CORNER_RADIUS,
  MIN_DENSITY, MAX_DENSITY, MIN_LINE_WIDTH, MAX_LINE_WIDTH,
} from '../lib/backgroundRender';
import type { BackgroundOptions, PatternKey, BackgroundShape, BackgroundImageFit } from '../lib/backgroundRender';
import { readBackgroundImageFile } from '../lib/imageCache';
import { parseIntegerInput } from '../lib/number';
import { CtrlRow, Pill, ColorField, SliderRow } from './ui-primitives';

const PATTERN_GROUPS: { label: string; options: { value: PatternKey; label: string }[] }[] = [
  {
    label: 'Geometric',
    options: [
      { value: 'honeycomb', label: 'Honeycomb' },
      { value: 'diamonds', label: 'Diamonds' },
      { value: 'squares', label: 'Squares' },
      { value: 'triangles', label: 'Triangles' },
      { value: 'circuit', label: 'Circuit' },
    ],
  },
  {
    label: 'Subway Tile',
    options: [
      { value: 'offset', label: 'Offset' },
      { value: 'runningBond', label: 'Running Bond' },
      { value: 'thirdOffset', label: '1/3 Offset' },
      { value: 'stacked', label: 'Stacked' },
      { value: 'stackedVertical', label: 'Stacked Vertical' },
      { value: 'crosshatch', label: 'Crosshatch' },
      { value: 'herringbone', label: 'Herringbone' },
      { value: 'diagonalHerringbone', label: 'Diagonal Herringbone' },
      { value: 'straightHerringbone', label: 'Straight Herringbone' },
      { value: 'chevron', label: 'Chevron' },
      { value: 'pinwheel', label: 'Pinwheel' },
      { value: 'basketWeave', label: 'Basket Weave' },
      { value: 'versailles', label: 'Versailles' },
      { value: 'corridor', label: 'Corridor' },
    ],
  },
];

const selectClass = 'flex-1 bg-background border border-border rounded px-2 py-1 text-[11px] text-foreground focus:outline-none cursor-pointer';
const numberInputClass = 'bg-background border border-border rounded px-2 py-1 text-[11px] w-20 text-center text-foreground focus:outline-none focus:border-primary/60';

export function BackgroundPanel({
  width, height, background, onSizeChange, onChange,
}: {
  width: number;
  height: number;
  background: BackgroundOptions;
  onSizeChange: (patch: Partial<{ width: number; height: number }>) => void;
  onChange: (patch: Partial<BackgroundOptions>) => void;
}) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [imageLoading, setImageLoading] = useState(false);

  const handleImageSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImageLoading(true);
    try {
      const dataUrl = await readBackgroundImageFile(file);
      onChange({ image: dataUrl });
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Failed to load image.');
    }
    setImageLoading(false);
  };

  return (
    <div className="flex flex-col gap-3.5">
      <CtrlRow label="Panel size (px)">
        <div className="flex items-center gap-2">
          <input type="number" value={width} min={1} step={1}
            onChange={e => onSizeChange({ width: Math.max(1, parseIntegerInput(e.target.value, 1)) })}
            className={numberInputClass}
          />
          <span className="text-xs text-muted-foreground">×</span>
          <input type="number" value={height} min={1} step={1}
            onChange={e => onSizeChange({ height: Math.max(1, parseIntegerInput(e.target.value, 1)) })}
            className={numberInputClass}
          />
        </div>
      </CtrlRow>

      <div className="border-t border-border/50" />

      <CtrlRow label="Background image">
        <div className="flex flex-col gap-2">
          <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelected} />
          <div className="flex items-center gap-2">
            {background.image && (
              <img src={background.image} alt="" className="w-8 h-8 rounded border border-border object-cover flex-shrink-0" />
            )}
            <button type="button" onClick={() => imageInputRef.current?.click()} disabled={imageLoading}
              className="px-2.5 py-1 text-[11px] border border-border/60 rounded hover:bg-secondary transition-colors disabled:opacity-40 cursor-pointer text-foreground"
            >{imageLoading ? 'Loading…' : background.image ? 'Replace…' : 'Choose image…'}</button>
            {background.image && (
              <button type="button" onClick={() => onChange({ image: null })}
                className="px-2.5 py-1 text-[11px] border border-border/60 rounded hover:bg-secondary transition-colors cursor-pointer text-muted-foreground hover:text-foreground"
              >Remove</button>
            )}
          </div>
          {background.image && (
            <div className="flex gap-1.5">
              <Pill active={background.imageFit === 'cover'} onClick={() => onChange({ imageFit: 'cover' as BackgroundImageFit })}>Cover</Pill>
              <Pill active={background.imageFit === 'actual'} onClick={() => onChange({ imageFit: 'actual' as BackgroundImageFit })}>Actual size</Pill>
            </div>
          )}
        </div>
      </CtrlRow>

      <div className="border-t border-border/50" />

      <CtrlRow label="Transparent background">
        <div className="flex gap-1.5">
          <Pill active={background.transparentBackground} onClick={() => onChange({ transparentBackground: true })}>On</Pill>
          <Pill active={!background.transparentBackground} onClick={() => onChange({ transparentBackground: false })}>Off</Pill>
        </div>
      </CtrlRow>

      {!background.transparentBackground && (
        <CtrlRow label="Gradient background">
          <div className="flex gap-1.5">
            <Pill active={background.backgroundGradientEnabled} onClick={() => onChange({ backgroundGradientEnabled: true })}>On</Pill>
            <Pill active={!background.backgroundGradientEnabled} onClick={() => onChange({ backgroundGradientEnabled: false })}>Off</Pill>
          </div>
        </CtrlRow>
      )}

      {!background.transparentBackground && (
        background.backgroundGradientEnabled ? (
          <>
            <CtrlRow label="Start color">
              <ColorField value={background.color} onChange={v => onChange({ color: v })} />
            </CtrlRow>
            <CtrlRow label="End color">
              <ColorField value={background.colorEnd} onChange={v => onChange({ colorEnd: v })} />
            </CtrlRow>
            <CtrlRow label={`Gradient angle — ${background.backgroundGradientAngle}°`}>
              <SliderRow value={background.backgroundGradientAngle} min={MIN_GRADIENT_ANGLE} max={MAX_GRADIENT_ANGLE}
                onChange={v => onChange({ backgroundGradientAngle: v })} />
            </CtrlRow>
          </>
        ) : (
          <CtrlRow label="Background color">
            <ColorField value={background.color} onChange={v => onChange({ color: v })} />
          </CtrlRow>
        )
      )}

      <div className="border-t border-border/50" />

      <CtrlRow label="Shape">
        <select
          value={background.shape}
          onChange={e => onChange({ shape: e.target.value as BackgroundShape })}
          className={selectClass}
        >
          <option value="none">None</option>
          <option value="circle">Circle</option>
          <option value="polygon">Polygon</option>
        </select>
      </CtrlRow>

      {background.shape === 'polygon' && (
        <CtrlRow label="Sides">
          <select
            value={background.sides}
            onChange={e => onChange({ sides: Number(e.target.value) })}
            className={selectClass}
          >
            {SIDE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </CtrlRow>
      )}

      {background.shape !== 'none' && (
        <CtrlRow label={`Diameter — ${background.diameter}%`}>
          <SliderRow value={background.diameter} min={MIN_DIAMETER} max={MAX_DIAMETER}
            onChange={v => onChange({ diameter: v })} />
        </CtrlRow>
      )}

      {background.shape === 'none' && (
        <CtrlRow label={`Corner radius — ${background.cornerRadius}px`}>
          <SliderRow value={background.cornerRadius} min={MIN_CORNER_RADIUS} max={MAX_CORNER_RADIUS}
            onChange={v => onChange({ cornerRadius: v })} />
        </CtrlRow>
      )}

      {background.shape === 'none' && (
        <CtrlRow label="Title bar">
          <div className="flex gap-1.5">
            <Pill active={background.showTitleBar} onClick={() => onChange({ showTitleBar: true })}>On</Pill>
            <Pill active={!background.showTitleBar} onClick={() => onChange({ showTitleBar: false })}>Off</Pill>
          </div>
        </CtrlRow>
      )}

      {background.shape === 'none' && background.showTitleBar && (
        <>
          <CtrlRow label={`Title bar height — ${background.titleBarHeight}px`}>
            <SliderRow value={background.titleBarHeight} min={MIN_TITLE_BAR_HEIGHT} max={MAX_TITLE_BAR_HEIGHT}
              onChange={v => onChange({ titleBarHeight: v })} />
          </CtrlRow>
          <CtrlRow label="Title bar color">
            <ColorField value={background.titleBarColor} onChange={v => onChange({ titleBarColor: v })} />
          </CtrlRow>
        </>
      )}

      <div className="border-t border-border/50" />

      <CtrlRow label="Pattern">
        <select
          value={background.pattern}
          onChange={e => onChange({ pattern: e.target.value as PatternKey })}
          className={selectClass}
        >
          <option value="none">None</option>
          {PATTERN_GROUPS.map(group => (
            <optgroup key={group.label} label={group.label}>
              {group.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </optgroup>
          ))}
        </select>
      </CtrlRow>

      {background.pattern !== 'none' && (
        <>
          <CtrlRow label="Pattern color">
            <ColorField value={background.patternColor} onChange={v => onChange({ patternColor: v })} />
          </CtrlRow>
          <CtrlRow label={`Density — ${background.density}`}>
            <SliderRow value={background.density} min={MIN_DENSITY} max={MAX_DENSITY}
              onChange={v => onChange({ density: v })} />
          </CtrlRow>
          <CtrlRow label={`Line thickness — ${background.patternLineWidth}px`}>
            <SliderRow value={background.patternLineWidth} min={MIN_LINE_WIDTH} max={MAX_LINE_WIDTH}
              onChange={v => onChange({ patternLineWidth: v })} />
          </CtrlRow>
        </>
      )}

      <div className="border-t border-border/50" />

      <CtrlRow label={`Border thickness — ${background.borderThickness}px`}>
        <SliderRow value={background.borderThickness} min={MIN_BORDER} max={MAX_BORDER}
          onChange={v => onChange({ borderThickness: v })} />
      </CtrlRow>

      {background.borderThickness > 0 && (
        <>
          <CtrlRow label="Gradient border">
            <div className="flex gap-1.5">
              <Pill active={background.borderGradientEnabled} onClick={() => onChange({ borderGradientEnabled: true })}>On</Pill>
              <Pill active={!background.borderGradientEnabled} onClick={() => onChange({ borderGradientEnabled: false })}>Off</Pill>
            </div>
          </CtrlRow>

          {background.borderGradientEnabled ? (
            <>
              <CtrlRow label="Start color">
                <ColorField value={background.borderColor} onChange={v => onChange({ borderColor: v })} />
              </CtrlRow>
              <CtrlRow label="End color">
                <ColorField value={background.borderColorEnd} onChange={v => onChange({ borderColorEnd: v })} />
              </CtrlRow>
              <CtrlRow label={`Gradient angle — ${background.borderGradientAngle}°`}>
                <SliderRow value={background.borderGradientAngle} min={MIN_GRADIENT_ANGLE} max={MAX_GRADIENT_ANGLE}
                  onChange={v => onChange({ borderGradientAngle: v })} />
              </CtrlRow>
            </>
          ) : (
            <CtrlRow label="Border color">
              <ColorField value={background.borderColor} onChange={v => onChange({ borderColor: v })} />
            </CtrlRow>
          )}
        </>
      )}
    </div>
  );
}
