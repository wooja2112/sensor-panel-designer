import { useEffect, useRef, useState } from 'react';
import type { PanelConfig, GaugeInstance } from '../types';
import type { ThemesMap } from '../lib/gaugeRender';
import { renderPanel } from '../lib/compose';
import { getCachedImage, loadImage } from '../lib/imageCache';

type Zoom = number | 'fit';

const MIN_GAUGE_SIZE = 20;

interface DragState {
  id: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
}

interface ResizeState {
  id: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startWidth: number;
  startHeight: number;
  // True when this gauge's on-screen box has width/height swapped relative
  // to gauge.width/gauge.height (a 90°/270°-rotated bar gauge) — see
  // boxSize() below. Screen-space drag deltas then need swapping back too,
  // since screen-horizontal drag is growing/shrinking gauge.height in that
  // case, not gauge.width.
  swapped: boolean;
}

// A bar gauge rotated 90°/270° renders into a canvas with width/height
// swapped (gaugeRender.ts resizes it to fit without clipping) and
// compose.ts centers that on the gauge's original center — so the on-screen
// box occupies gauge.height × gauge.width instead of gauge.width × gauge.height,
// still centered at the same point. Every other case (0°/180°, or any
// non-bar mode, which never resizes its canvas) keeps the plain box. Mirrors
// the `mode === "bar" && (rotation === 90 || rotation === 270)` check in
// gaugeRender.ts's drawOn — kept in sync with it, not derived from it,
// since the two live in different modules.
function boxSize(g: GaugeInstance): { width: number; height: number; swapped: boolean } {
  const swapped = g.opts.mode === 'bar' && (g.opts.rotation === 90 || g.opts.rotation === 270);
  return swapped ? { width: g.height, height: g.width, swapped } : { width: g.width, height: g.height, swapped };
}

