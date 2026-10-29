// Controls for the currently-selected gauge instance, ported from Sensor
// Gauge Image Creator's App.tsx control panel (originally one big global
// useState block) — reshaped to operate on a single GaugeInstance via props.
import { useRef, useState } from 'react';
import type { GaugeInstance, PanelConfig } from '../types';
import { MAX_CANVAS_SIZE, clampCanvasSize } from '../types';
import type { BarStyle, DrawOptions, GaugeMode, ColorMode, LabelPos, LabelUnit, ContainerShape, ContainerCorner, RingStyle, ThermoScales, ThemesMap } from '../lib/gaugeRender';
import { defaultSizeForMode, GAUGE_MODE_LABELS, isSensorGaugeMode } from '../lib/gaugeRender';
import { importedTextFromOpts, normalizeRotation, rotatedBounds, textFrameSize } from '../lib/importedText';
import { parseIntegerInput, parseNumberInput } from '../lib/number';
import { readBackgroundImageFile } from '../lib/imageCache';
import { CtrlRow, Pill, ColorField, SliderRow } from './ui-primitives';

const SOLID_SWATCHES = ['#2a78d6', '#1baf7a', '#7F77DD', '#D85A30', '#eda100', '#D4537E'];

const CONTAINER_PRESETS: { name: string; c1: string; c2: string }[] = [
  { name: 'Cyan / Pink', c1: '#22d3ee', c2: '#ec4899' },
  { name: 'Blue / Purple', c1: '#3b82f6', c2: '#a855f7' },
  { name: 'Pink / Orange', c1: '#ec4899', c2: '#f97316' },
  { name: 'Green / Cyan', c1: '#22c55e', c2: '#22d3ee' },
  { name: 'Hot Pink', c1: '#ff0055', c2: '#ff0055' },
];

const selectClass = 'flex-1 bg-background border border-border rounded px-2 py-1 text-[11px] text-foreground focus:outline-none cursor-pointer';
const numberInputClass = 'bg-background border border-border rounded px-2 py-1 text-[11px] w-full text-center text-foreground focus:outline-none focus:border-primary/60';
const textInputClass = 'flex-1 bg-background border border-border rounded px-2 py-1 text-[11px] text-foreground w-full focus:outline-none focus:border-primary/60';
const hintClass = 'text-[9px] text-muted-foreground leading-relaxed';

const BAR_STYLES: [BarStyle, string][] = [
  ['flat', 'Flat'], ['ascending', 'Ascending'], ['slanted', 'Slanted'], ['chevron', 'Chevron'], ['hex', 'Hex'], ['thermometer', 'Thermometer'],
];
const RING_STYLES: [RingStyle, string][] = [['arc', 'Arc'], ['dots', 'Dots'], ['sunburst', 'Sunburst']];
const THERMO_SCALES: [ThermoScales, string][] = [['both', '°F + °C'], ['f', '°F only'], ['c', '°C only']];
const LABEL_UNITS: [LabelUnit, string][] = [['none', 'None'], ['percent', '%'], ['celsius', '°C'], ['fahrenheit', '°F'], ['custom', 'Custom']];

// Font, size and color rows for a piece of gauge text. An empty font or
// color and a zero size mean "automatic"; `autoColor` names that choice.
function TextStyleRows({ what, font, size, color, autoColor, onChange }: {
  what: string;
  font: string;
  size: number;
  color: string;
  autoColor: string;
  onChange: (patch: { font?: string; size?: number; color?: string }) => void;
}) {
  const auto = size <= 0;
  return (
    <>
      <CtrlRow label={`${what} font`}>
        <div className="flex items-center gap-1.5">
          <Pill active={font === ''} onClick={() => onChange({ font: '' })}>Default</Pill>
          <input value={font} onChange={e => onChange({ font: e.target.value })} placeholder="Font family" className={textInputClass} />
        </div>
      </CtrlRow>
      <CtrlRow label={auto ? `${what} size — auto` : `${what} size — ${size}px`}>
        <div className="flex gap-1.5">
          <Pill active={auto} onClick={() => onChange({ size: 0 })}>Auto</Pill>
          <Pill active={!auto} onClick={() => { if (auto) onChange({ size: 24 }); }}>Custom</Pill>
        </div>
        {!auto && <SliderRow value={size} min={6} max={200} onChange={v => onChange({ size: v })} />}
      </CtrlRow>
      <CtrlRow label={`${what} color`}>
        <div className="flex items-center gap-1.5">
          <Pill active={color === ''} onClick={() => onChange({ color: '' })}>{autoColor}</Pill>
          <ColorField value={color || '#ffffff'} onChange={v => onChange({ color: v })} />
        </div>
      </CtrlRow>
    </>
  );
}

