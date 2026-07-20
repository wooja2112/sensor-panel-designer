// Controls for the currently-selected gauge instance, ported from Sensor
// Gauge Image Creator's App.tsx control panel (originally one big global
// useState block) — reshaped to operate on a single GaugeInstance via props.
import type { GaugeInstance, PanelConfig } from '../types';
import type { DrawOptions, GaugeMode, ColorMode, LabelPos, ContainerShape, ContainerCorner, ThemesMap } from '../lib/gaugeRender';
import { defaultSizeForMode } from '../lib/gaugeRender';
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

export function GaugePanel({
  gauge, panel, themes, onChange, onMeta, onOpenThemeDesigner, onDelete, onDuplicate,
}: {
  gauge: GaugeInstance;
  panel: PanelConfig;
  themes: ThemesMap;
  onChange: (patch: Partial<DrawOptions>) => void;
  onMeta: (patch: Partial<Pick<GaugeInstance, 'name' | 'x' | 'y' | 'width' | 'height' | 'previewValue' | 'themeKey' | 'aidaSensorId'>>) => void;
  onOpenThemeDesigner: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const opts = gauge.opts;
  const mode = opts.mode;

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
    });
    onMeta({ width: size.width, height: size.height });
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

      <CtrlRow label="Position (px)">
        <div className="grid grid-cols-2 gap-2">
          <input type="number" value={gauge.x} onChange={e => onMeta({ x: Math.round(+e.target.value || 0) })} className={numberInputClass} />
          <input type="number" value={gauge.y} onChange={e => onMeta({ y: Math.round(+e.target.value || 0) })} className={numberInputClass} />
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
          <input type="number" min={1} value={gauge.width} onChange={e => onMeta({ width: Math.max(1, Math.round(+e.target.value || 1)) })} className={numberInputClass} />
          <input type="number" min={1} value={gauge.height} onChange={e => onMeta({ height: Math.max(1, Math.round(+e.target.value || 1)) })} className={numberInputClass} />
        </div>
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
          {(['bar', 'circ', 'needle', 'container'] as GaugeMode[]).map(m => (
            <button key={m} type="button" onClick={() => switchMode(m)}
              className={[
                'px-3 py-1 text-[10px] tracking-wider uppercase transition-colors cursor-pointer',
                mode === m ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {m === 'bar' ? 'Bar' : m === 'circ' ? 'Circular' : m === 'needle' ? 'Needle' : 'Container'}
            </button>
          ))}
        </div>
      </CtrlRow>

      {mode !== 'container' && (
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

      {mode !== 'container' && (
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

      <div className="border-t border-border/50" />

      {/* Theme */}
      {mode !== 'container' && (
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

      {/* Segments */}
      {mode !== 'needle' && mode !== 'container' && (
        <CtrlRow label="Segments">
          <div className="flex gap-1.5 flex-wrap">
            <Pill active={opts.nSegs === 0} onClick={() => onChange({ nSegs: 0 })}>Solid</Pill>
            {[5, 8, 10, 12, 20, 50].map(n => (
              <Pill key={n} active={opts.nSegs === n} onClick={() => onChange({ nSegs: n })}>{n}</Pill>
            ))}
          </div>
        </CtrlRow>
      )}

      {mode !== 'needle' && mode !== 'container' && (
        <CtrlRow label="Color mode">
          <div className="flex gap-1.5">
            {(['zone', 'solid', 'mono'] as ColorMode[]).map(m => (
              <Pill key={m} active={opts.colorMode === m} onClick={() => onChange({ colorMode: m })}>{m}</Pill>
            ))}
          </div>
        </CtrlRow>
      )}

      {mode !== 'needle' && mode !== 'container' && opts.colorMode === 'solid' && (
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

      {mode !== 'container' && (
        <CtrlRow label={mode === 'needle' ? `Zone ring width — ${opts.sw}px` : `Stroke / bar height — ${opts.sw}px`}>
          <SliderRow value={opts.sw} min={6} max={72} onChange={v => onChange({ sw: v })} />
        </CtrlRow>
      )}

      {mode !== 'needle' && mode !== 'container' && opts.nSegs > 0 && (
        <CtrlRow label={`Gap between segments — ${opts.gap}px`}>
          <SliderRow value={opts.gap} min={0} max={50} onChange={v => onChange({ gap: v })} />
        </CtrlRow>
      )}

      {mode === 'bar' && (
        <CtrlRow label="Bar style">
          <div className="flex gap-1.5">
            <Pill active={opts.barStyle === 'flat'} onClick={() => onChange({ barStyle: 'flat' })}>Flat</Pill>
            <Pill active={opts.barStyle === 'ascending'} onClick={() => onChange({ barStyle: 'ascending' })}>Ascending</Pill>
          </div>
        </CtrlRow>
      )}

      {mode !== 'needle' && mode !== 'container' && (
        <CtrlRow label={mode === 'circ' ? 'Inner ring 3D effect' : '3D effect'}>
          <div className="flex gap-1.5">
            <Pill active={opts.gauge3D} onClick={() => onChange({ gauge3D: true })}>On</Pill>
            <Pill active={!opts.gauge3D} onClick={() => onChange({ gauge3D: false })}>Off</Pill>
          </div>
        </CtrlRow>
      )}

      {mode !== 'needle' && mode !== 'container' && (opts.gauge3D || (mode === 'circ' && opts.outerRing && opts.outerRing3D)) && (
        <CtrlRow label={`Light direction — ${opts.lightAngle}°`}>
          <SliderRow value={opts.lightAngle} min={0} max={360} onChange={v => onChange({ lightAngle: v })} />
        </CtrlRow>
      )}

      {(mode === 'circ' || mode === 'needle') && (
        <CtrlRow label={`Arc span — ${opts.arcSpan}°`}>
          <SliderRow value={opts.arcSpan} min={90} max={300} step={5} nudgeStep={1} onChange={v => onChange({ arcSpan: v })} />
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
          <CtrlRow label={`Hash mark length — ${opts.tickLength}px`}>
            <SliderRow value={opts.tickLength} min={2} max={60} onChange={v => onChange({ tickLength: v })} />
          </CtrlRow>
          <CtrlRow label={`Needle center diameter — ${opts.needleCenterDia}px`}>
            <SliderRow value={opts.needleCenterDia} min={10} max={120} onChange={v => onChange({ needleCenterDia: v })} />
          </CtrlRow>
          <CtrlRow label="Needle center color">
            <ColorField value={opts.needleCenterColor} onChange={v => onChange({ needleCenterColor: v })} />
          </CtrlRow>
          <CtrlRow label="Needle center border color">
            <ColorField value={opts.needleCenterBorderColor} onChange={v => onChange({ needleCenterBorderColor: v })} />
          </CtrlRow>
          <CtrlRow label="Needle color">
            <ColorField value={opts.needleColor} onChange={v => onChange({ needleColor: v })} />
          </CtrlRow>
        </>
      )}

      {mode !== 'container' && (
        <CtrlRow label="Rotation">
          <div className="flex gap-1.5">
            {[0, 90, 180, 270].map(deg => (
              <Pill key={deg} active={opts.rotation === deg} onClick={() => onChange({ rotation: deg })}>{deg}°</Pill>
            ))}
          </div>
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
            <input type="color" value={opts.trackColor.startsWith('#') ? opts.trackColor : '#808080'}
              onChange={e => onChange({ trackColor: e.target.value })}
              className="w-5 h-5 rounded cursor-pointer border border-border bg-transparent p-0"
            />
          </div>
        </CtrlRow>
      )}

      {mode !== 'container' && (
        <CtrlRow label="Value label">
          <div className="flex gap-1.5">
            <Pill active={opts.showLabel} onClick={() => onChange({ showLabel: true })}>On</Pill>
            <Pill active={!opts.showLabel} onClick={() => onChange({ showLabel: false })}>Off</Pill>
          </div>
        </CtrlRow>
      )}

      {mode !== 'container' && opts.showLabel && (
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

      {mode !== 'container' && opts.showLabel && opts.labelPos !== 'middle' && (
        <CtrlRow label={`Label offset — ${opts.labelPad}px`}>
          <SliderRow value={opts.labelPad} min={0} max={60} onChange={v => onChange({ labelPad: v })} />
        </CtrlRow>
      )}
    </div>
  );
}