export function CanvasWorkspace({
  panel, gauges, themes, selectedIds, onSelect, onMoveGauge, onResizeGauge,
}: {
  panel: PanelConfig;
  gauges: GaugeInstance[];
  themes: ThemesMap;
  selectedIds: string[];
  onSelect: (id: string | null, additive?: boolean) => void;
  onMoveGauge: (id: string, x: number, y: number) => void;
  onResizeGauge: (id: string, width: number, height: number) => void;
}) {
  const [zoom, setZoom] = useState<Zoom>('fit');
  const [available, setAvailable] = useState({ width: 600, height: 400 });

  const outerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const scaleRef = useRef(1);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setAvailable({ width: Math.max(1, width), height: Math.max(1, height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scale = zoom === 'fit'
    ? Math.max(0.02, Math.min(available.width / panel.width, available.height / panel.height, 4))
    : zoom;
  scaleRef.current = scale;

  const stageWidth = panel.width * scale;
  const stageHeight = panel.height * scale;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderPanel(canvas, panel, gauges, themes);

    // The background image may have arrived via autosave/project load,
    // where it isn't decoded yet on this first paint — renderBackground
    // silently skips it in that case, so re-render once decoding finishes.
    const src = panel.background.image;
    if (src && !getCachedImage(src)) {
      let cancelled = false;
      loadImage(src).then(() => {
        if (!cancelled) renderPanel(canvas, panel, gauges, themes);
      }).catch(() => {});
      return () => { cancelled = true; };
    }
  }, [panel, gauges, themes]);

  useEffect(() => {
    function handleMove(e: PointerEvent) {
      const drag = dragRef.current;
      if (drag && e.pointerId === drag.pointerId) {
        const dx = (e.clientX - drag.startClientX) / scaleRef.current;
        const dy = (e.clientY - drag.startClientY) / scaleRef.current;
        onMoveGauge(drag.id, Math.round(drag.startX + dx), Math.round(drag.startY + dy));
        return;
      }
      const resize = resizeRef.current;
      if (resize && e.pointerId === resize.pointerId) {
        const dx = (e.clientX - resize.startClientX) / scaleRef.current;
        const dy = (e.clientY - resize.startClientY) / scaleRef.current;
        // Swapped box: screen-horizontal drag is the on-screen box's height
        // axis, which is gauge.width — so dx/dy feed width/height swapped too.
        const dWidth = resize.swapped ? dy : dx;
        const dHeight = resize.swapped ? dx : dy;
        onResizeGauge(
          resize.id,
          Math.max(MIN_GAUGE_SIZE, Math.round(resize.startWidth + dWidth)),
          Math.max(MIN_GAUGE_SIZE, Math.round(resize.startHeight + dHeight)),
        );
      }
    }
    function handleUp() {
      dragRef.current = null;
      resizeRef.current = null;
    }
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [onMoveGauge, onResizeGauge]);

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      <div className="flex items-center justify-between">
        <span className="text-[9px] tracking-[0.14em] uppercase font-medium text-muted-foreground">
          {panel.width} × {panel.height}px
        </span>
        <div className="flex items-center gap-1">
          {(['fit', 0.25, 0.5, 0.75, 1] as Zoom[]).map(z => (
            <button key={z} type="button" onClick={() => setZoom(z)}
              className={[
                'px-2 py-0.5 text-[9px] rounded border transition-colors cursor-pointer',
                zoom === z ? 'bg-secondary border-border/60 text-foreground' : 'border-border/30 text-muted-foreground hover:text-foreground hover:border-border/60',
              ].join(' ')}
            >
              {z === 'fit' ? 'Fit' : `${(z as number) * 100}%`}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={outerRef}
        className="flex-1 min-h-0 flex items-center justify-center bg-background/40 rounded border border-border/40 overflow-auto"
      >
        <div
          className="relative flex-shrink-0"
          style={{ width: stageWidth, height: stageHeight }}
          onPointerDown={e => { if (e.target === e.currentTarget) onSelect(null); }}
        >
          <canvas
            ref={canvasRef}
            className="checkerboard"
            style={{ width: stageWidth, height: stageHeight, display: 'block', borderRadius: 3, imageRendering: scale > 1 ? 'pixelated' : 'auto' }}
            onPointerDown={() => onSelect(null)}
          />
          {gauges.map(g => {
            const isSelected = selectedIds.includes(g.id);
            // The first id in selectedIds is the anchor for multi-select
            // actions like "make same size" — given a distinct (solid vs.
            // dashed) border so it's clear which gauge is the reference.
            const isPrimary = selectedIds[0] === g.id;
            // 0°/90°/180°/270° are the only rotations offered, so the
            // on-screen box is always axis-aligned — for 90°/270° bar
            // gauges it's just the width/height-swapped box centered on the
            // same point as the un-rotated one (see boxSize above), no CSS
            // transform needed to place the hitbox, border, or resize handle.
            const box = boxSize(g);
            const centerX = g.x + g.width / 2;
            const centerY = g.y + g.height / 2;
            const boxLeft = centerX - box.width / 2;
            const boxTop = centerY - box.height / 2;
            return (
              <div
                key={g.id}
                onPointerDown={e => {
                  e.stopPropagation();
                  const additive = e.shiftKey || e.ctrlKey || e.metaKey;
                  onSelect(g.id, additive);
                  // Shift/ctrl-click only toggles selection membership — it
                  // shouldn't also start dragging the gauge under the cursor.
                  if (additive) return;
                  (e.target as HTMLElement).setPointerCapture(e.pointerId);
                  dragRef.current = {
                    id: g.id,
                    pointerId: e.pointerId,
                    startClientX: e.clientX,
                    startClientY: e.clientY,
                    startX: g.x,
                    startY: g.y,
                  };
                }}
                className={[
                  'absolute cursor-move border-2',
                  isPrimary ? 'border-primary' : isSelected ? 'border-primary/60 border-dashed' : 'border-transparent hover:border-primary/50',
                ].join(' ')}
                style={{
                  left: boxLeft * scale,
                  top: boxTop * scale,
                  width: box.width * scale,
                  height: box.height * scale,
                }}
                title={g.name}
              >
                {isSelected && selectedIds.length === 1 && (
                  <div
                    onPointerDown={e => {
                      e.stopPropagation();
                      (e.target as HTMLElement).setPointerCapture(e.pointerId);
                      resizeRef.current = {
                        id: g.id,
                        pointerId: e.pointerId,
                        startClientX: e.clientX,
                        startClientY: e.clientY,
                        startWidth: g.width,
                        startHeight: g.height,
                        swapped: box.swapped,
                      };
                    }}
                    className="absolute -right-1.5 -bottom-1.5 w-3 h-3 rounded-sm bg-primary border border-background cursor-nwse-resize"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