export function GaugePanel({
  gauge, panel, themes, onChange, onMeta, onOpenThemeDesigner, onDelete, onDuplicate, onFitToContent,
}: {
  gauge: GaugeInstance;
  panel: PanelConfig;
  themes: ThemesMap;
  onChange: (patch: Partial<DrawOptions>) => void;
  onMeta: (patch: Partial<Pick<GaugeInstance, 'name' | 'x' | 'y' | 'width' | 'height' | 'previewValue' | 'themeKey' | 'aidaSensorId' | 'hwinfoSensorLabel' | 'importedImage'>>) => void;
  onOpenThemeDesigner: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onFitToContent: () => void;
}) {
  const opts = gauge.opts;
  const mode = opts.mode;
  const isThermo = mode === 'bar' && opts.barStyle === 'thermometer';
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [imageLoading, setImageLoading] = useState(false);

  // Centers the gauge's own X/Y-plus-half-size midpoint on the panel — the
  // same midpoint compose.ts and CanvasWorkspace already treat as "the
  // gauge's center" for a rotated bar gauge's swapped on-screen box, so this
  // stays correct regardless of rotation without any special-casing here.
  const centerHorizontally = () => onMeta({ x: Math.round((panel.width - gauge.width) / 2) });
  const centerVertically = () => onMeta({ y: Math.round((panel.height - gauge.height) / 2) });

  const switchMode = (m: GaugeMode) => {
    const size = defaultSizeForMode(m);
    onChange({
      mode: m,
      nSegs: m === 'needle' ? 0 : opts.nSegs,
      labelPos: m !== 'circ' && opts.labelPos === 'middle' ? 'top' : opts.labelPos,
      // A label's box is sized for unrotated text, and a bar's leftover
      // rotation would otherwise carry over onto it.
      ...(m === 'text' ? { rotation: 0 } : {}),
    });
    onMeta({ width: size.width, height: size.height });
  };

  // Resizes a label's box to hold its text at the new angle, keeping the
  // center it rotates about.
  const rotateLabel = (rotation: number) => {
    const oldRotation = normalizeRotation(opts.rotation);
    if (rotation === oldRotation) return;
    const frame = textFrameSize(importedTextFromOpts(opts), oldRotation, gauge.width, gauge.height);
    const box = rotatedBounds(frame.width, frame.height, rotation);
    const cx = gauge.x + gauge.width / 2;
    const cy = gauge.y + gauge.height / 2;
    onChange({ rotation });
    onMeta({ width: box.width, height: box.height, x: Math.round(cx - box.width / 2), y: Math.round(cy - box.height / 2) });
  };

  // Dots and sunburst rings are made of individual marks, so they have no
  // solid mode and suit higher counts.
  const marksRing = mode === 'circ' && opts.ringStyle !== 'arc';
  const selectRingStyle = (style: RingStyle) => {
    onChange(style !== 'arc' && opts.nSegs === 0 ? { ringStyle: style, nSegs: 24 } : { ringStyle: style });
  };

  const selectBarStyle = (style: DrawOptions['barStyle']) => {
    // Thermometer needs a tall box to read correctly (the default bar size
    // is short and wide), and has no notion of segments — mirrors how
    // switchMode resizes on a mode change. Re-centered too, since jumping
    // between a short-wide and a tall-narrow box while keeping the old x/y
    // can push most of the gauge (e.g. the thermometer's bulb) off-panel.
    const recenter = (w: number, h: number) => onMeta({
      width: w, height: h,
      x: Math.round((panel.width - w) / 2), y: Math.round((panel.height - h) / 2),
    });
    if (style === 'thermometer') {
      recenter(140, 320);
      onChange({ barStyle: style, nSegs: 0, rotation: 0 });
      return;
    }
    if (opts.barStyle === 'thermometer') recenter(240, 60);
    onChange({ barStyle: style, nSegs: opts.nSegs });
  };

  const toggleContainerCorner = (c: ContainerCorner) => {
    const next = opts.containerCorners.includes(c) ? opts.containerCorners.filter(x => x !== c) : [...opts.containerCorners, c];
    onChange({ containerCorners: next });
  };

  return (
    <div className="flex flex-col gap-3.5">
      {/* Name + position/size */}
      <CtrlRow label="Gauge name">
        <input value={gauge.name} onChange={e => onMeta({ name: e.target.value })} className={textInputClass} />
      </CtrlRow>

      {gauge.importedImage && isSensorGaugeMode(mode) && (
        <div className="flex flex-col gap-2 rounded border border-border p-2">
          <p className="text-[10px] text-muted-foreground leading-snug">
            Imported bitmap from an AIDA64 or InfoPanel bundle. Style controls change the live gauge underneath; convert to use that instead of the bitmap.
          </p>
          <button type="button" onClick={() => onMeta({ importedImage: null })}
            className="w-full px-2 py-1.5 text-[10px] border border-border rounded hover:bg-secondary transition-colors cursor-pointer text-foreground"
          >Convert to live gauge</button>
        </div>
      )}

      <CtrlRow label="Position (px)">
        <div className="grid grid-cols-2 gap-2">
          <input type="number" value={gauge.x} onChange={e => onMeta({ x: parseIntegerInput(e.target.value) })} className={numberInputClass} />
          <input type="number" value={gauge.y} onChange={e => onMeta({ y: parseIntegerInput(e.target.value) })} className={numberInputClass} />
        </div>
      </CtrlRow>

      <CtrlRow label="Align on panel">
        <div className="flex gap-2">
          <button type="button" onClick={centerHorizontally}
            className="flex-1 px-2 py-1.5 text-[10px] border border-border rounded hover:bg-secondary transition-colors cursor-pointer text-foreground"
            title="Center horizontally on the panel"
          >Center H</button>
          <button type="button" onClick={centerVertically}
            className="flex-1 px-2 py-1.5 text-[10px] border border-border rounded hover:bg-secondary transition-colors cursor-pointer text-foreground"
            title="Center vertically on the panel"
          >Center V</button>
        </div>
      </CtrlRow>

      <CtrlRow label="Size (px)">
        <div className="grid grid-cols-2 gap-2">
          <input type="number" min={1} max={MAX_CANVAS_SIZE} value={gauge.width} onChange={e => onMeta({ width: clampCanvasSize(parseIntegerInput(e.target.value, 1)) })} className={numberInputClass} />
          <input type="number" min={1} max={MAX_CANVAS_SIZE} value={gauge.height} onChange={e => onMeta({ height: clampCanvasSize(parseIntegerInput(e.target.value, 1)) })} className={numberInputClass} />
        </div>
        <button type="button" onClick={onFitToContent}
          className="w-full px-2 py-1.5 text-[10px] border border-border rounded hover:bg-secondary transition-colors cursor-pointer text-foreground"
          title="Shrink the bounding box down to exactly what this gauge draws — no empty margin"
        >Fit to content</button>
      </CtrlRow>

      <div className="flex gap-2">
        <button type="button" onClick={onDuplicate}
          className="flex-1 px-2 py-1.5 text-[10px] border border-border rounded hover:bg-secondary transition-colors cursor-pointer text-foreground tracking-wider uppercase"
        >Duplicate</button>
        <button type="button" onClick={onDelete}
          className="flex-1 px-2 py-1.5 text-[10px] border border-destructive/40 text-destructive rounded hover:bg-destructive/10 transition-colors cursor-pointer tracking-wider uppercase"
        >Delete</button>
      </div>

      <div className="border-t border-border/50" />

      {/* Mode tabs */}
      <CtrlRow label="Gauge type">
        <div className="flex border border-border rounded overflow-hidden w-fit flex-wrap">
          {(['bar', 'circ', 'needle', 'container', 'text', 'image'] as GaugeMode[]).map(m => (
            <button key={m} type="button" onClick={() => switchMode(m)}
              className={[
                'px-3 py-1 text-[10px] tracking-wider uppercase transition-colors cursor-pointer',
                mode === m ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {GAUGE_MODE_LABELS[m]}
            </button>
          ))}
        </div>
      </CtrlRow>

      {isSensorGaugeMode(mode) && (
        <CtrlRow label="Preview value">
          <div className="flex items-center gap-3">
            <input type="range" min={0} max={100} step={1} value={gauge.previewValue}
              className="flex-1 accent-primary h-1"
              onChange={e => onMeta({ previewValue: +e.target.value })}
            />
            <span className="text-xs tabular-nums w-8 text-right text-foreground">{gauge.previewValue}%</span>
          </div>
        </CtrlRow>
      )}

      {isSensorGaugeMode(mode) && (
        <CtrlRow label="AIDA64 sensor ID (optional)">
          <input value={gauge.aidaSensorId} onChange={e => onMeta({ aidaSensorId: e.target.value })}
            placeholder="e.g. TCPU, SMASTVOL"
            className={textInputClass}
          />
          <span className="text-[9px] text-muted-foreground leading-relaxed">
            Find the exact ID in AIDA64's own "Modify Item" search box. Left blank, this gauge is
            exported already enabled and bound to "CPU Utilization" (SCPUUTI) — rebind it in AIDA64
            if it should track something else.
          </span>
        </CtrlRow>
      )}

      {isSensorGaugeMode(mode) && (
        <CtrlRow label="HWInfo sensor name (optional)">
          <input value={gauge.hwinfoSensorLabel} onChange={e => onMeta({ hwinfoSensorLabel: e.target.value })}
            placeholder="e.g. CPU Package"
            className={textInputClass}
          />
          <span className="text-[9px] text-muted-foreground leading-relaxed">
            HWInfo sensor IDs are specific to the machine running InfoPanel, so this can't bind
            automatically. Naming it here just tags the exported item so you know which sensor to
            pick in InfoPanel's own item editor after importing.
          </span>
        </CtrlRow>
      )}

      <div className="border-t border-border/50" />

      {/* Theme */}
      {isSensorGaugeMode(mode) && (
        <CtrlRow label="Theme">
          <div className="flex gap-1.5">
            <select
              value={gauge.themeKey}
              onChange={e => {
                const key = e.target.value;
                onMeta({ themeKey: key });
                onChange({ solidColor: themes[key]?.solid ?? opts.solidColor });
              }}
              className={selectClass}
            >
              {Object.keys(themes).map(t => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
            <button type="button" onClick={onOpenThemeDesigner}
              className="px-2 py-1 text-[10px] border border-border rounded hover:bg-secondary transition-colors cursor-pointer text-muted-foreground hover:text-foreground"
              title="Open theme designer"
            >Edit</button>
          </div>
        </CtrlRow>
      )}

      {/* Container controls */}
      {mode === 'container' && (
        <>
          <CtrlRow label="Container shape">
            <div className="flex gap-1.5">
              {(['frame', 'corners', 'line', 'circle'] as ContainerShape[]).map(s => (
                <Pill key={s} active={opts.containerShape === s} onClick={() => onChange({ containerShape: s })}>
                  {s === 'frame' ? 'Frame' : s === 'corners' ? 'Corners' : s === 'line' ? 'Line' : 'Circle'}
                </Pill>
              ))}
            </div>
          </CtrlRow>

          <CtrlRow label="Color presets">
            <div className="flex gap-1.5 flex-wrap">
              {CONTAINER_PRESETS.map(p => (
                <button key={p.name} type="button" title={p.name}
                  onClick={() => onChange({ containerColor1: p.c1, containerColor2: p.c2 })}
                  className={['w-6 h-6 rounded-full transition-all cursor-pointer border-2',
                    opts.containerColor1 === p.c1 && opts.containerColor2 === p.c2 ? 'border-foreground scale-110' : 'border-transparent'].join(' ')}
                  style={{ background: `linear-gradient(135deg, ${p.c1} 50%, ${p.c2} 50%)` }}
                />
              ))}
            </div>
          </CtrlRow>

          <CtrlRow label="Color 1">
            <ColorField value={opts.containerColor1} onChange={v => onChange({ containerColor1: v })} />
          </CtrlRow>
          <CtrlRow label="Color 2">
            <ColorField value={opts.containerColor2} onChange={v => onChange({ containerColor2: v })} />
          </CtrlRow>

          <CtrlRow label={`Line thickness — ${opts.containerThickness}px`}>
            <SliderRow value={opts.containerThickness} min={1} max={50} onChange={v => onChange({ containerThickness: v })} />
          </CtrlRow>

          <CtrlRow label={`Glow intensity — ${opts.containerGlow}px`}>
            <SliderRow value={opts.containerGlow} min={0} max={50} onChange={v => onChange({ containerGlow: v })} />
          </CtrlRow>

          <CtrlRow label={`Inset from edge — ${opts.containerMargin}px`}>
            <SliderRow value={opts.containerMargin} min={0} max={150} onChange={v => onChange({ containerMargin: v })} />
          </CtrlRow>

          {opts.containerShape === 'frame' && (
            <CtrlRow label={`Corner radius — ${opts.containerCornerRadius}px`}>
              <SliderRow value={opts.containerCornerRadius} min={0} max={150} onChange={v => onChange({ containerCornerRadius: v })} />
            </CtrlRow>
          )}

          {opts.containerShape === 'corners' && (
            <>
              <CtrlRow label={`Arm length — ${opts.containerArmLength}px`}>
                <SliderRow value={opts.containerArmLength} min={10} max={300} onChange={v => onChange({ containerArmLength: v })} />
              </CtrlRow>
              <CtrlRow label="Active corners">
                <div className="flex gap-1.5">
                  {(['tl', 'tr', 'bl', 'br'] as ContainerCorner[]).map(c => (
                    <Pill key={c} active={opts.containerCorners.includes(c)} onClick={() => toggleContainerCorner(c)}>{c.toUpperCase()}</Pill>
                  ))}
                </div>
              </CtrlRow>
            </>
          )}

          {opts.containerShape === 'line' && (
            <CtrlRow label="Orientation">
              <div className="flex gap-1.5">
                <Pill active={opts.containerOrientation === 'horizontal'} onClick={() => onChange({ containerOrientation: 'horizontal' })}>Horizontal</Pill>
                <Pill active={opts.containerOrientation === 'vertical'} onClick={() => onChange({ containerOrientation: 'vertical' })}>Vertical</Pill>
              </div>
            </CtrlRow>
          )}
        </>
      )}

      {mode === 'text' && (
        <>
          <CtrlRow label="Text">
            <input value={opts.textContent} onChange={e => onChange({ textContent: e.target.value })} className={textInputClass} />
          </CtrlRow>
          <CtrlRow label="Font">
            <input value={opts.textFont} onChange={e => onChange({ textFont: e.target.value })} className={textInputClass} />
          </CtrlRow>
          <CtrlRow label={`Size — ${opts.textFontSize}px`}>
            <SliderRow value={opts.textFontSize} min={8} max={200} onChange={v => onChange({ textFontSize: v })} />
          </CtrlRow>
          <CtrlRow label="Style">
            <div className="flex gap-1.5">
              <Pill active={opts.textBold} onClick={() => onChange({ textBold: !opts.textBold })}>Bold</Pill>
              <Pill active={opts.textItalic} onClick={() => onChange({ textItalic: !opts.textItalic })}>Italic</Pill>
            </div>
          </CtrlRow>
          <CtrlRow label="Align">
            <div className="flex gap-1.5">
              {(['left', 'center', 'right'] as const).map(a => (
                <Pill key={a} active={opts.textAlign === a} onClick={() => onChange({ textAlign: a })}>
                  {a.charAt(0).toUpperCase() + a.slice(1)}
                </Pill>
              ))}
            </div>
          </CtrlRow>
          <CtrlRow label="Color">
            <ColorField value={opts.textColor} onChange={v => onChange({ textColor: v })} />
          </CtrlRow>
          <CtrlRow label={`Rotation — ${normalizeRotation(opts.rotation)}°`}>
            <div className="flex gap-1.5">
              {[0, 90, 180, 270].map(deg => (
                <Pill key={deg} active={normalizeRotation(opts.rotation) === deg} onClick={() => rotateLabel(deg)}>{deg}°</Pill>
              ))}
            </div>
            <SliderRow value={normalizeRotation(opts.rotation)} min={0} max={359} onChange={rotateLabel} />
          </CtrlRow>
        </>
      )}

      {mode === 'image' && (
        <CtrlRow label="Image">
          <input ref={imageInputRef} type="file" accept="image/*" className="hidden"
            onChange={async e => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              setImageLoading(true);
              try {
                const src = await readBackgroundImageFile(file);
                onMeta({ importedImage: src });
              } catch {
                window.alert('Could not read that image.');
              }
              setImageLoading(false);
            }}
          />
          <div className="flex items-center gap-2">
            {gauge.importedImage && (
              <img src={gauge.importedImage} alt="" className="w-8 h-8 rounded border border-border object-cover flex-shrink-0" />
            )}
            <button type="button" onClick={() => imageInputRef.current?.click()} disabled={imageLoading}
              className="px-2.5 py-1 text-[11px] border border-border/60 rounded hover:bg-secondary transition-colors disabled:opacity-40 cursor-pointer text-foreground"
            >{imageLoading ? 'Loading…' : gauge.importedImage ? 'Replace…' : 'Choose image…'}</button>
            {gauge.importedImage && (
              <button type="button" onClick={() => onMeta({ importedImage: null })}
                className="px-2.5 py-1 text-[11px] border border-border/60 rounded hover:bg-secondary transition-colors cursor-pointer text-muted-foreground hover:text-foreground"
              >Remove</button>
            )}
          </div>
        </CtrlRow>
      )}

      {mode === 'circ' && (
        <CtrlRow label="Ring style">
          <div className="flex gap-1.5">
            {RING_STYLES.map(([s, l]) => (
              <Pill key={s} active={opts.ringStyle === s} onClick={() => selectRingStyle(s)}>{l}</Pill>
            ))}
          </div>
        </CtrlRow>
      )}

      {/* Segments */}
      {isSensorGaugeMode(mode) && mode !== 'needle' && !isThermo && (
        <CtrlRow label="Segments">
          <div className="flex gap-1.5 flex-wrap">
            {!marksRing && <Pill active={opts.nSegs === 0} onClick={() => onChange({ nSegs: 0 })}>Solid</Pill>}
            {(marksRing ? [12, 20, 24, 36, 50] : [5, 8, 10, 12, 20, 50]).map(n => (
              <Pill key={n} active={opts.nSegs === n} onClick={() => onChange({ nSegs: n })}>{n}</Pill>
            ))}
          </div>
        </CtrlRow>
      )}

      {isSensorGaugeMode(mode) && mode !== 'needle' && !isThermo && (
        <CtrlRow label="Color mode">
          <div className="flex gap-1.5">
            {(['zone', 'solid', 'mono'] as ColorMode[]).map(m => (
              <Pill key={m} active={opts.colorMode === m} onClick={() => onChange({ colorMode: m })}>{m}</Pill>
            ))}
          </div>
        </CtrlRow>
      )}

      {isSensorGaugeMode(mode) && mode !== 'needle' && !isThermo && opts.colorMode === 'solid' && (
        <CtrlRow label="Color">
          <div className="flex gap-1.5 flex-wrap items-center">
            {SOLID_SWATCHES.map(c => (
              <button key={c} type="button" onClick={() => onChange({ solidColor: c })}
                className={['w-5 h-5 rounded transition-all cursor-pointer border-2',
                  opts.solidColor === c ? 'border-foreground scale-110' : 'border-transparent'].join(' ')}
                style={{ background: c }}
              />
            ))}
            <input type="color" value={opts.solidColor}
              onChange={e => onChange({ solidColor: e.target.value })}
              className="w-5 h-5 rounded cursor-pointer border border-border bg-transparent p-0"
            />
          </div>
        </CtrlRow>
      )}

      {isSensorGaugeMode(mode) && (
        <CtrlRow label={mode === 'needle' ? `Zone ring width — ${opts.sw}px` : isThermo ? `Tube width — ${opts.sw}px` : `Stroke / bar height — ${opts.sw}px`}>
          <SliderRow value={opts.sw} min={6} max={72} onChange={v => onChange({ sw: v })} />
        </CtrlRow>
      )}

      {isSensorGaugeMode(mode) && mode !== 'needle' && !isThermo && opts.nSegs > 0 && (
        <CtrlRow label={`Gap between segments — ${opts.gap}px`}>
          <SliderRow value={opts.gap} min={0} max={50} onChange={v => onChange({ gap: v })} />
        </CtrlRow>
      )}

      {mode === 'bar' && (
        <CtrlRow label="Bar style">
          <div className="flex gap-1.5 flex-wrap">
            {BAR_STYLES.map(([s, l]) => (
              <Pill key={s} active={opts.barStyle === s} onClick={() => selectBarStyle(s)}>{l}</Pill>
            ))}
          </div>
        </CtrlRow>
      )}

      {isThermo && (
        <>
          <CtrlRow label="Mercury color">
            <div className="flex gap-1.5">
              <Pill active={opts.mercuryTheme} onClick={() => onChange({ mercuryTheme: true })}>Theme</Pill>
              <Pill active={!opts.mercuryTheme} onClick={() => onChange({ mercuryTheme: false })}>Custom</Pill>
            </div>
            {opts.mercuryTheme ? (
              <span className={hintClass}>Follows the gauge theme's zone colors, shifting from low to high as the temperature rises.</span>
            ) : (
              <ColorField value={opts.mercuryColor} onChange={v => onChange({ mercuryColor: v })} />
            )}
          </CtrlRow>
          <CtrlRow label="Scales">
            <div className="flex gap-1.5">
              {THERMO_SCALES.map(([s, l]) => (
                <Pill key={s} active={opts.thermoScales === s} onClick={() => onChange({ thermoScales: s })}>{l}</Pill>
              ))}
            </div>
          </CtrlRow>
          <CtrlRow label="Temperature entry unit">
            <div className="flex gap-1.5">
              <Pill active={opts.thermoUnit === 'F'} onClick={() => onChange({ thermoUnit: 'F' })}>°F</Pill>
              <Pill active={opts.thermoUnit === 'C'} onClick={() => onChange({ thermoUnit: 'C' })}>°C</Pill>
            </div>
          </CtrlRow>
          <CtrlRow label={`Temperature range (°${opts.thermoUnit})`}>
            <div className="grid grid-cols-2 gap-2">
              <input type="number"
                value={Math.round(opts.thermoUnit === 'F' ? opts.thermoMinF : (opts.thermoMinF - 32) * 5 / 9)}
                onChange={e => {
                  const v = parseNumberInput(e.target.value);
                  onChange({ thermoMinF: opts.thermoUnit === 'F' ? v : v * 9 / 5 + 32 });
                }}
                className={numberInputClass} title="Minimum (bottom of the tube)"
              />
              <input type="number"
                value={Math.round(opts.thermoUnit === 'F' ? opts.thermoMaxF : (opts.thermoMaxF - 32) * 5 / 9)}
                onChange={e => {
                  const v = parseNumberInput(e.target.value);
                  onChange({ thermoMaxF: opts.thermoUnit === 'F' ? v : v * 9 / 5 + 32 });
                }}
                className={numberInputClass} title="Maximum (top of the tube)"
              />
            </div>
            <span className="text-[9px] text-muted-foreground leading-relaxed">
              This just picks which unit you're typing in; Scales above picks which ones are drawn.
              AIDA64/InfoPanel exports use this range in °C (typical for temp sensors). Preview is 0–100% of the range.
            </span>
          </CtrlRow>
          <CtrlRow label={`Tick marks — ${opts.thermoTickCount}`}>
            <SliderRow value={opts.thermoTickCount} min={2} max={11} onChange={v => onChange({ thermoTickCount: v })} />
          </CtrlRow>
          <TextStyleRows what="Scale text" font={opts.thermoScaleFont} size={opts.thermoScaleFontSize} color={opts.thermoScaleColor} autoColor="Default"
            onChange={p => onChange({
              ...(p.font !== undefined ? { thermoScaleFont: p.font } : {}),
              ...(p.size !== undefined ? { thermoScaleFontSize: p.size } : {}),
              ...(p.color !== undefined ? { thermoScaleColor: p.color } : {}),
            })}
          />
        </>
      )}

      {isSensorGaugeMode(mode) && mode !== 'needle' && !isThermo && !(marksRing && opts.nSegs > 0) && (
        <CtrlRow label={mode === 'circ' ? 'Inner ring 3D effect' : '3D effect'}>
          <div className="flex gap-1.5">
            <Pill active={opts.gauge3D} onClick={() => onChange({ gauge3D: true })}>On</Pill>
            <Pill active={!opts.gauge3D} onClick={() => onChange({ gauge3D: false })}>Off</Pill>
          </div>
        </CtrlRow>
      )}

      {mode === 'bar' && !isThermo && (
        <CtrlRow label="Neon glow">
          <div className="flex gap-1.5">
            <Pill active={opts.barGlow} onClick={() => onChange({ barGlow: true })}>On</Pill>
            <Pill active={!opts.barGlow} onClick={() => onChange({ barGlow: false })}>Off</Pill>
          </div>
        </CtrlRow>
      )}

      {mode === 'bar' && !isThermo && opts.barGlow && (
        <CtrlRow label={`Glow intensity — ${opts.barGlowIntensity}px`}>
          <SliderRow value={opts.barGlowIntensity} min={0} max={50} onChange={v => onChange({ barGlowIntensity: v })} />
        </CtrlRow>
      )}

      {((isSensorGaugeMode(mode) && mode !== 'needle' && (opts.gauge3D || (mode === 'circ' && opts.outerRing && opts.outerRing3D)))
        || (mode === 'needle' && opts.needleStyle === 'classic')) && (
        <CtrlRow label={`Light direction — ${opts.lightAngle}°`}>
          <SliderRow value={opts.lightAngle} min={0} max={360} onChange={v => onChange({ lightAngle: v })} />
        </CtrlRow>
      )}

      {(mode === 'circ' || mode === 'needle') && (
        <CtrlRow label={`Arc span — ${opts.arcSpan}°`}>
          <SliderRow value={opts.arcSpan} min={90} max={360} step={5} nudgeStep={1} onChange={v => onChange({ arcSpan: v })} />
        </CtrlRow>
      )}

      {mode === 'circ' && (
        <CtrlRow label="Inner ring neon glow">
          <div className="flex gap-1.5">
            <Pill active={opts.innerRingGlow} onClick={() => onChange({ innerRingGlow: true })}>On</Pill>
            <Pill active={!opts.innerRingGlow} onClick={() => onChange({ innerRingGlow: false })}>Off</Pill>
          </div>
        </CtrlRow>
      )}

      {mode === 'circ' && opts.innerRingGlow && (
        <CtrlRow label={`Inner glow intensity — ${opts.innerRingGlowIntensity}px`}>
          <SliderRow value={opts.innerRingGlowIntensity} min={0} max={50} onChange={v => onChange({ innerRingGlowIntensity: v })} />
        </CtrlRow>
      )}

      {mode === 'circ' && (
        <CtrlRow label="Outer zone ring">
          <div className="flex gap-1.5">
            <Pill active={opts.outerRing} onClick={() => onChange({ outerRing: true })}>On</Pill>
            <Pill active={!opts.outerRing} onClick={() => onChange({ outerRing: false })}>Off</Pill>
          </div>
        </CtrlRow>
      )}

      {mode === 'circ' && opts.outerRing && (
        <CtrlRow label={`Outer ring width — ${opts.outerRingWidth}px`}>
          <SliderRow value={opts.outerRingWidth} min={2} max={30} onChange={v => onChange({ outerRingWidth: v })} />
        </CtrlRow>
      )}

      {mode === 'circ' && opts.outerRing && (
        <CtrlRow label={`Outer ring gap — ${opts.outerRingGap}px`}>
          <SliderRow value={opts.outerRingGap} min={0} max={30} onChange={v => onChange({ outerRingGap: v })} />
        </CtrlRow>
      )}

      {mode === 'circ' && opts.outerRing && (
        <CtrlRow label="Outer ring neon glow">
          <div className="flex gap-1.5">
            <Pill active={opts.outerRingGlow} onClick={() => onChange({ outerRingGlow: true })}>On</Pill>
            <Pill active={!opts.outerRingGlow} onClick={() => onChange({ outerRingGlow: false })}>Off</Pill>
          </div>
        </CtrlRow>
      )}

      {mode === 'circ' && opts.outerRing && opts.outerRingGlow && (
        <CtrlRow label={`Outer glow intensity — ${opts.outerRingGlowIntensity}px`}>
          <SliderRow value={opts.outerRingGlowIntensity} min={0} max={50} onChange={v => onChange({ outerRingGlowIntensity: v })} />
        </CtrlRow>
      )}

      {mode === 'circ' && opts.outerRing && (
        <CtrlRow label="Outer ring 3D effect">
          <div className="flex gap-1.5">
            <Pill active={opts.outerRing3D} onClick={() => onChange({ outerRing3D: true })}>On</Pill>
            <Pill active={!opts.outerRing3D} onClick={() => onChange({ outerRing3D: false })}>Off</Pill>
          </div>
        </CtrlRow>
      )}

      {mode === 'needle' && (
        <>
          <div className="border-t border-border/50" />
          <CtrlRow label="Dial style">
            <div className="flex gap-1.5">
              <Pill active={opts.needleStyle === 'plain'} onClick={() => onChange({ needleStyle: 'plain' })}>Plain</Pill>
              <Pill active={opts.needleStyle === 'classic'} onClick={() => onChange({ needleStyle: 'classic' })}>Classic</Pill>
            </div>
          </CtrlRow>
          <CtrlRow label={`Hash mark length — ${opts.tickLength}px`}>
            <SliderRow value={opts.tickLength} min={2} max={60} onChange={v => onChange({ tickLength: v })} />
          </CtrlRow>
          {opts.needleStyle !== 'classic' && (
            <>
              <CtrlRow label={`Needle center diameter — ${opts.needleCenterDia}px`}>
                <SliderRow value={opts.needleCenterDia} min={10} max={120} onChange={v => onChange({ needleCenterDia: v })} />
              </CtrlRow>
              <CtrlRow label="Needle center color">
                <ColorField value={opts.needleCenterColor} onChange={v => onChange({ needleCenterColor: v })} />
              </CtrlRow>
              <CtrlRow label="Needle center border color">
                <ColorField value={opts.needleCenterBorderColor} onChange={v => onChange({ needleCenterBorderColor: v })} />
              </CtrlRow>
            </>
          )}
          <CtrlRow label="Needle color">
            <ColorField value={opts.needleColor} onChange={v => onChange({ needleColor: v })} />
          </CtrlRow>

          {opts.needleStyle === 'classic' && (
            <>
              <CtrlRow label="Dial title">
                <textarea value={opts.dialTitle} onChange={e => onChange({ dialTitle: e.target.value })}
                  placeholder={'e.g. CPU\nUtilization'} rows={2}
                  className={textInputClass + ' resize-none'}
                />
                <span className="text-[9px] text-muted-foreground leading-relaxed">
                  Up to 2 lines, shown in the middle of the dial.
                </span>
              </CtrlRow>
              <CtrlRow label="Dial unit">
                <input value={opts.dialUnit} onChange={e => onChange({ dialUnit: e.target.value })}
                  placeholder="e.g. %" className={textInputClass}
                />
              </CtrlRow>
              <CtrlRow label="Dial sub-label (optional)">
                <input value={opts.dialSubtext} onChange={e => onChange({ dialSubtext: e.target.value })}
                  placeholder="e.g. 5500 MHz" className={textInputClass}
                />
              </CtrlRow>
              <CtrlRow label="Accent bar color">
                <ColorField value={opts.dialAccentColor} onChange={v => onChange({ dialAccentColor: v })} />
              </CtrlRow>
              <CtrlRow label="Dial value range">
                <div className="grid grid-cols-3 gap-2">
                  <input type="number" value={opts.dialMin} onChange={e => onChange({ dialMin: parseIntegerInput(e.target.value) })}
                    className={numberInputClass} title="Minimum (tick label at the start of the arc)"
                  />
                  <input type="number" value={opts.dialMax} onChange={e => onChange({ dialMax: parseIntegerInput(e.target.value) })}
                    className={numberInputClass} title="Maximum (tick label at the end of the arc)"
                  />
                  <input type="number" min={1} value={opts.dialTickStep} onChange={e => onChange({ dialTickStep: Math.max(1, parseIntegerInput(e.target.value, 1)) })}
                    className={numberInputClass} title="Step between numbered ticks"
                  />
                </div>
                <span className="text-[9px] text-muted-foreground leading-relaxed">
                  Min / max / step for the numbered tick marks. The same min/max are written into AIDA64 and InfoPanel exports.
                </span>
              </CtrlRow>
            </>
          )}
        </>
      )}

      {isSensorGaugeMode(mode) && !isThermo && (
        <CtrlRow label="Rotation">
          <div className="flex gap-1.5">
            {[0, 90, 180, 270].map(deg => (
              <Pill key={deg} active={opts.rotation === deg} onClick={() => onChange({ rotation: deg })}>{deg}°</Pill>
            ))}
          </div>
        </CtrlRow>
      )}

      {/* The classic dial sets the same range in its own row, with a tick step. */}
      {isSensorGaugeMode(mode) && !isThermo && !(mode === 'needle' && opts.needleStyle === 'classic') && (
        <CtrlRow label="Value range">
          <div className="grid grid-cols-2 gap-2">
            <input type="number" value={opts.dialMin} onChange={e => onChange({ dialMin: parseIntegerInput(e.target.value) })}
              className={numberInputClass} title="Minimum"
            />
            <input type="number" value={opts.dialMax} onChange={e => onChange({ dialMax: parseIntegerInput(e.target.value) })}
              className={numberInputClass} title="Maximum"
            />
          </div>
          <span className={hintClass}>
            Min / max of the sensor, e.g. 0–150 for FPS. Written into AIDA64 and InfoPanel exports, and used by value labels with a unit other than %.
          </span>
        </CtrlRow>
      )}

      <CtrlRow label="Gauge background">
        <div className="flex gap-1.5 flex-wrap items-center">
          {([['transparent', 'Trans.'], ['#000000', 'Black'], ['#1a1a1a', 'Dark'], ['#ffffff', 'White']] as [string, string][]).map(([c, l]) => (
            <Pill key={c} active={opts.bgColor === c} onClick={() => onChange({ bgColor: c })}>{l}</Pill>
          ))}
          <input type="color" value={opts.bgColor === 'transparent' ? '#ffffff' : opts.bgColor}
            onChange={e => onChange({ bgColor: e.target.value })}
            className="w-5 h-5 rounded cursor-pointer border border-border bg-transparent p-0"
          />
        </div>
      </CtrlRow>

      {(mode === 'bar' || mode === 'circ') && (
        <CtrlRow label="Track color">
          <div className="flex gap-1.5 flex-wrap items-center">
            {([['rgba(128,128,128,0.2)', 'Default'], ['transparent', 'None'], ['#000000', 'Black'], ['#ffffff', 'White']] as [string, string][]).map(([c, l]) => (
              <Pill key={c} active={opts.trackColor === c} onClick={() => onChange({ trackColor: c })}>{l}</Pill>
            ))}
            <input type="color" value={opts.trackColor?.startsWith('#') ? opts.trackColor : '#808080'}
              onChange={e => onChange({ trackColor: e.target.value })}
              className="w-5 h-5 rounded cursor-pointer border border-border bg-transparent p-0"
            />
          </div>
        </CtrlRow>
      )}

      {isSensorGaugeMode(mode) && !isThermo && (
        <CtrlRow label="Value label">
          <div className="flex gap-1.5">
            <Pill active={opts.showLabel} onClick={() => onChange({ showLabel: true })}>On</Pill>
            <Pill active={!opts.showLabel} onClick={() => onChange({ showLabel: false })}>Off</Pill>
          </div>
        </CtrlRow>
      )}

      {isSensorGaugeMode(mode) && !isThermo && opts.showLabel && (
        <CtrlRow label="Label position">
          <div className="flex gap-1.5 flex-wrap">
            {(['top', 'bottom', 'left', 'right'] as LabelPos[]).map(p => (
              <Pill key={p} active={opts.labelPos === p} onClick={() => onChange({ labelPos: p })}>{p}</Pill>
            ))}
            {mode === 'circ' && (
              <Pill active={opts.labelPos === 'middle'} onClick={() => onChange({ labelPos: 'middle' })}>middle</Pill>
            )}
          </div>
        </CtrlRow>
      )}

      {isSensorGaugeMode(mode) && !isThermo && opts.showLabel && opts.labelPos !== 'middle' && (
        <CtrlRow label={`Label offset — ${opts.labelPad}px`}>
          <SliderRow value={opts.labelPad} min={0} max={60} onChange={v => onChange({ labelPad: v })} />
        </CtrlRow>
      )}

      {isSensorGaugeMode(mode) && !isThermo && opts.showLabel && (
        <>
          <TextStyleRows what="Label" font={opts.labelFont} size={opts.labelFontSize} color={opts.labelColor} autoColor="Theme"
            onChange={p => onChange({
              ...(p.font !== undefined ? { labelFont: p.font } : {}),
              ...(p.size !== undefined ? { labelFontSize: p.size } : {}),
              ...(p.color !== undefined ? { labelColor: p.color } : {}),
            })}
          />
          <CtrlRow label="Label unit">
            <div className="flex gap-1.5 flex-wrap">
              {LABEL_UNITS.map(([u, l]) => (
                <Pill key={u} active={opts.labelUnit === u} onClick={() => onChange({ labelUnit: u })}>{l}</Pill>
              ))}
            </div>
            {opts.labelUnit === 'custom' && (
              <input value={opts.labelUnitText} onChange={e => onChange({ labelUnitText: e.target.value })}
                placeholder="e.g. FPS, MHz, W" className={textInputClass}
              />
            )}
            {opts.labelUnit !== 'percent' && (
              <span className={hintClass}>Shows the value within the gauge's value range rather than a percentage.</span>
            )}
          </CtrlRow>
        </>
      )}
    </div>
  );
}
