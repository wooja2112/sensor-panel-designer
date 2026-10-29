import { useEffect, useRef, useState } from 'react';
import type { PanelConfig, GaugeInstance } from '../types';
import type { ThemesMap } from '../lib/gaugeRender';
import { designImageSrcs, renderPanel } from '../lib/compose';
import { barCanvasIsSwapped } from '../lib/gaugeRender';
import { getCachedImage, preloadImages } from '../lib/imageCache';
import { MAX_CANVAS_SIZE } from '../types';
import type { OpenMenu } from './ContextMenu';

type Zoom = number | 'fit';

const MIN_GAUGE_SIZE = 20;

interface DragState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  // Every selected gauge's origin at pointerdown, so a multi-select
  // translates as a group instead of only the hit target moving.
  origins: { id: string; x: number; y: number }[];
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
  const swapped = barCanvasIsSwapped(g.opts);
  return swapped ? { width: g.height, height: g.width, swapped } : { width: g.width, height: g.height, swapped };
}

export function CanvasWorkspace({
  panel, gauges, themes, selectedIds, onSelect, onMoveGauges, onResizeGauge, onOpenMenu,
}: {
  panel: PanelConfig;
  gauges: GaugeInstance[];
  themes: ThemesMap;
  selectedIds: string[];
  onSelect: (id: string | null, additive?: boolean) => void;
  onMoveGauges: (moves: { id: string; x: number; y: number }[]) => void;
  onResizeGauge: (id: string, width: number, height: number) => void;
  onOpenMenu: (menu: OpenMenu) => void;
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

    // Background / imported-gauge images may have arrived via autosave or
    // Open, where they aren't decoded yet on this first paint — those
    // draws skip missing bitmaps, so re-render once decoding finishes.
    const pending = designImageSrcs(panel, gauges).filter(src => !getCachedImage(src));
    if (pending.length > 0) {
      let cancelled = false;
      preloadImages(pending).then(() => {
        if (!cancelled) renderPanel(canvas, panel, gauges, themes);
      });
      return () => { cancelled = true; };
    }
  }, [panel, gauges, themes]);

  useEffect(() => {
    function handleMove(e: PointerEvent) {
      const drag = dragRef.current;
      if (drag && e.pointerId === drag.pointerId) {
        const dx = Math.round((e.clientX - drag.startClientX) / scaleRef.current);
        const dy = Math.round((e.clientY - drag.startClientY) / scaleRef.current);
        onMoveGauges(drag.origins.map(o => ({ id: o.id, x: o.x + dx, y: o.y + dy })));
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
        const size = (v: number) => Math.min(MAX_CANVAS_SIZE, Math.max(MIN_GAUGE_SIZE, Math.round(v)));
        onResizeGauge(resize.id, size(resize.startWidth + dWidth), size(resize.startHeight + dHeight));
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
  }, [onMoveGauges, onResizeGauge]);

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0 min-w-0">
      <div className="flex items-center justify-between gap-2 flex-shrink-0">
        <span className="text-[9px] tracking-[0.14em] uppercase font-medium text-muted-foreground">
          {panel.width} × {panel.height}px
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {(['fit', 0.25, 0.5, 0.75, 1] as Zoom[]).map(z => (
            <button key={String(z)} type="button" onClick={() => setZoom(z)}
              aria-pressed={zoom === z}
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
        className="flex-1 min-h-0 min-w-0 bg-background/40 rounded border border-border/40 overflow-auto"
      >
        <div
          className="flex items-center justify-center"
          style={{
            minWidth: '100%',
            minHeight: '100%',
            width: Math.max(stageWidth, available.width),
            height: Math.max(stageHeight, available.height),
          }}
        >
        <div
          className="relative flex-shrink-0"
          style={{ width: stageWidth, height: stageHeight }}
          onPointerDown={e => { if (e.target === e.currentTarget) onSelect(null); }}
          onContextMenu={e => {
            // Empty panel space: the menu adds gauges centered where it opened.
            e.preventDefault();
            onSelect(null);
            const rect = e.currentTarget.getBoundingClientRect();
            onOpenMenu({
              clientX: e.clientX,
              clientY: e.clientY,
              target: {
                kind: 'panel',
                x: Math.round((e.clientX - rect.left) / scale),
                y: Math.round((e.clientY - rect.top) / scale),
                hasGauges: gauges.length > 0,
              },
            });
          }}
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
                onContextMenu={e => {
                  // Right-click on an unselected gauge selects just it, like
                  // most editors, so the menu always acts on what's highlighted.
                  e.preventDefault();
                  e.stopPropagation();
                  if (!isSelected) onSelect(g.id, false);
                  onOpenMenu({ clientX: e.clientX, clientY: e.clientY, target: { kind: 'gauges', count: isSelected ? selectedIds.length : 1 } });
                }}
                onPointerDown={e => {
                  e.stopPropagation();
                  // Only the primary button drags; a right-click opens the menu.
                  if (e.button !== 0) return;
                  const additive = e.shiftKey || e.ctrlKey || e.metaKey;
                  if (additive) {
                    onSelect(g.id, true);
                    return;
                  }
                  // Clicking an already-selected gauge keeps the rest of
                  // the selection so the drag can move the whole group.
                  // Clicking an unselected one replaces the selection.
                  const alreadySelected = selectedIds.includes(g.id);
                  if (!alreadySelected) onSelect(g.id, false);
                  const idsToMove = alreadySelected ? selectedIds : [g.id];
                  (e.target as HTMLElement).setPointerCapture(e.pointerId);
                  dragRef.current = {
                    pointerId: e.pointerId,
                    startClientX: e.clientX,
                    startClientY: e.clientY,
                    origins: gauges
                      .filter(x => idsToMove.includes(x.id))
                      .map(x => ({ id: x.id, x: x.x, y: x.y })),
                  };
                }}
                role="button"
                aria-label={g.name}
                aria-pressed={isSelected}
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
    </div>
  );
}
