// Small presentational primitives shared by the background and gauge control
// panels, ported from Sensor Gauge Image Creator's App.tsx.
import type { ReactNode } from 'react';

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-[9px] tracking-[0.14em] uppercase font-medium text-muted-foreground">
      {children}
    </span>
  );
}

export function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'px-2.5 py-0.5 text-[11px] rounded border transition-colors cursor-pointer',
        active
          ? 'bg-secondary border-border/60 text-foreground'
          : 'border-border/30 text-muted-foreground hover:text-foreground hover:border-border/60',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

export function CtrlRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <SectionLabel>{label}</SectionLabel>
      {children}
    </div>
  );
}

export function ColorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <div className="w-8 h-8 rounded border border-border" style={{ background: value }} />
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
        />
      </div>
      <span className="text-[10px] text-muted-foreground font-mono">{value}</span>
    </div>
  );
}

export function SliderRow({
  value, min, max, step = 1, nudgeStep,
  onChange,
}: {
  value: number; min: number; max: number; step?: number; nudgeStep?: number;
  onChange: (v: number) => void;
}) {
  const ns = nudgeStep ?? step;
  const nudge = (delta: number) => {
    const next = Math.min(max, Math.max(min, value + delta));
    if (next !== value) onChange(next);
  };
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={() => nudge(-ns)} disabled={value <= min}
        className="w-5 h-5 flex items-center justify-center rounded border border-border/50 text-muted-foreground hover:text-foreground hover:border-border transition-colors disabled:opacity-25 cursor-pointer text-[10px] leading-none flex-shrink-0"
      >▼</button>
      <input type="range" min={min} max={max} value={value} step={step}
        className="flex-1 accent-primary h-1"
        onChange={e => onChange(+e.target.value)}
      />
      <button type="button" onClick={() => nudge(ns)} disabled={value >= max}
        className="w-5 h-5 flex items-center justify-center rounded border border-border/50 text-muted-foreground hover:text-foreground hover:border-border transition-colors disabled:opacity-25 cursor-pointer text-[10px] leading-none flex-shrink-0"
      >▲</button>
    </div>
  );
}

// ── color row inside theme designer ──────────────────────────────────────────
export function ColorTriple({
  label,
  colors,
  onChange,
}: {
  label: string;
  colors: [string, string, string];
  onChange: (i: 0 | 1 | 2, v: string) => void;
}) {
  const sublabels = ['Low', 'Mid', 'High'];
  return (
    <div className="flex flex-col gap-1.5">
      <SectionLabel>{label}</SectionLabel>
      <div className="flex gap-3">
        {([0, 1, 2] as const).map(i => (
          <div key={i} className="flex flex-col items-center gap-1">
            <span className="text-[9px] text-muted-foreground">{sublabels[i]}</span>
            <div className="relative">
              <div className="w-8 h-8 rounded border border-border" style={{ background: colors[i] }} />
              <input
                type="color"
                value={colors[i]}
                onChange={e => onChange(i, e.target.value)}
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
              />
            </div>
            <span className="text-[8px] text-muted-foreground font-mono">{colors[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
